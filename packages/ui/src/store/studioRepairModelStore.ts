import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StudioRepairModelState {
  modelId: string;
  setModelId: (modelId: string) => void;
}

/** 修复模型独立于成稿模型；任务开始时读取，避免中途切换模型和推理参数。 */
export const useStudioRepairModelStore = create<StudioRepairModelState>()(
  persist((set) => ({ modelId: "", setModelId: (modelId) => set({ modelId }) }), {
    name: "zencode.studio.repair-model",
    partialize: ({ modelId }) => ({ modelId }),
  }),
);

export function resolveStudioRepairModel(writer: string): string {
  return useStudioRepairModelStore.getState().modelId.trim() || writer;
}
