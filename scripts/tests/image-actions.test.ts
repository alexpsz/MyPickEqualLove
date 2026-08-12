import assert from "node:assert/strict";
import test from "node:test";
import {
  copyPreviewImage,
  copyPreviewPageLink,
  preparePreviewImageArtifact,
  sharePreviewImage,
  type ImageActionCapabilities,
  type PreviewImageArtifact,
} from "../../src/utils/imageActions";

const pngDataUrl = "data:image/png;base64,iVBORw0KGgo=";
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const FakeFile = class extends Blob {
  name: string;

  constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
    super(bits, options);
    this.name = name;
  }
};

function makeArtifact(fileName = "my-pick.png"): PreviewImageArtifact {
  const blob = new Blob([pngBytes], { type: "image/png" });
  return {
    dataUrl: pngDataUrl,
    fileName,
    blob,
    file: new FakeFile([blob], fileName, { type: "image/png" }) as File,
  };
}

function secureCapabilities(
  navigator: ImageActionCapabilities["navigator"],
  ClipboardItem?: ImageActionCapabilities["ClipboardItem"],
): ImageActionCapabilities {
  return { navigator, ClipboardItem, isSecureContext: true };
}

test("prepares a non-empty PNG artifact from the generated data URL", async () => {
  const artifact = await preparePreviewImageArtifact({
    dataUrl: pngDataUrl,
    fileName: "prepared.png",
  });

  assert.equal(artifact.fileName, "prepared.png");
  assert.equal(artifact.blob.type, "image/png");
  assert.deepEqual(
    [...new Uint8Array(await artifact.blob.arrayBuffer())],
    [...pngBytes],
  );
});

test("shares the immutable PNG only when file sharing is supported", async () => {
  const artifact = makeArtifact("current.png");
  let shared: ShareData | undefined;
  const result = await sharePreviewImage(
    artifact,
    "My Pick",
    secureCapabilities({
      canShare: (data) => data.files?.[0]?.name === "current.png",
      share: async (data) => {
        shared = data;
      },
    }),
  );

  assert.equal(result.outcome, "success");
  assert.equal(shared?.title, "My Pick");
  assert.equal(shared?.files?.[0]?.name, "current.png");
  assert.equal(shared?.files?.[0]?.type, "image/png");
  assert.equal(shared?.files?.length, 1);
});

test("rechecks canShare for every click", async () => {
  const artifact = makeArtifact();
  let canShare = false;
  let shareCalls = 0;
  const capabilities = secureCapabilities({
    canShare: () => canShare,
    share: async () => {
      shareCalls += 1;
    },
  });

  assert.equal(
    (await sharePreviewImage(artifact, "My Pick", capabilities)).outcome,
    "unavailable",
  );
  canShare = true;
  assert.equal(
    (await sharePreviewImage(artifact, "My Pick", capabilities)).outcome,
    "success",
  );
  assert.equal(shareCalls, 1);
});

test("distinguishes cancelled, denied, and failed shares", async () => {
  const artifact = makeArtifact();
  const withFailure = (error: DOMException) =>
    sharePreviewImage(
      artifact,
      "My Pick",
      secureCapabilities({
        canShare: () => true,
        share: async () => {
          throw error;
        },
      }),
    );

  assert.equal(
    (await withFailure(new DOMException("", "AbortError"))).outcome,
    "cancelled",
  );
  assert.equal(
    (await withFailure(new DOMException("", "NotAllowedError"))).outcome,
    "denied",
  );
  assert.equal(
    (await withFailure(new DOMException("", "NetworkError"))).outcome,
    "failed",
  );
});

test("copies PNG bytes only with ClipboardItem and clipboard.write", async () => {
  const artifact = makeArtifact();
  let copied: ClipboardItem[] | undefined;
  const FakeClipboardItem = class {
    constructor(readonly items: Record<string, Blob>) {}
  } as unknown as ImageActionCapabilities["ClipboardItem"];
  const success = await copyPreviewImage(
    artifact,
    secureCapabilities(
      {
        clipboard: {
          write: async (items) => {
            copied = items;
          },
        },
      },
      FakeClipboardItem,
    ),
  );
  const unavailable = await copyPreviewImage(
    artifact,
    secureCapabilities({ clipboard: { write: async () => {} } }),
  );

  assert.equal(success.outcome, "success");
  assert.equal(copied?.length, 1);
  assert.equal(unavailable.outcome, "unavailable");
});

test("reports clipboard permission rejection without false success", async () => {
  const denied = await copyPreviewImage(
    makeArtifact(),
    secureCapabilities(
      {
        clipboard: {
          write: async () => {
            throw new DOMException("", "NotAllowedError");
          },
        },
      },
      class {} as unknown as ImageActionCapabilities["ClipboardItem"],
    ),
  );

  assert.equal(denied.outcome, "denied");
});

test("copies the page link as a separate fallback", async () => {
  let copiedLink = "";
  const result = await copyPreviewPageLink(
    "https://example.test/live/",
    secureCapabilities({
      clipboard: {
        write: async () => {},
        writeText: async (value) => {
          copiedLink = value;
        },
      },
    }),
  );

  assert.equal(result.outcome, "success");
  assert.equal(copiedLink, "https://example.test/live/");
});
