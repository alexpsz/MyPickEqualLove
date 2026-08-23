import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  EXPORT_REALM_REJECTIONS,
  resolveExportRealmRequest,
} from "../../src/utils/exportRealmRequest";
import type { ExportRenderRequest } from "../../src/utils/exportCapture";

function createRequest(
  overrides: Partial<ExportRenderRequest> = {},
): ExportRenderRequest {
  return {
    type: "mypick-export:render",
    version: 4,
    requestId: "req-1",
    kind: "picks",
    experienceId: "standard",
    picks: {},
    showTitles: true,
    transparentBg: false,
    showQrCode: true,
    templateId: "classic",
    sizePresetId: "portrait",
    selectedBy: "",
    pageUrl: "https://example.test/",
    ...overrides,
  } as ExportRenderRequest;
}

const base = {
  activeRequestId: null,
  experienceId: "standard",
  pageUrl: "https://example.test/",
  contextIds: [] as string[],
};

test("a second, different request is rejected while one is in flight", () => {
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest({ requestId: "req-2" }),
    activeRequestId: "req-1",
  });
  assert.deepEqual(verdict, {
    status: "reject",
    reason: EXPORT_REALM_REJECTIONS.busy,
  });
});

test("a duplicate of the in-flight request is ignored, not rejected", () => {
  // Rejecting would post a spurious failure for a capture that is running fine.
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest({ requestId: "req-1" }),
    activeRequestId: "req-1",
  });
  assert.deepEqual(verdict, { status: "ignore" });
});

test("a request for another experience is rejected", () => {
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest({ experienceId: "kokuritsu_2026" }),
  });
  assert.deepEqual(verdict, {
    status: "reject",
    reason: EXPORT_REALM_REJECTIONS.experience,
  });
});

test("a request for another page URL is rejected", () => {
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest({ pageUrl: "https://evil.test/" }),
  });
  assert.deepEqual(verdict, {
    status: "reject",
    reason: EXPORT_REALM_REJECTIONS.pageUrl,
  });
});

test("a context outside the current experience is rejected", () => {
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest({ contextId: "day3" }),
    contextIds: ["day1", "day2", "both"],
  });
  assert.deepEqual(verdict, {
    status: "reject",
    reason: EXPORT_REALM_REJECTIONS.context,
  });
});

test("a valid context is carried through to the accept verdict", () => {
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest({ contextId: "day2" }),
    contextIds: ["day1", "day2", "both"],
    defaultContextId: "day1",
  });
  assert.deepEqual(verdict, { status: "accept", contextId: "day2" });
});

test("an absent context falls back to the experience default", () => {
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest(),
    contextIds: ["day1", "day2"],
    defaultContextId: "day1",
  });
  assert.deepEqual(verdict, { status: "accept", contextId: "day1" });
});

test("the busy check runs before identity checks", () => {
  // An in-flight capture must not be disturbed even by a bogus request.
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest({ requestId: "req-2", experienceId: "other" }),
    activeRequestId: "req-1",
  });
  assert.deepEqual(verdict, {
    status: "reject",
    reason: EXPORT_REALM_REJECTIONS.busy,
  });
});

test("capture effect posts an uncancelled result before consuming its request id", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/PickExperienceClient.tsx"),
    "utf8",
  );
  const captureCallbackIndex = source.indexOf("const captureExportCanvas");
  const effectStart = source.indexOf(
    "  useEffect(() => {",
    captureCallbackIndex,
  );
  const effectEnd = source.indexOf(
    "  }, [captureExportCanvas, frameCaptureRequest, hydrated, isExportRealm]);",
    effectStart,
  );

  assert.notEqual(captureCallbackIndex, -1, "capture callback must exist");
  assert.notEqual(effectStart, -1, "capture effect must exist");
  assert.notEqual(effectEnd, -1, "capture effect boundary must stay explicit");

  const effect = source.slice(effectStart, effectEnd);
  const failureIndex = effect.indexOf("} catch (error) {");
  const cancellationIndex = effect.indexOf("if (cancelled) return;");
  const postIndex = effect.indexOf("window.parent.postMessage(result");
  const consumeStatement = "capturedFrameRequestIdRef.current = requestId;";
  const consumeIndex = effect.indexOf(consumeStatement);

  assert.notEqual(failureIndex, -1);
  assert.notEqual(cancellationIndex, -1);
  assert.notEqual(postIndex, -1);
  assert.notEqual(consumeIndex, -1);
  assert.ok(failureIndex < postIndex, "explicit failures must post a result");
  assert.ok(cancellationIndex < postIndex, "cancelled work must not post");
  assert.ok(
    postIndex < consumeIndex,
    "posting must precede request consumption",
  );
  assert.equal(
    effect.split(consumeStatement).length - 1,
    1,
    "the effect must have one settled-request consumption point",
  );
});
