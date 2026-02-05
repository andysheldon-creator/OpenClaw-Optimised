export type ChatCommand = {
  command: string;
  description: string;
  usage?: string;
  adminOnly?: boolean;
};

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    command: "/new",
    description: "Start a new session (reset context)",
    usage: "/new",
  },
  {
    command: "/reset",
    description: "Alias for /new",
    usage: "/reset",
  },
  {
    command: "/status",
    description: "Show current session status (model, tokens, cost)",
    usage: "/status",
  },
  {
    command: "/compact",
    description: "Compact session history to save tokens",
    usage: "/compact",
  },
  {
    command: "/think",
    description: "Set reasoning output level (off|minimal|low|medium|high|xhigh)",
    usage: "/think <level>",
  },
  {
    command: "/verbose",
    description: "Toggle verbose mode output",
    usage: "/verbose <on|off>",
  },
  {
    command: "/usage",
    description: "Configure usage reporting details",
    usage: "/usage <off|tokens|full>",
  },
  {
    command: "/restart",
    description: "Restart the gateway (admin only)",
    usage: "/restart",
    adminOnly: true,
  },
  {
    command: "/activation",
    description: "Configure group activation policy",
    usage: "/activation <mention|always>",
  },
  {
    command: "/stop",
    description: "Stop generation or abort current action",
    usage: "/stop",
  },
];
