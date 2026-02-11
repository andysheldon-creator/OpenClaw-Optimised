import { html, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import type { ConfigUiHints } from "../types.ts";
import { icons } from "../icons.ts";
import { renderConfigForm } from "./config-form.ts";
import {
  ALL_SUBSECTION,
  DIFF_LIMIT,
  analyzeConfigSchemaCached,
  computeDiffScopedCached,
  normalizeIssues,
  renderInfoPopover,
  renderSectionIcon,
  resolveSectionsCached,
  resolveSubsectionsCached,
  sectionHeroHelpText,
  truncateValue,
} from "./config-view-core.ts";
import {
  parseRawJson5,
  RAW_TREE_MAX_CHARS,
  renderRawTreeNode,
  setRawTreeExpanded,
} from "./config-view-raw.ts";

export type ConfigProps = {
  raw: string;
  originalRaw: string;
  valid: boolean | null;
  issues: unknown[];
  loading: boolean;
  saving: boolean;
  applying: boolean;
  updating: boolean;
  connected: boolean;
  schema: unknown;
  schemaLoading: boolean;
  uiHints: ConfigUiHints;
  formMode: "form" | "raw";
  formValue: Record<string, unknown> | null;
  originalValue: Record<string, unknown> | null;
  formDirty?: boolean;
  renderLimit?: number;
  searchQuery: string;
  activeSection: string | null;
  activeSubsection: string | null;
  onRawChange: (next: string) => void;
  onFormModeChange: (mode: "form" | "raw") => void;
  onFormPatch: (path: Array<string | number>, value: unknown) => void;
  onSearchChange: (query: string) => void;
  onSectionChange: (section: string | null) => void;
  onSubsectionChange: (section: string | null) => void;
  onReload: () => void;
  onSave: () => void;
  onApply: () => void;
  onUpdate: () => void;
};

export function renderConfig(props: ConfigProps) {
  const analysis = analyzeConfigSchemaCached(props.schema);
  const sections = resolveSectionsCached({
    schema: analysis.schema,
    uiHints: props.uiHints,
    searchQuery: props.searchQuery,
  });
  const sectionKeys = new Set(sections.map((section) => section.key));
  const activeSection =
    props.activeSection && sectionKeys.has(props.activeSection) ? props.activeSection : null;
  const activeSectionSchema = activeSection
    ? sections.find((section) => section.key === activeSection)?.schema
    : undefined;
  const activeSectionMeta = activeSection
    ? sections.find((section) => section.key === activeSection)
    : null;

  const subsections = activeSection
    ? resolveSubsectionsCached({
        sectionKey: activeSection,
        schema: activeSectionSchema,
        uiHints: props.uiHints,
        searchQuery: props.searchQuery,
      })
    : [];

  const showSubnav =
    props.formMode === "form" &&
    Boolean(activeSection) &&
    subsections.length > 0 &&
    props.searchQuery.trim().length === 0;

  const isAllSubsection = props.activeSubsection === ALL_SUBSECTION;
  const effectiveSubsection = isAllSubsection ? null : (props.activeSubsection ?? null);
  const activeSubsectionMeta =
    effectiveSubsection && activeSection
      ? (subsections.find((entry) => entry.key === effectiveSubsection) ?? null)
      : null;
  const diffScopePath =
    activeSection && activeSubsectionMeta
      ? ([activeSection, activeSubsectionMeta.key] as Array<string | number>)
      : activeSection
        ? ([activeSection] as Array<string | number>)
        : [];
  const formDirty =
    props.formDirty ?? computeDiffScopedCached(props.originalValue, props.formValue, []).length > 0;
  const hasScopedDiffContext = diffScopePath.length > 0;
  const diff =
    props.formMode === "form" && formDirty && hasScopedDiffContext
      ? computeDiffScopedCached(props.originalValue, props.formValue, diffScopePath)
      : [];
  const hasRawChanges = props.formMode === "raw" && props.raw !== props.originalRaw;
  const hasChanges = props.formMode === "form" ? formDirty : hasRawChanges;
  const showDiffDropdown = props.formMode === "form" && formDirty;
  const formUnsafe = analysis.schema ? analysis.unsupportedPaths.length > 0 : false;
  const rawParse = props.formMode === "raw" ? parseRawJson5(props.raw) : null;
  const rawValidationError = rawParse?.error ?? null;
  const rawTreeUnavailableReason =
    props.formMode === "raw" && props.raw.length > RAW_TREE_MAX_CHARS
      ? `Structured view is disabled for payloads above ${RAW_TREE_MAX_CHARS.toLocaleString()} chars.`
      : rawValidationError
        ? "Fix JSON5 errors to unlock structured view."
        : null;
  const issues = normalizeIssues(props.issues);

  const canSaveForm = Boolean(props.formValue) && !props.loading && Boolean(analysis.schema);
  const canSave =
    props.connected &&
    !props.saving &&
    hasChanges &&
    (props.formMode === "raw" ? !rawValidationError : canSaveForm);
  const canApply =
    props.connected &&
    !props.applying &&
    !props.updating &&
    hasChanges &&
    (props.formMode === "raw" ? !rawValidationError : canSaveForm);
  const canUpdate = props.connected && !props.applying && !props.updating;

  const validity = rawValidationError
    ? "invalid"
    : props.valid == null
      ? "unknown"
      : props.valid
        ? "valid"
        : "invalid";

  return html`
    <div class="config-layout">
      <aside class="config-sidebar">
        <div class="config-sidebar__header">
          <div class="config-sidebar__title">Configuration</div>
          <span
            class="pill pill--sm ${
              validity === "valid" ? "pill--ok" : validity === "invalid" ? "pill--danger" : ""
            }"
            >${validity}</span
          >
        </div>

        <div class="config-search">
          <span class="config-search__icon">${icons.search}</span>
          <input
            type="text"
            class="config-search__input"
            placeholder="Search settings, fields, descriptions..."
            .value=${props.searchQuery}
            @input=${(event: Event) => props.onSearchChange((event.target as HTMLInputElement).value)}
          />
          ${
            props.searchQuery
              ? html`
                  <button class="config-search__clear" @click=${() => props.onSearchChange("")}>
                    Clear
                  </button>
                `
              : nothing
          }
        </div>

        <nav class="config-nav">
          <button
            class="config-nav__item ${activeSection === null ? "active" : ""}"
            @click=${() => props.onSectionChange(null)}
          >
            <span class="config-nav__icon">${icons.settings}</span>
            <span class="config-nav__label">All Settings</span>
            ${
              props.searchQuery
                ? html`<span class="config-nav__meta">${sections.length}</span>`
                : nothing
            }
          </button>

          ${sections.map(
            (section) => html`
              <button
                class="config-nav__item ${activeSection === section.key ? "active" : ""}"
                title=${section.description || section.label}
                @click=${() => props.onSectionChange(section.key)}
              >
                <span class="config-nav__icon">${renderSectionIcon(section.key)}</span>
                <span class="config-nav__label">${section.label}</span>
                ${
                  props.searchQuery
                    ? html`<span class="config-nav__meta">${Math.max(1, section.search.hits)}</span>`
                    : nothing
                }
              </button>
            `,
          )}
        </nav>

        <div class="config-sidebar__footer">
          <div class="config-mode-toggle">
            <button
              class="config-mode-toggle__btn ${props.formMode === "form" ? "active" : ""}"
              ?disabled=${props.schemaLoading || !analysis.schema}
              @click=${() => props.onFormModeChange("form")}
            >
              Form
            </button>
            <button
              class="config-mode-toggle__btn ${props.formMode === "raw" ? "active" : ""}"
              @click=${() => props.onFormModeChange("raw")}
            >
              Raw
            </button>
          </div>
        </div>
      </aside>

      <main class="config-main">
        <div class="config-actions">
          <div class="config-actions__left">
            ${
              hasChanges
                ? html`
                    <span class="config-changes-badge"
                      >${props.formMode === "raw" ? "Unsaved changes" : "Unsaved changes"}</span
                    >
                  `
                : html`
                    <span class="config-status muted">No changes</span>
                  `
            }
            ${
              rawValidationError
                ? html`
                    <span class="pill pill--sm pill--danger">Invalid JSON5</span>
                  `
                : nothing
            }
            ${
              showDiffDropdown
                ? html`
                    <details class="config-actions-diff">
                      <summary class="config-actions-diff__trigger">
                        <span>Changes</span>
                        <span class="config-actions-diff__chevron">${icons.arrowDown}</span>
                      </summary>
                      <div class="config-actions-diff__panel">
                        ${
                          hasScopedDiffContext
                            ? html`
                                <div class="config-diff__content">
                                  ${
                                    diff.length > 0
                                      ? diff.map(
                                          (change) => html`
                                            <div class="config-diff__item">
                                              <div class="config-diff__path">${change.path || "<root>"}</div>
                                              <div class="config-diff__values">
                                                <span class="config-diff__from">${truncateValue(change.from)}</span>
                                                <span class="config-diff__arrow">-></span>
                                                <span class="config-diff__to">${truncateValue(change.to)}</span>
                                              </div>
                                            </div>
                                          `,
                                        )
                                      : html`
                                          <div class="config-diff__item">
                                            <div class="config-diff__values">
                                              <span class="config-diff__path"
                                                >No changes in current section. Changes may be in another section.</span
                                              >
                                            </div>
                                          </div>
                                        `
                                  }
                                  ${
                                    diff.length >= DIFF_LIMIT
                                      ? html`
                                          <div class="config-diff__item">
                                            <div class="config-diff__values">
                                              <span class="config-diff__path"
                                                >Showing first ${DIFF_LIMIT} changes for performance.</span
                                              >
                                            </div>
                                          </div>
                                        `
                                      : nothing
                                  }
                                </div>
                              `
                            : html`
                                <div class="config-diff__content">
                                  <div class="config-diff__item">
                                    <div class="config-diff__values">
                                      <span class="config-diff__path">Select a section to view detailed changes.</span>
                                    </div>
                                  </div>
                                </div>
                              `
                        }
                      </div>
                    </details>
                  `
                : nothing
            }
          </div>
          <div class="config-actions__right">
            <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onReload}>
              ${props.loading ? "Loading..." : "Reload"}
            </button>
            <button class="btn btn--sm primary" ?disabled=${!canSave} @click=${props.onSave}>
              ${props.saving ? "Saving..." : "Save"}
            </button>
            <button class="btn btn--sm" ?disabled=${!canApply} @click=${props.onApply}>
              ${props.applying ? "Applying..." : "Apply"}
            </button>
            <button class="btn btn--sm" ?disabled=${!canUpdate} @click=${props.onUpdate}>
              ${props.updating ? "Updating..." : "Update"}
            </button>
          </div>
        </div>

        ${
          activeSectionMeta && props.formMode === "form"
            ? html`
                <div class="config-section-hero">
                  <div class="config-section-hero__lead">
                    <div class="config-section-hero__icon">${renderSectionIcon(activeSectionMeta.key)}</div>
                    <div class="config-section-hero__text">
                      <div class="config-section-hero__title">${activeSectionMeta.label}</div>
                      ${
                        activeSectionMeta.description
                          ? html`<div class="config-section-hero__desc">${activeSectionMeta.description}</div>`
                          : nothing
                      }
                    </div>
                  </div>
                  <div class="config-section-hero__meta">
                    ${keyed(
                      `${activeSectionMeta.key}:${activeSubsectionMeta?.key ?? ALL_SUBSECTION}`,
                      renderInfoPopover(
                        `${activeSectionMeta.label} help`,
                        sectionHeroHelpText(activeSectionMeta, activeSubsectionMeta),
                      ),
                    )}
                  </div>
                </div>
              `
            : nothing
        }

        ${
          showSubnav
            ? html`
                <div class="config-subnav">
                  <button
                    class="config-subnav__item ${effectiveSubsection === null ? "active" : ""}"
                    @click=${() => props.onSubsectionChange(ALL_SUBSECTION)}
                  >
                    All
                  </button>
                  ${subsections.map(
                    (entry) => html`
                      <button
                        class="config-subnav__item ${effectiveSubsection === entry.key ? "active" : ""}"
                        title=${entry.description || entry.label}
                        @click=${() => props.onSubsectionChange(entry.key)}
                      >
                        ${entry.label}
                      </button>
                    `,
                  )}
                </div>
              `
            : nothing
        }

        <div class="config-content">
          ${
            props.formMode === "form"
              ? html`
                  ${
                    props.schemaLoading
                      ? html`
                          <div class="config-loading">
                            <div class="config-loading__spinner"></div>
                            <span>Loading schema...</span>
                          </div>
                        `
                      : renderConfigForm({
                          schema: analysis.schema,
                          uiHints: props.uiHints,
                          value: props.formValue,
                          disabled: props.loading || !props.formValue,
                          unsupportedPaths: analysis.unsupportedPaths,
                          renderLimit: props.renderLimit,
                          onPatch: props.onFormPatch,
                          searchQuery: props.searchQuery,
                          activeSection,
                          activeSubsection: effectiveSubsection,
                        })
                  }
                  ${
                    formUnsafe
                      ? html`
                          <div class="callout" style="margin-top: 12px">
                            Some advanced fields use JSON5 editors inside Form mode.
                          </div>
                        `
                      : nothing
                  }
                `
              : html`
                  <div class="config-raw-layout">
                    <section class="config-raw-editor">
                      <label class="field config-raw-field">
                        <span>Raw JSON5</span>
                        <textarea
                          wrap="soft"
                          spellcheck="false"
                          .value=${props.raw}
                          @input=${(event: Event) => props.onRawChange((event.target as HTMLTextAreaElement).value)}
                        ></textarea>
                      </label>
                      ${
                        rawValidationError
                          ? html`
                              <div class="callout danger config-raw-error">
                                <strong>JSON5 validation failed:</strong>
                                <div>${rawValidationError}</div>
                                ${
                                  rawParse?.errorLine && rawParse.errorColumn
                                    ? html`
                                        <div class="config-raw-error__meta">
                                          Line ${rawParse.errorLine}, column ${rawParse.errorColumn}
                                        </div>
                                      `
                                    : nothing
                                }
                                ${
                                  rawParse?.errorContext
                                    ? html`
                                        <pre class="config-raw-error__context">${rawParse.errorContext}</pre>
                                      `
                                    : nothing
                                }
                              </div>
                            `
                          : nothing
                      }
                    </section>
                    <section class="config-raw-panel">
                      <div class="config-raw-panel__header">
                        <div class="config-raw-panel__title">Structured view</div>
                        <div class="config-raw-panel__actions">
                          <button
                            type="button"
                            class="config-raw-panel__action"
                            ?disabled=${Boolean(rawTreeUnavailableReason)}
                            @click=${(event: Event) => setRawTreeExpanded(event.currentTarget, true)}
                          >
                            Expand all
                          </button>
                          <button
                            type="button"
                            class="config-raw-panel__action"
                            ?disabled=${Boolean(rawTreeUnavailableReason)}
                            @click=${(event: Event) => setRawTreeExpanded(event.currentTarget, false)}
                          >
                            Collapse all
                          </button>
                        </div>
                      </div>
                      ${
                        rawTreeUnavailableReason
                          ? html`<div class="config-raw-panel__empty">${rawTreeUnavailableReason}</div>`
                          : rawParse?.value
                            ? html`<div class="config-raw-tree">${renderRawTreeNode({ value: rawParse.value, depth: 0 })}</div>`
                            : html`
                                <div class="config-raw-panel__empty">No parsed data to display.</div>
                              `
                      }
                    </section>
                  </div>
                `
          }
        </div>

        ${
          issues.length > 0
            ? html`
                <div class="callout danger config-issues">
                  <div class="config-issues__title">Validation issues</div>
                  <ul class="config-issues__list">
                    ${issues.map(
                      (issue) => html`
                        <li class="config-issues__item">
                          <code>${issue.path}</code>
                          <span>${issue.message}</span>
                        </li>
                      `,
                    )}
                  </ul>
                </div>
              `
            : nothing
        }
      </main>
    </div>
  `;
}
