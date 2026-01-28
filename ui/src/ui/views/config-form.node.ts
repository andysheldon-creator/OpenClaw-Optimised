import { html, nothing, type TemplateResult } from "lit";
import type { ConfigUiHints } from "../types";
import {
  defaultValue,
  hintForPath,
  humanize,
  isCompactField,
  isSensitivePath,
  pathKey,
  schemaMax,
  schemaMin,
  schemaType,
  shouldUseSlider,
  type ConfigValidationMap,
  type JsonSchema,
} from "./config-form.shared";

const META_KEYS = new Set(["title", "description", "default", "nullable"]);

function isAnySchema(schema: JsonSchema): boolean {
  const keys = Object.keys(schema ?? {}).filter((key) => !META_KEYS.has(key));
  return keys.length === 0;
}

function jsonValue(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "";
  }
}

// SVG Icons as template literals
const icons = {
  chevronDown: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  minus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  trash: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  edit: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  panelIcon: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
};

export function renderNode(params: {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  unsupported: Set<string>;
  disabled: boolean;
  showLabel?: boolean;
  validation?: ConfigValidationMap;
  /** Render boolean toggles in compact inline style (no card wrapper) */
  compactToggles?: boolean;
  /** Render nested objects flat (no collapsible details) */
  flattenObjects?: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult | typeof nothing {
  const { schema, value, path, hints, unsupported, disabled, onPatch } = params;
  const showLabel = params.showLabel ?? true;
  const compactToggles = params.compactToggles ?? false;
  const flattenObjects = params.flattenObjects ?? false;
  const type = schemaType(schema);
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path.at(-1)));
  const help = hint?.help ?? schema.description;
  const key = pathKey(path);
  const validationIssues = params.validation?.[key] ?? [];
  const severity =
    validationIssues.find((issue) => issue.severity === "error")?.severity ??
    validationIssues.find((issue) => issue.severity === "warn")?.severity ??
    validationIssues[0]?.severity ??
    null;
  const validationMessage = validationIssues[0]?.message ?? "";

  if (unsupported.has(key)) {
    return html`<div class="cfg-field cfg-field--error">
      <div class="cfg-field__label">${label}</div>
      <div class="cfg-field__error">Unsupported schema node. Use Raw mode.</div>
    </div>`;
  }

  // Handle anyOf/oneOf unions
  if (schema.anyOf || schema.oneOf) {
    const variants = schema.anyOf ?? schema.oneOf ?? [];
    const nonNull = variants.filter(
      (v) => !(v.type === "null" || (Array.isArray(v.type) && v.type.includes("null")))
    );

    if (nonNull.length === 1) {
      return renderNode({ ...params, schema: nonNull[0] });
    }

    // Check if it's a set of literal values (enum-like)
    const extractLiteral = (v: JsonSchema): unknown | undefined => {
      if (v.const !== undefined) return v.const;
      if (v.enum && v.enum.length === 1) return v.enum[0];
      return undefined;
    };
    const literals = nonNull.map(extractLiteral);
    const allLiterals = literals.every((v) => v !== undefined);

    if (allLiterals && literals.length > 0 && literals.length <= 5) {
      // Use segmented control for small sets
      const resolvedValue = value ?? schema.default;
      return html`
        <div
          class="cfg-field ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
          data-config-path=${key}
        >
          ${showLabel ? html`<label class="cfg-field__label">${label}</label>` : nothing}
          ${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
          ${severity
            ? html`<div class="cfg-field__validation">${validationMessage}</div>`
            : nothing}
          <div class="cfg-segmented">
            ${literals.map((lit, idx) => html`
              <button
                type="button"
                class="cfg-segmented__btn ${lit === resolvedValue || String(lit) === String(resolvedValue) ? 'active' : ''}"
                ?disabled=${disabled}
                @click=${() => onPatch(path, lit)}
              >
                ${String(lit)}
              </button>
            `)}
          </div>
        </div>
      `;
    }

    if (allLiterals && literals.length > 5) {
      // Use dropdown for larger sets
      return renderSelect({ ...params, options: literals, value: value ?? schema.default });
    }

    // Handle mixed primitive types
    const primitiveTypes = new Set(
      nonNull.map((variant) => schemaType(variant)).filter(Boolean)
    );
    const normalizedTypes = new Set(
      [...primitiveTypes].map((v) => (v === "integer" ? "number" : v))
    );

    if ([...normalizedTypes].every((v) => ["string", "number", "boolean"].includes(v as string))) {
      const hasString = normalizedTypes.has("string");
      const hasNumber = normalizedTypes.has("number");
      const hasBoolean = normalizedTypes.has("boolean");

      if (hasBoolean && normalizedTypes.size === 1) {
        return renderNode({
          ...params,
          schema: { ...schema, type: "boolean", anyOf: undefined, oneOf: undefined },
        });
      }

      if (hasString || hasNumber) {
        return renderTextInput({
          ...params,
          inputType: hasNumber && !hasString ? "number" : "text",
        });
      }
    }
  }

  // Fallback for complex unions: render as JSON textarea
  if (schema.anyOf || schema.oneOf) {
    const resolvedValue = value ?? schema.default;
    const jsonStr = resolvedValue !== undefined ? jsonValue(resolvedValue) : "";
    return html`
      <div
        class="cfg-field ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
        data-config-path=${key}
      >
        ${showLabel ? html`<label class="cfg-field__label">${label}</label>` : nothing}
        ${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
        <div class="cfg-field__help">Complex type — edit as JSON</div>
        ${severity
          ? html`<div class="cfg-field__validation">${validationMessage}</div>`
          : nothing}
        <textarea
          class="cfg-textarea cfg-textarea--sm"
          rows="3"
          placeholder="JSON value"
          .value=${jsonStr}
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const raw = (e.target as HTMLTextAreaElement).value.trim();
            if (!raw) {
              onPatch(path, undefined);
              return;
            }
            try {
              onPatch(path, JSON.parse(raw));
            } catch {
              // Invalid JSON - don't update
            }
          }}
        ></textarea>
      </div>
    `;
  }

  // Enum - use segmented for small, dropdown for large
  if (schema.enum) {
    const options = schema.enum;
    if (options.length <= 5) {
      const resolvedValue = value ?? schema.default;
      return html`
        <div
          class="cfg-field ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
          data-config-path=${key}
        >
          ${showLabel ? html`<label class="cfg-field__label">${label}</label>` : nothing}
          ${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
          ${severity
            ? html`<div class="cfg-field__validation">${validationMessage}</div>`
            : nothing}
          <div class="cfg-segmented">
            ${options.map((opt) => html`
              <button
                type="button"
                class="cfg-segmented__btn ${opt === resolvedValue || String(opt) === String(resolvedValue) ? 'active' : ''}"
                ?disabled=${disabled}
                @click=${() => onPatch(path, opt)}
              >
                ${String(opt)}
              </button>
            `)}
          </div>
        </div>
      `;
    }
    return renderSelect({ ...params, options, value: value ?? schema.default });
  }

  // Object type - collapsible or flat section
  if (type === "object") {
    return renderObject({ ...params, flattenObjects });
  }

  // Array type
  if (type === "array") {
    return renderArray({ ...params, compactToggles, flattenObjects });
  }

  // Boolean - toggle row (compact or card style)
  if (type === "boolean") {
    const displayValue = typeof value === "boolean" ? value : typeof schema.default === "boolean" ? schema.default : false;

    // Compact inline toggle (no card wrapper)
    if (compactToggles) {
      return html`
        <label
          class="cfg-toggle-inline ${disabled ? 'disabled' : ''} ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
          data-config-path=${key}
        >
          <div class="cfg-toggle cfg-toggle--sm">
            <input
              type="checkbox"
              .checked=${displayValue}
              ?disabled=${disabled}
              @change=${(e: Event) => onPatch(path, (e.target as HTMLInputElement).checked)}
            />
            <span class="cfg-toggle__track"></span>
          </div>
          <div class="cfg-toggle-inline__content">
            <span class="cfg-toggle-inline__label">${label}</span>
            ${help ? html`<span class="cfg-toggle-inline__help">${help}</span>` : nothing}
          </div>
          ${severity
            ? html`<span class="cfg-field__validation">${validationMessage}</span>`
            : nothing}
        </label>
      `;
    }

    // Default card-style toggle
    return html`
      <label
        class="cfg-toggle-row ${disabled ? 'disabled' : ''} ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
        data-config-path=${key}
      >
        <div class="cfg-toggle-row__content">
          <span class="cfg-toggle-row__label">${label}</span>
          ${help ? html`<span class="cfg-toggle-row__help">${help}</span>` : nothing}
          ${severity
            ? html`<span class="cfg-field__validation">${validationMessage}</span>`
            : nothing}
        </div>
        <div class="cfg-toggle">
          <input
            type="checkbox"
            .checked=${displayValue}
            ?disabled=${disabled}
            @change=${(e: Event) => onPatch(path, (e.target as HTMLInputElement).checked)}
          />
          <span class="cfg-toggle__track"></span>
        </div>
      </label>
    `;
  }

  // Number/Integer
  if (type === "number" || type === "integer") {
    if (shouldUseSlider(schema, hint)) {
      return renderSliderInput(params);
    }
    return renderNumberInput(params);
  }

  // String
  if (type === "string") {
    return renderTextInput({ ...params, inputType: "text" });
  }

  // Fallback
  return html`
    <div class="cfg-field cfg-field--error">
      <div class="cfg-field__label">${label}</div>
      <div class="cfg-field__error">Unsupported type: ${type}. Use Raw mode.</div>
    </div>
  `;
}

