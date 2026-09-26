/**
 * 把贴上来的附件读成正文。
 * 以前只认纯文本，docx 只剩文件名，讨论就会说没有附件正文。
 */
import { createPdfJsDocumentOptions } from "@/lib/pdfJsAssets.js";
import { isTextLikeAttachment } from "@/lib/chatAttachmentMetadata.js";

const TEXT_LIMIT = 12000;
const BYTE_LIMIT = 20 * 1024 * 1024;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  dataStart: number;
}

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function clip(text: string): string {
  return text.replace(/\n{3,}/gu, "\n\n").trim().slice(0, TEXT_LIMIT);
}

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)));
}

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= min; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count && offset + 46 <= bytes.length; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (localOffset + 30 <= bytes.length) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      entries.push({
        name,
        method,
        compressedSize,
        dataStart: localOffset + 30 + localNameLength + localExtraLength,
      });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const raw = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8 || typeof DecompressionStream === "undefined") return "";
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

async function zipXml(file: File, names: readonly string[]): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipEntries(bytes);
  const wanted = names.length > 0
    ? names
    : entries.map((entry) => entry.name).filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name));
  const ordered = [...wanted].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const texts: string[] = [];
  for (const name of ordered) {
    const entry = entries.find((item) => item.name === name);
    if (!entry) continue;
    texts.push(await inflateEntry(bytes, entry));
  }
  return texts;
}

function docxPlain(xml: string): string {
  return xml.split(/<w:p[ >]/u).map((paragraph) => {
    const text = paragraph.replace(/<w:tab\/>/gu, "\t").replace(/<w:br\/>/gu, "\n");
    return [...text.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/gu)].map((match) => decodeXml(match[1] ?? "")).join("");
  }).filter(Boolean).join("\n");
}

function slidePlain(xml: string): string {
  return [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/gu)].map((match) => decodeXml(match[1] ?? "")).join("\n");
}

function sheetPlain(xml: string): string {
  return [...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/gu)].map((match) => decodeXml(match[1] ?? "")).join("\n");
}

async function pdfPlain(file: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const options = createPdfJsDocumentOptions(
    typeof import.meta.env?.BASE_URL === "string" ? import.meta.env.BASE_URL : "./",
    globalThis.location?.href ?? "http://localhost/",
  );
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...options }).promise;
  const pages: string[] = [];
  const count = Math.min(document.numPages, 20);
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(""));
  }
  return pages.join("\n");
}

export async function readDeckAttachmentText(file: File): Promise<string> {
  if (file.size > BYTE_LIMIT) return "";
  const extension = extensionOf(file.name);
  if (isTextLikeAttachment({ filename: file.name, mimeType: file.type })) {
    return clip(await file.text());
  }
  if (extension === "docx") {
    const [xml] = await zipXml(file, ["word/document.xml"]);
    return xml ? clip(docxPlain(xml)) : "";
  }
  if (extension === "pptx") {
    return clip((await zipXml(file, [])).map(slidePlain).filter(Boolean).join("\n\n"));
  }
  if (extension === "xlsx") {
    const [xml] = await zipXml(file, ["xl/sharedStrings.xml"]);
    return xml ? clip(sheetPlain(xml)) : "";
  }
  if (extension === "pdf" || file.type === "application/pdf") return clip(await pdfPlain(file));
  return "";
}
