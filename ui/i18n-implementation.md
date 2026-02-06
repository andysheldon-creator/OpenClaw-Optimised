# Internationalization (i18n) Implementation for Moltbot UI

## Overview

This implementation adds internationalization support to the Moltbot UI with support for English (en) and Simplified Chinese (zh-CN).

## Features

- Support for English and Simplified Chinese locales
- Dynamic locale switching via dropdown selector
- Automatic locale detection from browser or URL parameters
- Comprehensive translation coverage for UI elements
- Type-safe translation keys

## Architecture

### Files Added/Modified:

1. `src/i18n/i18n.ts` - Main i18n module with translation management
2. `src/i18n/LocaleSelector.ts` - Custom element for locale selection
3. `src/ui/navigation.ts` - Updated to use translated navigation labels
4. `src/ui/app-render.ts` - Updated to use translated UI elements
5. `src/ui/views/overview.ts` - Updated to use translated content
6. `index.html` - Updated to include lang attribute support

### Translation Keys

The implementation includes comprehensive translation keys organized by category:

- Navigation items
- Page titles and subtitles
- Topbar elements
- Overview page content
- Common terms

## Usage

### Translation Function

Use the `t()` function to translate text:

```typescript
import { t } from "./i18n/i18n.js";

// Simple translation
const buttonText = t("overview.connect_button"); // "Connect" or "连接"

// Translation with replacements
const cronText = t("overview.cron_next_wake", { nextRun: "in 2 hours" }); // "Next wake in 2 hours"
```

### Locale Switching

The locale can be switched dynamically using the dropdown selector in the topbar or programmatically:

```typescript
import { i18n } from "./i18n/i18n.js";

// Programmatically switch locale
i18n.setLocale("zh-CN"); // Switch to Simplified Chinese
```

### Automatic Detection

The system automatically detects the preferred locale from:

1. URL parameter (`?lang=en` or `?lang=zh-CN`)
2. Browser language settings
3. Fallback to English

## Testing Instructions

To test the implementation:

1. Build the project:

   ```bash
   cd /Users/moltbot/moltbot/ui
   npm run build
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Navigate to the UI and verify:
   - Language selector appears in the topbar
   - Text elements are properly translated
   - Language switching works dynamically
   - Fallback behavior works when translations are missing

## Extending Translations

To add new translations:

1. Add the translation key to the `TranslationKeys` interface in `i18n.ts`
2. Add the English translation to the `enTranslations` object
3. Add the Chinese translation to the `zhCNTranslations` object
4. Use the key with the `t()` function in your components

Example:

```typescript
// Add to TranslationKeys interface
'my.new.key': string;

// Add to enTranslations
'my.new.key': 'My New Text';

// Add to zhCNTranslations
'my.new.key': '我的新文本';

// Use in component
html`<div>${t('my.new.key')}</div>`;
```

## Error Handling

- Missing translations fall back to English
- Console warnings are logged for missing keys
- Placeholder replacements are handled gracefully

## Future Enhancements

- Additional language support
- RTL (right-to-left) layout support
- Date/time formatting localization
- Number/currency formatting localization
