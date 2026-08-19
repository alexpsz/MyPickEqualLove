type Vector3 = readonly [number, number, number];

// CSS Color 4 sample conversion matrices and reference whites:
// https://www.w3.org/TR/css-color-4/#color-conversion-code
const D50: Vector3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

const D50_TO_D65: readonly Vector3[] = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];

const XYZ_TO_LINEAR_SRGB: readonly Vector3[] = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
];

const OKLAB_TO_LMS: readonly Vector3[] = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];

const LMS_TO_XYZ: readonly Vector3[] = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

const CSS_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const MODERN_COLOR_FUNCTION =
  /(^|[^-\w])(oklch|oklab|lab|lch)\(([^()]*)\)(?=$|[^-\w])/gi;

function multiplyMatrix(matrix: readonly Vector3[], vector: Vector3): Vector3 {
  return matrix.map(
    (row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2],
  ) as unknown as Vector3;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseNumber(token: string): number | null {
  if (!CSS_NUMBER.test(token)) return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

function parseComponent(token: string, percentageScale: number): number | null {
  if (token.toLowerCase() === "none") return 0;
  const isPercentage = token.endsWith("%");
  const value = parseNumber(isPercentage ? token.slice(0, -1) : token);
  if (value === null) return null;
  return isPercentage ? (value / 100) * percentageScale : value;
}

function parseHue(token: string): number | null {
  if (token.toLowerCase() === "none") return 0;
  const match = token.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/i,
  );
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  switch (match[2]?.toLowerCase()) {
    case "grad":
      return value * 0.9;
    case "rad":
      return (value * 180) / Math.PI;
    case "turn":
      return value * 360;
    default:
      return value;
  }
}

function parseAlpha(token: string | undefined): number | null {
  if (token === undefined) return 1;
  return parseComponent(token, 1);
}

function labToXyzD50([L, a, b]: Vector3): Vector3 {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const fy = (L + 16) / 116;
  const f: Vector3 = [a / 500 + fy, fy, fy - b / 200];
  const xyz: Vector3 = [
    f[0] ** 3 > epsilon ? f[0] ** 3 : (116 * f[0] - 16) / kappa,
    L > kappa * epsilon ? ((L + 16) / 116) ** 3 : L / kappa,
    f[2] ** 3 > epsilon ? f[2] ** 3 : (116 * f[2] - 16) / kappa,
  ];
  return xyz.map((value, index) => value * D50[index]) as unknown as Vector3;
}

function oklabToXyzD65(oklab: Vector3): Vector3 {
  const nonlinearLms = multiplyMatrix(OKLAB_TO_LMS, oklab);
  const lms = nonlinearLms.map((value) => value ** 3) as unknown as Vector3;
  return multiplyMatrix(LMS_TO_XYZ, lms);
}

function linearToSrgb(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  return absolute > 0.0031308
    ? sign * (1.055 * absolute ** (1 / 2.4) - 0.055)
    : 12.92 * value;
}

function serializeAlpha(alpha: number): string {
  const rounded = Math.round(clamp(alpha, 0, 1) * 1_000_000) / 1_000_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function xyzD65ToRgba(xyz: Vector3, alpha: number): string {
  const linearRgb = multiplyMatrix(XYZ_TO_LINEAR_SRGB, xyz);
  const rgb = linearRgb.map((channel) =>
    Math.round(clamp(linearToSrgb(channel), 0, 1) * 255),
  );
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${serializeAlpha(alpha)})`;
}

function polarToRectangular(L: number, C: number, H: number): Vector3 {
  const hueRadians = (H * Math.PI) / 180;
  return [L, C * Math.cos(hueRadians), C * Math.sin(hueRadians)];
}

function convertFunction(name: string, body: string): string | null {
  const slashParts = body.split("/");
  if (slashParts.length > 2) return null;

  const components = slashParts[0].trim().split(/\s+/);
  const alphaComponents = slashParts[1]?.trim().split(/\s+/);
  if (
    components.length !== 3 ||
    components.some((component) => component.length === 0) ||
    (alphaComponents &&
      (alphaComponents.length !== 1 || alphaComponents[0].length === 0))
  ) {
    return null;
  }

  const alpha = parseAlpha(alphaComponents?.[0]);
  if (alpha === null) return null;

  const normalizedName = name.toLowerCase();
  const isOk = normalizedName.startsWith("ok");
  const isPolar = normalizedName.endsWith("lch");
  const lightness = parseComponent(components[0], isOk ? 1 : 100);
  const second = parseComponent(
    components[1],
    isPolar ? (isOk ? 0.4 : 150) : isOk ? 0.4 : 125,
  );
  const third = isPolar
    ? parseHue(components[2])
    : parseComponent(components[2], isOk ? 0.4 : 125);

  if (lightness === null || second === null || third === null) return null;

  const clampedLightness = clamp(lightness, 0, isOk ? 1 : 100);
  const rectangular = isPolar
    ? polarToRectangular(clampedLightness, Math.max(0, second), third)
    : ([clampedLightness, second, third] as Vector3);
  const xyzD65 = isOk
    ? oklabToXyzD65(rectangular)
    : multiplyMatrix(D50_TO_D65, labToXyzD50(rectangular));

  return xyzD65ToRgba(xyzD65, alpha);
}

export function convertColorString(str: string): string {
  if (!str || typeof str !== "string") return str;

  try {
    return str.replace(
      MODERN_COLOR_FUNCTION,
      (match, prefix: string, name: string, body: string) => {
        const converted = convertFunction(name, body);
        return converted === null ? match : `${prefix}${converted}`;
      },
    );
  } catch {
    return str;
  }
}
