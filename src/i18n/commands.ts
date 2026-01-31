/**
 * Command i18n translations for buildChatCommands
 */

export type Locale = "en" | "zh-CN";

/**
 * Command translation keys
 */
export interface CommandTranslations {
  // help
  "help.description": string;

  // commands
  "commands.description": string;

  // skill
  "skill.description": string;
  "skill.args.name": string;
  "skill.args.input": string;

  // status
  "status.description": string;

  // allowlist
  "allowlist.description": string;

  // approve
  "approve.description": string;

  // context
  "context.description": string;

  // tts
  "tts.description": string;
  "tts.args.action": string;
  "tts.args.value": string;
  "tts.choices.on": string;
  "tts.choices.off": string;
  "tts.choices.status": string;
  "tts.choices.provider": string;
  "tts.choices.limit": string;
  "tts.choices.summary": string;
  "tts.choices.audio": string;
  "tts.choices.help": string;
  "tts.menu.title": string;

  // whoami
  "whoami.description": string;

  // subagents
  "subagents.description": string;
  "subagents.args.action": string;
  "subagents.args.target": string;
  "subagents.args.value": string;

  // config
  "config.description": string;
  "config.args.action": string;
  "config.args.path": string;
  "config.args.value": string;

  // debug
  "debug.description": string;
  "debug.args.action": string;
  "debug.args.path": string;
  "debug.args.value": string;

  // usage
  "usage.description": string;
  "usage.args.mode": string;

  // stop
  "stop.description": string;

  // restart
  "restart.description": string;

  // activation
  "activation.description": string;
  "activation.args.mode": string;

  // send
  "send.description": string;
  "send.args.mode": string;

  // reset
  "reset.description": string;

  // new
  "new.description": string;

  // compact
  "compact.description": string;
  "compact.args.instructions": string;

  // think
  "think.description": string;
  "think.args.level": string;

  // verbose
  "verbose.description": string;
  "verbose.args.mode": string;

  // reasoning
  "reasoning.description": string;
  "reasoning.args.mode": string;

  // elevated
  "elevated.description": string;
  "elevated.args.mode": string;

  // exec
  "exec.description": string;
  "exec.args.options": string;

  // model
  "model.description": string;
  "model.args.model": string;

  // models
  "models.description": string;

  // queue
  "queue.description": string;
  "queue.args.mode": string;
  "queue.args.debounce": string;
  "queue.args.cap": string;
  "queue.args.drop": string;

  // bash
  "bash.description": string;
  "bash.args.command": string;

  // dock (dynamic)
  "dock.description": string; // Template: "Switch to {id} for replies."
}

