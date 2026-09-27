import { useSettings } from "./useSettingService.js";
import {
  readStudioMediaLibrary,
  normalizeStudioMediaLibrary,
  type StudioMediaLibrary,
} from "@/v4/composer/studio/studioMediaStore.js";

/** 各 Host 的 Settings 服务拥有默认模型；Renderer 只呈现它的快照。 */
export function useStudioMediaLibrary() {
  const { settings, loading, update, error } = useSettings();
  return {
    library: settings?.studioMediaLibrary ?? readStudioMediaLibrary(),
    loading,
    error,
    save: (next: StudioMediaLibrary) =>
      update({ studioMediaLibrary: normalizeStudioMediaLibrary(next) }),
  };
}
