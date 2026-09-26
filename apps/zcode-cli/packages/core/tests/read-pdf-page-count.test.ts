import assert from "node:assert/strict";
import { test } from "node:test";
import { readPdfFile, formatReadPdfPagesOutput } from "../src/tool/handlers/read-pdf.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

test("partial PDF rendering exposes actual total count rather than slide footer count", async () => {
  const context = {
    abortSignal: new AbortController().signal,
    fileSystemPort: { stat: async () => ({ kind: "file", sizeBytes: 3661771 }) },
    pdfDocumentPort: {
      getPageCount: async () => 24,
      renderPages: async () => [{ pageNumber: 20, data: new Uint8Array([1]), mediaType: "image/jpeg" }],
    },
    imageProcessorPort: { prepareForModel: async () => ({ data: new Uint8Array([1]), mediaType: "image/jpeg", originalWidth: 1, originalHeight: 1, width: 1, height: 1 }) },
  } as unknown as ToolExecutionContext;
  const output = await readPdfFile({ filePath: "/fixture.pdf", pages: "20" }, context);
  assert.ok("type" in output && output.type === "parts", JSON.stringify(output));
  assert.equal(output.totalPages, 24);
  assert.equal(output.numParts, 1);
  const content = formatReadPdfPagesOutput(output);
  assert.ok(Array.isArray(content));
  assert.match(JSON.stringify(content[0]), /Document total: 24 pages/);
  assert.match(JSON.stringify(content[0]), /Pages in this result: 20/);
});