function renderTextInput(params: {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  disabled: boolean;
  showLabel?: boolean;
  validation?: ConfigValidationMap;
  inputType: "text" | "number";
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult {
  const { schema, value, path, hints, disabled, onPatch, inputType } = params;
  const showLabel = params.showLabel ?? true;
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path.at(-1)));
  const help = hint?.help ?? schema.description;
  const isSensitive = hint?.sensitive ?? isSensitivePath(path);
  const placeholder =
    hint?.placeholder ??
    (isSensitive ? "••••" : schema.default !== undefined ? `Default: ${schema.default}` : "");
  const displayValue = value ?? "";
  const key = pathKey(path);
  const validationIssues = params.validation?.[key] ?? [];
  const severity =
    validationIssues.find((issue) => issue.severity === "error")?.severity ??
    validationIssues.find((issue) => issue.severity === "warn")?.severity ??
    validationIssues[0]?.severity ??
    null;
  const validationMessage = validationIssues[0]?.message ?? "";

  return html`
    <div
      class="cfg-field ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
      data-config-path=${key}
    >
      ${showLabel ? html`<label class="cfg-field__label">${label}</label>` : nothing}
      ${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
      ${severity ? html`<div class="cfg-field__validation">${validationMessage}</div>` : nothing}
      <div class="cfg-input-wrap">
        <input
          type=${isSensitive ? "password" : inputType}
          class="cfg-input"
          placeholder=${placeholder}
          .value=${displayValue == null ? "" : String(displayValue)}
          ?disabled=${disabled}
          @input=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            if (inputType === "number") {
              if (raw.trim() === "") {
                onPatch(path, undefined);
                return;
              }
              const parsed = Number(raw);
              onPatch(path, Number.isNaN(parsed) ? raw : parsed);
              return;
            }
            onPatch(path, raw);
          }}
        />
        ${schema.default !== undefined ? html`
          <button
            type="button"
            class="cfg-input__reset"
            title="Reset to default"
            ?disabled=${disabled}
            @click=${() => onPatch(path, schema.default)}
          >↺</button>
        ` : nothing}
      </div>
    </div>
  `;
}

