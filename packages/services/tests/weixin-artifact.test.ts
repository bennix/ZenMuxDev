import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareWeixinArtifact, readWeixinArtifact } from "../src/bots/weixinArtifact.js";
import { uploadWeixinFile } from "../src/bots/providers/weixinMediaUpload.js";
import { createDecipheriv } from "node:crypto";
test("only validated PDF and PNG artifacts can be delivered", async () => {
  const root = await mkdtemp(join(tmpdir(), "wx-artifacts-"));
  try {
    const pdf = await prepareWeixinArtifact(root, "pdf");
    await writeFile(pdf.path, "%PDF-1.7\nfixture");
    assert.match((await readWeixinArtifact(root, pdf.path, "pdf")).toString(), /%PDF/);
    await assert.rejects(readWeixinArtifact(root, pdf.path, "chart"), /格式/);
    const outside = join(root, "secret.pdf");
    await writeFile(outside, "%PDF-1.7");
    const escape = await prepareWeixinArtifact(root, "pdf");
    await symlink(outside, escape.path);
    await assert.rejects(readWeixinArtifact(root, escape.path, "pdf"), /越界/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("PDF upload uses file media type, exact bytes and file message fields", async () => {
  const bytes = Buffer.from("%PDF-1.7 fixture");
  let key: Buffer;
  const item = await uploadWeixinFile(
    bytes,
    "report.pdf",
    "fixture@im.wechat",
    async (_, body) => {
      const b = body as Record<string, unknown>;
      assert.equal(b.media_type, 3);
      assert.equal(b.rawsize, bytes.length);
      key = Buffer.from(b.aeskey as string, "hex");
      return { upload_full_url: "https://example.com/upload" };
    },
    async (_, init) => {
      const decipher = createDecipheriv("aes-128-ecb", key, null);
      assert.deepEqual(
        Buffer.concat([decipher.update(init?.body as Uint8Array), decipher.final()]),
        bytes,
      );
      return new Response(null, { headers: { "x-encrypted-param": "fixture" } });
    },
  );
  assert.equal(item.type, 4);
  assert.equal(item.file_item.file_name, "report.pdf");
  assert.equal(item.file_item.len, String(bytes.length));
});
test("file provider returns original context token and fresh client id", async () => {
  const { createWeixinBotProvider } = await import("../src/bots/providers/weixinProvider.js");
  const messages: any[] = [];
  const provider = createWeixinBotProvider({
    loadCredential: async () => "fixture",
    fetchImpl: async (url, init) => {
      if (String(url).endsWith("/getuploadurl"))
        return Response.json({ upload_full_url: "https://example.com/upload" });
      if (String(url) === "https://example.com/upload")
        return new Response(null, { headers: { "x-encrypted-param": "fixture" } });
      messages.push(JSON.parse(String(init?.body)));
      return Response.json({ ret: 0 });
    },
  });
  for (let i = 0; i < 2; i++)
    await provider.sendFile!(
      { provider: "weixin", credentialRef: "fixture" } as never,
      { providerUserId: "fixture", providerContextToken: "opaque", text: "" } as never,
      Buffer.from("%PDF-1.7"),
      "report.pdf",
    );
  assert.equal(messages[0].msg.item_list[0].type, 4);
  assert.equal(messages[0].msg.context_token, "opaque");
  assert.equal(messages[0].msg.from_user_id, "");
  assert.notEqual(messages[0].msg.client_id, messages[1].msg.client_id);
});
