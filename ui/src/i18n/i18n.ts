/**
 * Internationalization (i18n) module for Moltbot UI
 */

export type Locale = "en" | "zh-CN";

export interface TranslationKeys {
  // Navigation
  "nav.chat": string;
  "nav.overview": string;
  "nav.channels": string;
  "nav.instances": string;
  "nav.sessions": string;
  "nav.cron": string;
  "nav.skills": string;
  "nav.nodes": string;
  "nav.config": string;
  "nav.debug": string;
  "nav.logs": string;
  "nav.resources": string;
  "nav.docs": string;

  // Navigation Groups
  "nav.group.chat": string;
  "nav.group.control": string;
  "nav.group.agent": string;
  "nav.group.settings": string;

  // Page Titles and Subtitles
  "page.title.overview": string;
  "page.subtitle.overview": string;
  "page.title.channels": string;
  "page.subtitle.channels": string;
  "page.title.instances": string;
  "page.subtitle.instances": string;
  "page.title.sessions": string;
  "page.subtitle.sessions": string;
  "page.title.cron": string;
  "page.subtitle.cron": string;
  "page.title.skills": string;
  "page.subtitle.skills": string;
  "page.title.nodes": string;
  "page.subtitle.nodes": string;
  "page.title.chat": string;
  "page.subtitle.chat": string;
  "page.title.config": string;
  "page.subtitle.config": string;
  "page.title.debug": string;
  "page.subtitle.debug": string;
  "page.title.logs": string;
  "page.subtitle.logs": string;
  "instances.no_instances_yet": string;
  "instances.seconds_ago": string;
  "instances.last_input": string;
  "instances.reason": string;
  "instances.unknown_host": string;
  "instances.unknown": string;
  "instances.scopes": string;
  "instances.scopes_label": string;
  "cron.schedule_at": string;
  "cron.schedule_every": string;
  "cron.schedule_cron": string;
  "cron.payload_system": string;
  "cron.payload_agent": string;

  // Topbar
  "topbar.expand_sidebar": string;
  "topbar.collapse_sidebar": string;
  "topbar.brand_title": string;
  "topbar.brand_sub": string;
  "topbar.status.health": string;
  "topbar.status.ok": string;
  "topbar.status.offline": string;

  // Overview page
  "overview.gateway_access": string;
  "overview.gateway_subtitle": string;
  "overview.websocket_url": string;
  "overview.gateway_token": string;
  "overview.password": string;
  "overview.default_session_key": string;
  "overview.connect_button": string;
  "overview.refresh_button": string;
  "overview.click_connect_hint": string;
  "overview.snapshot": string;
  "overview.snapshot_subtitle": string;
  "overview.status": string;
  "overview.uptime": string;
  "overview.tick_interval": string;
  "overview.last_channels_refresh": string;
  "overview.instances": string;
  "overview.sessions": string;
  "overview.cron": string;
  "overview.notes": string;
  "overview.notes_subtitle": string;
  "overview.tailscale_serve": string;
  "overview.session_hygiene": string;
  "overview.cron_reminders": string;
  "overview.presence_beacons_hint": string;
  "overview.recent_sessions_hint": string;
  "overview.cron_next_wake": string;
  "overview.gateway_disconnected": string;
  "overview.tailscale_serve_note": string;
  "overview.session_hygiene_note": string;
  "overview.cron_reminders_note": string;

  // Common terms (已合并所有重复的通用术语)
  "common.connected": string;
  "common.disconnected": string;
  "common.enabled": string;
  "common.disabled": string;
  "common.n_a": string;
  "common.cancel": string;
  "common.save": string;
  "common.save_button": string;
  "common.apply": string;
  "common.update": string;
  "common.refresh": string;
  "common.refresh_button": string;
  "common.loading": string;
  "common.saving": string;
  "common.close": string;
  "common.ok": string;
  "common.yes": string;
  "common.no": string;
  "common.error": string;
  "common.warning": string;
  "common.info": string;
  "common.success": string;
  "common.open_in_new_tab": string;
  "common.inherit": string;
  "common.last": string;
  "common.select_a_job": string;
  "common.agent": string;
  "common.uses_default_value": string;
  "common.default_value": string;
  "common.override_value": string;
  "common.override_value_simple": string;
  "common.select_job_instruction": string;
  "common.select_job_prompt": string;
  "common.latest_runs_for": string;

  // WhatsApp channel
  "whatsapp.card_title": string;
  "whatsapp.card_subtitle": string;
  "whatsapp.status.configured": string;
  "whatsapp.status.linked": string;
  "whatsapp.status.running": string;
  "whatsapp.status.connected": string;
  "telegram.status.connected": string;
  "whatsapp.status.last_connect": string;
  "whatsapp.status.last_message": string;
  "whatsapp.status.auth_age": string;
  "whatsapp.button.show_qr": string;
  "whatsapp.button.working": string;
  "whatsapp.button.relink": string;
  "whatsapp.button.wait_scan": string;
  "whatsapp.button.logout": string;

  // Telegram channel
  "telegram.card_title": string;
  "telegram.card_subtitle": string;
  "telegram.status.configured": string;
  "telegram.status.running": string;
  "telegram.status.mode": string;
  "telegram.status.last_start": string;
  "telegram.status.last_probe": string;
  "telegram.status.last_inbound": string;
  "telegram.button.probe": string;

  // Discord channel
  "discord.card_title": string;
  "discord.card_subtitle": string;
  "discord.status.configured": string;
  "discord.status.running": string;
  "discord.status.last_start": string;
  "discord.status.last_probe": string;
  "discord.button.probe": string;

  // Signal channel
  "signal.card_title": string;
  "signal.card_subtitle": string;
  "signal.status.configured": string;
  "signal.status.running": string;
  "signal.status.base_url": string;
  "signal.status.last_start": string;
  "signal.status.last_probe": string;
  "signal.button.probe": string;

  // Slack channel
  "slack.card_title": string;
  "slack.card_subtitle": string;
  "slack.status.configured": string;
  "slack.status.running": string;
  "slack.status.last_start": string;
  "slack.status.last_probe": string;
  "slack.button.probe": string;

  // iMessage channel
  "imessage.card_title": string;
  "imessage.card_subtitle": string;
  "imessage.status.configured": string;
  "imessage.status.running": string;
  "imessage.status.last_start": string;
  "imessage.status.last_probe": string;
  "imessage.button.probe": string;

  // Nostr channel
  "nostr.card_title": string;
  "nostr.card_subtitle": string;
  "nostr.status.configured": string;
  "nostr.status.running": string;
  "nostr.status.public_key": string;
  "nostr.status.last_start": string;
  "nostr.status.last_inbound": string;
  "nostr.profile.title": string;
  "nostr.profile.edit_button": string;
  "nostr.profile.name": string;
  "nostr.profile.display_name": string;
  "nostr.profile.about": string;
  "nostr.profile.nip05": string;
  "nostr.profile.not_set": string;
  "nostr.button.refresh": string;

  // Google Chat channel
  "googlechat.card_title": string;
  "googlechat.card_subtitle": string;
  "googlechat.status.configured": string;
  "googlechat.status.running": string;
  "googlechat.status.credential": string;
  "googlechat.status.audience": string;
  "googlechat.status.last_start": string;
  "googlechat.status.last_probe": string;
  "googlechat.button.probe": string;

  // Channels config
  "channels.config.schema_unavailable": string;
  "channels.config.channel_config_schema_unavailable": string;
  "channels.config.use_raw": string;
  "channels.config.loading_config_schema": string;
  "channels.config.save_button": string;
  "channels.config.reload_button": string;
  "channels.config.no_snapshot_yet": string;

