import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginWeixinRegistration,
  pollWeixinRegistration,
} from "../src/bots/providers/weixinRegistration.js";
import { createWeixinBotProvider, getWeixinUpdates } from "../src/bots/providers/weixinProvider.js";

async function withFetch(
  responses: unknown[],
  run: (calls: Array<{ url: string; init: RequestInit }>) => Promise<void>,
) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("settings QR uses POST and keeps polling key distinct from display URL", async () => {
  await withFetch(
    [{ qrcode: "poll-key", qrcode_img_content: "https://example.test/scan" }],
    async (calls) => {
      const result = await beginWeixinRegistration();
      assert.equal(result.qrCode, "poll-key");
      assert.equal(result.qrUrl, "https://example.test/scan");
      assert.equal(calls[0]?.init.method, "POST");
      assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { local_token_list: [] });
    },
  );
});

test("confirmed login preserves routing and account identity", async () => {
  await withFetch(
    [
      {
        status: "confirmed",
        bot_token: "test-token",
        baseurl: "https://alternate.weixin.qq.com",
        ilink_bot_id: "b@im.bot",
        ilink_user_id: "u@im.wechat",
      },
    ],
    async () => {
      const result = await pollWeixinRegistration({ qrCode: "key" });
      assert.equal(result.status, "success");
      if (result.status === "success") {
        assert.equal(result.baseUrl, "https://alternate.weixin.qq.com");
        assert.equal(result.userId, "u@im.wechat");
      }
    },
  );
});

const bot = {
  id: "test",
  enabled: true,
  weixinUserId: "u@im.wechat",
  provider: "weixin",
  credentialRef: "test-token",
  providerUserId: "b@im.bot",
  weixinBaseUrl: "https://alternate.weixin.qq.com",
} as unknown as import("@zcode/shared").BotConfig;
const deps = { loadCredential: async () => "test-token" };

test("echo reply uses authenticated protocol headers and exact context token", async () => {
  await withFetch([{ ret: 0 }], async (calls) => {
    await createWeixinBotProvider(deps).send(bot, {
      providerUserId: "u@im.wechat",
      providerContextToken: "opaque-context",
      text: "pong",
    } as never);
    assert.match(calls[0]!.url, /^https:\/\/alternate.weixin.qq.com\/ilink\/bot\/sendmessage/);
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["iLink-App-Id"], "bot");
    assert.equal(headers["iLink-App-ClientVersion"], "132102");
    assert.match(Buffer.from(headers["X-WECHAT-UIN"]!, "base64").toString(), /^\d+$/);
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.msg.from_user_id, "");
    assert.equal(body.msg.context_token, "opaque-context");
    assert.equal(body.msg.item_list[0].text_item.text, "pong");
    assert.equal(body.base_info.channel_version, "2.4.8");
    assert.equal(body.base_info.bot_agent, "ZenCode");
  });
});

test("expired tokens are machine-readable and missing context cannot send", async () => {
  await withFetch([{ errcode: -14 }], async () => {
    await assert.rejects(
      getWeixinUpdates({ bot, deps, buf: "", signal: new AbortController().signal }),
      (error: unknown) => (error as { code: string }).code === "WEIXIN_SESSION_EXPIRED",
    );
  });
  await withFetch([], async (calls) => {
    await assert.rejects(
      createWeixinBotProvider(deps).send(bot, { providerUserId: "u", text: "pong" } as never),
      /context_token/,
    );
    assert.equal(calls.length, 0);
  });
});

test("verification and redirect return actionable settings states", async () => {
  await withFetch(
    [
      { status: "need_verifycode" },
      { status: "scaned_but_redirect", redirect_host: "alternate.weixin.qq.com" },
    ],
    async (calls) => {
      assert.equal((await pollWeixinRegistration({ qrCode: "key" })).status, "need_verifycode");
      const next = await pollWeixinRegistration({
        qrCode: "key",
        verifyCode: "123456",
        baseUrl: "https://alternate.weixin.qq.com",
      });
      assert.equal(next.status, "redirect");
      assert.match(calls[1]!.url, /verify_code=123456/);
      if (next.status === "redirect") assert.equal(next.baseUrl, "https://alternate.weixin.qq.com");
    },
  );
});

test("text chunks have unique IDs and preserve Unicode", async () => {
  await withFetch([{ ret: 0 }, { ret: 0 }], async (calls) => {
    await createWeixinBotProvider(deps).send(bot, {
      providerUserId: "u@im.wechat",
      providerContextToken: "context",
      text: "😀".repeat(4001),
    } as never);
    const messages = calls.map((call) => JSON.parse(String(call.init.body)).msg);
    assert.equal(messages.length, 2);
    assert.notEqual(messages[0].client_id, messages[1].client_id);
    assert.equal(
      messages.map((msg) => msg.item_list[0].text_item.text).join(""),
      "😀".repeat(4001),
    );
  });
});