function renderSliderInput(params: {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  disabled: boolean;
  showLabel?: boolean;
  validation?: ConfigValidationMap;
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult {
  const { schema, value, path, hints, disabled, onPatch } = params;
  const showLabel = params.showLabel ?? true;
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path.at(-1)));
  const help = hint?.help ?? schema.description;
  const type = schemaType(schema);
  const key = pathKey(path);
  const validationIssues = params.validation?.[key] ?? [];
  const severity =
    validationIssues.find((issue) => issue.severity === "error")?.severity ??
    validationIssues.find((issue) => issue.severity === "warn")?.severity ??
    validationIssues[0]?.severity ??
    null;
  const validationMessage = validationIssues[0]?.message ?? "";

  const min = schemaMin(schema) ?? 0;
  const max = schemaMax(schema) ?? 100;
  const range = max - min;
  const isInt = type === "integer";
  const step = isInt ? 1 : range <= 1 ? 0.01 : range <= 10 ? 0.1 : 1;
  const numValue = typeof value === "number" ? value : typeof schema.default === "number" ? schema.default : min;
  const pct = range > 0 ? ((numValue - min) / range) * 100 : 0;
  // Format display: integers show whole, floats show appropriate precision
  const displayStr = isInt ? String(numValue) : Number(numValue.toFixed(step < 1 ? 2 : 1)).toString();

  return html`
    <div
      class="cfg-field cfg-field--compact ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
      data-config-path=${key}
    >
      <div class="cfg-slider-header">
        ${showLabel ? html`<label class="cfg-field__label">${label}</label>` : nothing}
        <span class="cfg-slider-value">${displayStr}</span>
      </div>
      ${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
      ${severity ? html`<div class="cfg-field__validation">${validationMessage}</div>` : nothing}
      <input
        type="range"
        class="cfg-slider"
        min=${min}
        max=${max}
        step=${step}
        .value=${String(numValue)}
        ?disabled=${disabled}
        style="background: linear-gradient(to right, var(--accent) ${pct}%, var(--border-strong) ${pct}%)"
        @input=${(e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          const parsed = Number(raw);
          // Update the track fill on input
          const el = e.target as HTMLInputElement;
          const newPct = range > 0 ? ((parsed - min) / range) * 100 : 0;
          el.style.background = `linear-gradient(to right, var(--accent) ${newPct}%, var(--border-strong) ${newPct}%)`;
          onPatch(path, isInt ? Math.round(parsed) : parsed);
        }}
      />
    </div>
  `;
}

