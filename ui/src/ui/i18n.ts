export type Locale = "en" | "zh-CN" | "pt-BR";

export type MessageParams = Record<string, string | number | boolean | null | undefined>;
export type Messages = Record<string, string>;

import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import { ptBR } from "./locales/pt-BR";

const BUNDLES: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCN,
  "pt-BR": ptBR,
};

let currentLocale: Locale = "en";
const missingKeys = new Set<string>();

export function normalizeLocale(input: string | null | undefined): Locale | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "zh" || lower === "zh-cn" || lower.startsWith("zh-")) return "zh-CN";
  if (lower === "pt" || lower === "pt-br" || lower.startsWith("pt-")) return "pt-BR";
  if (lower === "en" || lower === "en-us" || lower.startsWith("en-")) return "en";
  return null;
}

export function resolveInitialLocale(saved: string | null | undefined): Locale {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromUrl = normalizeLocale(params.get("lang"));
    if (fromUrl) return fromUrl;
  } catch {
  }

  const fromSaved = normalizeLocale(saved);
  if (fromSaved) return fromSaved;

  const fromNavigator =
    typeof navigator !== "undefined" && typeof navigator.language === "string"
      ? normalizeLocale(navigator.language)
      : null;
  if (fromNavigator) return fromNavigator;

  return "en";
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(next: Locale) {
  currentLocale = next;
}

export function getMissingTranslationKeys(): string[] {
  return Array.from(missingKeys).sort((a, b) => a.localeCompare(b));
}

export function resetMissingTranslationKeys() {
  missingKeys.clear();
}

function format(template: string, params?: MessageParams) {
  if (!params) return template;
  return template.replace(/\$\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

export function t(key: string, params?: MessageParams): string {
  const bundle = BUNDLES[currentLocale] ?? BUNDLES.en;
  const hasLocal = Object.prototype.hasOwnProperty.call(bundle, key);
  const hasFallback = Object.prototype.hasOwnProperty.call(BUNDLES.en, key);
  if (!hasLocal && !hasFallback) {
    missingKeys.add(key);
    (globalThis as unknown as { __clawdbot_i18n_missing?: Set<string> }).__clawdbot_i18n_missing =
      missingKeys;
  }
  const fallback = hasFallback ? BUNDLES.en[key] : undefined;
  const raw = (hasLocal ? bundle[key] : undefined) ?? fallback ?? key;
  return format(raw, params);
}
