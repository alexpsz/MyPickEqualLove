import assert from "node:assert/strict";
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

test("a matching request is accepted", () => {
  const verdict = resolveExportRealmRequest({
    ...base,
    request: createRequest(),
  });
  assert.equal(verdict.status, "accept");
});

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
