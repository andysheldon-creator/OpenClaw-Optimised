import type { z } from "zod";
import type { XmppConfigSchema } from "./config-schema.js";

export type XmppConfig = z.infer<typeof XmppConfigSchema>;

export type CoreConfig = {
  channels?: {
    xmpp?: XmppConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export interface XmppAccountConfig {
  jid: string;
  password: string;
  server: string;
  resource?: string;
}

export interface ResolvedXmppAccount {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  jid?: string;
  password?: string;
  server?: string;
  resource?: string;
  config: XmppConfig;
}
