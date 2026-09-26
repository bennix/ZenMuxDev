import type { BotActor, BotConfig } from "@zcode/shared";

export function isWeixinActorAllowed(bot: BotConfig, actor: BotActor): boolean {
  // 修复：iLink 登录成功不代表任意来信人获授权；默认仅允许扫码用户，空名单明确拒绝全部。
  const allowed = bot.weixinAllowedUsers ?? (bot.weixinUserId ? [bot.weixinUserId] : []);
  return (
    bot.enabled &&
    bot.provider === "weixin" &&
    actor.provider === "weixin" &&
    bot.id === actor.botId &&
    actor.chatType === "private" &&
    (!actor.chatId || actor.chatId === actor.providerUserId) &&
    actor.providerUserId.endsWith("@im.wechat") &&
    allowed.includes(actor.providerUserId)
  );
}
