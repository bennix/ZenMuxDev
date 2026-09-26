import type { BotConfig, BotInboundMessage } from "@zcode/shared";
import type { BotProviderAdapter } from "./providers/types.js";

/** Diagnostic milestone B: no model, workspace command or media execution. */
export async function replyWeixinEcho(
  bot: BotConfig,
  inbound: BotInboundMessage,
  provider: Pick<BotProviderAdapter, "send">,
): Promise<void> {
  const actor = inbound.actor;
  if (
    !actor.providerUserId.endsWith("@im.wechat") ||
    (actor.chatId && actor.chatId !== actor.providerUserId)
  )
    return;
  if (!inbound.text.trim()) return;
  await provider.send(bot, {
    botId: bot.id,
    provider: "weixin",
    providerUserId: actor.providerUserId,
    providerContextToken: actor.providerContextToken,
    text: inbound.text.trim() === "ping" ? "pong" : inbound.text,
  });
}
