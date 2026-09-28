import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "@zcode/contracts";
import { createModelHttpDiagnosticsFetch } from "../src/model/http-diagnostics.js";

function harness(fetch: typeof globalThis.fetch) {
  const logs: Record<string, unknown>[] = [];
  const logger = {
    info: (_message: string, context: Record<string, unknown>) => logs.push(context),
  } as Logger;
  return { logs, fetch: createModelHttpDiagnosticsFetch(fetch, logger, "test-provider") };
}

test("HTTP errors and streamed bytes are recorded without secrets or eager reads", async () => {
  let reads = 0;
  const h = harness(
    async () =>
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              reads++;
              controller.enqueue(new TextEncoder().encode("secret-response"));
              controller.close();
            },
          },
          { highWaterMark: 0 },
        ),
        {
          status: 402,
          headers: { "x-zenmux-requestid": "test-server-id", "set-cookie": "secret-cookie" },
        },
      ),
  );
  const response = await h.fetch("https://example.test/private?secret-query", {
    method: "POST",
    headers: { authorization: "secret-key" },
    body: "secret-prompt",
  });
  assert.equal(reads, 0);
  assert.equal(response.status, 402);
  assert.equal(await response.text(), "secret-response");
  assert.deepEqual(
    h.logs.map((x) => x.event),
    ["model.http.started", "model.http.response", "model.http.first_bytes", "model.http.completed"],
  );
  assert.equal(h.logs[1].serverRequestId, "test-server-id");
  assert.equal(new Set(h.logs.map((x) => x.httpRequestId)).size, 1);
  assert.equal(JSON.stringify(h.logs).includes("secret"), false);
});

test("fetch and body failures preserve errors and identify phase", async () => {
  const error = new Error("secret-error");
  const before = harness(async () => {
    throw error;
  });
  await assert.rejects(before.fetch("https://example.test"), (e) => e === error);
  assert.equal(before.logs.at(-1)?.phase, "headers");
  const after = harness(
    async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            c.error(error);
          },
        }),
      ),
  );
  await assert.rejects((await after.fetch("https://example.test")).text(), (e) => e === error);
  assert.equal(after.logs.at(-1)?.phase, "body");
  assert.equal(after.logs.at(-1)?.event, "model.http.failed");
  assert.equal(JSON.stringify([...before.logs, ...after.logs]).includes("secret-error"), false);
});

test("cancellation is forwarded once without reading", async () => {
  let reason: unknown;
  const h = harness(
    async () =>
      new Response(
        new ReadableStream({
          cancel(value) {
            reason = value;
          },
        }),
      ),
  );
  const response = await h.fetch("https://example.test");
  await response.body!.cancel("stop");
  assert.equal(reason, "stop");
  assert.equal(h.logs.filter((x) => x.event === "model.http.cancelled").length, 1);
  assert.equal(
    h.logs.some((x) => x.event === "model.http.completed"),
    false,
  );
});
