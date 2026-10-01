import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createMcpNativeRuntime } from "./mcp-native.js";

const METHODS = new Set([
  "permissions.check",
  "apps.list",
  "window.list",
  "apps.launch",
  "observe",
  "dispatch.element",
  "dispatch.key",
  "screen.capture",
]);
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** 原生进程和会话只由 runtime 持有；上层 broker 不复制状态。 */
export function createComputerUseRuntime(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (platform === "win32" || platform === "linux")
    return createMcpNativeRuntime({ env, platform, arch: options.arch ?? process.arch });
  const developmentExecutor =
    env.ZCODE_CUA_DEV_MODE === "1" ? env.ZCODE_CUA_EXECUTOR_PATH?.trim() : "";
  const executable =
    developmentExecutor ||
    (env.ZCODE_CUA_PLUGIN_ROOT
      ? resolve(env.ZCODE_CUA_PLUGIN_ROOT, "bin", `macos-${process.arch}`, "OpenComputerUse")
      : "");
  let host;
  let starting;
  const sessions = new Map();

  async function nativeHost() {
    if (host && !host.closed) return host;
    if (host?.closed) {
      await host.dispose();
      host = undefined;
      sessions.clear();
    }
    if (process.platform !== "darwin" || !executable)
      throw new Error("Computer Use native executor is unavailable");
    starting ??= NativeHost.start(executable)
      .then((value) => {
        host = value;
        return value;
      })
      .finally(() => {
        starting = undefined;
      });
    return await starting;
  }

  async function nativeSession(context, signal) {
    const key = sessionKey(context);
    const native = await nativeHost();
    if (sessions.has(key)) return sessions.get(key);
    const id = `zcode-${randomUUID()}`;
    assertOk(await native.call("session.begin", { session: id, captureScope: "desktop" }, signal));
    sessions.set(key, id);
    return id;
  }

  return {
    async execute({ toolName, arguments: args, context, signal }) {
      try {
        if (context.runtimeScope !== "main")
          throw new Error("Computer Use is unavailable in subagent");
        if (toolName === "stop_computer_control") {
          await this.closeSession(context);
          return toolResult({ stopped: true });
        }
        if (!METHODS.has(toolName)) throw new Error(`Unsupported Computer Use method: ${toolName}`);
        if (signal?.aborted) throw signal.reason;
        const native = await nativeHost();
        const session = await nativeSession(context, signal);
        const userParams = args && typeof args === "object" && !Array.isArray(args) ? args : {};
        // 修复依据：模型不能选择原生 session；始终由 CLI 会话身份覆盖调用参数。
        const params = { ...userParams, session };
        const result = await native.call(toolName, params, signal);
        if (result?.ok !== true) return toolResult(result, true);
        const image = toolName === "screen.capture" ? result.image : result.snapshot?.image;
        if (!image) return toolResult(result);
        const bytes = await native.readImage(image);
        return {
          content: [
            { type: "text", text: JSON.stringify(result) },
            {
              type: "image",
              data: bytes.toString("base64"),
              mimeType: image.format === "jpeg" ? "image/jpeg" : "image/png",
            },
          ],
        };
      } catch (error) {
        return toolResult({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
    async closeSession(context) {
      const key = sessionKey(context);
      const session = sessions.get(key);
      sessions.delete(key);
      if (session && host)
        await host
          .call("session.end", { session }, AbortSignal.timeout(3000))
          .catch(() => undefined);
    },
    async dispose() {
      sessions.clear();
      if (host) await host.dispose();
      host = undefined;
    },
  };
}

function assertOk(value) {
  if (value?.ok !== true)
    throw new Error(value?.error?.message || "Computer Use native request failed");
}
function sessionKey(context) {
  return `${context.workspaceKey}\0${context.remoteSessionId ?? ""}\0${context.sessionId}`;
}
function toolResult(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

class NativeHost {
  static async start(executable) {
    const imageDir = await mkdtemp(join(tmpdir(), "zcode-cua-"));
    const child = spawn(executable, ["host"], { stdio: ["pipe", "pipe", "pipe"] });
    const host = new NativeHost(child, imageDir);
    try {
      const hello = await host.call(
        "host.hello",
        {
          protocol: "maka.cu/2",
          host: { name: "zencode", version: "0.1.0" },
          hostPid: process.pid,
          imageDir,
          allowGlobalPointer: false,
        },
        AbortSignal.timeout(10000),
      );
      if (hello?.ok !== true || hello.protocol !== "maka.cu/2")
        throw new Error("Computer Use protocol mismatch");
      return host;
    } catch (error) {
      await host.dispose();
      throw error;
    }
  }

  constructor(child, imageDir) {
    this.child = child;
    this.imageDir = imageDir;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.closed = false;
    child.stdout.on("data", (chunk) => this.onData(chunk));
    child.on("error", (error) => this.fail(error));
    child.on("exit", () => this.fail(new Error("Computer Use native executor exited")));
    child.stderr.on("data", () => {});
  }

  onData(chunk) {
    this.buffer += chunk.toString("utf8");
    for (let end = this.buffer.indexOf("\n"); end >= 0; end = this.buffer.indexOf("\n")) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (Buffer.byteLength(line) > MAX_RESPONSE_BYTES) {
        this.fail(new Error("Computer Use response exceeded 1 MiB"));
        return;
      }
      try {
        const response = JSON.parse(line);
        const pending = this.pending.get(response.id);
        if (!pending) continue;
        this.pending.delete(response.id);
        if (response.error) pending.reject(new Error(response.error.message));
        else pending.resolve(response.result);
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    if (Buffer.byteLength(this.buffer) > MAX_RESPONSE_BYTES)
      this.fail(new Error("Computer Use response exceeded 1 MiB"));
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.child.kill();
    void rm(this.imageDir, { recursive: true, force: true }).catch(() => undefined);
  }

  async call(method, params, signal) {
    if (this.closed) throw new Error("Computer Use native executor has exited");
    const id = this.nextId++;
    return await new Promise((resolveCall, rejectCall) => {
      const abort = () => this.fail(new Error("Computer Use call cancelled"));
      const finish = (kind, value) => {
        signal?.removeEventListener("abort", abort);
        if (kind === "ok") resolveCall(value);
        else rejectCall(value);
      };
      this.pending.set(id, {
        resolve: (value) => finish("ok", value),
        reject: (error) => finish("error", error),
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async readImage(image) {
    const root = await realpath(this.imageDir);
    const path = await realpath(image.path);
    if (!path.startsWith(`${root}${sep}`) || dirname(path) !== root)
      throw new Error("Computer Use image escaped its directory");
    const bytes = await readFile(path);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (bytes.length !== image.byteLength || digest !== image.sha256)
      throw new Error("Computer Use image digest mismatch");
    return bytes;
  }

  async dispose() {
    this.fail(new Error("Computer Use native executor disposed"));
    await rm(this.imageDir, { recursive: true, force: true });
  }
}
