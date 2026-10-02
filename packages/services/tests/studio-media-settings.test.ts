import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
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

test("retired video preset migrates once through settings owner and preserves other preferences", async () => {
  const root = await mkdtemp(join(tmpdir(), "zencode-video-settings-"));
  const previous = process.env.ZCODE_DESKTOP_HOME_DIR;
  process.env.ZCODE_DESKTOP_HOME_DIR = root;
  try {
    const service = createSettingService();
    await service.update({
      locale: "en-US",
      studioMediaLibrary: {
        imageIds: ["custom/image"],
        defaultImageId: "custom/image",
        videoIds: ["bytedance/doubao-seedance-1.5-pro", "google/veo-3.1-generate-001"],
        defaultVideoId: "bytedance/doubao-seedance-1.5-pro",
      },
    });
    // 模拟升级前已经落盘的旧默认，验证 get 的迁移持久化路径。
    const path = join(root, ".zcode", "v2", "setting.json");
    const raw = JSON.parse(await readFile(path, "utf8"));
    raw.studioMediaLibrary.videoIds = [
      "bytedance/doubao-seedance-1.5-pro",
      "google/veo-3.1-generate-001",
    ];
    raw.studioMediaLibrary.defaultVideoId = "bytedance/doubao-seedance-1.5-pro";
    await writeFile(path, JSON.stringify(raw));
    const first = await service.get();
    assert.equal(first.locale, "en-US");
    assert.deepEqual(first.studioMediaLibrary?.videoIds, ["google/veo-3.1-generate-001"]);
    assert.equal(first.studioMediaLibrary?.defaultVideoId, "google/veo-3.1-generate-001");
    assert.deepEqual(
      (await createSettingService().get()).studioMediaLibrary,
      first.studioMediaLibrary,
    );
    const persisted = JSON.parse(
      await readFile(join(root, ".zcode", "v2", "setting.json"), "utf8"),
    );
    assert.deepEqual(persisted.studioMediaLibrary, first.studioMediaLibrary);
  } finally {
    if (previous === undefined) delete process.env.ZCODE_DESKTOP_HOME_DIR;
    else process.env.ZCODE_DESKTOP_HOME_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
