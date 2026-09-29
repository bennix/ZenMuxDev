import { homedir } from "node:os";
import { describeWorkbenchExit } from "./diagnostics.js";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { realpath, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
  codeWorkbenchSelectionSchema,
  type CodeWorkbenchContext,
  type CodeWorkbenchRequest,
} from "@zcode/shared";
import { resolveBundledWorkbench } from "./install.js";
import { writeWorkbenchExtension } from "./extension.js";

export function isWithinWorkbench(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return (
    suffix !== ".." &&
    !suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(suffix)
  );
}
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("IDE port unavailable");
  return address.port;
}
export async function startWorkbench(options: {
  root: string;
  runtimeDirectory: string;
  request: CodeWorkbenchRequest;
  stateKey: string;
  onContext: (context: CodeWorkbenchContext) => void | Promise<void>;
}) {
  const workspace = await realpath(options.request.workspacePath);
  const runtime = await resolveBundledWorkbench(options.runtimeDirectory);
  const extensions = join(options.root, "extensions");
  await writeWorkbenchExtension(extensions);
  const data = join(options.root, "data", options.stateKey);
  await mkdir(join(data, "User"), { recursive: true });
  try {
    await writeFile(
      join(data, "User/settings.json"),
      JSON.stringify({
        "chat.disableAIFeatures": true,
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
      }),
      { flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const config = join(data, "code-server.yaml");
  await writeFile(config, "auth: none\ncert: false\n");
  const token = randomBytes(32).toString("hex");
  const bridge = createServer(async (req, res) => {
    if (
      req.method !== "POST" ||
      req.url !== "/context" ||
      req.headers.authorization !== `Bearer ${token}`
    ) {
      res.writeHead(403).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk);
        chunks.push(bytes);
        size += bytes.length;
        if (size > 1_000_000) {
          res.writeHead(413).end();
          return;
        }
      }
      const parsed = codeWorkbenchSelectionSchema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (!parsed.success) {
        res.writeHead(400).end();
        return;
      }
      const path = await realpath(parsed.data.sourcePath);
      if (!isWithinWorkbench(workspace, path)) {
        res.writeHead(403).end();
        return;
      }
      await options.onContext({ ...options.request, ...parsed.data, sourcePath: path });
      res.writeHead(202).end();
    } catch {
      res.writeHead(400).end();
    }
  });
  const bridgePort = await listen(bridge);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const node = join(runtime, "lib", process.platform === "win32" ? "node.exe" : "node");
  const child = spawn(
    node,
    [
      join(runtime, "out/node/entry.js"),
      "--config",
      config,
      "--bind-addr",
      `127.0.0.1:${port}`,
      "--auth",
      "none",
      "--disable-telemetry",
      "--disable-update-check",
      "--user-data-dir",
      data,
      "--extensions-dir",
      extensions,
      workspace,
    ],
    {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ZENCODE_IDE_BRIDGE_TOKEN: token,
        ZENCODE_IDE_BRIDGE_URL: `http://127.0.0.1:${bridgePort}/context`,
      },
    },
  );
  // 之前丢弃 stderr，导致真实启动错误无法诊断；只保留有界尾部并在返回前脱敏。
  let stderr = "";
  child.stdout?.resume();
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-8192);
  });
  let stopped = false;
  let launchError: Error | undefined;
  const dispose = () => {
    stopped = true;
    child.kill();
    bridge.close();
  };
  child.on("error", (error) => {
    launchError = error;
    stopped = true;
    bridge.close();
  });
  child.on("close", (code, signal) => {
    launchError ??= new Error(describeWorkbenchExit(code, signal, stderr,
      [token, workspace, runtime, options.root, homedir()]));
    stopped = true;
    bridge.close();
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (stopped) throw launchError ?? new Error("IDE process exited during startup");
      try {
        const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1000) });
        if (response.ok)
          return {
            origin,
            dispose,
            get alive() {
              return !stopped;
            },
          };
      } catch {
        /* 等待子进程就绪，不将此状态报告为已打开 */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("IDE startup timed out");
  } catch (error) {
    dispose();
    throw error;
  }
}