const enTranslations: CommandTranslations = {
  // help
  "help.description": "Show available commands.",

  // commands
  "commands.description": "List all slash commands.",

  // skill
  "skill.description": "Run a skill by name.",
  "skill.args.name": "Skill name",
  "skill.args.input": "Skill input",

  // status
  "status.description": "Show current status.",

  // allowlist
  "allowlist.description": "List/add/remove allowlist entries.",

  // approve
  "approve.description": "Approve or deny exec requests.",

  // context
  "context.description": "Explain how context is built and used.",

  // tts
  "tts.description": "Control text-to-speech (TTS).",
  "tts.args.action": "TTS action",
  "tts.args.value": "Provider, limit, or text",
  "tts.choices.on": "On",
  "tts.choices.off": "Off",
  "tts.choices.status": "Status",
  "tts.choices.provider": "Provider",
  "tts.choices.limit": "Limit",
  "tts.choices.summary": "Summary",
  "tts.choices.audio": "Audio",
  "tts.choices.help": "Help",
  "tts.menu.title":
    "TTS Actions:\n" +
    "• On – Enable TTS for responses\n" +
    "• Off – Disable TTS\n" +
    "• Status – Show current settings\n" +
    "• Provider – Set voice provider (edge, elevenlabs, openai)\n" +
    "• Limit – Set max characters for TTS\n" +
    "• Summary – Toggle AI summary for long texts\n" +
    "• Audio – Generate TTS from custom text\n" +
    "• Help – Show usage guide",

  // whoami
  "whoami.description": "Show your sender id.",

  // subagents
  "subagents.description": "List/stop/log/info subagent runs for this session.",
  "subagents.args.action": "list | stop | log | info | send",
  "subagents.args.target": "Run id, index, or session key",
  "subagents.args.value": "Additional input (limit/message)",

  // config
  "config.description": "Show or set config values.",
  "config.args.action": "show | get | set | unset",
  "config.args.path": "Config path",
  "config.args.value": "Value for set",

  // debug
  "debug.description": "Set runtime debug overrides.",
  "debug.args.action": "show | reset | set | unset",
  "debug.args.path": "Debug path",
  "debug.args.value": "Value for set",

  // usage
  "usage.description": "Usage footer or cost summary.",
  "usage.args.mode": "off, tokens, full, or cost",

  // stop
  "stop.description": "Stop the current run.",

  // restart
  "restart.description": "Restart Moltbot.",

  // activation
  "activation.description": "Set group activation mode.",
  "activation.args.mode": "mention or always",

  // send
  "send.description": "Set send policy.",
  "send.args.mode": "on, off, or inherit",

  // reset
  "reset.description": "Reset the current session.",

  // new
  "new.description": "Start a new session.",

  // compact
  "compact.description": "Compact the session context.",
  "compact.args.instructions": "Extra compaction instructions",

  // think
  "think.description": "Set thinking level.",
  "think.args.level": "off, minimal, low, medium, high, xhigh",

  // verbose
  "verbose.description": "Toggle verbose mode.",
  "verbose.args.mode": "on or off",

  // reasoning
  "reasoning.description": "Toggle reasoning visibility.",
  "reasoning.args.mode": "on, off, or stream",

  // elevated
  "elevated.description": "Toggle elevated mode.",
  "elevated.args.mode": "on, off, ask, or full",

  // exec
  "exec.description": "Set exec defaults for this session.",
  "exec.args.options": "host=... security=... ask=... node=...",

  // model
  "model.description": "Show or set the model.",
  "model.args.model": "Model id (provider/model or id)",

  // models
  "models.description": "List model providers or provider models.",

  // queue
  "queue.description": "Adjust queue settings.",
  "queue.args.mode": "queue mode",
  "queue.args.debounce": "debounce duration (e.g. 500ms, 2s)",
  "queue.args.cap": "queue cap",
  "queue.args.drop": "drop policy",

  // bash
  "bash.description": "Run host shell commands (host-only).",
  "bash.args.command": "Shell command",

  // dock (dynamic)
  "dock.description": "Switch to {id} for replies.",
};

