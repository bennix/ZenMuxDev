import { useState } from "react";
const initial = {
  imageIds: ["openai/gpt-image-2", "google/gemini-2.5-flash-image"],
  videoIds: ["test/video"],
  defaultImageId: "openai/gpt-image-2",
  defaultVideoId: "test/video",
};
export function useSettings() {
  const [settings, setSettings] = useState({ studioMediaLibrary: initial });
  return {
    settings,
    loading: false,
    error: null,
    update: async (patch: any) => {
      setSettings((value) => ({ ...value, ...patch }));
      (window as any).savedMedia = patch.studioMediaLibrary;
    },
  };
}
