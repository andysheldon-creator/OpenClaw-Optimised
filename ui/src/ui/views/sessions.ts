import { html, nothing } from "lit";
import type { GatewaySessionRow, SessionsListResult } from "../types.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { t } from "../i18n/i18n-manager.ts";
import { icons } from "../icons.ts";
import { pathForTab } from "../navigation.ts";
import { formatSessionTokens } from "../presenter.ts";

export type SessionsProps = {
  loading: boolean;
  result: SessionsListResult | null;
  error: string | null;
  activeMinutes: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  basePath: string;
  onFiltersChange: (next: {
    activeMinutes: string;
    limit: string;
    includeGlobal: boolean;
    includeUnknown: boolean;
  }) => void;
  onRefresh: () => void;
  onPatch: (
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) => void;
  onDelete: (key: string) => void;
};

const THINK_LEVELS = ["", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
const BINARY_THINK_LEVELS = ["", "off", "on"] as const;
const VERBOSE_LEVELS = [
  { value: "", label: "sessions.inherit" },
  { value: "off", label: "sessions.offExplicit" },
  { value: "on", label: "sessions.on" },
  { value: "full", label: "sessions.full" },
] as const;
const REASONING_LEVELS = ["", "off", "on", "stream"] as const;

function normalizeProviderId(provider?: string | null): string {
  if (!provider) {
    return "";
  }
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") {
    return "zai";
  }
  return normalized;
}

function isBinaryThinkingProvider(provider?: string | null): boolean {
  return normalizeProviderId(provider) === "zai";
}

function resolveThinkLevelOptions(provider?: string | null): readonly string[] {
  return isBinaryThinkingProvider(provider) ? BINARY_THINK_LEVELS : THINK_LEVELS;
}

function withCurrentOption(options: readonly string[], current: string): string[] {
  if (!current) {
    return [...options];
  }
  if (options.includes(current)) {
    return [...options];
  }
  return [...options, current];
}

function withCurrentLabeledOption(
  options: readonly { value: string; label: string }[],
  current: string,
): Array<{ value: string; label: string }> {
  if (!current) {
    return [...options];
  }
  if (options.some((option) => option.value === current)) {
    return [...options];
  }
  return [...options, { value: current, label: t("sessions.custom", { name: current }) }];
}

function resolveThinkLevelPatchValue(value: string, isBinary: boolean): string | null {
  if (!value) {
    return null;
  }
  if (!isBinary) {
    return value;
  }
  if (value === "on") {
    return "low";
  }
  return value;
}

export function renderSessions(props: SessionsProps) {
  const rows = props.result?.sessions ?? [];
  return html`
    <details class="card cfg-object" open style="padding: 0; overflow: hidden;">
      <summary class="cfg-object__header" style="cursor: pointer; user-select: none; list-style: none;">
        <div style="display: flex; flex-direction: column; align-items: flex-start; flex: 1;">
          <div class="card-title">${t("sessions.title")}</div>
          <div class="card-sub">${t("sessions.subtitle")}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <button
            class="btn"
            ?disabled=${props.loading}
            @click=${(e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              props.onRefresh();
            }}
          >
            ${props.loading ? t("common.loading") : t("common.refresh")}
          </button>
          <span class="cfg-object__chevron">${icons.chevronDown}</span>
        </div>
      </summary>

      <div class="card-content" style="padding: 20px; border-top: 1px solid var(--border);">
        <div class="filters" style="margin-top: 0;">
          <label class="field">
            <span>${t("sessions.activeWithin")}</span>
            <input
              .value=${props.activeMinutes}
              @input=${(e: Event) =>
                props.onFiltersChange({
                  activeMinutes: (e.target as HTMLInputElement).value,
                  limit: props.limit,
                  includeGlobal: props.includeGlobal,
                  includeUnknown: props.includeUnknown,
                })}
            />
          </label>
          <label class="field">
            <span>${t("sessions.limit")}</span>
            <input
              .value=${props.limit}
              @input=${(e: Event) =>
                props.onFiltersChange({
                  activeMinutes: props.activeMinutes,
                  limit: (e.target as HTMLInputElement).value,
                  includeGlobal: props.includeGlobal,
                  includeUnknown: props.includeUnknown,
                })}
            />
          </label>
          <label class="field checkbox">
            <span>${t("sessions.includeGlobal")}</span>
            <input
              type="checkbox"
              .checked=${props.includeGlobal}
              @change=${(e: Event) =>
                props.onFiltersChange({
                  activeMinutes: props.activeMinutes,
                  limit: props.limit,
                  includeGlobal: (e.target as HTMLInputElement).checked,
                  includeUnknown: props.includeUnknown,
                })}
            />
          </label>
          <label class="field checkbox">
            <span>${t("sessions.includeUnknown")}</span>
            <input
              type="checkbox"
              .checked=${props.includeUnknown}
              @change=${(e: Event) =>
                props.onFiltersChange({
                  activeMinutes: props.activeMinutes,
                  limit: props.limit,
                  includeGlobal: props.includeGlobal,
                  includeUnknown: (e.target as HTMLInputElement).checked,
                })}
            />
          </label>
        </div>

        ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

        <div class="muted" style="margin-top: 12px;">
          ${
            props.result
              ? t("sessions.store", {
                  path:
                    props.result.path === "(multiple)" ? t("sessions.multiple") : props.result.path,
                })
              : ""
          }
        </div>

        <div class="table" style="margin-top: 16px;">
          <div class="table-head">
            <div>${t("sessions.key")}</div>
            <div>${t("sessions.label")}</div>
            <div>${t("sessions.kind")}</div>
            <div>${t("sessions.updated")}</div>
            <div>${t("sessions.tokens")}</div>
            <div>${t("sessions.thinking")}</div>
            <div>${t("sessions.verbose")}</div>
            <div>${t("sessions.reasoning")}</div>
            <div>${t("common.actions")}</div>
          </div>
          ${
            rows.length === 0
              ? html`
                  <div class="muted">${t("sessions.noSessions")}</div>
                `
              : rows.map((row) =>
                  renderRow(row, props.basePath, props.onPatch, props.onDelete, props.loading),
                )
          }
        </div>
      </div>
    </details>
  `;
}

