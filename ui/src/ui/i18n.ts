/**
 * Lightweight i18n module for the Control UI.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from "./i18n.ts";
 *   const label = t("nav.tabs.chat");        // "Chat" or "Sohbet"
 *   const msg = t("status.x", { n: "5" });   // interpolation
 *
 * Adding a new language:
 *   1. Create `locales/<code>.json` with the same key structure as `en.json`.
 *   2. Add the entry to `LOCALE_REGISTRY` below.
 *   3. Import the JSON and add to `BUNDLES`.
 */

import de from "./locales/de.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };
import tr from "./locales/tr.json" with { type: "json" };

// ── Types ──────────────────────────────────────────────────────────────────────

export type Locale = "en" | "tr" | "fr" | "de" | (string & {});

export type LocaleEntry = {
  code: string;
  /** English name (e.g. "Turkish") */
  label: string;
  /** Native name (e.g. "Türkçe") */
  nativeLabel: string;
};

type FlatMessages = Record<string, string>;
type NestedMessages = { [k: string]: string | NestedMessages };

// ── Registry ───────────────────────────────────────────────────────────────────

/**
 * To add a new locale:
 * 1. Create `locales/<code>.json`
 * 2. Import it above
 * 3. Add to LOCALE_REGISTRY and BUNDLES below
 */
export const LOCALE_REGISTRY: readonly LocaleEntry[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
] as const;

const BUNDLES: Record<string, NestedMessages> = {
  en: en as unknown as NestedMessages,
  tr: tr as unknown as NestedMessages,
  fr: fr as unknown as NestedMessages,
  de: de as unknown as NestedMessages,
};

// ── Flatten helper ─────────────────────────────────────────────────────────────

function flatten(obj: NestedMessages, prefix = ""): FlatMessages {
  const result: FlatMessages = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[fullKey] = value;
    } else {
      Object.assign(result, flatten(value, fullKey));
    }
  }
  return result;
}

// ── State ──────────────────────────────────────────────────────────────────────

let currentLocale: Locale = "en";
const flatCache = new Map<string, FlatMessages>();

function getFlat(locale: string): FlatMessages {
  let flat = flatCache.get(locale);
  if (!flat) {
    const bundle = BUNDLES[locale] ?? BUNDLES.en;
    flat = flatten(bundle);
    flatCache.set(locale, flat);
  }
  return flat;
}

const enFlat = getFlat("en");

// ── Callbacks for reactivity ───────────────────────────────────────────────────

type LocaleChangeCallback = (locale: Locale) => void;
const listeners = new Set<LocaleChangeCallback>();

export function onLocaleChange(cb: LocaleChangeCallback): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Translate a key. Supports dot-notation: `t("nav.tabs.chat")`.
 * Falls back to English, then to the raw key.
 *
 * Optional `params` for interpolation: `t("x", { count: "5" })`
 * replaces `{{count}}` with `"5"`.
 */
export function t(key: string, params?: Record<string, string>): string {
  const flat = getFlat(currentLocale);
  let value = flat[key] ?? enFlat[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{{${k}}}`, v);
    }
  }
  return value;
}

/**
 * Set the active locale. Notifies all registered listeners.
 */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) {
    return;
  }
  if (!BUNDLES[locale]) {
    console.warn(`[i18n] Unknown locale "${locale}", falling back to "en"`);
    locale = "en";
  }
  currentLocale = locale;
  for (const cb of listeners) {
    cb(locale);
  }
}

/**
 * Get the active locale code.
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * List all registered locales.
 */
export function getAvailableLocales(): readonly LocaleEntry[] {
  return LOCALE_REGISTRY;
}

/**
 * Detect a reasonable default from `navigator.language`.
 * Returns the best match from available locales, or "en".
 */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const browserLang = navigator.language?.toLowerCase() ?? "";
  // Exact match (e.g. "tr")
  for (const entry of LOCALE_REGISTRY) {
    if (browserLang === entry.code || browserLang.startsWith(`${entry.code}-`)) {
      return entry.code as Locale;
    }
  }
  return "en";
}