  // Sessions page
  "sessions.title": string;
  "sessions.subtitle": string;
  "sessions.active_minutes_filter": string;
  "sessions.limit_filter": string;
  "sessions.include_global_filter": string;
  "sessions.include_unknown_filter": string;
  "sessions.refresh_button": string;
  "sessions.loading": string;
  "sessions.store_path": string;
  "sessions.table_key": string;
  "sessions.table_label": string;
  "sessions.table_kind": string;
  "sessions.table_updated": string;
  "sessions.table_tokens": string;
  "sessions.table_thinking": string;
  "sessions.table_verbose": string;
  "sessions.table_reasoning": string;
  "sessions.table_actions": string;
  "sessions.no_sessions_found": string;
  "sessions.delete_button": string;

  // Cron page
  "cron.scheduler_title": string;
  "cron.scheduler_subtitle": string;
  "cron.scheduler_enabled": string;
  "cron.scheduler_jobs": string;
  "cron.scheduler_next_wake": string;
  "cron.new_job_title": string;
  "cron.new_job_subtitle": string;
  "cron.job_name": string;
  "cron.job_description": string;
  "cron.agent_id": string;
  "cron.job_enabled": string;
  "cron.schedule_type": string;
  "cron.schedule_type_every": string;
  "cron.schedule_type_at": string;
  "cron.schedule_type_cron": string;
  "cron.session_target": string;
  "cron.session_target_main": string;
  "cron.session_target_isolated": string;
  "cron.wake_mode": string;
  "cron.wake_mode_next_heartbeat": string;
  "cron.wake_mode_now": string;
  "cron.payload_type": string;
  "cron.payload_type_system_event": string;
  "cron.payload_type_agent_turn": string;
  "cron.system_text": string;
  "cron.agent_message": string;
  "cron.deliver": string;
  "cron.delivery": string;
  "cron.delivery_announce": string;
  "cron.delivery_none": string;
  "cron.channel": string;
  "cron.to": string;
  "cron.timeout_seconds": string;
  "cron.post_to_main_prefix": string;
  "cron.add_job_button": string;
  "cron.saving": string;
  "cron.jobs_title": string;
  "cron.jobs_subtitle": string;
  "cron.no_jobs_yet": string;
  "cron.run_history_title": string;
  "cron.run_history_subtitle": string;
  "cron.select_job_to_inspect": string;
  "cron.no_runs_yet": string;
  "cron.run_at": string;
  "cron.every_amount": string;
  "cron.unit": string;
  "cron.unit_minutes": string;
  "cron.unit_hours": string;
  "cron.unit_days": string;
  "cron.expression": string;
  "cron.timezone_optional": string;
  "cron.enable_button": string;
  "cron.disable_button": string;
  "cron.run_button": string;
  "cron.runs_button": string;
  "cron.remove_button": string;
  "cron.minutes": string;
  "cron.hours": string;
  "cron.days": string;
  "cron.enabled_status": string;
  "cron.disabled_status": string;

  // Skills page
  "skills.title": string;
  "skills.subtitle": string;
  "skills.filter_placeholder": string;
  "skills.loading": string;
  "skills.refresh_button": string;
  "skills.shown_count": string;
  "skills.no_skills_found": string;
  "skills.toggle_enable": string;
  "skills.install_button": string;
  "skills.installing": string;
  "skills.missing": string;
  "skills.reason": string;
  "skills.api_key": string;
  "skills.save_key_button": string;

  // Nodes page
  "nodes.title": string;
  "nodes.subtitle": string;
  "nodes.loading": string;
  "nodes.refresh_button": string;
  "nodes.no_nodes_found": string;
  "nodes.nodes_title": string;
  "nodes.nodes_subtitle": string;
  "nodes.devices_title": string;
  "nodes.devices_subtitle": string;
  "nodes.pending_label": string;
  "nodes.paired_label": string;
  "nodes.no_paired_devices": string;
  "nodes.tokens_none": string;
  "nodes.tokens_label": string;
  "nodes.exec_node_binding_title": string;
  "nodes.switch_config_form_mode": string;
  "nodes.load_config_to_edit": string;
  "nodes.load_config_button": string;
  "nodes.default_binding_title": string;
  "nodes.default_binding_subtitle": string;
  "nodes.node_label": string;
  "nodes.any_node_option": string;
  "nodes.no_nodes_with_system_run": string;
  "nodes.no_agents_found": string;
  "nodes.load_exec_approvals": string;
  "nodes.load_approvals_button": string;
  "nodes.target_title": string;
  "nodes.target_subtitle": string;
  "nodes.host_label": string;
  "nodes.gateway_option": string;
  "nodes.node_option": string;
  "nodes.select_node_option": string;
  "nodes.no_nodes_advertise_exec_approvals": string;
  "nodes.scope_label": string;
  "nodes.defaults_button": string;
  "nodes.security_title": string;
  "nodes.default_security_mode": string;
  "nodes.mode_label": string;
  "nodes.ask_title": string;
  "nodes.default_prompt_policy": string;
  "nodes.ask_fallback_title": string;
  "nodes.applied_when_ui_unavailable": string;
  "nodes.fallback_label": string;
  "nodes.auto_allow_skill_clis_title": string;
  "nodes.allow_skill_executables": string;
  "nodes.on_value": string;
  "nodes.off_value": string;
  "nodes.enabled_label": string;
  "nodes.use_default_button": string;
  "nodes.case_insensitive_glob_patterns": string;
  "nodes.add_pattern_button": string;
  "nodes.no_allowlist_entries": string;
  "nodes.pattern_label": string;
  "nodes.remove_button": string;
  "nodes.default_agent": string;
  "nodes.agent": string;
  "nodes.any_value": string;
  "nodes.binding_label": string;
  "nodes.using_default_value": string;
  "devices.title": string;
  "devices.subtitle": string;
  "devices.pending_requests": string;
  "devices.paired_devices": string;
  "devices.no_paired_devices": string;
  "devices.approve_button": string;
  "devices.reject_button": string;
  "devices.rotate_button": string;
  "devices.revoke_button": string;
  "devices.requested": string;
  "devices.role": string;
  "devices.scopes": string;
  "devices.tokens": string;
  "devices.none": string;
  "devices.active": string;
  "devices.revoked": string;
  "nodes.exec_approvals_title": string;
  "nodes.exec_approvals_subtitle": string;
  "nodes.exec_node_binding_subtitle": string;
  "nodes.bindings_save_button": string;
  "nodes.default_binding": string;
  "nodes.any_node": string;
  "nodes.no_nodes_available": string;
  "nodes.agents_not_found": string;
  "nodes.target": string;
  "nodes.host": string;
  "nodes.gateway": string;
  "nodes.node": string;
  "nodes.select_node": string;
  "nodes.no_nodes_with_exec_approvals": string;
  "nodes.scope": string;
  "nodes.defaults": string;
  "nodes.security": string;
  "nodes.security_mode": string;
  "nodes.ask": string;
  "nodes.ask_fallback": string;
  "nodes.ask_fallback_applied_when_ui_unavailable": string;
  "nodes.auto_allow_skill_cli": string;
  "nodes.allow_using_default": string;
  "nodes.allowlist_title": string;
  "nodes.allowlist_subtitle": string;
  "nodes.last_used": string;
  "nodes.new_pattern": string;
  "nodes.binding_override": string;
  "nodes.using_default": string;

  // Debug page
  "debug.snapshots_title": string;
  "debug.snapshots_subtitle": string;
  "debug.refresh_button": string;
  "debug.refreshing": string;
  "debug.status": string;
  "debug.security_audit": string;
  "debug.manual_rpc_title": string;
  "debug.manual_rpc_subtitle": string;
  "debug.method": string;
  "debug.params_json": string;
  "debug.call_button": string;
  "debug.models_title": string;
  "debug.models_subtitle": string;
  "debug.event_log_title": string;
  "debug.event_log_subtitle": string;
  "debug.no_events_yet": string;

  // Logs page
  "logs.title": string;
  "logs.subtitle": string;
  "logs.refresh_button": string;
  "logs.loading": string;
  "logs.export_button": string;
  "logs.filter_placeholder": string;
  "logs.auto_follow": string;
  "logs.file": string;
  "logs.log_output_truncated": string;
  "logs.no_log_entries": string;

