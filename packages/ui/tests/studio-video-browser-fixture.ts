import { useState } from "react";
const initial = {
  imageIds: ["openai/gpt-image-2"],
  defaultImageId: "openai/gpt-image-2",
  videoIds: [
    "google/veo-3.1-generate-001",
    "google/gemini-omni-1.1-flash-preview",
    "alibaba/wan3.0-video",
  ],
  defaultVideoId: "google/veo-3.1-generate-001",
};
export function useSettings() {
  const [settings, setSettings] = useState({ studioMediaLibrary: initial });
  (window as unknown as { setVideoModel: (id: string) => void }).setVideoModel = (id) =>
    setSettings((value) => ({
      ...value,
      studioMediaLibrary: { ...value.studioMediaLibrary, defaultVideoId: id },
    }));
  return { settings, loading: false, error: null, update: async () => {} };
}
