/**
 * Test file to demonstrate i18n functionality
 */

import { i18n, t } from "./src/i18n/i18n.js";

console.log("=== Moltbot UI i18n Test ===");

// Test initial locale detection
console.log("Initial locale:", i18n.getLocale());

// Test basic translations
console.log("English translations:");
i18n.setLocale("en");
console.log("- Connect button:", t("overview.connect_button"));
console.log("- Gateway access:", t("overview.gateway_access"));
console.log("- Status:", t("overview.status"));

console.log("\nChinese translations:");
i18n.setLocale("zh-CN");
console.log("- Connect button:", t("overview.connect_button"));
console.log("- Gateway access:", t("overview.gateway_access"));
console.log("- Status:", t("overview.status"));

// Test translation with replacements
console.log("\nTranslation with replacements:");
i18n.setLocale("en");
console.log("- Cron next wake:", t("overview.cron_next_wake", { nextRun: "in 2 hours" }));

i18n.setLocale("zh-CN");
console.log("- Cron next wake:", t("overview.cron_next_wake", { nextRun: "2小时后" }));

// Test fallback behavior
console.log("\nTesting fallback for non-existent key:");
// @ts-ignore intentionally passing a non-declared key to test fallback
console.log("- Non-existent key:", t("non.existent.key" as never));

console.log("\n=== Test Complete ===");
