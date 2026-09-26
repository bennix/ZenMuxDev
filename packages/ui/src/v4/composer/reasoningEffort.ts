import type { ModelSelectionView } from "@zcode/services";

/** 没选过时用 medium；该模型没有 medium 就用最高一档。 */
export function defaultEffort(efforts: readonly string[]): string {
  if (efforts.includes("medium")) return "medium";
  return efforts.at(-1) ?? "";
}

export function resolveEffort(effort: string, efforts: readonly string[]): string {
  if (effort && efforts.includes(effort)) return effort;
  return defaultEffort(efforts);
}

/** GPT-6 Astra 不接受 minimal 和 none，Sol 不接受 minimal。传了会得到 400。 */
export function supportedEfforts(modelId: string, efforts: readonly string[]): readonly string[] {
  const blocked = /gpt-6-astra/iu.test(modelId)
    ? new Set(["minimal", "none"])
    : /gpt-6-sol/iu.test(modelId)
      ? new Set(["minimal"])
      : null;
  return blocked ? efforts.filter((effort) => !blocked.has(effort)) : efforts;
}

export function modelEfforts(view: ModelSelectionView | null, modelId: string): readonly string[] {
  const model = view?.providers.flatMap((provider) => provider.models).find((item) => item.modelId === modelId);
  return supportedEfforts(modelId, model?.config.optionSpecs.reasoningLevel?.values ?? []);
}

/** 和主界面的档位映射一致：Claude 用思考预算，Gemini 3 用 thinking_level，其余用 reasoning_effort。 */
export function reasoningBody(modelId: string, effort: string): Record<string, unknown> | undefined {
  const level = /gpt-6-astra/iu.test(modelId) && (effort === "minimal" || effort === "none")
    ? "medium"
    : /gpt-6-sol/iu.test(modelId) && effort === "minimal"
      ? "medium"
      : effort;
  if (!level) return undefined;
  if (/claude|anthropic\//iu.test(modelId)) {
    const budget = level === "low" || level === "minimal" ? 4000 : level === "high" ? 24000 : 10000;
    return { thinking: { type: "enabled", budget_tokens: budget } };
  }
  if (/gemini-3/iu.test(modelId)) return { thinking_level: level.toUpperCase() };
  if (/gemini/iu.test(modelId)) {
    const budget = level === "low" || level === "minimal" ? 4000 : level === "high" ? 24000 : 10000;
    return { thinking_budget: budget };
  }
  return { reasoning_effort: level };
}
