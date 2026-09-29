import { z } from "zod";
export const codeWorkbenchRequestSchema = z
  .object({
    workspacePath: z.string().min(1),
    workspaceIdentity: z.string().optional(),
  })
  .strict();
export type CodeWorkbenchRequest = z.infer<typeof codeWorkbenchRequestSchema>;
export const codeWorkbenchSelectionSchema = z
  .object({
    sourcePath: z.string().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    selectedText: z.string().max(200_000),
    comment: z.string().min(1).max(20_000),
  })
  .strict()
  .refine((value) => value.endLine >= value.startLine);
export type CodeWorkbenchContext = CodeWorkbenchRequest &
  z.infer<typeof codeWorkbenchSelectionSchema> & { requestId?: string };
