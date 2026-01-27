import { z } from "zod";

export const GmailAccountSchema = z.object({
  accountId: z.string().optional(),
  name: z.string().optional(),
  enabled: z.boolean().default(true),
  email: z.string(), // The Gmail email address
  allowFrom: z.array(z.string()).default([]),
  // Gmail specific settings
  historyId: z.string().optional(), // For resuming history
  delegate: z.string().optional(), // If using delegation
  pollIntervalMs: z.number().optional(), // Polling interval in ms (default 60s)
});

export const GmailConfigSchema = z.object({
  enabled: z.boolean().default(true),
  accounts: z.record(GmailAccountSchema).optional(),
  defaults: z.object({
    allowFrom: z.array(z.string()).optional(),
  }).optional(),
});

export type GmailConfig = z.infer<typeof GmailConfigSchema>;
export type GmailAccount = z.infer<typeof GmailAccountSchema>;
