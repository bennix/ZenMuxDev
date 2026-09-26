/** 生图和视频模型名单、缺省模型存在本机。比例和时长在生成时选择。 */

import {
  CUSTOM_IMAGE_RATIOS,
  CUSTOM_VIDEO_DURATIONS,
  CUSTOM_VIDEO_RATIOS,
  IMAGE_CATALOG,
  VIDEO_CATALOG,
  type ImageCatalogEntry,
  type VideoCatalogEntry,
} from "./studioMediaCatalog.js";

const STORAGE_KEY = "zencode.studio.media.v1";
const LEGACY_IMAGE_KEY = "zencode.studio.imageModel";
const DEFAULT_IMAGE_ID = "openai/gpt-image-2";
const DEFAULT_VIDEO_ID = "google/veo-3.1-fast-generate-001";

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
  return (
    VIDEO_CATALOG.find((model) => model.id === id) ?? {
      id,
      name: id,
      ratios: CUSTOM_VIDEO_RATIOS,
      durations: CUSTOM_VIDEO_DURATIONS,
    }
  );
}

function sanitize(raw: Partial<StudioMediaLibrary> | null): StudioMediaLibrary {
  const imageIds = unique(raw?.imageIds?.length ? raw.imageIds : IMAGE_CATALOG.map((model) => model.id));
  const videoIds = unique(raw?.videoIds?.length ? raw.videoIds : VIDEO_CATALOG.map((model) => model.id));
  const defaultImageId = imageIds.includes(raw?.defaultImageId ?? "")
    ? (raw?.defaultImageId as string)
    : imageIds.includes(DEFAULT_IMAGE_ID)
      ? DEFAULT_IMAGE_ID
      : imageIds[0];
  const defaultVideoId = videoIds.includes(raw?.defaultVideoId ?? "")
    ? (raw?.defaultVideoId as string)
    : videoIds.includes(DEFAULT_VIDEO_ID)
      ? DEFAULT_VIDEO_ID
      : videoIds[0];
  return {
    imageIds,
    videoIds,
    defaultImageId,
    defaultVideoId,
  };
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
    const library = sanitize(parsed);
    if (!stored) {
      const legacy = LEGACY_IMAGE_MODELS[localStorage.getItem(LEGACY_IMAGE_KEY) ?? ""] ?? localStorage.getItem(LEGACY_IMAGE_KEY);
      if (legacy && library.imageIds.includes(legacy)) library.defaultImageId = legacy;
    }
    return library;
  } catch {
    return sanitize(null);
  }
}

function writeStudioMediaLibrary(library: StudioMediaLibrary): StudioMediaLibrary {
  const next = sanitize(library);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    localStorage.setItem(LEGACY_IMAGE_KEY, next.defaultImageId);
  } catch {
    return next;
  }
  return next;
}

export function readStudioImageModel(): string {
  return readStudioMediaLibrary().defaultImageId;
}

export function readStudioVideoModel(): string {
  return readStudioMediaLibrary().defaultVideoId;
}

export function saveStudioMediaLibrary(library: StudioMediaLibrary): StudioMediaLibrary {
  return writeStudioMediaLibrary(library);
}
