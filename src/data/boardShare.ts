import { DEFAULT_PICK_SLOTS, STANDARD_EXPERIENCE_ID } from "../config/project";
import { PROJECTS } from "../projects/registry";
import {
  COMBINED_CONTEXT_ID,
  PROJECT_IDS,
  type ProjectId,
} from "../schema/project";
import type {
  ExperiencePickSlot,
  PickExperience,
} from "../schema/pick-experience";
import type { StoredPicks } from "../schema/music";
import {
  BOARD_SHARE_PROTOCOL_VERSION,
  validateBoardShareImport,
  type BoardShareInvalidReason,
  type BoardSharePayload,
} from "../utils/boardShareProtocol.mjs";

interface BoardShareTarget {
  projectId: ProjectId;
  experienceId: string;
  displayName: string;
  canonicalUrl: string;
  slots: ExperiencePickSlot[];
  performances?: PickExperience["performances"];
  includeCombinedPerformance?: boolean;
}

export type ResolvedBoardShare =
  | {
      status: "import";
      contextId?: string;
      picks: StoredPicks;
    }
  | {
      status: "mismatch";
      canonicalUrl: string;
      displayName: string;
    }
  | {
      status: "invalid";
      reason: BoardShareInvalidReason | "unknown-target";
    };

export function createBoardSharePayload({
  experience,
  contextId,
  storedPicks,
}: {
  experience: PickExperience;
  contextId?: string;
  storedPicks: StoredPicks;
}): BoardSharePayload {
  const pairs = experience.slots
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((slot): Array<[string, string]> => {
      const songId = storedPicks[slot.id];
      return songId ? [[slot.id, songId]] : [];
    });

  return {
    v: BOARD_SHARE_PROTOCOL_VERSION,
    p: experience.projectId,
    e: experience.id,
    c: contextId ?? null,
    s: pairs,
  };
}

export function resolveBoardSharePayload({
  payload,
  currentExperience,
}: {
  payload: BoardSharePayload;
  currentExperience: PickExperience;
}): ResolvedBoardShare {
  const target = getBoardShareTarget(payload.p, payload.e);
  if (!target) {
    return { status: "invalid", reason: "unknown-target" };
  }

  const validation = validateBoardShareImport(
    payload,
    buildTargetRules(target, payload.c),
  );
  if (!validation.ok) {
    return { status: "invalid", reason: validation.reason };
  }

  if (
    payload.p !== currentExperience.projectId ||
    payload.e !== currentExperience.id
  ) {
    return {
      status: "mismatch",
      canonicalUrl: target.canonicalUrl,
      displayName: target.displayName,
    };
  }

  return {
    status: "import",
    contextId: payload.c ?? undefined,
    picks: validation.picks,
  };
}

function getBoardShareTarget(
  projectIdValue: string,
  experienceId: string,
): BoardShareTarget | null {
  if (!PROJECT_IDS.includes(projectIdValue as ProjectId)) {
    return null;
  }

  const projectId = projectIdValue as ProjectId;
  const project = PROJECTS[projectId];
  if (experienceId === STANDARD_EXPERIENCE_ID) {
    return {
      projectId,
      experienceId,
      displayName: project.config.displayName,
      canonicalUrl: new URL("/", project.config.siteUrl).toString(),
      slots: DEFAULT_PICK_SLOTS.map((slot) => ({
        ...slot,
        eligibility: "catalog",
      })),
    };
  }

  const experience = project.liveExperiences.find(
    (candidate) =>
      candidate.id === experienceId &&
      (candidate.status === "published" || candidate.status === "archived"),
  );
  if (!experience) {
    return null;
  }

  return {
    projectId,
    experienceId,
    displayName: `${project.config.displayName} · ${experience.title}`,
    canonicalUrl: new URL(
      experience.canonicalPath,
      project.config.siteUrl,
    ).toString(),
    slots: experience.slots,
    performances: experience.performances,
    includeCombinedPerformance: experience.includeCombinedPerformance,
  };
}

function buildTargetRules(target: BoardShareTarget, contextId: string | null) {
  const project = PROJECTS[target.projectId];
  const songIds = new Set(project.songs.map((song) => song.id));
  const performances = target.performances ?? [];
  const contextIds = performances.map((performance) => performance.id);
  if (target.includeCombinedPerformance && performances.length > 1) {
    contextIds.push(COMBINED_CONTEXT_ID);
  }

  const selectedPerformances =
    contextId === COMBINED_CONTEXT_ID && target.includeCombinedPerformance
      ? performances
      : performances.filter((performance) => performance.id === contextId);
  const selectedPerformanceSongIds = new Set(
    selectedPerformances.flatMap((performance) =>
      performance.setlist.map((entry) => entry.songId),
    ),
  );
  const eventSongIds = new Set(
    performances.flatMap((performance) =>
      performance.setlist.map((entry) => entry.songId),
    ),
  );

  return {
    projectId: target.projectId,
    experienceId: target.experienceId,
    contextIds,
    requiresContext: contextIds.length > 0,
    songIds,
    slots: target.slots.map((slot) => ({
      id: slot.id,
      eligibleSongIds:
        slot.eligibility === "catalog"
          ? songIds
          : slot.eligibility === "event-union"
            ? eventSongIds
            : selectedPerformanceSongIds,
    })),
  };
}
