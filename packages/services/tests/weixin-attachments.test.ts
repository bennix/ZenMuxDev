import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { test } from "node:test";
import { createWeixinBotProvider } from "../src/bots/providers/weixinProvider.js";

const provider = createWeixinBotProvider({ loadCredential: async () => "unused" });
const key = Buffer.from("0123456789abcdef");
function fileItem(media = {}) {
  return {
    type: 4,
    file_item: {
      file_name: "Python 第一课.pdf",
      len: "22",
      media: { encrypt_query_param: "param+/=", aes_key: key.toString("base64"), ...media },
    },
  };
}
function parse(item: unknown) {
  return provider.parseCallback({
    botId: "test",
    msgs: [{ from_user_id: "u@im.wechat", context_token: "context", item_list: [item] }],
  });
}
test("PDF CDN reference constructs encoded URL, preserves length/name and decrypts exact bytes", async () => {
  const attachment = parse(fileItem())[0]!.attachments![0]!;
  assert.equal(attachment.filename, "Python 第一课.pdf");
  assert.equal(attachment.mimeType, "application/pdf");
  assert.equal(attachment.sizeBytes, 22);
  assert.equal(
    new URL(attachment.downloadUrl!).searchParams.get("encrypted_query_param"),
    "param+/=",
  );
  assert.equal(new URL(attachment.downloadUrl!).origin, "https://novac2c.cdn.weixin.qq.com");
  const original = Buffer.from("%PDF-1.7\nfixture\n%%EOF");
  const cipher = createCipheriv("aes-128-ecb", key, null);
  const encrypted = Buffer.concat([cipher.update(original), cipher.final()]);
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(encrypted);
  try {
    const downloaded = await provider.downloadAttachment!({} as never, attachment);
    assert.deepEqual(Buffer.from(downloaded!.data), original);
    await assert.rejects(
      provider.downloadAttachment!({} as never, { ...attachment, providerMetadata: {} }),
      /AES/,
    );
  } finally {
    globalThis.fetch = previous;
  }
});
test("full URL wins and transcribed voice becomes text without duplicated media", () => {
  assert.equal(
    parse(fileItem({ full_url: "https://example.test/full" }))[0]!.attachments![0]!.downloadUrl,
    "https://example.test/full",
  );
  const voice = parse({
    type: 3,
    voice_item: {
      text: "请总结这份 PDF",
      media: { encrypt_query_param: "q", aes_key: key.toString("base64") },
    },
  });
  assert.equal(voice[0]!.text, "请总结这份 PDF");
  assert.equal(voice[0]!.attachments?.length ?? 0, 0);
});