  // Chat page
  "chat.compacting_context": string;
  "chat.context_compacted": string;
  "chat.add_message_or_paste_images": string;
  "chat.message_placeholder": string;
  "chat.connect_to_gateway": string;
  "chat.loading_chat": string;
  "chat.queued_messages": string;
  "chat.image_count": string;
  "chat.message_label": string;
  "chat.stop_button": string;
  "chat.new_session_button": string;
  "chat.queue_button": string;
  "chat.send_button": string;
}

// English translations
const enTranslations: TranslationKeys = {
  // Navigation
  "nav.chat": "Chat",
  "nav.overview": "Overview",
  "nav.channels": "Channels",
  "nav.instances": "Instances",
  "nav.sessions": "Sessions",
  "nav.cron": "Cron Jobs",
  "nav.skills": "Skills",
  "nav.nodes": "Nodes",
  "nav.config": "Config",
  "nav.debug": "Debug",
  "nav.logs": "Logs",
  "nav.resources": "Resources",
  "nav.docs": "Docs",

  // Navigation Groups
  "nav.group.chat": "Chat",
  "nav.group.control": "Control",
  "nav.group.agent": "Agent",
  "nav.group.settings": "Settings",

  // Page Titles and Subtitles
  "page.title.overview": "Overview",
  "page.subtitle.overview": "Gateway status, entry points, and a fast health read.",
  "page.title.channels": "Channels",
  "page.subtitle.channels": "Manage channels and settings.",
  "page.title.instances": "Instances",
  "page.subtitle.instances": "Presence beacons from connected clients and nodes.",
  "page.title.sessions": "Sessions",
  "page.subtitle.sessions": "Inspect active sessions and adjust per-session defaults.",
  "page.title.cron": "Cron Jobs",
  "page.subtitle.cron": "Schedule wakeups and recurring agent runs.",
  "page.title.skills": "Skills",
  "page.subtitle.skills": "Manage skill availability and API key injection.",
  "page.title.nodes": "Nodes",
  "page.subtitle.nodes": "Paired devices, capabilities, and command exposure.",
  "page.title.chat": "Chat",
  "page.subtitle.chat": "Direct gateway chat session for quick interventions.",
  "page.title.config": "Config",
  "page.subtitle.config": "Edit ~/.clawdbot/moltbot.json safely.",
  "page.title.debug": "Debug",
  "page.subtitle.debug": "Gateway snapshots, events, and manual RPC calls.",
  "page.title.logs": "Logs",
  "page.subtitle.logs": "Live tail of the gateway file logs.",
  "instances.no_instances_yet": "No instances reported yet.",
  "instances.seconds_ago": "s ago",
  "instances.last_input": "Last input",
  "instances.reason": "Reason",
  "instances.unknown_host": "unknown host",
  "instances.unknown": "unknown",
  "instances.scopes": "scopes",
  "instances.scopes_label": "scopes",
  "cron.schedule_at": "At",
  "cron.schedule_every": "Every",
  "cron.schedule_cron": "Cron",
  "cron.payload_system": "System",
  "cron.payload_agent": "Agent",

  // Topbar
  "topbar.expand_sidebar": "Expand sidebar",
  "topbar.collapse_sidebar": "Collapse sidebar",
  "topbar.brand_title": "MOLTBOT",
  "topbar.brand_sub": "Gateway Dashboard",
  "topbar.status.health": "Health",
  "topbar.status.ok": "OK",
  "topbar.status.offline": "Offline",

  // Overview page
  "overview.gateway_access": "Gateway Access",
  "overview.gateway_subtitle": "Where the dashboard connects and how it authenticates.",
  "overview.websocket_url": "WebSocket URL",
  "overview.gateway_token": "Gateway Token",
  "overview.password": "Password (not stored)",
  "overview.default_session_key": "Default Session Key",
  "overview.connect_button": "Connect",
  "overview.refresh_button": "Refresh",
  "overview.click_connect_hint": "Click Connect to apply connection changes.",
  "overview.snapshot": "Snapshot",
  "overview.snapshot_subtitle": "Latest gateway handshake information.",
  "overview.status": "Status",
  "overview.uptime": "Uptime",
  "overview.tick_interval": "Tick Interval",
  "overview.last_channels_refresh": "Last Channels Refresh",
  "overview.instances": "Instances",
  "overview.sessions": "Sessions",
  "overview.cron": "Cron",
  "overview.notes": "Notes",
  "overview.notes_subtitle": "Quick reminders for remote control setups.",
  "overview.tailscale_serve": "Tailscale serve",
  "overview.session_hygiene": "Session hygiene",
  "overview.cron_reminders": "Cron reminders",
  "overview.presence_beacons_hint": "Presence beacons in the last 5 minutes.",
  "overview.recent_sessions_hint": "Recent session keys tracked by the gateway.",
  "overview.cron_next_wake": "Next wake {nextRun}",
  "overview.gateway_disconnected": "Disconnected from gateway.",
  "overview.tailscale_serve_note":
    "Prefer serve mode to keep the gateway on loopback with tailnet auth.",
  "overview.session_hygiene_note": "Use /new or sessions.patch to reset context.",
  "overview.cron_reminders_note": "Use isolated sessions for recurring runs.",

  // Common terms (已合并所有重复的通用术语)
  "common.connected": "Connected",
  "common.disconnected": "Disconnected",
  "common.enabled": "Enabled",
  "common.disabled": "Disabled",
  "common.n_a": "n/a",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.save_button": "Save",
  "common.apply": "Apply",
  "common.update": "Update",
  "common.refresh": "Refresh",
  "common.refresh_button": "Refresh",
  "common.loading": "Loading…",
  "common.saving": "Saving…",
  "common.close": "Close",
  "common.ok": "OK",
  "common.yes": "Yes",
  "common.no": "No",
  "common.error": "Error",
  "common.warning": "Warning",
  "common.info": "Info",
  "common.success": "Success",
  "common.open_in_new_tab": "opens in new tab",
  "common.inherit": "inherit",
  "common.last": "last",
  "common.select_a_job": "(select a job)",
  "common.agent": "Agent",
  "common.uses_default_value": "Uses default ({value})",
  "common.default_value": "Default value: {value}",
  "common.override_value": "Override value: {value}",
  "common.override_value_simple": "Override: {value}",
  "common.select_job_instruction": "Select a job to view run history",
  "common.select_job_prompt": "Please select a job",
  "common.latest_runs_for": "Latest runs for job {jobId}",

  // WhatsApp channel
  "whatsapp.card_title": "WhatsApp",
  "whatsapp.card_subtitle": "Link WhatsApp Web and monitor connection health.",
  "whatsapp.status.configured": "Configured",
  "whatsapp.status.linked": "Linked",
  "whatsapp.status.running": "Running",
  "whatsapp.status.connected": "Connected",
  "telegram.status.connected": "Connected",
  "whatsapp.status.last_connect": "Last connect",
  "whatsapp.status.last_message": "Last message",
  "whatsapp.status.auth_age": "Auth age",
  "whatsapp.button.show_qr": "Show QR",
  "whatsapp.button.working": "Working…",
  "whatsapp.button.relink": "Relink",
  "whatsapp.button.wait_scan": "Wait for scan",
  "whatsapp.button.logout": "Logout",

  // Telegram channel
  "telegram.card_title": "Telegram",
  "telegram.card_subtitle": "Bot status and channel configuration.",
  "telegram.status.configured": "Configured",
  "telegram.status.running": "Running",
  "telegram.status.mode": "Mode",
  "telegram.status.last_start": "Last start",
  "telegram.status.last_probe": "Last probe",
  "telegram.status.last_inbound": "Last inbound",
  "telegram.button.probe": "Probe",

  // Discord channel
  "discord.card_title": "Discord",
  "discord.card_subtitle": "Bot status and channel configuration.",
  "discord.status.configured": "Configured",
  "discord.status.running": "Running",
  "discord.status.last_start": "Last start",
  "discord.status.last_probe": "Last probe",
  "discord.button.probe": "Probe",

  // Signal channel
  "signal.card_title": "Signal",
  "signal.card_subtitle": "signal-cli status and channel configuration.",
  "signal.status.configured": "Configured",
  "signal.status.running": "Running",
  "signal.status.base_url": "Base URL",
  "signal.status.last_start": "Last start",
  "signal.status.last_probe": "Last probe",
  "signal.button.probe": "Probe",

  // Slack channel
  "slack.card_title": "Slack",
  "slack.card_subtitle": "Socket mode status and channel configuration.",
  "slack.status.configured": "Configured",
  "slack.status.running": "Running",
  "slack.status.last_start": "Last start",
  "slack.status.last_probe": "Last probe",
  "slack.button.probe": "Probe",

  // iMessage channel
  "imessage.card_title": "iMessage",
  "imessage.card_subtitle": "macOS bridge status and channel configuration.",
  "imessage.status.configured": "Configured",
  "imessage.status.running": "Running",
  "imessage.status.last_start": "Last start",
  "imessage.status.last_probe": "Last probe",
  "imessage.button.probe": "Probe",

  // Nostr channel
  "nostr.card_title": "Nostr",
  "nostr.card_subtitle": "Decentralized DMs via Nostr relays (NIP-04).",
  "nostr.status.configured": "Configured",
  "nostr.status.running": "Running",
  "nostr.status.public_key": "Public Key",
  "nostr.status.last_start": "Last start",
  "nostr.status.last_inbound": "Last inbound",
  "nostr.profile.title": "Profile",
  "nostr.profile.edit_button": "Edit Profile",
  "nostr.profile.name": "Name",
  "nostr.profile.display_name": "Display Name",
  "nostr.profile.about": "About",
  "nostr.profile.nip05": "NIP-05",
  "nostr.profile.not_set":
    'No profile set. Click "Edit Profile" to add your name, bio, and avatar.',
  "nostr.button.refresh": "Refresh",

  // Google Chat channel
  "googlechat.card_title": "Google Chat",
  "googlechat.card_subtitle": "Chat API webhook status and channel configuration.",
  "googlechat.status.configured": "Configured",
  "googlechat.status.running": "Running",
  "googlechat.status.credential": "Credential",
  "googlechat.status.audience": "Audience",
  "googlechat.status.last_start": "Last start",
  "googlechat.status.last_probe": "Last probe",
  "googlechat.button.probe": "Probe",

  // Channels config
  "channels.config.schema_unavailable": "Schema unavailable.",
  "channels.config.channel_config_schema_unavailable": "Channel config schema unavailable.",
  "channels.config.use_raw": "Use Raw.",
  "channels.config.loading_config_schema": "Loading config schema…",
  "channels.config.save_button": "Save",
  "channels.config.reload_button": "Reload",
  "channels.config.no_snapshot_yet": "No snapshot yet.",

  // Sessions page
  "sessions.title": "Sessions",
  "sessions.subtitle": "Active session keys and per-session overrides.",
  "sessions.active_minutes_filter": "Active within (minutes)",
  "sessions.limit_filter": "Limit",
  "sessions.include_global_filter": "Include global",
  "sessions.include_unknown_filter": "Include unknown",
  "sessions.refresh_button": "Refresh",
  "sessions.loading": "Loading…",
  "sessions.store_path": "Store: {path}",
  "sessions.table_key": "Key",
  "sessions.table_label": "Label",
  "sessions.table_kind": "Kind",
  "sessions.table_updated": "Updated",
  "sessions.table_tokens": "Tokens",
  "sessions.table_thinking": "Thinking",
  "sessions.table_verbose": "Verbose",
  "sessions.table_reasoning": "Reasoning",
  "sessions.table_actions": "Actions",
  "sessions.no_sessions_found": "No sessions found.",
  "sessions.delete_button": "Delete",

  // Cron page
  "cron.scheduler_title": "Scheduler",
  "cron.scheduler_subtitle": "Gateway-owned cron scheduler status.",
  "cron.scheduler_enabled": "Enabled",
  "cron.scheduler_jobs": "Jobs",
  "cron.scheduler_next_wake": "Next wake",
  "cron.new_job_title": "New Job",
  "cron.new_job_subtitle": "Create a scheduled wakeup or agent run.",
  "cron.job_name": "Name",
  "cron.job_description": "Description",
  "cron.agent_id": "Agent ID",
  "cron.job_enabled": "Enabled",
  "cron.schedule_type": "Schedule",
  "cron.schedule_type_every": "Every",
  "cron.schedule_type_at": "At",
  "cron.schedule_type_cron": "Cron",
  "cron.session_target": "Session",
  "cron.session_target_main": "Main",
  "cron.session_target_isolated": "Isolated",
  "cron.wake_mode": "Wake mode",
  "cron.wake_mode_next_heartbeat": "Next heartbeat",
  "cron.wake_mode_now": "Now",
  "cron.payload_type": "Payload",
  "cron.payload_type_system_event": "System event",
  "cron.payload_type_agent_turn": "Agent turn",
  "cron.system_text": "System text",
  "cron.agent_message": "Agent message",
  "cron.deliver": "Deliver",
  "cron.delivery": "Delivery",
  "cron.delivery_announce": "Announce",
  "cron.delivery_none": "None",
  "cron.channel": "Channel",
  "cron.to": "To",
  "cron.timeout_seconds": "Timeout (seconds)",
  "cron.post_to_main_prefix": "Post to main prefix",
  "cron.add_job_button": "Add job",
  "cron.saving": "Saving…",
  "cron.jobs_title": "Jobs",
  "cron.jobs_subtitle": "All scheduled jobs stored in the gateway.",
  "cron.no_jobs_yet": "No jobs yet.",
  "cron.run_history_title": "Run history",
  "cron.run_history_subtitle": "Latest runs for {jobId}.",
  "cron.select_job_to_inspect": "Select a job to inspect run history.",
  "cron.no_runs_yet": "No runs yet.",
  "cron.run_at": "Run at",
  "cron.every_amount": "Every",
  "cron.unit": "Unit",
  "cron.unit_minutes": "Minutes",
  "cron.unit_hours": "Hours",
  "cron.unit_days": "Days",
  "cron.expression": "Expression",
  "cron.timezone_optional": "Timezone (optional)",
  "cron.enable_button": "Enable",
  "cron.disable_button": "Disable",
  "cron.run_button": "Run",
  "cron.runs_button": "Runs",
  "cron.remove_button": "Remove",
  "cron.minutes": "Minutes",
  "cron.hours": "Hours",
  "cron.days": "Days",
  "cron.enabled_status": "enabled",
  "cron.disabled_status": "disabled",

  // Skills page
  "skills.title": "Skills",
  "skills.subtitle": "Bundled, managed, and workspace skills.",
  "skills.filter_placeholder": "Search skills",
  "skills.loading": "Loading…",
  "skills.refresh_button": "Refresh",
  "skills.shown_count": "{count} shown",
  "skills.no_skills_found": "No skills found.",
  "skills.toggle_enable": "Enable",
  "skills.install_button": "Install",
  "skills.installing": "Installing…",
  "skills.missing": "Missing: {items}",
  "skills.reason": "Reason: {reason}",
  "skills.api_key": "API key",
  "skills.save_key_button": "Save key",

  // Nodes page
  "nodes.title": "Nodes",
  "nodes.subtitle": "Paired devices and live links.",
  "nodes.loading": "Loading…",
  "nodes.refresh_button": "Refresh",
  "nodes.no_nodes_found": "No nodes found.",
  "nodes.nodes_title": "Nodes",
  "nodes.nodes_subtitle": "Connected nodes and their capabilities.",
  "nodes.devices_title": "Devices",
  "nodes.devices_subtitle": "Pairing requests and authorized devices.",
  "nodes.pending_label": "Pending requests",
  "nodes.paired_label": "Paired devices",
  "nodes.no_paired_devices": "No paired devices yet.",
  "nodes.tokens_none": "No tokens issued",
  "nodes.tokens_label": "Issued tokens",
  "nodes.exec_node_binding_title": "Exec Node Binding",
  "nodes.switch_config_form_mode": "Switch to form mode to edit bindings.",
  "nodes.load_config_to_edit": "Configuration not loaded. Load config to edit bindings:",
  "nodes.load_config_button": "Load Config",
  "nodes.default_binding_title": "Default Binding",
  "nodes.default_binding_subtitle": "Fallback node when no specific binding is set.",
  "nodes.node_label": "Node",
  "nodes.any_node_option": "Any node (default)",
  "nodes.no_nodes_with_system_run": "No nodes support system.run command.",
  "nodes.no_agents_found": "No agents found in configuration.",
  "nodes.load_exec_approvals": "Exec approvals not loaded. Load to configure policies:",
  "nodes.load_approvals_button": "Load Approvals",
  "nodes.target_title": "Target",
  "nodes.target_subtitle": "Choose where to store exec approval settings.",
  "nodes.host_label": "Host",
  "nodes.gateway_option": "Gateway",
  "nodes.node_option": "Specific Node",
  "nodes.select_node_option": "Select a node",
  "nodes.no_nodes_advertise_exec_approvals": "No nodes support exec approvals yet.",
  "nodes.scope_label": "Scope",
  "nodes.defaults_button": "Defaults",
  "nodes.security_title": "Security Policy",
  "nodes.mode_label": "Mode",
  "nodes.ask_title": "Prompt Policy",
  "nodes.ask_fallback_title": "Ask Fallback",
  "nodes.applied_when_ui_unavailable": "Applied when the UI prompt is unavailable.",
  "nodes.fallback_label": "Fallback",
  "nodes.auto_allow_skill_clis_title": "Auto-Allow Skill CLIs",
  "nodes.on_value": "On",
  "nodes.off_value": "Off",
  "nodes.enabled_label": "Enabled",
  "nodes.use_default_button": "Use Default",
  "nodes.case_insensitive_glob_patterns": "Patterns are case-insensitive glob matches.",
  "nodes.add_pattern_button": "Add Pattern",
  "nodes.pattern_label": "Pattern",
  "nodes.remove_button": "Remove",
  "nodes.default_agent": "default agent",
  "nodes.agent": "agent",
  "nodes.any_value": "any",
  "nodes.binding_label": "Binding",
  "nodes.using_default_value": "Using default {value}",
  "devices.title": "Devices",
  "devices.subtitle": "Pairing requests + role tokens.",
  "devices.pending_requests": "Pending",
  "devices.paired_devices": "Paired",
  "devices.no_paired_devices": "No paired devices.",
  "devices.approve_button": "Approve",
  "devices.reject_button": "Reject",
  "devices.rotate_button": "Rotate",
  "devices.revoke_button": "Revoke",
  "devices.requested": "requested {time}",
  "devices.role": "role: {role}",
  "devices.scopes": "scopes: {scopes}",
  "devices.tokens": "Tokens",
  "devices.none": "none",
  "devices.active": "active",
  "devices.revoked": "revoked",
  "nodes.exec_approvals_title": "Exec approvals",
  "nodes.exec_approvals_subtitle": "Allowlist and approval policy for {exec_command}.",
  "nodes.exec_node_binding_subtitle": "Pin agents to a specific node when using {exec_command}.",
  "nodes.bindings_save_button": "Save",
  "nodes.default_binding": "Default binding",
  "nodes.any_node": "Any node",
  "nodes.no_nodes_available": "No nodes with system.run available.",
  "nodes.agents_not_found": "No agents found.",
  "nodes.target": "Target",
  "nodes.host": "Host",
  "nodes.gateway": "Gateway",
  "nodes.node": "Node",
  "nodes.select_node": "Select node",
  "nodes.no_nodes_with_exec_approvals": "No nodes advertise exec approvals yet.",
  "nodes.scope": "Scope",
  "nodes.defaults": "Defaults",
  "nodes.security": "Security",
  "nodes.security_mode": "Mode",
  "nodes.default_security_mode": "Default security mode.",
  "nodes.ask": "Ask",
  "nodes.default_prompt_policy": "Default prompt policy.",
  "nodes.ask_fallback": "Ask fallback",
  "nodes.ask_fallback_applied_when_ui_unavailable": "Applied when the UI prompt is unavailable.",
  "nodes.auto_allow_skill_cli": "Auto-allow skill CLIs",
  "nodes.allow_skill_executables": "Allow skill executables listed by the Gateway.",
  "nodes.allow_using_default": "Using default ({value}).",
  "nodes.allowlist_title": "Allowlist",
  "nodes.allowlist_subtitle": "Case-insensitive glob patterns.",
  "nodes.no_allowlist_entries": "No allowlist entries yet.",
  "nodes.last_used": "Last used: {time}",
  "nodes.new_pattern": "New pattern",
  "nodes.binding_override": "override: {binding}",
  "nodes.using_default": "uses default ({default})",

  // Debug page
  "debug.snapshots_title": "Snapshots",
  "debug.snapshots_subtitle": "Status, health, and heartbeat data.",
  "debug.refresh_button": "Refresh",
  "debug.refreshing": "Refreshing…",
  "debug.status": "Status",
  "debug.security_audit": "Security audit: {summary}. Run {command} for details.",
  "debug.manual_rpc_title": "Manual RPC",
  "debug.manual_rpc_subtitle": "Send a raw gateway method with JSON params.",
  "debug.method": "Method",
  "debug.params_json": "Params (JSON)",
  "debug.call_button": "Call",
  "debug.models_title": "Models",
  "debug.models_subtitle": "Catalog from models.list.",
  "debug.event_log_title": "Event Log",
  "debug.event_log_subtitle": "Latest gateway events.",
  "debug.no_events_yet": "No events yet.",

  // Logs page
  "logs.title": "Logs",
  "logs.subtitle": "Gateway file logs (JSONL).",
  "logs.refresh_button": "Refresh",
  "logs.loading": "Loading…",
  "logs.export_button": "Export {label}",
  "logs.filter_placeholder": "Search logs",
  "logs.auto_follow": "Auto-follow",
  "logs.file": "File: {file}",
  "logs.log_output_truncated": "Log output truncated; showing latest chunk.",
  "logs.no_log_entries": "No log entries.",

  // Chat page
  "chat.compacting_context": "Compacting context...",
  "chat.context_compacted": "Context compacted",
  "chat.add_message_or_paste_images": "Add message or paste images",
  "chat.message_placeholder": "Message",
  "chat.connect_to_gateway": "Connect to gateway",
  "chat.loading_chat": "Loading chat...",
  "chat.queued_messages": "{count} queued message(s)",
  "chat.image_count": "{count} image(s)",
  "chat.message_label": "Message",
  "chat.stop_button": "Stop",
  "chat.new_session_button": "New session",
  "chat.queue_button": "Queue",
  "chat.send_button": "Send",
};

