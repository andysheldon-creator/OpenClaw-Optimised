import { z } from "zod";

/**
 * Zod schema for AgentMail channel configuration.
 * Validates user-provided config at runtime.
 */
export const AgentMailConfigSchema = z.object({
  /** Account name for identifying this AgentMail configuration. */
  name: z.string().optional(),
  /** If false, do not start AgentMail channel. Default: true. */
  enabled: z.boolean().optional(),
  /** AgentMail API token (required). */
  token: z.string().optional(),
  /** AgentMail inbox email address to monitor (required). */
  emailAddress: z.string().optional(),
  /** Full public webhook URL (e.g., https://my-gateway.ngrok.io/webhooks/agentmail). */
  webhookUrl: z.string().optional(),
  /** Local webhook path (default: /webhooks/agentmail). Derived from webhookUrl if not set. */
  webhookPath: z.string().optional(),
  /** Allowed sender emails/domains. Empty = allow all. */
  allowFrom: z.array(z.string()).optional(),
});
