import { isApiKeyAccess } from "@zcode/provider";
import type { ModelSelectionView } from "@zcode/services";

interface ProviderAvailabilityState {
  readonly source: "registry";
  readonly hydrated: boolean;
  readonly providerCount: number;
  readonly hasUsableProvider: boolean;
}

function providerHasSavedCredential(
  provider: ModelSelectionView["providers"][number],
): boolean {
  const access = provider.config.access;
  if (!access) return false;
  if (access.type === "zhipu-account") return true;
  return isApiKeyAccess(access) && Boolean(access.apiKey?.trim());
}

export function resolveProviderAvailabilityState(params: {
  modelSelectionView: ModelSelectionView | null;
}): ProviderAvailabilityState {
  const providers = params.modelSelectionView?.providers ?? [];
  return {
    source: "registry",
    hydrated: params.modelSelectionView !== null,
    providerCount: providers.length,
    // 只有写下了 API Key（或账号登录）且已有模型，才算可直接进入工作区。
    hasUsableProvider:
      params.modelSelectionView !== null &&
      providers.some(
        (provider) => provider.models.length > 0 && providerHasSavedCredential(provider),
      ),
  };
}
