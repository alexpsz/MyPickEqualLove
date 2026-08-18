import { convertColorString } from "./colors";

/**
 * Minimal shape this adapter needs from a computed style declaration.
 * Declared structurally so tests can pass a plain object instead of a real
 * `CSSStyleDeclaration`.
 */
export interface ExportStyleDeclarationLike {
  getPropertyValue(propertyName: string): string;
}

export interface ExportStyleWindowLike {
  getComputedStyle: (
    element: Element,
    pseudoElement?: string | null,
  ) => ExportStyleDeclarationLike;
}

/**
 * Wraps one computed style declaration so every string it yields has modern
 * CSS color functions rewritten into the `rgba()` form html2canvas parses
 * reliably.
 *
 * Methods are bound to the original declaration because html2canvas calls
 * them detached; returning an unbound method would throw an illegal
 * invocation.
 */
export function wrapExportStyleDeclaration<
  T extends ExportStyleDeclarationLike,
>(declaration: T): T {
  return new Proxy(declaration, {
    get(target, property) {
      if (property === "getPropertyValue") {
        return (propertyName: string) =>
          convertColorString(target.getPropertyValue(propertyName));
      }

      const value = Reflect.get(target, property) as unknown;
      if (typeof value === "function") {
        return value.bind(target);
      }
      if (typeof value === "string") {
        return convertColorString(value);
      }
      return value;
    },
  });
}

/**
 * Temporarily replaces `getComputedStyle` on the given window so html2canvas
 * observes converted colors for the duration of a capture.
 *
 * Returns a restore function; callers must invoke it in a `finally` block so
 * a failed capture cannot leave the realm's `getComputedStyle` patched.
 */
export function installExportStyleAdapter(
  target: ExportStyleWindowLike,
): () => void {
  const original = target.getComputedStyle;

  target.getComputedStyle = (element, pseudoElement) =>
    wrapExportStyleDeclaration(
      original.call(
        target,
        element,
        pseudoElement,
      ) as ExportStyleDeclarationLike,
    );

  return () => {
    target.getComputedStyle = original;
  };
}
