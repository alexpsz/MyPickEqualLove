import assert from "node:assert/strict";
import test from "node:test";
import { convertColorString } from "../src/utils/colors";

// Golden RGB values come from https://www.w3.org/TR/css-color-4/ examples or
// its sample conversion matrices. A one-byte tolerance covers 8-bit quantization.
const RGB_CHANNEL_TOLERANCE = 1;
const ALPHA_TOLERANCE = 0.000001;

function parseRgba(value: string) {
  const match = value.match(
    /^rgba\((\d+), (\d+), (\d+), ([0-9]+(?:\.[0-9]+)?)\)$/,
  );
  assert.ok(match, `expected deterministic rgba() serialization, got ${value}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

function assertRgbaNear(
  input: string,
  expectedRgb: readonly [number, number, number],
  expectedAlpha = 1,
) {
  const actual = parseRgba(convertColorString(input));
  actual.rgb.forEach((channel, index) => {
    assert.ok(
      Math.abs(channel - expectedRgb[index]) <= RGB_CHANNEL_TOLERANCE,
      `${input}: channel ${index} expected ${expectedRgb[index]}±${RGB_CHANNEL_TOLERANCE}, got ${channel}`,
    );
  });
  assert.ok(
    Math.abs(actual.alpha - expectedAlpha) <= ALPHA_TOLERANCE,
    `${input}: expected alpha ${expectedAlpha}, got ${actual.alpha}`,
  );
}

test("CSS Color 4 Lab uses D50 with Bradford adaptation to sRGB D65", () => {
  // CSS Color 4 lists this Lab value and #7654CD as exactly equivalent.
  assertRgbaNear("lab(44.36% 36.05 -58.99)", [118, 84, 205]);
  assertRgbaNear("lab(100% 0 0)", [255, 255, 255]);
  assertRgbaNear("lab(0 0 0)", [0, 0, 0]);
});

test("Lab and LCH percentage reference ranges are applied", () => {
  assert.equal(
    convertColorString("lab(44.36% 28.84% -47.192%)"),
    convertColorString("lab(44.36 36.05 -58.99)"),
  );
  assert.equal(
    convertColorString("lch(44.36% 46.0833333333% 301.43deg)"),
    convertColorString("lch(44.36 69.125 301.43)"),
  );
});

test("Oklab and OkLCH use D65 and their CSS percentage ranges", () => {
  assertRgbaNear("oklab(62.7955% 0.224863 0.125846)", [255, 0, 0]);
  assert.equal(
    convertColorString("oklab(62.7955% 56.21575% 31.4615%)"),
    convertColorString("oklab(0.627955 0.224863 0.125846)"),
  );
  assert.equal(
    convertColorString("oklch(62.7955% 64.425% 29.2339deg)"),
    convertColorString("oklch(0.627955 0.2577 29.2339)"),
  );
});

test("Tailwind-style Lab values with signed decimals convert deterministically", () => {
  assertRgbaNear("lab(97.8% -0.2 0.5)", [249, 249, 247]);
  assertRgbaNear("lab(63.7% 52.6 35 / 75%)", [246, 110, 96], 0.75);
  assert.equal(
    convertColorString(
      "linear-gradient(lab(97.8% -0.2 0.5), oklch(63.7% 0.237 25.331))",
    ),
    "linear-gradient(rgba(249, 249, 248, 1), rgba(251, 44, 54, 1))",
  );
});

test("angles, negative values, none, and clamping follow CSS Color 4", () => {
  assert.equal(
    convertColorString("lch(50 40 -90deg)"),
    convertColorString("lch(50 40 0.75turn)"),
  );
  assert.equal(
    convertColorString("oklch(50% -20% 1rad / 125%)"),
    convertColorString("oklch(50% 0 none / 1)"),
  );
  assert.equal(
    convertColorString("lab(-10 none none / none)"),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    convertColorString("lab(120 0 0 / -20%)"),
    "rgba(255, 255, 255, 0)",
  );
});

test("unsupported and invalid inputs are preserved without throwing", () => {
  const unchanged = [
    "var(--project-primary)",
    "color(display-p3 1 0 0)",
    "lab(50%, 0, 0)",
    "lab(50 0)",
    "lab(50 0 0 / 1 / 2)",
    "lab(calc(50%) 0 0)",
    "lch(50 20 10px)",
    "oklab(50% NaN 0)",
    "oklch(50% 20% Infinity)",
    "prefix-lab(50 0 0)",
    "lab(50 0 0)-suffix",
    "lab(50 0 0",
  ];
  for (const value of unchanged) {
    assert.doesNotThrow(() => convertColorString(value));
    assert.equal(convertColorString(value), value);
  }
});

test("serialization is stable for exponent notation and alpha rounding", () => {
  assert.equal(
    convertColorString("LAB(5e1 +0 -0 / 33.3333333%)"),
    "rgba(119, 119, 119, 0.333333)",
  );
});