function renderNumberInput(params: {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  disabled: boolean;
  showLabel?: boolean;
  validation?: ConfigValidationMap;
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult {
  const { schema, value, path, hints, disabled, onPatch } = params;
  const showLabel = params.showLabel ?? true;
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path.at(-1)));
  const help = hint?.help ?? schema.description;
  const displayValue = value ?? schema.default ?? "";
  const numValue = typeof displayValue === "number" ? displayValue : 0;
  const key = pathKey(path);
  const validationIssues = params.validation?.[key] ?? [];
  const severity =
    validationIssues.find((issue) => issue.severity === "error")?.severity ??
    validationIssues.find((issue) => issue.severity === "warn")?.severity ??
    validationIssues[0]?.severity ??
    null;
  const validationMessage = validationIssues[0]?.message ?? "";

  const min = schemaMin(schema);
  const max = schemaMax(schema);
  const atMin = min != null && numValue <= min;
  const atMax = max != null && numValue >= max;

  return html`
    <div
      class="cfg-field cfg-field--compact ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
      data-config-path=${key}
    >
      ${showLabel ? html`<label class="cfg-field__label">${label}</label>` : nothing}
      ${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
      ${severity ? html`<div class="cfg-field__validation">${validationMessage}</div>` : nothing}
      <div class="cfg-number">
        <button
          type="button"
          class="cfg-number__btn"
          ?disabled=${disabled || atMin}
          @click=${() => {
            const next = numValue - 1;
            onPatch(path, min != null ? Math.max(min, next) : next);
          }}
        >−</button>
        <input
          type="number"
          class="cfg-number__input"
          .value=${displayValue == null ? "" : String(displayValue)}
          ?disabled=${disabled}
          min=${min != null ? min : nothing}
          max=${max != null ? max : nothing}
          @input=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            const parsed = raw === "" ? undefined : Number(raw);
            onPatch(path, parsed);
          }}
        />
        <button
          type="button"
          class="cfg-number__btn"
          ?disabled=${disabled || atMax}
          @click=${() => {
            const next = numValue + 1;
            onPatch(path, max != null ? Math.min(max, next) : next);
          }}
        >+</button>
      </div>
    </div>
  `;
}

