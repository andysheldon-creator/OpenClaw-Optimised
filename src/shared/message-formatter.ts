/**
 * Cross-Platform Message Formatter
 *
 * Detects platform from context and adjusts message output format accordingly.
 * Handles tables, lists, code blocks, headers, and emphasis per platform capabilities.
 */

export type Platform = "slack" | "discord" | "telegram" | "whatsapp" | "web" | "unknown";

export type MessageContent = {
  text?: string;
  table?: { headers: string[]; rows: string[][] };
  list?: string[];
  codeBlock?: { language?: string; code: string };
  heading?: string;
  emphasis?: string;
  bold?: string;
};

const PLATFORM_CAPABILITIES: Record<
  Platform,
  {
    tables: boolean;
    threads: boolean;
    buttons: boolean;
    markdownHeaders: boolean;
    markdownFormatting: boolean;
    codeBlocks: boolean;
  }
> = {
  slack: {
    tables: true,
    threads: true,
    buttons: true,
    markdownHeaders: false,
    markdownFormatting: true,
    codeBlocks: true,
  },
  discord: {
    tables: false,
    threads: true,
    buttons: true,
    markdownHeaders: true,
    markdownFormatting: true,
    codeBlocks: true,
  },
  telegram: {
    tables: false,
    threads: false,
    buttons: true,
    markdownHeaders: false,
    markdownFormatting: true,
    codeBlocks: true,
  },
  whatsapp: {
    tables: false,
    threads: false,
    buttons: false,
    markdownHeaders: false,
    markdownFormatting: false,
    codeBlocks: false,
  },
  web: {
    tables: true,
    threads: true,
    buttons: true,
    markdownHeaders: true,
    markdownFormatting: true,
    codeBlocks: true,
  },
  unknown: {
    tables: false,
    threads: false,
    buttons: false,
    markdownHeaders: false,
    markdownFormatting: true,
    codeBlocks: true,
  },
};

export function detectPlatform(channel?: string | null): Platform {
  if (!channel) {
    return "unknown";
  }
  const lower = channel.toLowerCase();
  if (lower.includes("slack")) {
    return "slack";
  }
  if (lower.includes("discord")) {
    return "discord";
  }
  if (lower.includes("telegram")) {
    return "telegram";
  }
  if (lower.includes("whatsapp")) {
    return "whatsapp";
  }
  if (lower.includes("web")) {
    return "web";
  }
  return "unknown";
}

function formatTable(headers: string[], rows: string[][], platform: Platform): string {
  const caps = PLATFORM_CAPABILITIES[platform];
  if (caps.tables) {
    const headerRow = `| ${headers.join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;
    const dataRows = rows.map((row) => `| ${row.join(" | ")} |`);
    return [headerRow, separator, ...dataRows].join("\n");
  }
  return rows
    .map((row) => {
      const items = row
        .map((cell, i) => {
          const label = headers[i] || `Col ${i + 1}`;
          return platform === "whatsapp"
            ? `${label.toUpperCase()}: ${cell}`
            : `**${label}**: ${cell}`;
        })
        .join(platform === "whatsapp" ? " | " : " · ");
      return platform === "whatsapp" ? `- ${items}` : `• ${items}`;
    })
    .join("\n");
}

function formatHeading(text: string, platform: Platform): string {
  const caps = PLATFORM_CAPABILITIES[platform];
  if (caps.markdownHeaders) {
    return `## ${text}`;
  }
  if (platform === "whatsapp") {
    return text.toUpperCase();
  }
  if (caps.markdownFormatting) {
    return `**${text}**`;
  }
  return text.toUpperCase();
}

export function formatMessageContent(content: MessageContent, platform: Platform): string {
  const parts: string[] = [];
  if (content.heading) {
    parts.push(formatHeading(content.heading, platform));
  }
  if (content.bold) {
    parts.push(platform === "whatsapp" ? content.bold.toUpperCase() : `**${content.bold}**`);
  }
  if (content.emphasis) {
    parts.push(platform === "whatsapp" ? content.emphasis.toUpperCase() : `*${content.emphasis}*`);
  }
  if (content.text) {
    parts.push(content.text);
  }
  if (content.table) {
    parts.push(formatTable(content.table.headers, content.table.rows, platform));
  }
  if (content.list) {
    parts.push(
      content.list.map((item) => (platform === "whatsapp" ? `- ${item}` : `• ${item}`)).join("\n"),
    );
  }
  if (content.codeBlock) {
    const { code, language } = content.codeBlock;
    parts.push(
      PLATFORM_CAPABILITIES[platform].codeBlocks
        ? `\`\`\`${language || ""}\n${code}\n\`\`\``
        : code
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n"),
    );
  }
  return parts.join("\n\n");
}

export function adaptMarkdownForPlatform(markdown: string, platform: Platform): string {
  const caps = PLATFORM_CAPABILITIES[platform];
  let result = markdown;
  if (!caps.markdownHeaders) {
    result =
      platform === "whatsapp"
        ? result.replace(/^#{1,6}\s+(.+)$/gm, (_m, t) => t.toUpperCase())
        : result.replace(/^#{1,6}\s+(.+)$/gm, (_m, t) => `**${t}**`);
  }
  if (!caps.tables) {
    result = result.replace(
      /^\|(.+)\|\s*\n\|[\s:|-]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm,
      (_, headerLine, bodyLines) => {
        const headers = headerLine
          .split("|")
          .map((h: string) => h.trim())
          .filter(Boolean);
        const rows = bodyLines
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line: string) =>
            line
              .split("|")
              .map((c: string) => c.trim())
              .filter(Boolean),
          );
        return formatTable(headers, rows, platform) + "\n";
      },
    );
  }
  if (!caps.markdownFormatting) {
    result = result.replace(/\*\*(.+?)\*\*/g, (_m, t) => t.toUpperCase());
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1");
    result = result.replace(/~~(.+?)~~/g, "$1");
  }
  if (!caps.codeBlocks) {
    result = result.replace(/```[\w]*\n([\s\S]*?)```/g, (_m, code) =>
      code
        .trim()
        .split("\n")
        .map((l: string) => `  ${l}`)
        .join("\n"),
    );
  }
  return result;
}

export function getPlatformCapabilities(platform: Platform) {
  return { ...PLATFORM_CAPABILITIES[platform] };
}
