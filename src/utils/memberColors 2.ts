import type { Member } from "../schema/music";

export function getMemberColors(member: Member, fallbackColor: string) {
  const configuredColors = member.colors?.filter(Boolean) ?? [];
  if (configuredColors.length > 0) {
    return configuredColors;
  }
  return [member.color ?? fallbackColor];
}

export function getMemberColorGradient(
  members: Member[],
  fallbackColor: string,
) {
  const colors = members.flatMap((member) =>
    getMemberColors(member, fallbackColor),
  );
  return `linear-gradient(90deg, ${
    colors.length > 0 ? colors.join(", ") : fallbackColor
  })`;
}

export function getColorBackground(colors: string[], fallbackColor: string) {
  const configuredColors = colors.filter(Boolean);
  if (configuredColors.length === 0) {
    return fallbackColor;
  }
  if (new Set(configuredColors).size === 1) {
    return configuredColors[0];
  }
  return `linear-gradient(90deg, ${configuredColors.join(", ")})`;
}

export function getMemberColorBackground(
  member: Member,
  fallbackColor: string,
) {
  return getColorBackground(
    getMemberColors(member, fallbackColor),
    fallbackColor,
  );
}
