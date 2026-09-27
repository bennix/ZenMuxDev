import { z } from "zod";

export const weixinFileRequestSchema = z
  .object({
    action: z.enum(["list", "send"]),
    path: z.string().trim().min(1).optional(),
    recipientId: z.string().min(1).optional(),
  })
  .strict();
export const weixinFileResultSchema = z
  .object({
    recipients: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
    sent: z.boolean(),
  })
  .strict();
export type WeixinFileRequest = z.infer<typeof weixinFileRequestSchema>;
export type WeixinFileResult = z.infer<typeof weixinFileResultSchema>;
export type WeixinFilePort = (request: WeixinFileRequest) => Promise<WeixinFileResult>;
export type WeixinFileScope = { workspacePath: string; workspaceIdentity?: string };