const zhCNTranslations: CommandTranslations = {
  // help
  "help.description": "显示可用命令。",

  // commands
  "commands.description": "列出所有斜杠命令。",

  // skill
  "skill.description": "按名称运行技能。",
  "skill.args.name": "技能名称",
  "skill.args.input": "技能输入",

  // status
  "status.description": "显示当前状态。",

  // allowlist
  "allowlist.description": "列出/添加/移除白名单条目。",

  // approve
  "approve.description": "批准或拒绝执行请求。",

  // context
  "context.description": "解释上下文如何构建和使用。",

  // tts
  "tts.description": "控制文本转语音（TTS）。",
  "tts.args.action": "TTS 操作",
  "tts.args.value": "提供商、限制或文本",
  "tts.choices.on": "开启",
  "tts.choices.off": "关闭",
  "tts.choices.status": "状态",
  "tts.choices.provider": "提供商",
  "tts.choices.limit": "限制",
  "tts.choices.summary": "摘要",
  "tts.choices.audio": "音频",
  "tts.choices.help": "帮助",
  "tts.menu.title":
    "TTS 操作：\n" +
    "• 开启 – 为回复启用TTS\n" +
    "• 关闭 – 禁用TTS\n" +
    "• 状态 – 显示当前设置\n" +
    "• 提供商 – 设置语音提供商（edge、elevenlabs、openai）\n" +
    "• 限制 – 设置TTS最大字符数\n" +
    "• 摘要 – 为长文本切换AI摘要\n" +
    "• 音频 – 从自定义文本生成TTS\n" +
    "• 帮助 – 显示使用指南",

  // whoami
  "whoami.description": "显示您的发送者ID。",

  // subagents
  "subagents.description": "列出/停止/记录/查看此会话的子代理运行。",
  "subagents.args.action": "list | stop | log | info | send",
  "subagents.args.target": "运行ID、索引或会话密钥",
  "subagents.args.value": "额外输入（限制/消息）",

  // config
  "config.description": "显示或设置配置值。",
  "config.args.action": "show | get | set | unset",
  "config.args.path": "配置路径",
  "config.args.value": "设置的值",

  // debug
  "debug.description": "设置运行时调试覆盖。",
  "debug.args.action": "show | reset | set | unset",
  "debug.args.path": "调试路径",
  "debug.args.value": "设置的值",

  // usage
  "usage.description": "使用情况页脚或成本摘要。",
  "usage.args.mode": "off、tokens、full 或 cost",

  // stop
  "stop.description": "停止当前运行。",

  // restart
  "restart.description": "重启 Moltbot。",

  // activation
  "activation.description": "设置群组激活模式。",
  "activation.args.mode": "mention 或 always",

  // send
  "send.description": "设置发送策略。",
  "send.args.mode": "on、off 或 inherit",

  // reset
  "reset.description": "重置当前会话。",

  // new
  "new.description": "开始新会话。",

  // compact
  "compact.description": "压缩会话上下文。",
  "compact.args.instructions": "额外的压缩指令",

  // think
  "think.description": "设置思考级别。",
  "think.args.level": "off、minimal、low、medium、high、xhigh",

  // verbose
  "verbose.description": "切换详细模式。",
  "verbose.args.mode": "on 或 off",

  // reasoning
  "reasoning.description": "切换推理可见性。",
  "reasoning.args.mode": "on、off 或 stream",

  // elevated
  "elevated.description": "切换提升模式。",
  "elevated.args.mode": "on、off、ask 或 full",

  // exec
  "exec.description": "为此会话设置执行默认值。",
  "exec.args.options": "host=... security=... ask=... node=...",

  // model
  "model.description": "显示或设置模型。",
  "model.args.model": "模型ID（provider/model 或 id）",

  // models
  "models.description": "列出模型提供商或提供商的模型。",

  // queue
  "queue.description": "调整队列设置。",
  "queue.args.mode": "队列模式",
  "queue.args.debounce": "防抖延迟（例如 500ms、2s）",
  "queue.args.cap": "队列上限",
  "queue.args.drop": "丢弃策略",

  // bash
  "bash.description": "运行主机Shell命令（仅限主机）。",
  "bash.args.command": "Shell命令",

  // dock (dynamic)
  "dock.description": "切换到 {id} 进行回复。",
};

const translations: Record<Locale, CommandTranslations> = {
  en: enTranslations,
  "zh-CN": zhCNTranslations,
};

/**
 * Get translation for a command key
 */
export function t(
  key: keyof CommandTranslations,
  locale: Locale = "en",
  replacements?: Record<string, string>,
): string {
  const translation = translations[locale]?.[key] ?? translations.en[key];

  if (!translation) {
    console.warn(`Command translation key '${key}' not found for locale '${locale}'`);
    return key;
  }

  // Replace placeholders
  let result = translation;
  if (replacements) {
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`\\{${placeholder}\\}`, "g"), value);
    }
  }

  return result;
}

/**
 * Get all translations for a locale
 */
export function getTranslations(locale: Locale = "en"): CommandTranslations {
  return translations[locale] ?? translations.en;
}
