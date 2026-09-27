import { open, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { BotConfig, BotsStateFile, WeixinFileRequest, WeixinFileScope } from "@zcode/shared";
import { weixinFileRequestSchema } from "@zcode/shared";
import type { BotsRepo } from "./repo.js";
import type { BotProviderAdapter } from "./providers/types.js";
import { isWeixinActorAllowed } from "./weixinAccess.js";
import { isWorkspaceAllowed } from "./workspaceHelpers.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
export function availableWeixinRecipients(
  bots: BotConfig[],
  state: BotsStateFile,
  scope: WeixinFileScope,
) {
  const key = scope.workspaceIdentity?.trim() || scope.workspacePath;
  return Object.entries(state.weixinRecipients ?? {})
    .flatMap(([id, recipient]) => {
      const bot = bots.find((item) => item.id === recipient.botId);
      const context = Object.values(state.bots).find(
        (item) =>
          item.botId === recipient.botId &&
          (item.workspaceIdentity?.trim() || item.workspacePath) === key,
      );
      if (
        !bot ||
        !recipient.contextToken ||
        !isWorkspaceAllowed(context?.workspaceId ?? "", bot.allowedWorkspaces) ||
        !isWeixinActorAllowed(bot, {
          provider: "weixin",
          botId: bot.id,
          providerUserId: recipient.userId,
          chatType: "private",
        })
      )
        return [];
      return [{ id, label: `${bot.name} · ${recipient.userId}`, bot, recipient }];
    })
    .sort((a, b) => b.recipient.updatedAt - a.recipient.updatedAt);
}
export async function readWeixinShareFile(workspacePath: string, path: string) {
  const root = await realpath(workspacePath);
  const resolved = await realpath(resolve(root, path));
  const rel = relative(root, resolved);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("只能发送当前工作区内的文件");
  const handle = await open(resolved, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FILE_BYTES)
      throw new Error("文件必须为非空普通文件，且不超过 20 MB");
    const bytes = await handle.readFile();
    if (bytes.length > MAX_FILE_BYTES) throw new Error("文件超过 20 MB");
    return { bytes, name: basename(resolved) };
  } finally {
    await handle.close();
  }
}
export async function deliverWeixinFile(
  repo: Pick<BotsRepo, "readConfig" | "readState">,
  adapter: BotProviderAdapter | null | undefined,
  params: WeixinFileScope & WeixinFileRequest,
) {
  const request = weixinFileRequestSchema.parse({
    action: params.action,
    path: params.path,
    recipientId: params.recipientId,
  });
  const available = availableWeixinRecipients(
    (await repo.readConfig()).bots,
    await repo.readState(),
    params,
  );
  const recipients = available.map(({ id, label }) => ({ id, label }));
  if (request.action === "list") return { recipients, sent: false };
  if (!request.path) throw new Error("请指定要发送的文件");
  const selected = request.recipientId
    ? available.find((item) => item.id === request.recipientId)
    : available[0];
  if (!selected) throw new Error("没有可用的微信会话，请绑定当前工作区并在微信发送一条消息");
  if (!adapter?.sendFile) throw new Error("微信文件发送不可用");
  const file = await readWeixinShareFile(params.workspacePath, request.path);
  // 修复：发送必须使用该接收方最新的 context_token，不能仅凭扫码账号伪造会话。
  await adapter.sendFile(
    selected.bot,
    {
      provider: "weixin",
      botId: selected.bot.id,
      providerUserId: selected.recipient.userId,
      providerContextToken: selected.recipient.contextToken,
      text: "",
    },
    file.bytes,
    file.name,
  );
  return { recipients: [{ id: selected.id, label: selected.label }], sent: true };
}