function renderRow(
  row: GatewaySessionRow,
  basePath: string,
  onPatch: SessionsProps["onPatch"],
  onDelete: SessionsProps["onDelete"],
  disabled: boolean,
) {
  const updated = row.updatedAt ? formatRelativeTimestamp(row.updatedAt) : t("common.na");
  const isBinaryThinking = isBinaryThinkingProvider(row.modelProvider);
  const _reasoning = row.reasoningLevel ?? "";
  const displayName =
    typeof row.displayName === "string" && row.displayName.trim().length > 0
      ? row.displayName.trim()
      : null;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const showDisplayName = Boolean(displayName && displayName !== row.key && displayName !== label);
  const canLink = row.kind !== "global";
  const chatUrl = canLink
    ? `${pathForTab("chat", basePath)}?session=${encodeURIComponent(row.key)}`
    : null;

  return html`
    <div class="table-row">
      <div class="mono session-key-cell">
        ${canLink ? html`<a href=${chatUrl} class="session-link">${row.key}</a>` : row.key}
        ${showDisplayName ? html`<span class="muted session-key-display-name">${displayName}</span>` : nothing}
      </div>
      <div>
        <input
          .value=${row.label ?? ""}
          ?disabled=${disabled}
          placeholder="${t("sessions.optional")}"
          @change=${(e: Event) => {
            const value = (e.target as HTMLInputElement).value.trim();
            onPatch(row.key, { label: value || null });
          }}
        />
      </div>
      <div>${t(`sessions.kinds.${row.kind}`, { defaultValue: row.kind })}</div>
      <div>${updated}</div>
      <div>${formatSessionTokens(row)}</div>
      <div>
        <select
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, {
              thinkingLevel: resolveThinkLevelPatchValue(value, isBinaryThinking),
            });
          }}
        >
          ${withCurrentOption(
            resolveThinkLevelOptions(row.modelProvider),
            row.thinkingLevel ?? "",
          ).map(
            (level) =>
              html`<option value=${level} ?selected=${level === (row.thinkingLevel ?? "")}>
                ${level ? t(`sessions.${level}`) : t("sessions.inherit")}
              </option>`,
          )}
        </select>
      </div>
      <div>
        <select
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, { verboseLevel: value || null });
          }}
        >
          ${withCurrentLabeledOption(VERBOSE_LEVELS, row.verboseLevel ?? "").map(
            (level) =>
              html`<option value=${level.value} ?selected=${level.value === (row.verboseLevel ?? "")}>
                ${t(level.label)}
              </option>`,
          )}
        </select>
      </div>
      <div>
        <select
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            onPatch(row.key, { reasoningLevel: value || null });
          }}
        >
          ${withCurrentOption(REASONING_LEVELS, row.reasoningLevel ?? "").map(
            (level) =>
              html`<option value=${level} ?selected=${level === (row.reasoningLevel ?? "")}>
                ${level ? t(`sessions.${level}`) : t("sessions.inherit")}
              </option>`,
          )}
        </select>
      </div>
      <div>
        <button class="btn danger" ?disabled=${disabled} @click=${() => onDelete(row.key)}>
          ${t("common.delete")}
        </button>
      </div>
    </div>
  `;
}