function renderSelect(params: {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  disabled: boolean;
  showLabel?: boolean;
  validation?: ConfigValidationMap;
  options: unknown[];
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult {
  const { schema, value, path, hints, disabled, options, onPatch } = params;
  const showLabel = params.showLabel ?? true;
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path.at(-1)));
  const help = hint?.help ?? schema.description;
  const resolvedValue = value ?? schema.default;
  const currentIndex = options.findIndex(
    (opt) => opt === resolvedValue || String(opt) === String(resolvedValue),
  );
  const unset = "__unset__";
  const key = pathKey(path);
  const validationIssues = params.validation?.[key] ?? [];
  const severity =
    validationIssues.find((issue) => issue.severity === "error")?.severity ??
    validationIssues.find((issue) => issue.severity === "warn")?.severity ??
    validationIssues[0]?.severity ??
    null;
  const validationMessage = validationIssues[0]?.message ?? "";

  return html`
    <div
      class="cfg-field ${severity ? `cfg-field--invalid cfg-field--${severity}` : ""}"
      data-config-path=${key}
    >
      ${showLabel ? html`<label class="cfg-field__label">${label}</label>` : nothing}
      ${help ? html`<div class="cfg-field__help">${help}</div>` : nothing}
      ${severity ? html`<div class="cfg-field__validation">${validationMessage}</div>` : nothing}
      <select
        class="cfg-select"
        ?disabled=${disabled}
        .value=${currentIndex >= 0 ? String(currentIndex) : unset}
        @change=${(e: Event) => {
          const val = (e.target as HTMLSelectElement).value;
          onPatch(path, val === unset ? undefined : options[Number(val)]);
        }}
      >
        <option value=${unset}>Select...</option>
        ${options.map((opt, idx) => html`
          <option value=${String(idx)}>${String(opt)}</option>
        `)}
      </select>
    </div>
  `;
}

/**
 * Partition sorted entries into runs of compact and wide fields.
 * Consecutive compact fields get wrapped in a multi-column grid.
 */
type FieldRun = { compact: boolean; entries: [string, JsonSchema][] };

function partitionFieldRuns(
  sorted: [string, JsonSchema][],
  path: Array<string | number>,
  hints: ConfigUiHints,
): FieldRun[] {
  const runs: FieldRun[] = [];
  for (const entry of sorted) {
    const [propKey, node] = entry;
    const fieldHint = hintForPath([...path, propKey], hints);
    const compact = isCompactField(node, fieldHint);
    const last = runs.at(-1);
    if (last && last.compact === compact) {
      last.entries.push(entry);
    } else {
      runs.push({ compact, entries: [entry] });
    }
  }
  return runs;
}

function renderFieldRuns(
  runs: FieldRun[],
  obj: Record<string, unknown>,
  baseParams: {
    path: Array<string | number>;
    hints: ConfigUiHints;
    unsupported: Set<string>;
    disabled: boolean;
    validation?: ConfigValidationMap;
    compactToggles: boolean;
    flattenObjects: boolean;
    onPatch: (path: Array<string | number>, value: unknown) => void;
  },
): TemplateResult[] {
  const { path, hints, unsupported, disabled, onPatch } = baseParams;
  return runs.map((run) => {
    const nodes = run.entries.map(([propKey, node]) =>
      renderNode({
        schema: node,
        value: obj[propKey],
        path: [...path, propKey],
        hints,
        unsupported,
        disabled,
        validation: baseParams.validation,
        compactToggles: baseParams.compactToggles,
        flattenObjects: baseParams.flattenObjects,
        onPatch,
      })
    );
    if (run.compact && run.entries.length >= 1) {
      return html`<div class="cfg-fields-compact">${nodes}</div>`;
    }
    return html`${nodes}`;
  });
}

