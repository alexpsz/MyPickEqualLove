import { parseMemorySnapshot } from "../contracts/memory-snapshot.js";
import type { MemoryMessages } from "../i18n/memory/messages.js";

export const MEMORY_CANVAS_WIDTH = 1200 as const;
export const MEMORY_CANVAS_HEIGHT = 630 as const;
export const MEMORY_TEMPLATE_ID = "atlas-memory-v1" as const;

const MEMORY_DETAIL_LINE_BUDGET = 13;
const LEFT_COLUMN_X = 64;
const LEFT_COLUMN_MAX_WIDTH = 560;
const EVENT_START_Y = 116;
const EVENT_LINE_HEIGHT = 56;
const DATE_OFFSET_Y = 24;
const DATE_TEXT_HEIGHT = 24;
const NICKNAME_OFFSET_Y = 18;
const NICKNAME_LINE_HEIGHT = 26;
const LEFT_CONTENT_BOTTOM = 520;
const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const GROUP_FONT = `700 22px ${SYSTEM_FONT_STACK}`;
const EVENT_FONT = `700 48px ${SYSTEM_FONT_STACK}`;
const DATE_FONT = `600 20px ${SYSTEM_FONT_STACK}`;
const NICKNAME_FONT = `700 18px ${SYSTEM_FONT_STACK}`;

export interface MemoryDrawSection {
  readonly label: string;
  readonly values: readonly string[];
}

export interface MemoryDrawPlan {
  readonly templateId: typeof MEMORY_TEMPLATE_ID;
  readonly width: typeof MEMORY_CANVAS_WIDTH;
  readonly height: typeof MEMORY_CANVAS_HEIGHT;
  readonly groupName: string;
  readonly eventName: string;
  readonly dateLabel: string;
  readonly date: string;
  readonly nicknameLine: string | null;
  readonly sections: readonly MemoryDrawSection[];
  readonly noOptionalDetails: string;
}

export type MemoryDrawPlanResult =
  | { readonly ok: true; readonly plan: MemoryDrawPlan }
  | {
      readonly ok: false;
      readonly reason: "invalid-snapshot" | "content-too-long";
    };

export interface MemoryCanvasTextMetrics {
  readonly width: number;
}

export interface MemoryCanvasContext {
  fillStyle: string;
  font: string;
  textBaseline: "top";
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): MemoryCanvasTextMetrics;
}

function estimatedLines(value: string, charactersPerLine: number) {
  return Math.max(1, Math.ceil(Array.from(value).length / charactersPerLine));
}

function detailLineCount(sections: readonly MemoryDrawSection[]) {
  return sections.reduce(
    (count, section) =>
      count +
      1 +
      section.values.reduce(
        (valueCount, value) => valueCount + estimatedLines(value, 38),
        0,
      ),
    0,
  );
}

export function createMemoryDrawPlan(
  value: unknown,
  messages: MemoryMessages,
): MemoryDrawPlanResult {
  const parsed = parseMemorySnapshot(value);
  if (!parsed.ok) {
    return { ok: false, reason: "invalid-snapshot" };
  }

  const snapshot = parsed.value;
  const sections: MemoryDrawSection[] = [];
  if (snapshot.event.performanceName !== null) {
    sections.push({
      label: messages.card.performanceLabel,
      values: [snapshot.event.performanceName],
    });
  }
  if (snapshot.selected.mode !== null) {
    sections.push({
      label: messages.card.modeLabel,
      values: [messages.card.modes[snapshot.selected.mode.value]],
    });
  }
  if (snapshot.selected.highlights.length > 0) {
    sections.push({
      label: messages.card.highlightsLabel,
      values: snapshot.selected.highlights.map((highlight) => highlight.value),
    });
  }
  if (snapshot.selected.songs.length > 0) {
    sections.push({
      label: messages.card.songsLabel,
      values: snapshot.selected.songs.map(
        (song) => `${song.value.groupName} · ${song.value.title}`,
      ),
    });
  }
  if (snapshot.selected.summary !== null) {
    sections.push({
      label: messages.card.summaryLabel,
      values: [snapshot.selected.summary.value],
    });
  }

  if (
    estimatedLines(snapshot.event.eventName, 24) > 4 ||
    detailLineCount(sections) > MEMORY_DETAIL_LINE_BUDGET
  ) {
    return { ok: false, reason: "content-too-long" };
  }

  return {
    ok: true,
    plan: {
      templateId: MEMORY_TEMPLATE_ID,
      width: MEMORY_CANVAS_WIDTH,
      height: MEMORY_CANVAS_HEIGHT,
      groupName: snapshot.event.groupName,
      eventName: snapshot.event.eventName,
      dateLabel: messages.card.dateLabel,
      date: snapshot.event.date,
      nicknameLine:
        snapshot.selected.nickname === null
          ? null
          : messages.card.nickname
              .split("{name}")
              .join(snapshot.selected.nickname.value),
      sections,
      noOptionalDetails: messages.card.noOptionalDetails,
    },
  };
}

