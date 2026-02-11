// Internationalization support for OpenClaw UI
// Define all translatable strings with English as the default

export const en = {
  // Navigation
  navigation: {
    chat: "Chat",
    overview: "Overview",
    channels: "Channels",
    instances: "Instances",
    sessions: "Sessions",
    usage: "Usage",
    cron: "Cron Jobs",
    skills: "Skills",
    nodes: "Nodes",
    agents: "Agents",
    config: "Config",
    debug: "Debug",
    logs: "Logs",

    // Navigation Groups
    chatGroup: "Chat",
    controlGroup: "Control",
    agentGroup: "Agent",
    settingsGroup: "Settings",

    // Resources
    resources: "Resources",
    docs: "Docs",
    docsTitle: "Docs (opens in new tab)",
  },

  // Page titles and subtitles
  pageTitles: {
    agents: "Agents",
    overview: "Overview",
    channels: "Channels",
    instances: "Instances",
    sessions: "Sessions",
    usage: "Usage",
    cron: "Cron Jobs",
    skills: "Skills",
    nodes: "Nodes",
    chat: "Chat",
    config: "Config",
    debug: "Debug",
    logs: "Logs",
  },

  pageSubtitles: {
    agents: "Manage agent workspaces, tools, and identities.",
    overview: "Gateway status, entry points, and a fast health read.",
    channels: "Manage channels and settings.",
    instances: "Presence beacons from connected clients and nodes.",
    sessions: "Inspect active sessions and adjust per-session defaults.",
    usage: "",
    cron: "Schedule wakeups and recurring agent runs.",
    skills: "Manage skill availability and API key injection.",
    nodes: "Paired devices, capabilities, and command exposure.",
    chat: "Direct gateway chat session for quick interventions.",
    config: "Edit ~/.openclaw/openclaw.json safely.",
    debug: "Gateway snapshots, events, and manual RPC calls.",
    logs: "Live tail of the gateway file logs.",
  },

  // Topbar
  topbar: {
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    brandTitle: "OPENCLAW",
    brandSubtitle: "Gateway Dashboard",
    health: "Health",
    offline: "Offline",
    ok: "OK",
  },

  // Common UI elements
  common: {
    status: "Status",
    loading: "Loading...",
    refresh: "Refresh",
    save: "Save",
    cancel: "Cancel",
    yes: "Yes",
    no: "No",
    apply: "Apply",
    close: "Close",
    error: "Error",
    clear: "Clear",
    search: "Search",
    enabled: "Enabled",
    disabled: "Disabled",
    name: "Name",
    type: "Type",
    actions: "Actions",
    settings: "Settings",
    edit: "Edit",
    delete: "Delete",
    add: "Add",
    remove: "Remove",
    connect: "Connect",
    disconnect: "Disconnect",
    connected: "Connected",
    disconnected: "Disconnected",
  },

  // Chat
  chat: {
    thinking: "Thinking",
    send: "Send",
    newSession: "New Session",
    focusMode: "Focus Mode",
    showThinking: "Show Thinking",
    noMessages: "No messages yet. Start a conversation!",
    attachment: "Attachment",
    attachments: "Attachments",
  },

  // Settings
  settings: {
    theme: {
      light: "Light",
      dark: "Dark",
      system: "System",
      toggle: "Toggle Theme",
    },
    language: "Language",
    languageSelect: "Select Language",
  },
};

export const zh = {
  // Navigation
  navigation: {
    chat: "聊天",
    overview: "概览",
    channels: "频道",
    instances: "实例",
    sessions: "会话",
    usage: "用量",
    cron: "定时任务",
    skills: "技能",
    nodes: "节点",
    agents: "代理",
    config: "配置",
    debug: "调试",
    logs: "日志",

    // Navigation Groups
    chatGroup: "聊天",
    controlGroup: "控制",
    agentGroup: "代理",
    settingsGroup: "设置",

    // Resources
    resources: "资源",
    docs: "文档",
    docsTitle: "文档（在新标签页中打开）",
  },

  // Page titles and subtitles
  pageTitles: {
    agents: "代理",
    overview: "概览",
    channels: "频道",
    instances: "实例",
    sessions: "会话",
    usage: "用量",
    cron: "定时任务",
    skills: "技能",
    nodes: "节点",
    chat: "聊天",
    config: "配置",
    debug: "调试",
    logs: "日志",
  },

  pageSubtitles: {
    agents: "管理代理工作区、工具和身份。",
    overview: "网关状态、入口点和快速健康检查。",
    channels: "管理频道和设置。",
    instances: "来自连接客户端和节点的存在信号。",
    sessions: "检查活动会话并调整每个会话的默认设置。",
    usage: "",
    cron: "安排唤醒和定期代理运行。",
    skills: "管理技能可用性和API密钥注入。",
    nodes: "配对设备、功能和命令暴露。",
    chat: "直接网关聊天会话，用于快速干预。",
    config: "安全地编辑 ~/.openclaw/openclaw.json。",
    debug: "网关快照、事件和手动RPC调用。",
    logs: "网关文件日志的实时尾部。",
  },

  // Topbar
  topbar: {
    expandSidebar: "展开侧边栏",
    collapseSidebar: "收起侧边栏",
    brandTitle: "OPENCLAW",
    brandSubtitle: "网关仪表板",
    health: "健康状况",
    offline: "离线",
    ok: "正常",
  },

  // Common UI elements
  common: {
    status: "状态",
    loading: "加载中...",
    refresh: "刷新",
    save: "保存",
    cancel: "取消",
    yes: "是",
    no: "否",
    apply: "应用",
    close: "关闭",
    error: "错误",
    clear: "清除",
    search: "搜索",
    enabled: "启用",
    disabled: "禁用",
    name: "名称",
    type: "类型",
    actions: "操作",
    settings: "设置",
    edit: "编辑",
    delete: "删除",
    add: "添加",
    remove: "移除",
    connect: "连接",
    disconnect: "断开连接",
    connected: "已连接",
    disconnected: "已断开连接",
  },

  // Chat
  chat: {
    thinking: "思考中",
    send: "发送",
    newSession: "新会话",
    focusMode: "专注模式",
    showThinking: "显示思考过程",
    noMessages: "还没有消息。开始对话吧！",
    attachment: "附件",
    attachments: "附件",
  },

  // Settings
  settings: {
    theme: {
      light: "明亮",
      dark: "暗黑",
      system: "跟随系统",
      toggle: "切换主题",
    },
    language: "语言",
    languageSelect: "选择语言",
  },
};

// Default to English
export const defaultLocale = "en";

// Export all locales
export const locales = {
  en,
  zh,
};