function renderObject(params: {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  unsupported: Set<string>;
  disabled: boolean;
  showLabel?: boolean;
  validation?: ConfigValidationMap;
  flattenObjects?: boolean;
  compactToggles?: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult {
  const { schema, value, path, hints, unsupported, disabled, onPatch } = params;
  const showLabel = params.showLabel ?? true;
  const flattenObjects = params.flattenObjects ?? false;
  const compactToggles = params.compactToggles ?? false;
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path.at(-1)));
  const help = hint?.help ?? schema.description;

  const fallback = value ?? schema.default;
  const obj = fallback && typeof fallback === "object" && !Array.isArray(fallback)
    ? (fallback as Record<string, unknown>)
    : {};
  const props = schema.properties ?? {};
  const entries = Object.entries(props);

  // Sort by hint order
  const sorted = entries.sort((a, b) => {
    const orderA = hintForPath([...path, a[0]], hints)?.order ?? 0;
    const orderB = hintForPath([...path, b[0]], hints)?.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a[0].localeCompare(b[0]);
  });

  const reserved = new Set(Object.keys(props));
  const additional = schema.additionalProperties;
  const allowExtra = Boolean(additional) && typeof additional === "object";

  // Partition fields into compact/wide runs for multi-column layout
  const runs = partitionFieldRuns(sorted, path, hints);
  const baseRunParams = {
    path,
    hints,
    unsupported,
    disabled,
    validation: params.validation,
    compactToggles,
    flattenObjects,
    onPatch,
  };

  const extraMap = allowExtra ? renderMapField({
    schema: additional as JsonSchema,
    value: obj,
    path,
    hints,
    unsupported,
    disabled,
    reservedKeys: reserved,
    validation: params.validation,
    onPatch,
  }) : nothing;

  // Render flat (no collapsible wrapper) for top-level objects or when
  // showLabel is false (parent already provides the section title)
  if (path.length === 1 || !showLabel) {
    return html`
      <div class="cfg-fields">
        ${renderFieldRuns(runs, obj, baseRunParams)}
        ${extraMap}
      </div>
    `;
  }

  // Flat object rendering (for wizard context) - only for shallow nesting (path.length <= 3)
  // Uses <details> (collapsed by default) so users can expand nested config objects on demand
  if (flattenObjects && path.length <= 3) {
    return html`
      <details class="cfg-object-flat" data-config-path=${pathKey(path)}>
        <summary class="cfg-object-flat__header">
          <span class="cfg-object__icon">${icons.panelIcon}</span>
          <span class="cfg-object-flat__title">${label}</span>
          <span class="cfg-object-flat__chevron">${icons.chevronDown}</span>
        </summary>
        ${help ? html`<div class="cfg-object-flat__help">${help}</div>` : nothing}
        <div class="cfg-object-flat__content">
          ${renderFieldRuns(runs, obj, baseRunParams)}
          ${extraMap}
        </div>
      </details>
    `;
  }

  // Deep nested objects still get collapsible treatment
  return html`
    <details class="cfg-object" data-config-path=${pathKey(path)}>
      <summary class="cfg-object__header">
        <span class="cfg-object__icon">${icons.panelIcon}</span>
        <span class="cfg-object__title">${label}</span>
        <span class="cfg-object__chevron">${icons.chevronDown}</span>
      </summary>
      ${help ? html`<div class="cfg-object__help">${help}</div>` : nothing}
      <div class="cfg-object__content">
        ${renderFieldRuns(runs, obj, baseRunParams)}
        ${extraMap}
      </div>
    </details>
  `;
}

function renderArray(params: {
  schema: JsonSchema;
  value: unknown;
  path: Array<string | number>;
  hints: ConfigUiHints;
  unsupported: Set<string>;
  disabled: boolean;
  showLabel?: boolean;
  validation?: ConfigValidationMap;
  compactToggles?: boolean;
  flattenObjects?: boolean;
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult {
  const { schema, value, path, hints, unsupported, disabled, onPatch } = params;
  const showLabel = params.showLabel ?? true;
  const compactToggles = params.compactToggles ?? false;
  const flattenObjects = params.flattenObjects ?? false;
  const hint = hintForPath(path, hints);
  const label = hint?.label ?? schema.title ?? humanize(String(path.at(-1)));
  const help = hint?.help ?? schema.description;

  const itemsSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
  if (!itemsSchema) {
    return html`
      <div class="cfg-field cfg-field--error">
        <div class="cfg-field__label">${label}</div>
        <div class="cfg-field__error">Unsupported array schema. Use Raw mode.</div>
      </div>
    `;
  }

  const arr = Array.isArray(value) ? value : Array.isArray(schema.default) ? schema.default : [];

  return html`
    <div class="cfg-array" data-config-path=${pathKey(path)}>
      <div class="cfg-array__header">
        ${showLabel ? html`<span class="cfg-array__label">${label}</span>` : nothing}
        <span class="cfg-array__count">${arr.length} item${arr.length !== 1 ? 's' : ''}</span>
        <button
          type="button"
          class="cfg-array__add"
          ?disabled=${disabled}
          @click=${() => {
            const next = [...arr, defaultValue(itemsSchema)];
            onPatch(path, next);
          }}
        >
          <span class="cfg-array__add-icon">${icons.plus}</span>
          Add
        </button>
      </div>
      ${help ? html`<div class="cfg-array__help">${help}</div>` : nothing}

      ${arr.length === 0 ? html`
        <div class="cfg-array__empty">
          No items yet. Click "Add" to create one.
        </div>
      ` : html`
        <div class="cfg-array__items">
          ${arr.map((item, idx) => html`
            <div class="cfg-array__item">
              <div class="cfg-array__item-header">
                <span class="cfg-array__item-index">${(() => {
                  if (item && typeof item === "object") {
                    const obj = item as Record<string, unknown>;
                    const name = obj.name ?? obj.id ?? obj.label ?? obj.key;
                    if (name && typeof name === "string") {
                      return `#${idx + 1} — ${name}`;
                    }
                  }
                  return `#${idx + 1}`;
                })()}</span>
                <button
                  type="button"
                  class="cfg-array__item-remove"
                  title="Remove item"
                  ?disabled=${disabled}
                  @click=${() => {
                    const next = [...arr];
                    next.splice(idx, 1);
                    onPatch(path, next);
                  }}
                >
                  ${icons.trash}
                </button>
              </div>
              <div class="cfg-array__item-content">
                ${renderNode({
                  schema: itemsSchema,
                  value: item,
                  path: [...path, idx],
                  hints,
                  unsupported,
                  disabled,
                  showLabel: false,
                  validation: params.validation,
                  compactToggles,
                  flattenObjects,
                  onPatch,
                })}
              </div>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}

