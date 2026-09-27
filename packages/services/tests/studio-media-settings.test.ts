import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingService } from "../src/setting/settingService.js";

test("legacy image model migration is persistent and cannot overwrite a newer selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-media-settings-"));
  const previousHome = process.env.ZCODE_DESKTOP_HOME_DIR;
  process.env.ZCODE_DESKTOP_HOME_DIR = root;
  const old = {
    imageIds: ["custom/old", "custom/new"],
    videoIds: ["test/video"],
    defaultImageId: "custom/old",
    defaultVideoId: "test/video",
  };
  try {
    const service = createSettingService();
    await service.initializeStudioMediaLibrary(old);
    assert.equal((await service.get()).studioMediaLibrary?.defaultImageId, "custom/old");
    await service.update({ studioMediaLibrary: { ...old, defaultImageId: "custom/new" } });
    await service.initializeStudioMediaLibrary(old);
    assert.equal(
      (await createSettingService().get()).studioMediaLibrary?.defaultImageId,
      "custom/new",
    );
    await assert.rejects(
      service.update({ studioMediaLibrary: { ...old, defaultImageId: "not-in-list" } }),
    );
  } finally {
    if (previousHome === undefined) delete process.env.ZCODE_DESKTOP_HOME_DIR;
    else process.env.ZCODE_DESKTOP_HOME_DIR = previousHome;
    await rm(root, { recursive: true, force: true });
  }
});
