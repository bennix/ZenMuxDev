const OFFICE_COMMAND_INTENTS: Readonly<Record<string, string>> = {
  office: "Perform the requested Office operation using the complete OfficeCLI command surface.",
  "office-create": "Create the requested Word, Excel or PowerPoint document at the requested output path.",
  "office-edit": "Inspect the existing document first, then apply the requested changes while preserving unrelated content and formatting.",
  "office-preview": "Produce a read-only preview with all available pages or sheets. Do not edit the source document.",
};

export function expandOfficeCommand(name: string, args: string): string | undefined {
  // 命令来自用户输入，必须检查自有键，避免 constructor 等原型属性误命中内置命令。
  if (!Object.hasOwn(OFFICE_COMMAND_INTENTS, name)) return undefined;
  return [
    "Load the bundled `officecli` skill before proceeding.",
    OFFICE_COMMAND_INTENTS[name],
    "Use the existing tool executor and its normal permissions and cancellation rules.",
    "Use the bundled skill launcher for `officecli --version` and command help. It provisions the pinned runtime; never invent flags or run an unrelated installer.",
    "If the executable is unavailable, report that setup is required rather than claiming the operation succeeded.",
    "If a document is open in resident mode, use `officecli save <file>` before an external preview or delivery reads it.",
    "Validate the output and return a link to the saved file or preview. Report unsupported formats and failures explicitly.",
    "User request:",
    args || "Ask for the document or desired output and the operation to perform.",
  ].join("\n");
}
