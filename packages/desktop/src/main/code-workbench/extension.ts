import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseExtensionReference } from "./extensionImport";

// 扩展只传递选区，不持有模型密钥，不创建另一套 AI 会话。
export async function writeWorkbenchExtension(extensions: string) {
  const root = join(extensions, "zencode.ai-bridge-1.0.0");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "ai-bridge",
        publisher: "zencode",
        displayName: "ZenCode AI",
        description: "Send code context to your existing ZenCode AI conversation",
        version: "1.0.0",
        engines: { vscode: "^1.90.0" },
        main: "./extension.cjs",
        extensionKind: ["workspace"],
        capabilities: { untrustedWorkspaces: { supported: true } },
        activationEvents: ["onCommand:zencode.askAI"],
        contributes: {
          commands: [
            { command: "zencode.askAI", title: "ZenCode: 将选中代码交给 AI / Ask AI" },
            {
              command: "zencode.importExtension",
              title: "ZenCode: 导入扩展 / Import Extension",
              icon: "$(extensions)",
            },
          ],
          menus: {
            "view/title": [
              {
                command: "zencode.importExtension",
                when: "view == workbench.views.extensions.installed",
                group: "navigation",
              },
            ],
            "editor/context": [
              { command: "zencode.askAI", when: "editorTextFocus", group: "zencode" },
            ],
          },
          keybindings: [
            {
              command: "zencode.askAI",
              key: "ctrl+alt+k",
              mac: "cmd+alt+k",
              when: "editorTextFocus",
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "extension.cjs"),
    `
const vscode = require('vscode');
const parseExtensionReference = ${parseExtensionReference.toString()};
exports.activate = context => {
 context.subscriptions.push(vscode.commands.registerCommand('zencode.importExtension', async () => {
  try {
   const kind = await vscode.window.showQuickPick(['网页链接或扩展 ID / Web link or ID', '本地 VSIX / Local VSIX'], { placeHolder: '导入 VS Code 扩展 / Import extension' });
   if (!kind) return;
   if (kind.startsWith('网页')) {
    const value = await vscode.window.showInputBox({ prompt: 'Open VSX / Marketplace / vscode:extension / publisher.name', placeHolder: '粘贴扩展网页链接 / Paste extension link', validateInput: value => parseExtensionReference(value) ? undefined : '请输入有效的扩展链接或 publisher.name / Invalid extension reference' });
    if (!value) return;
    const id = parseExtensionReference(value);
    if (!id) return;
    await vscode.commands.executeCommand('workbench.extensions.search', '@id:' + id);
    vscode.window.showInformationMessage('请在扩展列表确认安装。使用 Open VSX；未收录的扩展可导入 VSIX。 / Review and install in Extensions.');
   } else {
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { VSIX: ['vsix'] }, openLabel: '导入 / Import' });
    if (!files?.length) return;
    const confirm = await vscode.window.showWarningMessage('安装扩展可执行本机代码 / Extensions can execute local code: ' + files[0].fsPath, { modal: true }, '安装 / Install');
    if (!confirm) return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在安装扩展 / Installing extension' }, () => vscode.commands.executeCommand('workbench.extensions.installExtension', files[0]));
    vscode.window.showInformationMessage('扩展安装完成，请在扩展列表查看。 / Extension installed.');
   }
  } catch (error) { vscode.window.showErrorMessage('扩展导入失败 / Extension import failed: ' + String(error)); }
 }));
 context.subscriptions.push(vscode.commands.registerCommand('zencode.askAI', async () => {
  try {
   const editor = vscode.window.activeTextEditor;
   if (!editor || editor.document.uri.scheme !== 'file') return;
   if (editor.document.isDirty) {
    const choice = await vscode.window.showWarningMessage('先保存文件，让 ZenCode AI 读取最新代码。', '保存并继续');
    if (!choice || !await editor.document.save()) return;
   }
   const comment = await vscode.window.showInputBox({ prompt: '希望 ZenCode AI 如何处理这段代码？', placeHolder: '解释、排错、重构或实现功能…' });
   if (!comment?.trim()) return;
   const range = editor.selection.isEmpty ? new vscode.Range(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length) : editor.selection;
   const response = await fetch(process.env.ZENCODE_IDE_BRIDGE_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.ZENCODE_IDE_BRIDGE_TOKEN },
    body: JSON.stringify({ sourcePath: editor.document.uri.fsPath, startLine: range.start.line + 1, endLine: range.end.line + 1, selectedText: editor.document.getText(range), comment })
   });
   if (!response.ok) throw new Error('ZenCode bridge: HTTP ' + response.status);
   vscode.window.showInformationMessage('已交给 ZenCode。请回到 AI 对话查看并发送。');
  } catch (error) { vscode.window.showErrorMessage(String(error)); }
 }));
};
`,
  );
}
