export type SimplexChatType = "direct" | "group" | "local";

export type SimplexChatRef = {
  type: SimplexChatType;
  id: number | string;
  scope?: string | null;
};

export type SimplexMsgContent = {
  type: "text" | "link" | "image" | "video" | "voice" | "file" | "report" | "chat" | "unknown";
  text: string;
  [key: string]: unknown;
};

export type SimplexComposedMessage = {
  msgContent: SimplexMsgContent;
  quotedItemId?: number;
  fileSource?: {
    filePath: string;
    cryptoArgs?: { fileKey: string; fileNonce: string };
  };
  mentions?: Record<string, number>;
};

const SIMPLEX_CHAT_REF_RE = /^[@#][0-9A-Za-z_-]+$/;
const SIMPLEX_CHAT_ITEM_ID_RE = /^-?\d+$/;

function normalizeChatRefToken(value: string): string {
  const trimmed = value.trim();
  if (!SIMPLEX_CHAT_REF_RE.test(trimmed)) {
    throw new Error(`invalid SimpleX chat ref: ${value}`);
  }
  return trimmed;
}

function normalizeChatItemIdToken(value: number | string): string {
  const normalized = normalizeCommandId(value);
  if (!SIMPLEX_CHAT_ITEM_ID_RE.test(normalized)) {
    throw new Error(`invalid SimpleX chat item id: ${value}`);
  }
  return normalized;
}

function quoteCliArg(value: string): string {
  const trimmed = value.trim();
  const hasControlNewline =
    trimmed.includes("\n") || trimmed.includes("\r") || trimmed.includes("\u0000");
  if (!trimmed || hasControlNewline) {
    throw new Error("invalid SimpleX CLI argument");
  }
  return `'${trimmed.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function formatChatRef(ref: SimplexChatRef): string {
  const prefix = ref.type === "direct" ? "@" : ref.type === "group" ? "#" : "*";
  const scope = ref.scope ? String(ref.scope) : "";
  return `${prefix}${ref.id}${scope}`;
}

export function buildSendMessagesCommand(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  liveMessage?: boolean;
  ttl?: number;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const liveFlag = params.liveMessage ? " live=on" : "";
  const ttlFlag = typeof params.ttl === "number" ? ` ttl=${params.ttl}` : "";
  const json = quoteCliArg(JSON.stringify(params.composedMessages));
  return `/_send ${chatRef}${liveFlag}${ttlFlag} json ${json}`;
}

export function buildUpdateChatItemCommand(params: {
  chatRef: string;
  chatItemId: number;
  updatedMessage: SimplexComposedMessage;
  liveMessage?: boolean;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const chatItemId = normalizeChatItemIdToken(params.chatItemId);
  const liveFlag = params.liveMessage ? " live=on" : "";
  const json = quoteCliArg(JSON.stringify(params.updatedMessage));
  return `/_update item ${chatRef} ${chatItemId}${liveFlag} json ${json}`;
}

export function buildDeleteChatItemCommand(params: {
  chatRef: string;
  chatItemIds: Array<number | string>;
  deleteMode?: "broadcast" | "internal" | "internalMark";
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const deleteMode = params.deleteMode ?? "broadcast";
  const ids = params.chatItemIds.map((id) => normalizeChatItemIdToken(id)).join(",");
  return `/_delete item ${chatRef} ${ids} ${deleteMode}`;
}

export function buildReactionCommand(params: {
  chatRef: string;
  chatItemId: number;
  add: boolean;
  reaction: Record<string, unknown>;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const chatItemId = normalizeChatItemIdToken(params.chatItemId);
  const toggle = params.add ? "on" : "off";
  const json = quoteCliArg(JSON.stringify(params.reaction));
  return `/_reaction ${chatRef} ${chatItemId} ${toggle} ${json}`;
}

export function buildReceiveFileCommand(params: {
  fileId: number;
  filePath?: string;
  inline?: boolean;
  encrypt?: boolean;
  approvedRelays?: boolean;
}): string {
  if (!Number.isFinite(params.fileId)) {
    throw new Error(`invalid SimpleX file id: ${params.fileId}`);
  }
  const flags: string[] = [];
  if (params.approvedRelays) {
    flags.push("approved_relays=on");
  }
  if (typeof params.encrypt === "boolean") {
    flags.push(`encrypt=${params.encrypt ? "on" : "off"}`);
  }
  if (typeof params.inline === "boolean") {
    flags.push(`inline=${params.inline ? "on" : "off"}`);
  }
  const path = params.filePath ? ` ${quoteCliArg(params.filePath)}` : "";
  const suffix = flags.length > 0 ? ` ${flags.join(" ")}` : "";
  return `/freceive ${Math.trunc(params.fileId)}${suffix}${path}`;
}

export function buildCancelFileCommand(fileId: number): string {
  return `/fcancel ${fileId}`;
}

function normalizeCommandId(value: number | string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

function normalizeContactRef(value: number | string): string {
  const raw = normalizeCommandId(value);
  if (!raw) {
    return raw;
  }
  if (raw.startsWith("@")) {
    return raw;
  }
  if (/^(contact|user|member):/i.test(raw)) {
    return `@${raw.slice(raw.indexOf(":") + 1).trim()}`;
  }
  return `@${raw}`;
}

function normalizeGroupRef(value: number | string): string {
  const raw = normalizeCommandId(value);
  if (!raw) {
    return raw;
  }
  if (raw.startsWith("#")) {
    return raw;
  }
  if (/^group:/i.test(raw)) {
    return `#${raw.slice("group:".length).trim()}`;
  }
  return `#${raw}`;
}

