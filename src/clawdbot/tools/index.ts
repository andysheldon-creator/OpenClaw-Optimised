/**
 * Clawdbot tool runners -- barrel export
 *
 * Re-exports every tool module so consumers can import from a single path:
 *   import { CliRunner, BrowserRunner, ... } from "../clawdbot/tools/index.js";
 */

// TOOLS-001 (#37) CLI runner
export type { CliRunnerOptions, CliRunnerResult } from "./cli-runner.js";
export { CliRunner } from "./cli-runner.js";

// TOOLS-002 (#38) CLI allowlist
export type { CliAllowlistEntry } from "./cli-allowlist.js";
export { CliAllowlist } from "./cli-allowlist.js";

// TOOLS-003 (#39) CLI output parsers
export { parseJsonOutput, parseTableOutput, parseCsvOutput } from "./cli-parser.js";

// TOOLS-004 (#40) Browser runner
export type {
  BrowserActionType,
  BrowserAction,
  BrowserRunnerOptions,
  BrowserScreenshot,
  BrowserRunnerResult,
} from "./browser-runner.js";
export { BrowserRunner } from "./browser-runner.js";

// TOOLS-016 (#297) Google Ads browser adapter
export type {
  GoogleAdsMutationActionType,
  GoogleAdsMutationAction,
  GoogleAdsActionErrorCategory,
  GoogleAdsMutationResult,
  GoogleAdsSessionProbeResult,
} from "./google-ads-types.js";
export { GoogleAdsBrowserAdapter } from "./google-ads-browser.js";

// TOOLS-017 (#298) Google Ads CLI adapter
export { GoogleAdsCliAdapter } from "./google-ads-cli.js";

// TOOLS-005 (#41) Browser credential vault
export type { BrowserCredential, BrowserSessionData } from "./browser-vault.js";
export { BrowserSessionStore } from "./browser-vault.js";

// TOOLS-006 (#42) Browser commit gating
export type { CommitActionType, CommitGateResult } from "./browser-commit-gate.js";
export { CommitStepDetector } from "./browser-commit-gate.js";

// TOOLS-007 (#43) Email integration
export type {
  EmailAttachment,
  Email,
  EmailSearchOptions,
  EmailSendOptions,
  EmailProvider,
} from "./email-runner.js";

// TOOLS-008 (#44) Calendar integration
export type {
  CalendarAttendee,
  RecurrenceRule,
  CalendarEvent,
  CalendarListOptions,
  CalendarEventCreate,
  CalendarEventUpdate,
  CalendarProvider,
} from "./calendar-runner.js";

// TOOLS-009 (#45) Messaging integration
export type {
  MessageAttachment,
  Message,
  MessagingChannel,
  MessageSendOptions,
  MessageReceiveOptions,
  MessagingProvider,
} from "./messaging-runner.js";

// TOOLS-010 (#46) Voice calling
export type {
  VoiceCallStatus,
  VoiceCall,
  VoiceCallInitiateOptions,
  VoiceProvider,
} from "./voice-runner.js";

// TOOLS-011 (#47) Speech-to-text
export type { TranscriptSegment, Transcript, SttOptions, SttProvider } from "./stt-pipeline.js";

// TOOLS-012 (#48) Text-to-speech
export type { TtsAudioFormat, TtsOptions, TtsResult, TtsProvider } from "./tts-pipeline.js";

// TOOLS-013 (#49) Webhook receiver
export type { WebhookConfig, WebhookEvent } from "./webhook-receiver.js";
export { verifyWebhookSignature, isIpAllowed } from "./webhook-receiver.js";

// TOOLS-014 (#50) File storage
export type {
  StoredFile,
  FileUploadOptions,
  FileListOptions,
  FileListResult,
  FileStorageProvider,
} from "./file-storage.js";

// TOOLS-015 (#51) PDF / text ingestion
export type { TocEntry, IngestedPage, IngestMetadata, IngestResult } from "./pdf-ingestion.js";
export { ingestPdf, ingestText } from "./pdf-ingestion.js";
