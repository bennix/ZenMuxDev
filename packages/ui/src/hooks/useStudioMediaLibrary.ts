import { useSettings } from "./useSettingService.js";
import {
  readStudioMediaLibrary,
  normalizeStudioMediaLibrary,
  type StudioMediaLibrary,
} from "@/v4/composer/studio/studioMediaStore.js";

/** 各 Host 的 Settings 服务拥有默认模型；Renderer 只呈现它的快照。 */
export function useStudioMediaLibrary() {
  const { settings, loading, update, error } = useSettings();
  // 显式使用公开界面类型，避免增量声明生成引用 shared 的内部协议路径。
  const library: StudioMediaLibrary = settings?.studioMediaLibrary ?? readStudioMediaLibrary();
  return {
    library,
    loading,
    error,
    save: (next: StudioMediaLibrary) =>
      update({ studioMediaLibrary: normalizeStudioMediaLibrary(next) }),
  };
}
