const MAX_CIPHERTEXT_BYTES = 5 * 1024 * 1024 + 16;
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Keep the existing Bot plaintext limit, allowing one AES padding block. */
export async function downloadWeixinCiphertext(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body)
      throw new Error(`Weixin attachment download failed: HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_CIPHERTEXT_BYTES) {
      await response.body.cancel();
      throw new Error("Weixin attachment exceeds 5MB.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_CIPHERTEXT_BYTES) {
          await reader.cancel();
          throw new Error("Weixin attachment exceeds 5MB.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}
