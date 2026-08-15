const WHITE_ACCENT = "#ffffff";

export const ARCHETYPE_ACCENT_OUTLINE = "#64748b";

export function getArchetypeAccentContrast(accentColor: string) {
  const outlineColor =
    accentColor.trim().toLowerCase() === WHITE_ACCENT
      ? ARCHETYPE_ACCENT_OUTLINE
      : undefined;

  return {
    color: accentColor,
    outlineColor,
    textShadow: outlineColor
      ? [
          `-1px -1px 0 ${outlineColor}`,
          `1px -1px 0 ${outlineColor}`,
          `-1px 1px 0 ${outlineColor}`,
          `1px 1px 0 ${outlineColor}`,
        ].join(", ")
      : undefined,
    outlineShadow: outlineColor ? `0 0 0 1px ${outlineColor}` : undefined,
  };
}