function measuredWidth(context: MemoryCanvasContext, value: string) {
  const width = context.measureText(value).width;
  if (!Number.isFinite(width) || width < 0) {
    throw new Error("Canvas text measurement failed");
  }
  return width;
}

function brandLine(plan: MemoryDrawPlan) {
  return `ATLAS × ${plan.groupName}`;
}

function wrapText(
  context: MemoryCanvasContext,
  value: string,
  maxWidth: number,
): readonly string[] {
  const characters = Array.from(value);
  const lines: string[] = [];
  let line = "";

  for (const character of characters) {
    const candidate = `${line}${character}`;
    if (line.length > 0 && measuredWidth(context, candidate) > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) {
    lines.push(line.trimEnd());
  }
  return lines.length > 0 ? lines : [""];
}

function drawWrappedText(
  context: MemoryCanvasContext,
  value: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
) {
  let y = startY;
  for (const line of wrapText(context, value, maxWidth)) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

interface RequiredLeftLayout {
  readonly eventLines: readonly string[];
  readonly eventBottom: number;
  readonly dateText: string;
  readonly dateY: number;
  readonly nicknameLines: readonly string[];
  readonly nicknameY: number | null;
}

function measureRequiredLeftLayout(
  context: MemoryCanvasContext,
  plan: MemoryDrawPlan,
): RequiredLeftLayout {
  context.font = GROUP_FONT;
  if (measuredWidth(context, brandLine(plan)) > LEFT_COLUMN_MAX_WIDTH) {
    throw new Error("Memory group name exceeds the left column");
  }

  context.font = EVENT_FONT;
  const eventLines = wrapText(context, plan.eventName, LEFT_COLUMN_MAX_WIDTH);
  if (
    eventLines.some(
      (line) => measuredWidth(context, line) > LEFT_COLUMN_MAX_WIDTH,
    )
  ) {
    throw new Error("Memory event title exceeds the left column");
  }

  const eventBottom = EVENT_START_Y + eventLines.length * EVENT_LINE_HEIGHT;
  const dateY = eventBottom + DATE_OFFSET_Y;
  const dateText = `${plan.dateLabel} · ${plan.date}`;
  context.font = DATE_FONT;
  if (
    measuredWidth(context, dateText) > LEFT_COLUMN_MAX_WIDTH ||
    dateY + DATE_TEXT_HEIGHT > LEFT_CONTENT_BOTTOM
  ) {
    throw new Error("Memory date exceeds the left column");
  }

  const nicknameY =
    plan.nicknameLine === null
      ? null
      : dateY + DATE_TEXT_HEIGHT + NICKNAME_OFFSET_Y;
  const nicknameLines =
    plan.nicknameLine === null
      ? []
      : (() => {
          context.font = NICKNAME_FONT;
          return wrapText(context, plan.nicknameLine, LEFT_COLUMN_MAX_WIDTH);
        })();
  if (
    nicknameLines.length > 2 ||
    nicknameLines.some(
      (line) => measuredWidth(context, line) > LEFT_COLUMN_MAX_WIDTH,
    ) ||
    (nicknameY !== null &&
      nicknameY + nicknameLines.length * NICKNAME_LINE_HEIGHT >
        LEFT_CONTENT_BOTTOM)
  ) {
    throw new Error("Memory nickname exceeds the left column");
  }

  return {
    eventLines,
    eventBottom,
    dateText,
    dateY,
    nicknameLines,
    nicknameY,
  };
}

function validateRequiredLeftLayout(
  context: MemoryCanvasContext,
  plan: MemoryDrawPlan,
  layout: RequiredLeftLayout,
) {
  context.font = GROUP_FONT;
  if (measuredWidth(context, brandLine(plan)) > LEFT_COLUMN_MAX_WIDTH) {
    throw new Error("Memory group name changed beyond the left column");
  }

  context.font = EVENT_FONT;
  if (
    layout.eventLines.some(
      (line) => measuredWidth(context, line) > LEFT_COLUMN_MAX_WIDTH,
    )
  ) {
    throw new Error("Memory event layout changed beyond the left column");
  }

  context.font = DATE_FONT;
  if (
    measuredWidth(context, layout.dateText) > LEFT_COLUMN_MAX_WIDTH ||
    layout.dateY + DATE_TEXT_HEIGHT > LEFT_CONTENT_BOTTOM
  ) {
    throw new Error("Memory date changed beyond the left column");
  }

  if (layout.nicknameY !== null) {
    context.font = NICKNAME_FONT;
    if (
      layout.nicknameLines.length > 2 ||
      layout.nicknameLines.some(
        (line) => measuredWidth(context, line) > LEFT_COLUMN_MAX_WIDTH,
      ) ||
      layout.nicknameY + layout.nicknameLines.length * NICKNAME_LINE_HEIGHT >
        LEFT_CONTENT_BOTTOM
    ) {
      throw new Error("Memory nickname changed beyond the left column");
    }
  }
}

function drawTextLines(
  context: MemoryCanvasContext,
  lines: readonly string[],
  x: number,
  startY: number,
  lineHeight: number,
) {
  let y = startY;
  for (const line of lines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function drawMemoryPlan(
  context: MemoryCanvasContext,
  plan: MemoryDrawPlan,
) {
  if (
    plan.templateId !== MEMORY_TEMPLATE_ID ||
    plan.width !== MEMORY_CANVAS_WIDTH ||
    plan.height !== MEMORY_CANVAS_HEIGHT
  ) {
    throw new Error("Unsupported Memory draw plan");
  }

  // Required fields are laid out using the actual Canvas context. The exact
  // chosen lines and positions are checked again immediately before and after
  // drawing, so changing metrics fail before the canvas can be encoded.
  const requiredLeftLayout = measureRequiredLeftLayout(context, plan);
  validateRequiredLeftLayout(context, plan, requiredLeftLayout);

  context.textBaseline = "top";
  context.fillStyle = "#ff3f72";
  context.fillRect(0, 0, plan.width, plan.height);
  context.fillStyle = "#ffffff";
  context.fillRect(4, 4, plan.width - 8, plan.height - 8);

  context.fillStyle = "#ff2f68";
  context.font = GROUP_FONT;
  context.fillText(brandLine(plan), LEFT_COLUMN_X, 54);

  context.fillStyle = "#201c22";
  context.font = EVENT_FONT;
  const eventBottom = drawTextLines(
    context,
    requiredLeftLayout.eventLines,
    LEFT_COLUMN_X,
    EVENT_START_Y,
    EVENT_LINE_HEIGHT,
  );
  if (eventBottom !== requiredLeftLayout.eventBottom) {
    throw new Error("Memory event layout changed while drawing");
  }

  context.fillStyle = "#6e6670";
  context.font = DATE_FONT;
  context.fillText(
    requiredLeftLayout.dateText,
    LEFT_COLUMN_X,
    requiredLeftLayout.dateY,
  );

  if (requiredLeftLayout.nicknameY !== null) {
    context.fillStyle = "#6e6670";
    context.font = NICKNAME_FONT;
    drawTextLines(
      context,
      requiredLeftLayout.nicknameLines,
      LEFT_COLUMN_X,
      requiredLeftLayout.nicknameY,
      NICKNAME_LINE_HEIGHT,
    );
  }

  validateRequiredLeftLayout(context, plan, requiredLeftLayout);

  context.fillStyle = "#eadfe3";
  context.fillRect(676, 82, 1, 446);

  let detailY = 100;
  if (plan.sections.length === 0) {
    context.fillStyle = "#6e6670";
    context.font = `500 22px ${SYSTEM_FONT_STACK}`;
    drawWrappedText(context, plan.noOptionalDetails, 724, detailY, 408, 31);
  } else {
    for (const section of plan.sections) {
      context.fillStyle = "#ff2f68";
      context.font = `700 16px ${SYSTEM_FONT_STACK}`;
      context.fillText(section.label.toUpperCase(), 724, detailY);
      detailY += 26;

      context.fillStyle = "#201c22";
      context.font = `500 21px ${SYSTEM_FONT_STACK}`;
      for (const value of section.values) {
        detailY = drawWrappedText(context, value, 724, detailY, 408, 28);
        detailY += 5;
      }
      detailY += 12;
      if (detailY > 526) {
        throw new Error("Memory content exceeds the canvas");
      }
    }
  }

  context.fillStyle = "#ff2f68";
  context.font = `700 19px ${SYSTEM_FONT_STACK}`;
  context.fillText("ATLAS MEMORY", 984, 568);
}
