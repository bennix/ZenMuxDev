import { createHash } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import plist from "plist";

export async function refreshMacAsarIntegrity(context) {
  if (context.electronPlatformName !== "darwin") return;
  const contents = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
  );
  const archive = await open(join(contents, "Resources", "app.asar"), "r");
  let hash;
  try {
    // ASAR 的两个 Pickle 头共 16 字节；只异步读取 JSON header，避免加载整个归档。
    const prefix = Buffer.alloc(16);
    if ((await archive.read(prefix, 0, 16, 0)).bytesRead !== 16)
      throw new Error("Invalid ASAR prefix");
    const headerSize = prefix.readUInt32LE(4);
    const jsonSize = prefix.readUInt32LE(12);
    if (
      prefix.readUInt32LE(0) !== 4 ||
      jsonSize === 0 ||
      jsonSize > headerSize - 8 ||
      headerSize > (await archive.stat()).size - 8
    )
      throw new Error("Invalid ASAR header size");
    const header = Buffer.alloc(jsonSize);
    if ((await archive.read(header, 0, jsonSize, 16)).bytesRead !== jsonSize)
      throw new Error("Incomplete ASAR header");
    JSON.parse(header.toString("utf8"));
    hash = createHash("sha256").update(header).digest("hex");
  } finally {
    await archive.close();
  }
  const infoPath = join(contents, "Info.plist");
  const info = plist.parse(await readFile(infoPath, "utf8"));
  // 修复：afterPack 重写归档后旧哈希失效，必须在签名前以最终 header 更新完整性元数据。
  info.ElectronAsarIntegrity = {
    ...info.ElectronAsarIntegrity,
    "Resources/app.asar": { algorithm: "SHA256", hash },
  };
  await writeFile(infoPath, plist.build(info));
}
