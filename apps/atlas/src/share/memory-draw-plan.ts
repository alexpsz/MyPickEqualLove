import { parseMemorySnapshot } from "../contracts/memory-snapshot.js";
import type { MemoryMessages } from "../i18n/memory/messages.js";

export const MEMORY_CANVAS_WIDTH = 1200 as const;
export const MEMORY_CANVAS_HEIGHT = 630 as const;
export const MEMORY_TEMPLATE_ID = "atlas-memory-v1" as const;

const MEMORY_DETAIL_LINE_BUDGET = 13;
const LEFT_COLUMN_X = 72;
const LEFT_COLUMN_MAX_WIDTH = 405;
const EVENT_START_Y = 118;
const EVENT_LINE_HEIGHT = 58;
const DATE_OFFSET_Y = 22;
const DATE_TEXT_HEIGHT = 24;
const LEFT_CONTENT_BOTTOM = 526;
const GROUP_FONT =
  '700 24px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const EVENT_FONT =
  '700 48px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const DATE_FONT =
  '600 20px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

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
  readonly sections: readonly MemoryDrawSection[];
  readonly noOptionalDetails: string;
  readonly privacyLine: string;
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
      sections,
      noOptionalDetails: messages.card.noOptionalDetails,
      privacyLine: messages.card.privacyLine,
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
}

function measureRequiredLeftLayout(
  context: MemoryCanvasContext,
  plan: MemoryDrawPlan,
): RequiredLeftLayout {
  context.font = GROUP_FONT;
  if (measuredWidth(context, plan.groupName) > LEFT_COLUMN_MAX_WIDTH) {
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

  return { eventLines, eventBottom, dateText, dateY };
}

function validateRequiredLeftLayout(
  context: MemoryCanvasContext,
  plan: MemoryDrawPlan,
  layout: RequiredLeftLayout,
) {
  context.font = GROUP_FONT;
  if (measuredWidth(context, plan.groupName) > LEFT_COLUMN_MAX_WIDTH) {
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
  context.fillStyle = "#f4f8fc";
  context.fillRect(0, 0, plan.width, plan.height);
  context.fillStyle = "#3559c7";
  context.fillRect(0, 0, 20, plan.height);

  context.fillStyle = "#3559c7";
  context.font = GROUP_FONT;
  context.fillText(plan.groupName, LEFT_COLUMN_X, 70);

  context.fillStyle = "#172033";
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

  context.fillStyle = "#53627a";
  context.font = DATE_FONT;
  context.fillText(
    requiredLeftLayout.dateText,
    LEFT_COLUMN_X,
    requiredLeftLayout.dateY,
  );

  validateRequiredLeftLayout(context, plan, requiredLeftLayout);

  context.fillStyle = "#ffffff";
  context.fillRect(525, 48, 615, 534);

  let detailY = 80;
  if (plan.sections.length === 0) {
    context.fillStyle = "#53627a";
    context.font =
      '500 24px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    drawWrappedText(context, plan.noOptionalDetails, 568, detailY, 520, 32);
  } else {
    for (const section of plan.sections) {
      context.fillStyle = "#3559c7";
      context.font =
        '700 17px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
      context.fillText(section.label.toUpperCase(), 568, detailY);
      detailY += 28;

      context.fillStyle = "#172033";
      context.font =
        '500 22px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
      for (const value of section.values) {
        detailY = drawWrappedText(context, value, 568, detailY, 520, 29);
        detailY += 7;
      }
      detailY += 13;
      if (detailY > 530) {
        throw new Error("Memory content exceeds the canvas");
      }
    }
  }

  context.fillStyle = "#53627a";
  context.font =
    '500 17px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillText(plan.privacyLine, 72, 558);
  context.fillStyle = "#3559c7";
  context.font =
    '700 20px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  context.fillText("ATLAS MEMORY", 955, 558);
}
