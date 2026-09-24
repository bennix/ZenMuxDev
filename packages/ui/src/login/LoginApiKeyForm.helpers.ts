import { ZENMUX_TEMPLATE_ID, type AppSettings, type Locale } from "@zcode/shared";
import type { ModelSelectionView } from "@zcode/services";
import { encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";

export type ApiKeyProviderChoice = "zenmux";

export function resolveLoginApiKeyDefaultProvider(_locale: Locale): ApiKeyProviderChoice {
  return "zenmux";
}

export function resolveLoginApiKeyTemplateId(
  _choice: ApiKeyProviderChoice,
): typeof ZENMUX_TEMPLATE_ID {
  return ZENMUX_TEMPLATE_ID;
}

export function resolveLoginApiKeyProviderLabel(_choice: ApiKeyProviderChoice): string {
  return "ZenMux";
}

export function buildLoginApiKeySkipSettings(
  _choice: ApiKeyProviderChoice,
  now: number,
): Pick<AppSettings, "providerFamilyDomainUpdatedAt" | "providerFamilyDomainMigrated"> {
  return {
    providerFamilyDomainUpdatedAt: now,
    providerFamilyDomainMigrated: true,
  };
}

export function shouldShowLoginApiKeyLink(
  apiKeyValue: string,
  apiKeyUrl: string | undefined,
): boolean {
  return Boolean(apiKeyUrl) && apiKeyValue.trim().length === 0;
}

export function buildLoginApiKeyDefaultModelPreferenceFromSelection(
  view: ModelSelectionView,
  providerId: string,
): string | null {
  const firstModel = view.providers.find((provider) => provider.providerId === providerId)
    ?.models[0]?.modelId;
  return firstModel ? encodeCustomModelValue(providerId, firstModel) : null;
}
