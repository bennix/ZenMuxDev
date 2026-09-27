import assert from "node:assert/strict";
import { test } from "node:test";
import { createDecipheriv } from "node:crypto";
import { uploadWeixinImage } from "../src/bots/providers/weixinMediaUpload.js";

test("upload ciphertext decrypts to original image and sends CDN reference with encoded key", async () => {
  const original = globalThis.fetch;
  const input = Buffer.from("fake image fixture");
  let key: Buffer;
  let uploaded = false;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /encrypted_query_param=upload%2Btoken/);
    assert.equal(init?.method, "POST");
    const cipher = createDecipheriv("aes-128-ecb", key, null);
    assert.deepEqual(
      Buffer.concat([cipher.update(init?.body as Uint8Array), cipher.final()]),
      input,
    );
    uploaded = true;
    return new Response(null, { status: 200, headers: { "x-encrypted-param": "download-token" } });
  };
  try {
    const item = await uploadWeixinImage(input, "test@im.wechat", async (path, body) => {
      assert.equal(path, "/getuploadurl");
      const request = body as Record<string, unknown>;
      assert.equal(request.rawsize, input.length);
      assert.equal(request.filesize, 32);
      key = Buffer.from(request.aeskey as string, "hex");
      return { upload_param: "upload+token" };
    });
    assert.equal(uploaded, true);
    assert.equal(item.type, 2);
    assert.equal(item.image_item.media.encrypt_query_param, "download-token");
    assert.deepEqual(
      Buffer.from(Buffer.from(item.image_item.media.aes_key, "base64").toString(), "hex"),
      key!,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("missing upload confirmation fails instead of sending a broken image", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 200 });
  try {
    await assert.rejects(
      uploadWeixinImage(Buffer.from("image"), "test@im.wechat", async () => ({
        upload_full_url: "https://example.com/upload",
      })),
      /上传失败/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("provider delivers image with original context and login route", async () => {
  const { createWeixinBotProvider } = await import("../src/bots/providers/weixinProvider.js");
  const original = globalThis.fetch;
  const messages: any[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/getuploadurl"))
      return Response.json({ upload_full_url: "https://cdn.example.com/upload" });
    if (String(url).includes("cdn.example.com"))
      return new Response(null, { headers: { "x-encrypted-param": "image-ref" } });
    assert.equal(String(url), "https://alternate.weixin.qq.com/ilink/bot/sendmessage");
    messages.push(JSON.parse(String(init?.body)));
    return Response.json({ ret: 0 });
  };
  try {
    const provider = createWeixinBotProvider({ loadCredential: async () => "fixture-token" });
    await provider.sendImage!(
      {
        provider: "weixin",
        credentialRef: "fixture",
        weixinBaseUrl: "https://alternate.weixin.qq.com",
      } as never,
      {
        providerUserId: "test@im.wechat",
        providerContextToken: "opaque-context",
        text: "",
      } as never,
      Buffer.from("fixture"),
    );
    assert.equal(messages[0].msg.context_token, "opaque-context");
    assert.equal(messages[0].msg.from_user_id, "");
    assert.equal(messages[0].msg.item_list[0].type, 2);
    assert.equal(messages[0].msg.item_list[0].image_item.media.encrypt_query_param, "image-ref");
  } finally {
    globalThis.fetch = original;
  }
});
