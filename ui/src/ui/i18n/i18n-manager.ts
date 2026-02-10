// Internationalization manager for OpenClaw UI
import { locales, defaultLocale } from "./locales.ts";

export type Locale = keyof typeof locales;

export class I18nManager {
  private static instance: I18nManager;
  private currentLocale: Locale = defaultLocale as Locale;

  // Get singleton instance
  static getInstance(): I18nManager {
    if (!I18nManager.instance) {
      I18nManager.instance = new I18nManager();
    }
    return I18nManager.instance;
  }

  constructor() {
    // Initialize with browser locale or default
    this.initLocale();
  }

  private initLocale() {
    const storedLocale = localStorage.getItem("openclaw.locale");
    if (storedLocale && storedLocale in locales) {
      this.currentLocale = storedLocale as Locale;
    } else {
      // Try to detect from browser
      const browserLocale = navigator.language.substring(0, 2);
      if (browserLocale in locales) {
        this.currentLocale = browserLocale as Locale;
      }
      // Otherwise, it remains as default (en)
    }
  }

  // Get current locale
  getLocale(): Locale {
    return this.currentLocale;
  }

  // Set locale and save to storage
  setLocale(locale: Locale) {
    if (!(locale in locales)) {
      console.warn(`Locale '${locale}' not supported, falling back to '${defaultLocale}'`);
      locale = defaultLocale as Locale;
    }

    const oldLocale = this.currentLocale;
    this.currentLocale = locale;
    localStorage.setItem("openclaw.locale", locale);

    // Dispatch event for UI updates only if locale changed
    if (oldLocale !== locale) {
      window.dispatchEvent(
        new CustomEvent("localeChanged", {
          detail: { locale, oldLocale },
        }),
      );

      // Also update the lang attribute on html element for accessibility
      document.documentElement.lang = locale;
    }
  }

  // Get translation by key path (e.g., 'common.save')
  t(
    key: string,
    locale: Locale = this.currentLocale,
    replacements?: Record<string, string | number> & { defaultValue?: string },
  ): string {
    try {
      // Split the key by dots to navigate the nested object
      const keys = key.split(".");
      let value: unknown = locales[locale];

      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          // If key not found in current locale, fallback to default
          if (locale !== defaultLocale) {
            const fallback = this.t(key, defaultLocale as Locale, replacements);
            // If fallback returned key (not found), try defaultValue
            if (fallback === key && replacements?.defaultValue) {
              return replacements.defaultValue;
            }
            return fallback;
          }
          // If checking default and not found, use defaultValue
          if (replacements?.defaultValue) {
            return replacements.defaultValue;
          }
          return key; // Return the key itself if not found anywhere
        }
      }

      let text = typeof value === "string" ? value : key;

      // Apply replacements if provided
      if (replacements) {
        for (const [key, val] of Object.entries(replacements)) {
          text = text.replace(new RegExp(`{{${key}}}`, "g"), String(val));
        }
      }

      return text;
    } catch (error) {
      console.error(`Error getting translation for key '${key}':`, error);
      return key;
    }
  }

  // Get all available locales
  getAvailableLocales(): Locale[] {
    return Object.keys(locales) as Locale[];
  }
}

// Create global instance
export const i18n = I18nManager.getInstance();

// Helper function for templates
export function t(
  key: string,
  replacements?: Record<string, string | number> & { defaultValue?: string },
): string {
  return i18n.t(key, undefined, replacements);
}

// Helper function to translate technical names (API keys, config paths, etc.)
// This accesses the technicalNames object directly to avoid dot-splitting issues
export function translateTechnicalName(name: string): string {
  const locale = i18n.getLocale();
  const currentLocaleData = locales[locale] as Record<string, unknown>;
  const defaultLocaleData = locales[defaultLocale as keyof typeof locales] as Record<
    string,
    unknown
  >;

  // Try current locale first
  const skillsData = currentLocaleData?.skills as Record<string, unknown> | undefined;
  const technicalNames = skillsData?.technicalNames as Record<string, string> | undefined;
  if (technicalNames && name in technicalNames) {
    return technicalNames[name];
  }

  // Fallback to default locale
  const defaultSkillsData = defaultLocaleData?.skills as Record<string, unknown> | undefined;
  const defaultTechnicalNames = defaultSkillsData?.technicalNames as
    | Record<string, string>
    | undefined;
  if (defaultTechnicalNames && name in defaultTechnicalNames) {
    return defaultTechnicalNames[name];
  }

  // Return original name if no translation found
  return name;
}
