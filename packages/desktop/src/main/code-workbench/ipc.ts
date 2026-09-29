import { createHash, randomBytes } from "node:crypto";
import { join, isAbsolute } from "node:path";
import { app, BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import { PlatformChannels, codeWorkbenchRequestSchema } from "@zcode/shared";
import { startWorkbench } from "./process.js";

export function registerCodeWorkbenchIpc(logger: {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}) {
  const processes = new Map<string, Promise<Awaited<ReturnType<typeof startWorkbench>>>>();
  const disposedWindows = new Set<number>();
  const observedWindows = new Set<number>();
  ipcMain.handle(PlatformChannels.OpenCodeWorkbench, async (event, value: unknown) => {
    const request = codeWorkbenchRequestSchema.parse(value);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !isAbsolute(request.workspacePath)) throw new Error("Invalid IDE workspace");
    const windowId = window.id;
    const key = `${windowId}:${request.workspaceIdentity?.trim() || request.workspacePath}`;
    if (!observedWindows.has(windowId)) {
      observedWindows.add(windowId);
      window.once("closed", () => {
        disposedWindows.add(windowId);
        for (const [id, pending] of processes) {
          if (id.startsWith(`${windowId}:`)) {
            void pending.then((process) => process.dispose()).catch(() => {});
            processes.delete(id);
          }
        }
      });
    }
    let pending = processes.get(key);
    if (pending && !(await pending).alive) {
      processes.delete(key);
      pending = undefined;
    }
    if (!pending) {
      logger.info("codeWorkbench.start", { windowId });
      pending = startWorkbench({
        root: join(app.getPath("userData"), "code-workbench"),
        runtimeDirectory: app.isPackaged
          ? join(process.resourcesPath, "code-workbench")
          : join(app.getAppPath(), "bundled-workbench", `${process.platform}-${process.arch}`),
        request,
        stateKey: createHash("sha256").update(key).digest("hex").slice(0, 24),
        async onContext(context) {
          if (event.sender.isDestroyed()) throw new Error("IDE window closed");
          const requestId = randomBytes(16).toString("hex");
          // ACK 只确认当前 composer 接住了草稿；不创建任务，不默认发送 AI 请求。
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timer);
              ipcMain.removeListener(PlatformChannels.CodeWorkbenchContextAck, listener);
            };
            const listener = (reply: IpcMainEvent, payload: unknown) => {
              if (
                reply.sender !== event.sender ||
                !payload ||
                typeof payload !== "object" ||
                !("requestId" in payload) ||
                payload.requestId !== requestId
              )
                return;
              cleanup();
              if ("accepted" in payload && payload.accepted === true) resolve();
              else reject(new Error("No active ZenCode composer"));
            };
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error("ZenCode composer did not accept context"));
            }, 5000);
            ipcMain.on(PlatformChannels.CodeWorkbenchContextAck, listener);
            event.sender.send(PlatformChannels.CodeWorkbenchContext, { ...context, requestId });
          });
        },
      });
      processes.set(key, pending);
      void pending.catch((error: unknown) => {
        processes.delete(key);
        logger.warn("codeWorkbench.startFailed", {
          windowId,
          reason: error instanceof Error ? error.message : "IDE startup failed",
        });
      });
    }
    // 修复：局部变量不能叫 process，否则平台路径读取落入暂时性死区，点击即失败。
    const workbench = await pending;
    if (disposedWindows.has(windowId)) {
      workbench.dispose();
      throw new Error("IDE window closed");
    }
    // 用户要求本机 IDE 免登录；不再通过 cookie 中转认证。
    logger.info("codeWorkbench.ready", { windowId });
    return { url: `${workbench.origin}/?folder=${encodeURIComponent(request.workspacePath)}` };
  });
  app.once("before-quit", () => {
    for (const pending of processes.values())
      void pending.then((process) => process.dispose()).catch(() => {});
    processes.clear();
  });
}
