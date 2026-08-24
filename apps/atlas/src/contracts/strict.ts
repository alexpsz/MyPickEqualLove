export interface ContractIssue {
  readonly path: string;
  readonly message: string;
}

export class ContractValidationError extends Error {
  readonly issue: ContractIssue;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ContractValidationError";
    this.issue = { path, message };
  }
}

export function expectRecord(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContractValidationError(path, "expected an object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ContractValidationError(path, "expected a plain object");
  }
  return value as Record<string, unknown>;
}

export function expectExactKeys(
  value: Record<string, unknown>,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new ContractValidationError(`${path}.${key}`, "missing field");
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ContractValidationError(`${path}.${key}`, "unknown field");
    }
  }
}

export function expectString(
  value: unknown,
  path: string,
  options: { readonly min?: number; readonly max?: number } = {},
) {
  const min = options.min ?? 1;
  const max = options.max ?? 512;
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max ||
    (min > 0 && value.trim().length === 0)
  ) {
    throw new ContractValidationError(
      path,
      `expected a string with length ${min}..${max}`,
    );
  }
  return value;
}

export function expectInteger(
  value: unknown,
  path: string,
  options: { readonly min?: number; readonly max?: number } = {},
) {
  const min = options.min ?? Number.MIN_SAFE_INTEGER;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new ContractValidationError(
      path,
      `expected an integer in range ${min}..${max}`,
    );
  }
  return value as number;
}

export function expectArray(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    throw new ContractValidationError(path, "expected an array");
  }
  return value;
}

export function expectLiteral<T extends string | number | boolean | null>(
  value: unknown,
  path: string,
  allowed: readonly T[],
) {
  if (!allowed.includes(value as T)) {
    throw new ContractValidationError(
      path,
      `expected one of ${allowed.map(String).join(", ")}`,
    );
  }
  return value as T;
}

export function expectIsoDate(value: unknown, path: string) {
  const date = expectString(value, path, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ContractValidationError(path, "expected an ISO calendar date");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new ContractValidationError(path, "invalid ISO calendar date");
  }
  return date;
}

export function expectIsoTimestamp(value: unknown, path: string) {
  const timestamp = expectString(value, path, { max: 64 });
  const parsed = Date.parse(timestamp);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== timestamp
  ) {
    throw new ContractValidationError(
      path,
      "expected a canonical UTC ISO timestamp",
    );
  }
  return timestamp;
}

export function expectIanaTimezone(value: unknown, path: string) {
  const timezone = expectString(value, path, { max: 128 });
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    throw new ContractValidationError(path, "invalid IANA timezone");
  }
  return timezone;
}

export function expectHttpsUrl(value: unknown, path: string) {
  const url = expectString(value, path, { max: 2048 });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ContractValidationError(path, "invalid URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ContractValidationError(path, "expected a public HTTPS URL");
  }
  return url;
}

export function expectPattern(
  value: unknown,
  path: string,
  pattern: RegExp,
  description: string,
) {
  const text = expectString(value, path, { max: 256 });
  if (!pattern.test(text)) {
    throw new ContractValidationError(path, description);
  }
  return text;
}

export function expectUniqueStrings(
  value: unknown,
  path: string,
  options: { readonly maxItems?: number; readonly maxLength?: number } = {},
) {
  const items = expectArray(value, path);
  const maxItems = options.maxItems ?? 256;
  if (items.length > maxItems) {
    throw new ContractValidationError(
      path,
      `expected at most ${maxItems} items`,
    );
  }
  const result = items.map((item, index) =>
    expectString(item, `${path}[${index}]`, {
      max: options.maxLength ?? 1024,
    }),
  );
  if (new Set(result).size !== result.length) {
    throw new ContractValidationError(path, "duplicate values are not allowed");
  }
  return result;
}

export function issueFrom(error: unknown): ContractIssue {
  return error instanceof ContractValidationError
    ? error.issue
    : { path: "$", message: "unexpected validation failure" };
}