// Simplified Chinese translations
const zhCNTranslations: TranslationKeys = {
  // Navigation
  "nav.chat": "聊天",
  "nav.overview": "概览",
  "nav.channels": "频道",
  "nav.instances": "实例",
  "nav.sessions": "会话",
  "nav.cron": "定时任务",
  "nav.skills": "技能",
  "nav.nodes": "节点",
  "nav.config": "配置",
  "nav.debug": "调试",
  "nav.logs": "日志",
  "nav.resources": "资源",
  "nav.docs": "文档",

  // Navigation Groups
  "nav.group.chat": "聊天",
  "nav.group.control": "控制",
  "nav.group.agent": "代理",
  "nav.group.settings": "设置",

  // Page Titles and Subtitles
  "page.title.overview": "概览",
  "page.subtitle.overview": "网关状态、入口点和健康状况快速读取。",
  "page.title.channels": "频道",
  "page.subtitle.channels": "管理频道和设置。",
  "page.title.instances": "实例",
  "page.subtitle.instances": "来自连接客户端和节点的存在信标。",
  "page.title.sessions": "会话",
  "page.subtitle.sessions": "检查活动会话并调整每个会话的默认值。",
  "page.title.cron": "定时任务",
  "page.subtitle.cron": "安排唤醒和定期代理运行。",
  "page.title.skills": "技能",
  "page.subtitle.skills": "管理技能可用性和API密钥注入。",
  "page.title.nodes": "节点",
  "page.subtitle.nodes": "配对设备、功能和命令暴露。",
  "page.title.chat": "聊天",
  "page.subtitle.chat": "用于快速干预的直接网关聊天会话。",
  "page.title.config": "配置",
  "page.subtitle.config": "安全编辑 ~/.clawdbot/moltbot.json。",
  "page.title.debug": "调试",
  "page.subtitle.debug": "网关快照、事件和手动RPC调用。",
  "page.title.logs": "日志",
  "page.subtitle.logs": "网关文件日志的实时跟踪。",
  "instances.no_instances_yet": "暂未报告任何实例。",
  "instances.seconds_ago": "秒前",
  "instances.last_input": "上次输入",
  "instances.reason": "原因",
  "instances.unknown_host": "未知主机",
  "instances.unknown": "未知",
  "instances.scopes": "个作用域",
  "instances.scopes_label": "作用域",
  "cron.schedule_at": "在",
  "cron.schedule_every": "每",
  "cron.schedule_cron": "Cron",
  "cron.payload_system": "系统",
  "cron.payload_agent": "代理",

  // Topbar
  "topbar.expand_sidebar": "展开侧边栏",
  "topbar.collapse_sidebar": "收起侧边栏",
  "topbar.brand_title": "MOLTBOT",
  "topbar.brand_sub": "网关仪表板",
  "topbar.status.health": "健康状况",
  "topbar.status.ok": "正常",
  "topbar.status.offline": "离线",

  // Overview page
  "overview.gateway_access": "网关访问",
  "overview.gateway_subtitle": "仪表板连接的位置以及身份验证方式。",
  "overview.websocket_url": "WebSocket URL",
  "overview.gateway_token": "网关令牌",
  "overview.password": "密码（不存储）",
  "overview.default_session_key": "默认会话密钥",
  "overview.connect_button": "连接",
  "overview.refresh_button": "刷新",
  "overview.click_connect_hint": '单击"连接"以应用连接更改。',
  "overview.snapshot": "快照",
  "overview.snapshot_subtitle": "最新的网关握手信息。",
  "overview.status": "状态",
  "overview.uptime": "运行时间",
  "overview.tick_interval": "心跳间隔",
  "overview.last_channels_refresh": "上次频道刷新",
  "overview.instances": "实例",
  "overview.sessions": "会话",
  "overview.cron": "定时任务",
  "overview.notes": "备注",
  "overview.notes_subtitle": "远程控制设置的快速提醒。",
  "overview.tailscale_serve": "Tailscale服务",
  "overview.session_hygiene": "会话卫生",
  "overview.cron_reminders": "定时任务提醒",
  "overview.presence_beacons_hint": "最近5分钟内的存在信标。",
  "overview.recent_sessions_hint": "网关跟踪的最近会话密钥。",
  "overview.cron_next_wake": "下次唤醒 {nextRun}",
  "overview.gateway_disconnected": "与网关断开连接。",
  "overview.tailscale_serve_note": "建议使用服务模式，通过尾网认证将网关保持在回环地址。",
  "overview.session_hygiene_note": "使用 /new 或 sessions.patch 重置上下文。",
  "overview.cron_reminders_note": "为重复运行使用隔离会话。",

  // Common terms (已合并所有重复的通用术语)
  "common.connected": "已连接",
  "common.disconnected": "已断开",
  "common.enabled": "启用",
  "common.disabled": "禁用",
  "common.n_a": "无",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.save_button": "保存",
  "common.apply": "应用",
  "common.update": "更新",
  "common.refresh": "刷新",
  "common.refresh_button": "刷新",
  "common.loading": "加载中…",
  "common.saving": "保存中…",
  "common.close": "关闭",
  "common.ok": "确定",
  "common.yes": "是",
  "common.no": "否",
  "common.error": "错误",
  "common.warning": "警告",
  "common.info": "信息",
  "common.success": "成功",
  "common.open_in_new_tab": "在新标签页中打开",
  "common.inherit": "继承",
  "common.last": "最后",
  "common.select_a_job": "（选择一个任务）",
  "common.agent": "代理",
  "common.uses_default_value": "使用默认值（{value}）",
  "common.default_value": "默认值：{value}",
  "common.override_value": "覆盖值：{value}",
  "common.override_value_simple": "覆盖：{value}",
  "common.select_job_instruction": "选择一个任务来查看运行历史",
  "common.select_job_prompt": "请选择一个任务",
  "common.latest_runs_for": "任务 {jobId} 的最新运行记录",

  // WhatsApp channel
  "whatsapp.card_title": "WhatsApp",
  "whatsapp.card_subtitle": "链接 WhatsApp Web 并监控连接状态。",
  "whatsapp.status.configured": "已配置",
  "whatsapp.status.linked": "已链接",
  "whatsapp.status.running": "运行中",
  "whatsapp.status.connected": "已连接",
  "telegram.status.connected": "已连接",
  "whatsapp.status.last_connect": "最后连接",
  "whatsapp.status.last_message": "最后消息",
  "whatsapp.status.auth_age": "认证时长",
  "whatsapp.button.show_qr": "显示二维码",
  "whatsapp.button.working": "工作中…",
  "whatsapp.button.relink": "重新链接",
  "whatsapp.button.wait_scan": "等待扫描",
  "whatsapp.button.logout": "登出",

  // Telegram channel
  "telegram.card_title": "Telegram",
  "telegram.card_subtitle": "机器人状态和频道配置。",
  "telegram.status.configured": "已配置",
  "telegram.status.running": "运行中",
  "telegram.status.mode": "模式",
  "telegram.status.last_start": "最后启动",
  "telegram.status.last_probe": "最后探测",
  "telegram.status.last_inbound": "最后入站",
  "telegram.button.probe": "探测",

  // Discord channel
  "discord.card_title": "Discord",
  "discord.card_subtitle": "机器人状态和频道配置。",
  "discord.status.configured": "已配置",
  "discord.status.running": "运行中",
  "discord.status.last_start": "最后启动",
  "discord.status.last_probe": "最后探测",
  "discord.button.probe": "探测",

  // Signal channel
  "signal.card_title": "Signal",
  "signal.card_subtitle": "signal-cli 状态和频道配置。",
  "signal.status.configured": "已配置",
  "signal.status.running": "运行中",
  "signal.status.base_url": "基础URL",
  "signal.status.last_start": "最后启动",
  "signal.status.last_probe": "最后探测",
  "signal.button.probe": "探测",

  // Slack channel
  "slack.card_title": "Slack",
  "slack.card_subtitle": "Socket模式状态和频道配置。",
  "slack.status.configured": "已配置",
  "slack.status.running": "运行中",
  "slack.status.last_start": "最后启动",
  "slack.status.last_probe": "最后探测",
  "slack.button.probe": "探测",

  // iMessage channel
  "imessage.card_title": "iMessage",
  "imessage.card_subtitle": "macOS桥接状态和频道配置。",
  "imessage.status.configured": "已配置",
  "imessage.status.running": "运行中",
  "imessage.status.last_start": "最后启动",
  "imessage.status.last_probe": "最后探测",
  "imessage.button.probe": "探测",

  // Nostr channel
  "nostr.card_title": "Nostr",
  "nostr.card_subtitle": "通过 Nostr 中继进行去中心化私信（NIP-04）。",
  "nostr.status.configured": "已配置",
  "nostr.status.running": "运行中",
  "nostr.status.public_key": "公钥",
  "nostr.status.last_start": "最后启动",
  "nostr.status.last_inbound": "最后入站",
  "nostr.profile.title": "资料",
  "nostr.profile.edit_button": "编辑资料",
  "nostr.profile.name": "姓名",
  "nostr.profile.display_name": "显示名称",
  "nostr.profile.about": "关于",
  "nostr.profile.nip05": "NIP-05",
  "nostr.profile.not_set": '未设置资料。点击"编辑资料"添加您的姓名、简介和头像。',
  "nostr.button.refresh": "刷新",

  // Google Chat channel
  "googlechat.card_title": "Google Chat",
  "googlechat.card_subtitle": "Chat API webhook 状态和频道配置。",
  "googlechat.status.configured": "已配置",
  "googlechat.status.running": "运行中",
  "googlechat.status.credential": "凭证",
  "googlechat.status.audience": "受众",
  "googlechat.status.last_start": "最后启动",
  "googlechat.status.last_probe": "最后探测",
  "googlechat.button.probe": "探测",

  // Channels config
  "channels.config.schema_unavailable": "架构不可用。",
  "channels.config.channel_config_schema_unavailable": "频道配置架构不可用。",
  "channels.config.use_raw": "使用原始模式。",
  "channels.config.loading_config_schema": "正在加载配置架构…",
  "channels.config.save_button": "保存",
  "channels.config.reload_button": "重新加载",
  "channels.config.no_snapshot_yet": "暂无快照。",

  // Sessions page
  "sessions.title": "会话",
  "sessions.subtitle": "活动会话密钥和每个会话的覆盖设置。",
  "sessions.active_minutes_filter": "活动时间（分钟内）",
  "sessions.limit_filter": "限制",
  "sessions.include_global_filter": "包含全局",
  "sessions.include_unknown_filter": "包含未知",
  "sessions.refresh_button": "刷新",
  "sessions.loading": "加载中…",
  "sessions.store_path": "存储：{path}",
  "sessions.table_key": "密钥",
  "sessions.table_label": "标签",
  "sessions.table_kind": "类型",
  "sessions.table_updated": "更新时间",
  "sessions.table_tokens": "令牌",
  "sessions.table_thinking": "思考",
  "sessions.table_verbose": "详细",
  "sessions.table_reasoning": "推理",
  "sessions.table_actions": "操作",
  "sessions.no_sessions_found": "未找到会话。",
  "sessions.delete_button": "删除",

  // Cron page
  "cron.scheduler_title": "调度器",
  "cron.scheduler_subtitle": "网关拥有的cron调度器状态。",
  "cron.scheduler_enabled": "启用",
  "cron.scheduler_jobs": "任务",
  "cron.scheduler_next_wake": "下次唤醒",
  "cron.new_job_title": "新建任务",
  "cron.new_job_subtitle": "创建计划唤醒或代理运行。",
  "cron.job_name": "名称",
  "cron.job_description": "描述",
  "cron.agent_id": "代理ID",
  "cron.job_enabled": "启用",
  "cron.schedule_type": "计划",
  "cron.schedule_type_every": "每",
  "cron.schedule_type_at": "在",
  "cron.schedule_type_cron": "Cron",
  "cron.session_target": "会话",
  "cron.session_target_main": "主会话",
  "cron.session_target_isolated": "隔离",
  "cron.wake_mode": "唤醒模式",
  "cron.wake_mode_next_heartbeat": "下次心跳",
  "cron.wake_mode_now": "立即",
  "cron.payload_type": "负载",
  "cron.payload_type_system_event": "系统事件",
  "cron.payload_type_agent_turn": "代理执行",
  "cron.system_text": "系统文本",
  "cron.agent_message": "代理消息",
  "cron.deliver": "发送",
  "cron.delivery": "发送方式",
  "cron.delivery_announce": "通知",
  "cron.delivery_none": "无",
  "cron.channel": "频道",
  "cron.to": "接收方",
  "cron.timeout_seconds": "超时（秒）",
  "cron.post_to_main_prefix": "发布到主会话前缀",
  "cron.add_job_button": "添加任务",
  "cron.saving": "保存中…",
  "cron.jobs_title": "任务",
  "cron.jobs_subtitle": "存储在网关中的所有计划任务。",
  "cron.no_jobs_yet": "暂无任务。",
  "cron.run_history_title": "运行历史",
  "cron.run_history_subtitle": "{jobId} 的最新运行情况。",
  "cron.select_job_to_inspect": "选择一个任务来检查运行历史。",
  "cron.no_runs_yet": "暂无运行记录。",
  "cron.run_at": "运行于",
  "cron.every_amount": "每",
  "cron.unit": "单位",
  "cron.unit_minutes": "分钟",
  "cron.unit_hours": "小时",
  "cron.unit_days": "天",
  "cron.expression": "表达式",
  "cron.timezone_optional": "时区（可选）",
  "cron.enable_button": "启用",
  "cron.disable_button": "禁用",
  "cron.run_button": "运行",
  "cron.runs_button": "运行",
  "cron.remove_button": "移除",
  "cron.minutes": "分钟",
  "cron.hours": "小时",
  "cron.days": "天",
  "cron.enabled_status": "启用",
  "cron.disabled_status": "禁用",

  // Skills page
  "skills.title": "技能",
  "skills.subtitle": "捆绑、管理和工作区技能。",
  "skills.filter_placeholder": "搜索技能",
  "skills.loading": "加载中…",
  "skills.refresh_button": "刷新",
  "skills.shown_count": "显示 {count} 个",
  "skills.no_skills_found": "未找到技能。",
  "skills.toggle_enable": "启用",
  "skills.install_button": "安装",
  "skills.installing": "安装中…",
  "skills.missing": "缺少：{items}",
  "skills.reason": "原因：{reason}",
  "skills.api_key": "API密钥",
  "skills.save_key_button": "保存密钥",

  // Nodes page
  "nodes.title": "节点",
  "nodes.subtitle": "配对设备和实时链接。",
  "nodes.loading": "加载中…",
  "nodes.refresh_button": "刷新",
  "nodes.no_nodes_found": "未找到节点。",
  "nodes.nodes_title": "节点",
  "nodes.nodes_subtitle": "连接的节点及其功能。",
  "nodes.devices_title": "设备",
  "nodes.devices_subtitle": "配对请求和授权设备。",
  "nodes.pending_label": "待处理请求",
  "nodes.paired_label": "已配对设备",
  "nodes.no_paired_devices": "暂无配对设备。",
  "nodes.tokens_none": "未颁发令牌",
  "nodes.tokens_label": "已颁发令牌",
  "nodes.exec_node_binding_title": "执行节点绑定",
  "nodes.switch_config_form_mode": "切换到表单模式以编辑绑定。",
  "nodes.load_config_to_edit": "配置未加载。加载配置以编辑绑定：",
  "nodes.load_config_button": "加载配置",
  "nodes.default_binding_title": "默认绑定",
  "nodes.default_binding_subtitle": "未设置特定绑定时的备用节点。",
  "nodes.node_label": "节点",
  "nodes.any_node_option": "任意节点（默认）",
  "nodes.no_nodes_with_system_run": "没有节点支持 system.run 命令。",
  "nodes.no_agents_found": "配置中未找到代理。",
  "nodes.load_exec_approvals": "执行审批未加载。加载以配置策略：",
  "nodes.load_approvals_button": "加载审批",
  "nodes.target_title": "目标",
  "nodes.target_subtitle": "选择存储执行审批设置的位置。",
  "nodes.host_label": "主机",
  "nodes.gateway_option": "网关",
  "nodes.node_option": "特定节点",
  "nodes.select_node_option": "选择节点",
  "nodes.no_nodes_advertise_exec_approvals": "尚无节点支持执行审批。",
  "nodes.scope_label": "范围",
  "nodes.defaults_button": "默认",
  "nodes.security_title": "安全策略",
  "nodes.mode_label": "模式",
  "nodes.ask_title": "提示策略",
  "nodes.ask_fallback_title": "询问备用",
  "nodes.applied_when_ui_unavailable": "当UI提示不可用时应用。",
  "nodes.fallback_label": "备用",
  "nodes.auto_allow_skill_clis_title": "自动允许技能CLI",
  "nodes.on_value": "开启",
  "nodes.off_value": "关闭",
  "nodes.enabled_label": "启用",
  "nodes.use_default_button": "使用默认",
  "nodes.case_insensitive_glob_patterns": "模式为大小写不敏感的通配符匹配。",
  "nodes.add_pattern_button": "添加模式",
  "nodes.pattern_label": "模式",
  "nodes.remove_button": "移除",
  "nodes.default_agent": "默认代理",
  "nodes.agent": "代理",
  "nodes.any_value": "任意",
  "nodes.binding_label": "绑定",
  "nodes.using_default_value": "默认使用{value}",
  "devices.title": "设备",
  "devices.subtitle": "配对请求 + 角色令牌。",
  "devices.pending_requests": "待处理",
  "devices.paired_devices": "已配对",
  "devices.no_paired_devices": "无配对设备。",
  "devices.approve_button": "批准",
  "devices.reject_button": "拒绝",
  "devices.rotate_button": "轮换",
  "devices.revoke_button": "撤销",
  "devices.requested": "请求于 {time}",
  "devices.role": "角色：{role}",
  "devices.scopes": "权限：{scopes}",
  "devices.tokens": "令牌",
  "devices.none": "无",
  "devices.active": "活跃",
  "devices.revoked": "已撤销",
  "nodes.exec_approvals_title": "执行审批",
  "nodes.exec_approvals_subtitle": "使用 {exec_command} 的白名单和审批策略。",
  "nodes.exec_node_binding_subtitle": "使用 {exec_command} 时将代理固定到特定节点。",
  "nodes.bindings_save_button": "保存",
  "nodes.default_binding": "默认绑定",
  "nodes.any_node": "任意节点",
  "nodes.no_nodes_available": "没有可用 system.run 的节点。",
  "nodes.agents_not_found": "未找到代理。",
  "nodes.target": "目标",
  "nodes.host": "主机",
  "nodes.gateway": "网关",
  "nodes.node": "节点",
  "nodes.select_node": "选择节点",
  "nodes.no_nodes_with_exec_approvals": "尚无节点提供执行审批功能。",
  "nodes.scope": "范围",
  "nodes.defaults": "默认",
  "nodes.security": "安全",
  "nodes.security_mode": "模式",
  "nodes.default_security_mode": "默认安全模式。",
  "nodes.ask": "询问",
  "nodes.default_prompt_policy": "默认提示策略。",
  "nodes.ask_fallback": "询问备用",
  "nodes.ask_fallback_applied_when_ui_unavailable": "当UI提示不可用时应用。",
  "nodes.auto_allow_skill_cli": "自动允许技能CLI",
  "nodes.allow_skill_executables": "允许网关列出的技能可执行文件。",
  "nodes.allow_using_default": "使用默认值（{value}）。",
  "nodes.allowlist_title": "白名单",
  "nodes.allowlist_subtitle": "大小写不敏感的通配符模式。",
  "nodes.no_allowlist_entries": "暂无白名单条目。",
  "nodes.last_used": "最后使用：{time}",
  "nodes.new_pattern": "新模式",
  "nodes.binding_override": "覆盖：{binding}",
  "nodes.using_default": "使用默认（{default}）",

  // Debug page
  "debug.snapshots_title": "快照",
  "debug.snapshots_subtitle": "状态、健康和心跳数据。",
  "debug.refresh_button": "刷新",
  "debug.refreshing": "刷新中…",
  "debug.status": "状态",
  "debug.security_audit": "安全审计：{summary}。运行 {command} 查看详情。",
  "debug.manual_rpc_title": "手动RPC",
  "debug.manual_rpc_subtitle": "使用JSON参数发送原始网关方法。",
  "debug.method": "方法",
  "debug.params_json": "参数（JSON）",
  "debug.call_button": "调用",
  "debug.models_title": "模型",
  "debug.models_subtitle": "来自 models.list 的目录。",
  "debug.event_log_title": "事件日志",
  "debug.event_log_subtitle": "最新网关事件。",
  "debug.no_events_yet": "暂无事件。",

  // Logs page
  "logs.title": "日志",
  "logs.subtitle": "网关文件日志（JSONL）。",
  "logs.refresh_button": "刷新",
  "logs.loading": "加载中…",
  "logs.export_button": "导出 {label}",
  "logs.filter_placeholder": "搜索日志",
  "logs.auto_follow": "自动跟随",
  "logs.file": "文件：{file}",
  "logs.log_output_truncated": "日志输出已截断；显示最新部分。",
  "logs.no_log_entries": "无日志条目。",

  // Chat page
  "chat.compacting_context": "正在压缩上下文...",
  "chat.context_compacted": "上下文已压缩",
  "chat.add_message_or_paste_images": "添加消息或粘贴图片",
  "chat.message_placeholder": "消息",
  "chat.connect_to_gateway": "连接到网关",
  "chat.loading_chat": "正在加载聊天...",
  "chat.queued_messages": "{count} 条排队消息",
  "chat.image_count": "{count} 张图片",
  "chat.message_label": "消息",
  "chat.stop_button": "停止",
  "chat.new_session_button": "新会话",
  "chat.queue_button": "队列",
  "chat.send_button": "发送",
};

