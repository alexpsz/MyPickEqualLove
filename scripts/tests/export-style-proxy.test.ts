import assert from "node:assert/strict";
import test from "node:test";

import {
  installExportStyleAdapter,
  wrapExportStyleDeclaration,
  type ExportStyleDeclarationLike,
  type ExportStyleWindowLike,
} from "../../src/utils/exportStyleProxy";

/** Stand-in for CSSStyleDeclaration; only what the adapter touches. */
function createDeclaration(values: Record<string, string>) {
  return {
    ...values,
    getPropertyValue(propertyName: string) {
      return values[propertyName] ?? "";
    },
    // Bound-method probe: throws if called detached from the declaration.
    describe(this: { marker?: string }) {
      if (this?.marker !== "real") throw new TypeError("illegal invocation");
      return "ok";
    },
    marker: "real",
  };
}

test("getPropertyValue converts modern color functions to rgba", () => {
  const wrapped = wrapExportStyleDeclaration(
    createDeclaration({ color: "oklch(0.7 0.1 200)" }),
  );

  const value = wrapped.getPropertyValue("color");
  assert.match(value, /^rgba\(\d+, \d+, \d+, 1\)$/);
  assert.doesNotMatch(value, /oklch/);
});

test("string properties read off the declaration are converted too", () => {
  const wrapped = wrapExportStyleDeclaration(
    createDeclaration({ backgroundColor: "oklab(0.5 0.1 -0.1)" }),
  ) as unknown as ExportStyleDeclarationLike & { backgroundColor: string };

  assert.match(wrapped.backgroundColor, /^rgba\(/);
});

test("values without a modern color function pass through unchanged", () => {
  const wrapped = wrapExportStyleDeclaration(
    createDeclaration({ display: "flex", margin: "0px 4px" }),
  );

  assert.equal(wrapped.getPropertyValue("display"), "flex");
  assert.equal(wrapped.getPropertyValue("margin"), "0px 4px");
  assert.equal(wrapped.getPropertyValue("missing"), "");
});

test("methods stay bound so html2canvas can call them detached", () => {
  const wrapped = wrapExportStyleDeclaration(createDeclaration({})) as {
    describe: () => string;
  };

  const detached = wrapped.describe;
  assert.equal(detached(), "ok");
});

test("installExportStyleAdapter wraps and then fully restores getComputedStyle", () => {
  const original: ExportStyleWindowLike["getComputedStyle"] = () =>
    createDeclaration({ color: "oklch(0.7 0.1 200)" });
  const target: ExportStyleWindowLike = { getComputedStyle: original };

  const restore = installExportStyleAdapter(target);
  assert.notEqual(target.getComputedStyle, original);
  assert.match(
    target.getComputedStyle({} as Element).getPropertyValue("color"),
    /^rgba\(/,
  );

  restore();
  assert.equal(target.getComputedStyle, original);
  assert.equal(
    target.getComputedStyle({} as Element).getPropertyValue("color"),
    "oklch(0.7 0.1 200)",
  );
});

test("restore is safe to call after the adapter threw", () => {
  const original: ExportStyleWindowLike["getComputedStyle"] = () => {
    throw new Error("boom");
  };
  const target: ExportStyleWindowLike = { getComputedStyle: original };

  const restore = installExportStyleAdapter(target);
  assert.throws(() => target.getComputedStyle({} as Element), /boom/);
  restore();
  assert.equal(target.getComputedStyle, original);
});