function renderMapField(params: {
  schema: JsonSchema;
  value: Record<string, unknown>;
  path: Array<string | number>;
  hints: ConfigUiHints;
  unsupported: Set<string>;
  disabled: boolean;
  reservedKeys: Set<string>;
  validation?: ConfigValidationMap;
  onPatch: (path: Array<string | number>, value: unknown) => void;
}): TemplateResult {
  const { schema, value, path, hints, unsupported, disabled, reservedKeys, onPatch } = params;
  const anySchema = isAnySchema(schema);
  const entries = Object.entries(value ?? {}).filter(([key]) => !reservedKeys.has(key));

  return html`
    <div class="cfg-map">
      <div class="cfg-map__header">
        <span class="cfg-map__label">Custom entries</span>
        <button
          type="button"
          class="cfg-map__add"
          ?disabled=${disabled}
          @click=${() => {
            const next = { ...(value ?? {}) };
            let index = 1;
            let key = `custom-${index}`;
            while (key in next) {
              index += 1;
              key = `custom-${index}`;
            }
            next[key] = anySchema ? {} : defaultValue(schema);
            onPatch(path, next);
          }}
        >
          <span class="cfg-map__add-icon">${icons.plus}</span>
          Add Entry
        </button>
      </div>

      ${entries.length === 0 ? html`
        <div class="cfg-map__empty">No custom entries.</div>
      ` : html`
        <div class="cfg-map__items">
          ${entries.map(([key, entryValue]) => {
            const valuePath = [...path, key];
            const fallback = jsonValue(entryValue);
            return html`
              <div class="cfg-map__item">
                <div class="cfg-map__item-key">
                  <input
                    type="text"
                    class="cfg-input cfg-input--sm"
                    placeholder="Key"
                    .value=${key}
                    ?disabled=${disabled}
                    @change=${(e: Event) => {
                      const nextKey = (e.target as HTMLInputElement).value.trim();
                      if (!nextKey || nextKey === key) return;
                      const next = { ...(value ?? {}) };
                      if (nextKey in next) return;
                      next[nextKey] = next[key];
                      delete next[key];
                      onPatch(path, next);
                    }}
                  />
                </div>
                <div class="cfg-map__item-value">
                  ${anySchema
                    ? html`
                        <textarea
                          class="cfg-textarea cfg-textarea--sm"
                          placeholder="JSON value"
                          rows="2"
                          .value=${fallback}
                          ?disabled=${disabled}
                          @change=${(e: Event) => {
                            const target = e.target as HTMLTextAreaElement;
                            const raw = target.value.trim();
                            if (!raw) {
                              onPatch(valuePath, undefined);
                              return;
                            }
                            try {
                              onPatch(valuePath, JSON.parse(raw));
                            } catch {
                              target.value = fallback;
                            }
                          }}
                        ></textarea>
                      `
                    : renderNode({
                        schema,
                        value: entryValue,
                        path: valuePath,
                        hints,
                        unsupported,
                        disabled,
                        showLabel: false,
                        validation: params.validation,
                        onPatch,
                      })}
                </div>
                <button
                  type="button"
                  class="cfg-map__item-remove"
                  title="Remove entry"
                  ?disabled=${disabled}
                  @click=${() => {
                    const next = { ...(value ?? {}) };
                    delete next[key];
                    onPatch(path, next);
                  }}
                >
                  ${icons.trash}
                </button>
              </div>
            `;
          })}
        </div>
      `}
    </div>
  `;
}