test("milestone B replies pong without entering the agent and ignores groups", async () => {
  const { replyWeixinEcho } = await import("../src/bots/weixinEcho.js");
  const replies: string[] = [];
  const provider = {
    send: async (_bot: unknown, message: { text: string }) => {
      replies.push(message.text);
    },
  };
  await replyWeixinEcho(
    bot,
    {
      text: "ping",
      actor: {
        botId: "test",
        provider: "weixin",
        chatType: "private",
        providerUserId: "u@im.wechat",
        providerContextToken: "context",
      },
    } as never,
    provider,
  );
  await replyWeixinEcho(
    bot,
    { text: "ping", actor: { providerUserId: "u@im.wechat", chatId: "group@chatroom" } } as never,
    provider,
  );
  assert.deepEqual(replies, ["pong"]);
});

test("cursor persists without workspace and survives stale context writes", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { setDataBaseDir } = await import("../src/paths.js");
  const { BotsRepo } = await import("../src/bots/repo.js");
  const root = await mkdtemp(join(tmpdir(), "weixin-cursor-test-"));
  setDataBaseDir(root);
  try {
    const repo = new BotsRepo();
    const stale = await repo.readState();
    await repo.updateWeixinCursor("bot", "opaque-cursor");
    await repo.writeState(stale);
    assert.equal((await new BotsRepo().readState()).weixinCursors?.bot, "opaque-cursor");
    await repo.updateWeixinCursor("bot", null);
    assert.equal((await repo.readState()).weixinCursors?.bot, undefined);
  } finally {
    setDataBaseDir(null);
    await rm(root, { recursive: true, force: true });
  }
});

test("Weixin access defaults to scanner and rejects groups, strangers and explicit empty list", async () => {
  const { isWeixinActorAllowed } = await import("../src/bots/weixinAccess.js");
  const { findAuthorizedBot, findBoundUser } = await import("../src/bots/botConfigHelpers.js");
  const configured = { ...bot, enabled: true, weixinUserId: "owner@im.wechat" };
  const actor = {
    botId: "test",
    provider: "weixin",
    providerUserId: "owner@im.wechat",
    chatType: "private",
  } as const;
  assert.equal(isWeixinActorAllowed(configured, actor), true);
  assert.equal(
    isWeixinActorAllowed(configured, { ...actor, providerUserId: "stranger@im.wechat" }),
    false,
  );
  assert.equal(isWeixinActorAllowed({ ...configured, weixinUserId: undefined }, actor), false);
  assert.equal(isWeixinActorAllowed({ ...configured, weixinAllowedUsers: [] }, actor), false);
  assert.equal(isWeixinActorAllowed(configured, { ...actor, chatType: "group" }), false);
  assert.equal(isWeixinActorAllowed(configured, { ...actor, chatId: "group" }), false);
  const custom = { ...configured, weixinAllowedUsers: ["other@im.wechat"] };
  assert.equal(isWeixinActorAllowed(custom, { ...actor, providerUserId: "other@im.wechat" }), true);
  assert.equal(findAuthorizedBot({ bots: [custom] } as never, actor), null);
  assert.equal(findBoundUser(custom, actor), null);
});

test("typing starts then cancels with original context; no ticket sends nothing", async () => {
  await withFetch(
    [{ typing_ticket: "ticket" }, { ret: 0 }, { typing_ticket: "ticket" }, { ret: 0 }],
    async (calls) => {
      const provider = createWeixinBotProvider(deps);
      const target = { providerUserId: "u@im.wechat", providerContextToken: "original" };
      await Promise.all([provider.sendTyping!(bot, target), provider.stopTyping!(bot, target)]);
      assert.deepEqual(
        calls.map((call) => new URL(call.url).pathname.split("/").pop()),
        ["getconfig", "sendtyping", "getconfig", "sendtyping"],
      );
      assert.equal(JSON.parse(String(calls[0]!.init.body)).context_token, "original");
      assert.equal(JSON.parse(String(calls[1]!.init.body)).status, 1);
      assert.equal(JSON.parse(String(calls[3]!.init.body)).status, 2);
    },
  );
  await withFetch([{}], async (calls) => {
    await createWeixinBotProvider(deps).sendTyping!(bot, { providerUserId: "u@im.wechat" });
    assert.equal(calls.length, 1);
  });
});

test("typing refresh bursts coalesce and cancellation stays last", async () => {
  await withFetch(
    [{ typing_ticket: "ticket" }, {}, { typing_ticket: "ticket" }, {}],
    async (calls) => {
      const provider = createWeixinBotProvider(deps);
      const target = { providerUserId: "u@im.wechat", providerContextToken: "ctx" };
      await Promise.all([
        provider.sendTyping!(bot, target),
        provider.sendTyping!(bot, target),
        provider.sendTyping!(bot, target),
        provider.stopTyping!(bot, target),
      ]);
      assert.equal(calls.length, 4);
      assert.equal(JSON.parse(String(calls[3]!.init.body)).status, 2);
    },
  );
});