function formatSearchArg(search?: string | null): string {
  const trimmed = search?.trim();
  if (!trimmed) {
    return "";
  }
  if (/\s/.test(trimmed)) {
    return `'${trimmed.replace(/'/g, "\\'")}'`;
  }
  return trimmed;
}

export function buildListUsersCommand(): string {
  return "/_users";
}

export function buildShowActiveUserCommand(): string {
  return "/_user";
}

export function buildListContactsCommand(userId: number | string): string {
  const id = normalizeCommandId(userId);
  return `/_contacts ${id}`;
}

export function buildListGroupsCommand(params: {
  userId: number | string;
  contactId?: number | string | null;
  search?: string | null;
}): string {
  const userId = normalizeCommandId(params.userId);
  const contactRef = params.contactId ? normalizeContactRef(params.contactId) : "";
  const search = formatSearchArg(params.search);
  const parts = ["/_groups", userId, contactRef, search].filter(Boolean);
  return parts.join(" ");
}

export function buildListGroupMembersCommand(params: {
  groupId: number | string;
  search?: string | null;
}): string {
  const groupRef = normalizeGroupRef(params.groupId);
  const search = formatSearchArg(params.search);
  const parts = ["/_members", groupRef, search].filter(Boolean);
  return parts.join(" ");
}

export function buildAddGroupMemberCommand(params: {
  groupId: number | string;
  contactId: number | string;
}): string {
  return `/_add ${normalizeGroupRef(params.groupId)} ${normalizeContactRef(params.contactId)}`;
}

export function buildRemoveGroupMemberCommand(params: {
  groupId: number | string;
  memberId: number | string;
}): string {
  return `/_remove ${normalizeGroupRef(params.groupId)} ${normalizeContactRef(params.memberId)}`;
}

export function buildLeaveGroupCommand(groupId: number | string): string {
  return `/_leave ${normalizeGroupRef(groupId)}`;
}

export function buildUpdateGroupProfileCommand(params: {
  groupId: number | string;
  profile: Record<string, unknown>;
}): string {
  return `/_group_profile ${normalizeGroupRef(params.groupId)} ${quoteCliArg(JSON.stringify(params.profile))}`;
}
