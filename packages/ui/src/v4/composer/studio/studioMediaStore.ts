import {
  DEFAULT_STUDIO_IMAGE_MODEL as DEFAULT_IMAGE_ID,
  normalizeStudioVideoSelection,
  studioVideoCatalogEntry,
} from "@zcode/shared";
/** 旧版 localStorage 的一次性迁移与目录查询；当前模型设置由 Host Settings 服务持久化。 */

import {
  CUSTOM_IMAGE_RATIOS,
  IMAGE_CATALOG,
  VIDEO_CATALOG,
  type ImageCatalogEntry,
  type VideoCatalogEntry,
} from "./studioMediaCatalog.js";

const STORAGE_KEY = "zencode.studio.media.v1";
const LEGACY_IMAGE_KEY = "zencode.studio.imageModel";

const LEGACY_IMAGE_MODELS: Record<string, string> = {
  "google/gemini-3.1-flash-image-preview": "google/gemini-3.1-flash-image",
  "google/gemini-3-pro-image-preview": "google/gemini-3-pro-image",
};

export interface StudioMediaLibrary {
  imageIds: string[];
  videoIds: string[];
  defaultImageId: string;
  defaultVideoId: string;
}

export function imageCatalogEntry(id: string): ImageCatalogEntry {
  return (
    IMAGE_CATALOG.find((model) => model.id === id) ?? {
      id,
      name: id,
      protocol: "vertex",
      reference: "optional",
      ratioKind: "aspect",
      ratios: CUSTOM_IMAGE_RATIOS,
    }
  );
}

export function videoCatalogEntry(id: string): VideoCatalogEntry {
  return studioVideoCatalogEntry(id);
}

export function normalizeStudioMediaLibrary(
  raw: Partial<StudioMediaLibrary> | null,
): StudioMediaLibrary {
  let imageIds = unique(raw?.imageIds ?? []);
  let videoIds = unique(raw?.videoIds ?? []);
  // 修复：空白 ID 清理后也可能为空；恢复目录才能保证默认模型属于可用列表。
  if (!imageIds.length) imageIds = IMAGE_CATALOG.map((model) => model.id);
  if (!videoIds.length) videoIds = VIDEO_CATALOG.map((model) => model.id);
  const defaultImageId = imageIds.includes(raw?.defaultImageId ?? "")
    ? (raw?.defaultImageId as string)
    : imageIds.includes(DEFAULT_IMAGE_ID)
      ? DEFAULT_IMAGE_ID
      : (imageIds[0] ?? DEFAULT_IMAGE_ID);
  return normalizeStudioVideoSelection({
    imageIds,
    videoIds,
    defaultImageId,
    defaultVideoId: raw?.defaultVideoId ?? "",
  });
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const mapped = LEGACY_IMAGE_MODELS[id] ?? id.trim();
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    next.push(mapped);
  }
  return next;
}

export function readStudioMediaLibrary(): StudioMediaLibrary {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as Partial<StudioMediaLibrary>) : null;
    const library = normalizeStudioMediaLibrary(parsed);
    if (!stored) {
      const legacy =
        LEGACY_IMAGE_MODELS[localStorage.getItem(LEGACY_IMAGE_KEY) ?? ""] ??
        localStorage.getItem(LEGACY_IMAGE_KEY);
      if (legacy && library.imageIds.includes(legacy)) library.defaultImageId = legacy;
    }
    return library;
  } catch {
    return normalizeStudioMediaLibrary(null);
  }
}

export function readStudioImageModel(): string {
  return readStudioMediaLibrary().defaultImageId;
}

export function readStudioVideoModel(): string {
  return readStudioMediaLibrary().defaultVideoId;
}
