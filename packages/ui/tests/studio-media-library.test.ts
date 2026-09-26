import assert from "node:assert/strict";
import { test } from "node:test";
import { saveStudioMediaLibrary } from "../src/v4/composer/studio/studioMediaStore.js";

test("blank model lists recover valid built-in defaults", () => {
  for (const ids of [[], [" ", ""]]) {
    const result = saveStudioMediaLibrary({
      imageIds: ids,
      videoIds: ids,
      defaultImageId: "",
      defaultVideoId: "",
    });
    assert.ok(result.imageIds.includes(result.defaultImageId));
    assert.ok(result.videoIds.includes(result.defaultVideoId));
    assert.ok(result.defaultImageId);
    assert.ok(result.defaultVideoId);
  }
});
test("custom model selection survives list normalization", () => {
  const result = saveStudioMediaLibrary({
    imageIds: ["custom/image", "custom/image", " "],
    videoIds: ["custom/video"],
    defaultImageId: "custom/image",
    defaultVideoId: "custom/video",
  });
  assert.deepEqual(result.imageIds, ["custom/image"]);
  assert.equal(result.defaultImageId, "custom/image");
  assert.equal(result.defaultVideoId, "custom/video");
});
