import { html, nothing } from "lit";
import type { SkillMessageMap } from "../controllers/skills.ts";
import type { SkillStatusEntry, SkillStatusReport } from "../types.ts";
import { clampText } from "../format.ts";
import { t, translateTechnicalName } from "../i18n/i18n-manager.ts";

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

const SKILL_SOURCE_GROUPS: Array<{ id: string; label: string; sources: string[] }> = [
  { id: "workspace", label: t("skills.groups.workspace"), sources: ["openclaw-workspace"] },
  { id: "built-in", label: t("skills.groups.builtIn"), sources: ["openclaw-bundled"] },
  { id: "installed", label: t("skills.groups.installed"), sources: ["openclaw-managed"] },
  { id: "extra", label: t("skills.groups.extra"), sources: ["openclaw-extra"] },
];

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) {
    groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  }
  const builtInGroup = SKILL_SOURCE_GROUPS.find((group) => group.id === "built-in");
  const other: SkillGroup = { id: "other", label: t("skills.groups.other"), skills: [] };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : SKILL_SOURCE_GROUPS.find((group) => group.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = SKILL_SOURCE_GROUPS.map((group) => groups.get(group.id)).filter(
    (group): group is SkillGroup => Boolean(group && group.skills.length > 0),
  );
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
}

export type SkillsProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
};

function formatInstallLabel(label: string) {
  if (label.startsWith("Install ")) {
    return label.replace(/^Install /, t("skills.installAction") + " ");
  }
  return label;
}

export function renderSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();
  const filtered = filter
    ? skills.filter((skill) =>
        [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter),
      )
    : skills;
  const groups = groupSkills(filtered);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("skills.title")}</div>
          <div class="card-sub">${t("skills.subtitle")}</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="flex: 1;">
          <span>${t("skills.filter")}</span>
          <input
            .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder="${t("skills.searchPlaceholder")}"
          />
        </label>
        <div class="muted">${t("skills.shown", { count: filtered.length })}</div>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        filtered.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">${t("skills.noSkills")}</div>
            `
          : html`
            <div class="agent-skills-groups" style="margin-top: 16px;">
              ${groups.map((group) => {
                const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
                return html`
                  <details class="agent-skills-group" ?open=${!collapsedByDefault}>
                    <summary class="agent-skills-header">
                      <span>${group.label}</span>
                      <span class="muted">${group.skills.length}</span>
                    </summary>
                    <div class="list skills-grid">
                      ${group.skills.map((skill) => renderSkill(skill, props))}
                    </div>
                  </details>
                `;
              })}
            </div>
          `
      }
    </section>
  `;
}

function renderSkill(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const apiKey = props.edits[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const showBundledBadge = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
  const defaultName = skill.name.replace(/-/g, " ");
  const displayName = t(`skills.skillNames.${skill.skillKey}`, {
    defaultValue: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
  });
  const description = t(`skills.skillDescriptions.${skill.skillKey}`, {
    defaultValue: skill.description,
  });
  const sourceLabel = t(`skills.skillSources.${skill.source}`, {
    defaultValue: skill.source,
  });
  const formatMissingItems = (type: string, items: string[]) => {
    if (items.length === 0) {
      return null;
    }
    const typeLabel = t(`skills.missingType.${type}`);
    const translatedItems = items.map((item) => translateTechnicalName(item));
    return `${typeLabel}: ${translatedItems.join(", ")}`;
  };
  const missing = [
    formatMissingItems("bin", skill.missing.bins),
    formatMissingItems("env", skill.missing.env),
    formatMissingItems("config", skill.missing.config),
    formatMissingItems("os", skill.missing.os),
  ].filter((item): item is string => item !== null);
  const reasons: string[] = [];
  if (skill.disabled) {
    reasons.push(t("skills.status.disabled"));
  }
  if (skill.blockedByAllowlist) {
    reasons.push(t("skills.status.blockedByAllowlist"));
  }
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          ${skill.emoji ? `${skill.emoji} ` : ""}${displayName}
        </div>
        <div class="list-sub">${clampText(description, 140)}</div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${sourceLabel}</span>
          ${
            showBundledBadge
              ? html`
                  <span class="chip">${t("skills.status.bundled")}</span>
                `
              : nothing
          }
          <span class="chip ${skill.eligible ? "chip-ok" : "chip-warn"}">
            ${skill.eligible ? t("skills.status.eligible") : t("skills.status.blocked")}
          </span>
          ${
            skill.disabled
              ? html`
                  <span class="chip chip-warn">${t("skills.status.disabled")}</span>
                `
              : nothing
          }
        </div>
        ${
          missing.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                ${t("skills.missing", { items: missing.join("; ") })}
              </div>
            `
            : nothing
        }
        ${
          reasons.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                ${t("skills.reason", { items: reasons.join(", ") })}
              </div>
            `
            : nothing
        }
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; flex-wrap: wrap;">
          <button
            class="btn"
            ?disabled=${busy}
            @click=${() => props.onToggle(skill.skillKey, skill.disabled)}
          >
            ${skill.disabled ? t("skills.enable") : t("skills.disable")}
          </button>
          ${
            canInstall
              ? html`<button
                class="btn"
                ?disabled=${busy}
                @click=${() => props.onInstall(skill.skillKey, skill.name, skill.install[0].id)}
              >
                ${busy ? t("skills.installing") : formatInstallLabel(skill.install[0].label)}
              </button>`
              : nothing
          }
        </div>
        ${
          message
            ? html`<div
              class="muted"
              style="margin-top: 8px; color: ${
                message.kind === "error"
                  ? "var(--danger-color, #d14343)"
                  : "var(--success-color, #0a7f5a)"
              };"
            >
              ${message.message}
            </div>`
            : nothing
        }
        ${
          skill.primaryEnv
            ? html`
              <div class="field" style="margin-top: 10px;">
                <span>${t("skills.apiKey")}</span>
                <input
                  type="password"
                  .value=${apiKey}
                  @input=${(e: Event) =>
                    props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
                />
              </div>
              <button
                class="btn primary"
                style="margin-top: 8px;"
                ?disabled=${busy}
                @click=${() => props.onSaveKey(skill.skillKey)}
              >
                ${t("skills.saveKey")}
              </button>
            `
            : nothing
        }
      </div>
    </div>
  `;
}
