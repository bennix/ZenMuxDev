import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

const READ_TOOLS = new Set([
  "list_apps",
  "list_windows",
  "focused_window",
  "get_app_state",
  "screenshot",
  "doctor",
]);
const ACTION_TOOLS = new Set([
  "click",
  "perform_secondary_action",
  "scroll",
  "drag",
  "type_text",
  "press_key",
  "set_value",
  "perform_action",
  "activate_window",
]);
const MAX_LINE_BYTES = 24 * 1024 * 1024;

export function createMcpNativeRuntime({ env, platform, arch }) {
  const sessions = new Map();
  const starting = new Map();
  const generations = new Map();
  let disposed = false;
  const platformDir = platform === "win32" ? "windows" : "linux";
  const filename = platform === "win32" ? "open-computer-use.exe" : "computer-use-linux";
  const executable =
    env.ZCODE_CUA_DEV_MODE === "1" && env.ZCODE_CUA_EXECUTOR_PATH?.trim()
      ? env.ZCODE_CUA_EXECUTOR_PATH.trim()
      : env.ZCODE_CUA_PLUGIN_ROOT
        ? resolve(env.ZCODE_CUA_PLUGIN_ROOT, "bin", `${platformDir}-${arch}`, filename)
        : "";

  async function getSession(context) {
    if (disposed) throw new Error("Computer Use runtime is disposed");
    const key = `${context.workspaceKey}\0${context.remoteSessionId ?? ""}\0${context.sessionId}`;
    const generation = generations.get(key) ?? 0;
    let session = sessions.get(key);
    if (session?.host.closed) {
      sessions.delete(key);
      session = undefined;
    }
    if (!session) {
      if (!executable) throw new Error("Computer Use native executor is unavailable");
      await access(executable);
      let pending = starting.get(key);
      if (!pending) {
        pending = McpHost.start(executable).finally(() => starting.delete(key));
        starting.set(key, pending);
      }
      const host = await pending;
      if (disposed || (generations.get(key) ?? 0) !== generation || host.closed) {
        await host.dispose();
        throw new Error("Computer Use session ended during startup");
      }
      if (sessions.has(key)) {
        return sessions.get(key);
      }
      session = { host, snapshotId: undefined };
      sessions.set(key, session);
    }
    return session;
  }

  return {
    async execute({ toolName, arguments: args, context, signal }) {
      try {
        if (context.runtimeScope !== "main")
          throw new Error("Computer Use is unavailable in subagent");
        if (toolName === "stop_computer_control") {
          await this.closeSession(context);
          return result({ stopped: true });
        }
        if (toolName !== "platform.describe" && toolName !== "platform.call")
          throw new Error(`Unsupported Computer Use method: ${toolName}`);
        if (signal?.aborted) throw signal.reason;
        const session = await getSession(context);
        if (toolName === "platform.describe") {
          const listed = await session.host.call("tools/list", {}, signal);
          return result({
            platform,
            tools: (listed.tools ?? []).filter(
              (tool) => READ_TOOLS.has(tool.name) || ACTION_TOOLS.has(tool.name),
            ),
          });
        }
        const name = args?.name;
        if (!READ_TOOLS.has(name) && !ACTION_TOOLS.has(name))
          throw new Error(`Unsupported Computer Use tool: ${String(name)}`);
        const input = args?.arguments;
        if (!input || typeof input !== "object" || Array.isArray(input))
          throw new Error("Computer Use tool arguments must be an object");
        if (name === "get_app_state") session.snapshotId = undefined;
        if (ACTION_TOOLS.has(name)) {
          // 修复依据：上游 MCP 的 element_index 依赖最近一次观察，必须由会话持有并消费快照，避免旧索引触发错误动作。
          if (!session.snapshotId || args.snapshotId !== session.snapshotId)
            throw new Error("Computer Use action requires the current observation snapshot");
          session.snapshotId = undefined;
        }
        const called = await session.host.call("tools/call", { name, arguments: input }, signal);
        if (called.isError) return { content: called.content ?? [], isError: true };
        if (name === "get_app_state") {
          session.snapshotId = randomUUID();
          return appendSnapshot(called, session.snapshotId);
        }
        return { content: called.content ?? [] };
      } catch (error) {
        if (signal?.aborted) await this.closeSession(context);
        return result({ error: error instanceof Error ? error.message : String(error) }, true);
      }
    },
    async closeSession(context) {
      const key = `${context.workspaceKey}\0${context.remoteSessionId ?? ""}\0${context.sessionId}`;
      generations.set(key, (generations.get(key) ?? 0) + 1);
      const session = sessions.get(key);
      sessions.delete(key);
      const pending = starting.get(key);
      if (pending) await pending.then((host) => host.dispose()).catch(() => undefined);
      if (session) await session.host.dispose();
    },
    async dispose() {
      disposed = true;
      const active = [...sessions.values()];
      sessions.clear();
      await Promise.all(
        [...starting.values()].map((pending) =>
          pending.then((host) => host.dispose()).catch(() => undefined),
        ),
      );
      await Promise.all(active.map((session) => session.host.dispose()));
    },
  };
}

function result(value, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

function appendSnapshot(value, snapshotId) {
  return {
    content: [
      ...(value.content ?? []),
      { type: "text", text: JSON.stringify({ zcodeSnapshotId: snapshotId }) },
    ],
  };
}

class McpHost {
  static async start(executable) {
    const child = spawn(executable, ["mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    const host = new McpHost(child);
    try {
      await host.call(
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "zencode", version: "0.7.0" },
        },
        AbortSignal.timeout(10000),
      );
      host.write({ jsonrpc: "2.0", method: "notifications/initialized" });
      return host;
    } catch (error) {
      await host.dispose();
      throw error;
    }
  }

  constructor(child) {
    this.child = child;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    this.closed = false;
    child.stdout.on("data", (chunk) => this.onData(chunk));
    child.on("error", (error) => this.fail(error));
    child.on("exit", () => this.fail(new Error("Computer Use native executor exited")));
    child.stderr.on("data", () => {});
  }

  onData(chunk) {
    this.buffer += this.decoder.write(chunk);
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) {
      this.fail(new Error("Computer Use MCP response exceeded limit"));
      return;
    }
    for (let end = this.buffer.indexOf("\n"); end >= 0; end = this.buffer.indexOf("\n")) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "MCP request failed"));
        else pending.resolve(message.result);
      } catch (error) {
        this.fail(error);
        return;
      }
    }
  }

  write(message) {
    if (this.closed) throw new Error("Computer Use native executor has exited");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async call(method, params, signal) {
    if (this.closed) throw new Error("Computer Use native executor has exited");
    const id = this.nextId++;
    return await new Promise((resolveCall, rejectCall) => {
      const abort = () => this.fail(new Error("Computer Use call cancelled"));
      const finish = (ok, value) => {
        signal?.removeEventListener("abort", abort);
        if (ok) resolveCall(value);
        else rejectCall(value);
      };
      this.pending.set(id, {
        resolve: (value) => finish(true, value),
        reject: (error) => finish(false, error),
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.child.kill();
  }

  async dispose() {
    this.fail(new Error("Computer Use native executor disposed"));
  }
}