const translations = {
  en: enTranslations,
  "zh-CN": zhCNTranslations,
};

// Update HTML lang attribute when locale changes
function updateHtmlLangAttribute(locale: Locale) {
  const html = document.getElementById("html-root") || document.documentElement;
  html.setAttribute("lang", locale);
}

class I18nManager {
  private currentLocale: Locale = "en";
  private listeners: Array<(locale: Locale) => void> = [];

  constructor() {
    // Detect locale from browser or URL
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get("lang");

    if (langParam && (langParam === "en" || langParam === "zh-CN")) {
      this.currentLocale = langParam as Locale;
    } else {
      // Fallback to browser language detection
      const browserLang = navigator.language;
      if (browserLang.startsWith("zh")) {
        this.currentLocale = "zh-CN";
      } else {
        this.currentLocale = "en";
      }
    }

    // Update the HTML lang attribute initially
    updateHtmlLangAttribute(this.currentLocale);
  }

  /**
   * Get the current locale
   */
  getLocale(): Locale {
    return this.currentLocale;
  }

  /**
   * Set the locale and notify listeners
   */
  setLocale(locale: Locale): void {
    if (locale !== this.currentLocale) {
      this.currentLocale = locale;
      localStorage.setItem("moltbot_locale", locale);
      updateHtmlLangAttribute(locale);
      this.notifyListeners();
    }
  }

  /**
   * Translate a key with optional replacements
   */
  t(key: keyof TranslationKeys, replacements?: Record<string, string>): string {
    const translation = translations[this.currentLocale][key] || translations.en[key];

    if (!translation) {
      console.warn(
        `Translation key '${key}' not found for locale '${this.currentLocale}', falling back to English`,
      );
      return key; // Return the key itself if translation is missing
    }

    // Replace placeholders in the translation
    let result = translation;
    if (replacements) {
      for (const [placeholder, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(`\\{${placeholder}\\}`, "g"), value);
      }
    }

    return result;
  }

  /**
   * Add a listener for locale changes
   */
  addListener(listener: (locale: Locale) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a listener
   */
  removeListener(listener: (locale: Locale) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of locale change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.currentLocale));
  }
}

export const i18n = new I18nManager();

// Export a helper function for easy usage
export const t = (key: keyof TranslationKeys, replacements?: Record<string, string>): string => {
  return i18n.t(key, replacements);
};
