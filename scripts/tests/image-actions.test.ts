import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadTextFile,
  preparePreviewImageArtifact,
  sharePreviewImage,
  sharePreviewPage,
  type ImageActionCapabilities,
  type PreviewImageArtifact,
  type PreviewPageShareSnapshot,
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
): ImageActionCapabilities {
  return { navigator, isSecureContext: true };
}

const pageShareSnapshot: PreviewPageShareSnapshot = {
  pageUrl: "https://example.test/live/",
  shareTitle: "My Pick",
  shareText: "Here are my picks.",
  shareHashtags: ["#MyPick", "#EqualLove"],
};

test("downloads text through a temporary object URL and revokes it", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
    URL,
    "createObjectURL",
  );
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
    URL,
    "revokeObjectURL",
  );
  let createdBlob: Blob | undefined;
  let appended = false;
  let clicked = false;
  let removed = false;
  let revokedUrl: string | undefined;
  const link = {
    href: "",
    download: "",
    hidden: false,
    click: () => {
      clicked = true;
    },
    remove: () => {
      removed = true;
    },
  } as HTMLAnchorElement;

  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        body: {
          appendChild: (candidate: HTMLAnchorElement) => {
            assert.equal(candidate, link);
            appended = true;
          },
        },
        createElement: (tagName: string) => {
          assert.equal(tagName, "a");
          return link;
        },
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        createdBlob = blob;
        return "blob:backup-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: (url: string) => {
        revokedUrl = url;
      },
    });

    downloadTextFile(
      '{"hello":"世界"}',
      "mypick-backup.json",
      "application/json;charset=utf-8",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(await createdBlob?.text(), '{"hello":"世界"}');
    assert.equal(createdBlob?.type, "application/json;charset=utf-8");
    assert.equal(link.href, "blob:backup-test");
    assert.equal(link.download, "mypick-backup.json");
    assert.equal(link.hidden, true);
    assert.equal(appended, true);
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.equal(revokedUrl, "blob:backup-test");
  } finally {
    restoreProperty(globalThis, "document", originalDocument);
    restoreProperty(URL, "createObjectURL", originalCreateObjectUrl);
    restoreProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
  }
});

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

test("calls native page share synchronously with the immutable payload", async () => {
  let shared: ShareData | undefined;
  let resolveShare: (() => void) | undefined;
  const resultPromise = sharePreviewPage(
    pageShareSnapshot,
    secureCapabilities({
      share: (data) => {
        shared = data;
        return new Promise<void>((resolve) => {
          resolveShare = resolve;
        });
      },
    }),
  );

  assert.deepEqual(shared, {
    title: "My Pick",
    text: "Here are my picks.\n#MyPick #EqualLove",
    url: "https://example.test/live/",
  });
  resolveShare?.();
  assert.equal((await resultPromise).outcome, "success");
});

test("copies the page URL only when native share is unavailable", async () => {
  const copiedLinks: string[] = [];
  let shareCalls = 0;
  const missingShareResult = await sharePreviewPage(
    pageShareSnapshot,
    secureCapabilities({
      clipboard: {
        writeText: async (value) => {
          copiedLinks.push(value);
        },
      },
    }),
  );
  const nonSecureResult = await sharePreviewPage(pageShareSnapshot, {
    isSecureContext: false,
    navigator: {
      share: async () => {
        shareCalls += 1;
      },
      clipboard: {
        writeText: async (value) => {
          copiedLinks.push(value);
        },
      },
    },
  });

  assert.equal(missingShareResult.outcome, "copied");
  assert.equal(nonSecureResult.outcome, "copied");
  assert.equal(shareCalls, 0);
  assert.deepEqual(copiedLinks, [
    "https://example.test/live/",
    "https://example.test/live/",
  ]);
});

test("does not copy after cancelled, denied, or failed native page sharing", async () => {
  let copyCalls = 0;
  const withFailure = (error: DOMException) =>
    sharePreviewPage(
      pageShareSnapshot,
      secureCapabilities({
        share: async () => {
          throw error;
        },
        clipboard: {
          writeText: async () => {
            copyCalls += 1;
          },
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
  assert.equal(copyCalls, 0);
});

test("reports page sharing unavailable when neither native share nor copy exists", async () => {
  const result = await sharePreviewPage(pageShareSnapshot, {
    isSecureContext: true,
    navigator: {},
  });

  assert.equal(result.outcome, "unavailable");
});

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}
