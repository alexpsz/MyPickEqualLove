import type {
  EqualLoveArchetypeStatId,
  EqualLoveArchetypeStats,
} from "../data/equalLoveArchetype";
import { getArchetypeAccentContrast } from "../utils/archetypeAccent";

export interface ArchetypeRadarChartProps {
  stats: EqualLoveArchetypeStats;
  labels: Record<EqualLoveArchetypeStatId, string>;
  accentColor: string;
  ariaLabel: string;
  size?: number;
  maxValue?: number;
  showScale?: boolean;
  showLabels?: boolean;
}

const AXES: ReadonlyArray<{
  id: EqualLoveArchetypeStatId;
  shortLabel: string;
  angle: number;
}> = [
  { id: "atk", shortLabel: "ATK", angle: -90 },
  { id: "def", shortLabel: "DEF", angle: -18 },
  { id: "spdMobility", shortLabel: "SPD", angle: 54 },
  { id: "sta", shortLabel: "STA", angle: 126 },
  { id: "bearCharmResistance", shortLabel: "BEAR", angle: 198 },
];

const GRID_STEPS = [0.25, 0.5, 0.75, 1] as const;

export default function ArchetypeRadarChart({
  stats,
  labels,
  accentColor,
  ariaLabel,
  size = 360,
  maxValue = 1200,
  showScale = true,
  showLabels = true,
}: ArchetypeRadarChartProps) {
  const center = size / 2;
  const radius = size * 0.31;
  const labelRadius = size * 0.43;
  const accent = getArchetypeAccentContrast(accentColor);
  const dataStrokeWidth = Math.max(2, size * 0.008);
  const points = AXES.map((axis) =>
    polarPoint(
      center,
      center,
      radius * clamp(stats[axis.id] / maxValue),
      axis.angle,
    ),
  );

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flex: "0 0 auto", overflow: "visible" }}
      data-archetype-radar="true"
      data-archetype-radar-max={maxValue}
      data-archetype-accent-color={accent.color}
      data-archetype-accent-outline={accent.outlineColor}
    >
      <title>{ariaLabel}</title>
      {GRID_STEPS.map((step) => (
        <polygon
          key={step}
          points={polygonPoints(center, radius * step)}
          fill="none"
          stroke={step === 1 ? "#9ca3af" : "#d1d5db"}
          strokeWidth={step === 1 ? 1.4 : 1}
          strokeDasharray={step === 1 ? undefined : "3 3"}
        />
      ))}
      {AXES.map((axis) => {
        const endpoint = polarPoint(center, center, radius, axis.angle);
        return (
          <line
            key={axis.id}
            x1={center}
            y1={center}
            x2={endpoint.x}
            y2={endpoint.y}
            stroke="#d1d5db"
            strokeWidth={1}
          />
        );
      })}
      {showScale
        ? GRID_STEPS.map((step) => (
            <text
              key={step}
              x={center + 5}
              y={center - radius * step + 4}
              fill="#6b7280"
              fontSize={Math.max(9, size * 0.027)}
              fontWeight={700}
            >
              {Math.round(maxValue * step)}
            </text>
          ))
        : null}
      {accent.outlineColor ? (
        <polygon
          aria-hidden="true"
          points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={accent.outlineColor}
          strokeWidth={dataStrokeWidth + Math.max(2, size * 0.006)}
          strokeLinejoin="round"
        />
      ) : null}
      <polygon
        points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
        fill={accent.color}
        fillOpacity={0.14}
        stroke={accent.color}
        strokeWidth={dataStrokeWidth}
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <circle
          key={AXES[index].id}
          cx={point.x}
          cy={point.y}
          r={Math.max(3.5, size * 0.012)}
          fill={accent.color}
          stroke={accent.outlineColor}
          strokeWidth={accent.outlineColor ? Math.max(1.5, size * 0.005) : 0}
        />
      ))}
      {showLabels
        ? AXES.map((axis) => {
            const axisLabelRadius =
              axis.id === "bearCharmResistance" ? size * 0.34 : labelRadius;
            const labelPoint = polarPoint(
              center,
              center,
              axisLabelRadius,
              axis.angle,
            );
            const anchor = getTextAnchor(axis.angle);
            const value = stats[axis.id];
            return (
              <g key={axis.id} aria-hidden="true">
                <text
                  x={labelPoint.x}
                  y={labelPoint.y - size * 0.012}
                  textAnchor={anchor}
                  fill="#111827"
                  fontSize={Math.max(10, size * 0.036)}
                  fontWeight={900}
                  letterSpacing="0.04em"
                >
                  {axis.shortLabel}
                </text>
                <text
                  x={labelPoint.x}
                  y={labelPoint.y + size * 0.036}
                  textAnchor={anchor}
                  fill={accent.color}
                  stroke={accent.outlineColor}
                  strokeWidth={
                    accent.outlineColor ? Math.max(1.5, size * 0.006) : 0
                  }
                  paintOrder="stroke fill"
                  fontSize={Math.max(10, size * 0.035)}
                  fontWeight={900}
                >
                  {value}
                </text>
              </g>
            );
          })
        : null}
      <desc>
        {AXES.map((axis) => `${labels[axis.id]} ${stats[axis.id]}`).join(", ")}
      </desc>
    </svg>
  );
}

function polygonPoints(center: number, radius: number) {
  return AXES.map(({ angle }) => {
    const point = polarPoint(center, center, radius, angle);
    return `${point.x},${point.y}`;
  }).join(" ");
}

function polarPoint(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number,
) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: centerX + Math.cos(radians) * radius,
    y: centerY + Math.sin(radians) * radius,
  };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getTextAnchor(angle: number): "start" | "middle" | "end" {
  const cosine = Math.cos((angle * Math.PI) / 180);
  if (cosine > 0.25) return "start";
  if (cosine < -0.25) return "end";
  return "middle";
}
