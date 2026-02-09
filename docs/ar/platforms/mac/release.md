---
summary: "قائمة التحقق لإصدار OpenClaw على macOS (خلاصة Sparkle، التغليف، التوقيع)"
read_when:
  - عند قطع أو التحقق من إصدار OpenClaw على macOS
  - عند تحديث خلاصة أو أصول تطبيق Sparkle
title: "إصدار macOS"
---

# إصدار OpenClaw على macOS (Sparkle)

يشحن هذا التطبيق الآن تحديثات Sparkle التلقائية. يجب توقيع بنى الإصدار بمعرّف المطوّر (Developer ID)، وضغطها، ونشرها مع إدخال appcast موقّع.

## المسبق

- تثبيت شهادة Developer ID Application (مثال: `Developer ID Application: <Developer Name> (<TEAMID>)`).
- تعيين مسار المفتاح الخاص لـ Sparkle في متغيرات البيئة كـ `SPARKLE_PRIVATE_KEY_FILE` (المسار إلى مفتاح Sparkle الخاص ed25519؛ المفتاح العام مضمّن في Info.plist). إذا كان مفقودًا، تحقّق من `~/.profile`.
- بيانات اعتماد التوثيق (ملف تعريف سلسلة المفاتيح أو مفتاح API) لـ `xcrun notarytool` إذا كنت تريد توزيع DMG/zip آمنًا مع Gatekeeper.
  - نستخدم ملف تعريف لسلسلة المفاتيح باسم `openclaw-notary`، تم إنشاؤه من متغيرات بيئة مفتاح API لـ App Store Connect في ملف تعريف الصدفة لديك:
    - `APP_STORE_CONNECT_API_KEY_P8`، `APP_STORE_CONNECT_KEY_ID`، `APP_STORE_CONNECT_ISSUER_ID`
    - `echo "$APP_STORE_CONNECT_API_KEY_P8" | sed 's/\\n/\n/g' > /tmp/openclaw-notary.p8`
    - `xcrun notarytool store-credentials "openclaw-notary" --key /tmp/openclaw-notary.p8 --key-id "$APP_STORE_CONNECT_KEY_ID" --issuer "$APP_STORE_CONNECT_ISSUER_ID"`
- تثبيت تبعيات `pnpm` (`pnpm install --config.node-linker=hoisted`).
- يتم جلب أدوات Sparkle تلقائيًا عبر SwiftPM في `apps/macos/.build/artifacts/sparkle/Sparkle/bin/` (`sign_update`، `generate_appcast`، إلخ).

## البناء والتغليف

ملاحظات:

- `APP_BUILD` يُطابِق `CFBundleVersion`/`sparkle:version`؛ اجعله رقميًا ومتزايدًا بشكل رتيب (بدون `-beta`)، وإلا سيقارنه Sparkle على أنه متساوٍ.
- الإعداد الافتراضي هو المعمارية الحالية (`$(uname -m)`). لبنى الإصدار/العالمية، عيّن `BUILD_ARCHS="arm64 x86_64"` (أو `BUILD_ARCHS=all`).
- استخدم `scripts/package-mac-dist.sh` لأصول الإصدار (zip + DMG + التوثيق). استخدم `scripts/package-mac-app.sh` للتغليف المحلي/التطويري.

```bash
21. # من جذر المستودع؛ عيّن معرفات الإصدار لتمكين تغذية Sparkle.
# يجب أن يكون APP_BUILD رقمياً ومتزايداً لمقارنة Sparkle.
BUNDLE_ID=bot.molt.mac \
APP_VERSION=2026.2.9 \
APP_BUILD="$(git rev-list --count HEAD)" \
BUILD_CONFIG=release \
SIGN_IDENTITY="Developer ID Application: <Developer Name> (<TEAMID>)" \
scripts/package-mac-app.sh

# ضغط للتوزيع (يتضمن resource forks لدعم Sparkle delta)
ditto -c -k --sequesterRsrc --keepParent dist/OpenClaw.app dist/OpenClaw-2026.2.9.zip

# اختياري: أيضاً أنشئ DMG مُنسّق للبشر (سحب إلى /Applications)
scripts/create-dmg.sh dist/OpenClaw.app dist/OpenClaw-2026.2.9.dmg

# موصى به: البناء + التوثيق/notarize وإرفاق zip + DMG
# أولاً، أنشئ ملف تعريف لسلسلة المفاتيح مرة واحدة:
#   xcrun notarytool store-credentials "openclaw-notary" \
#     --apple-id "<apple-id>" --team-id "<team-id>" --password "<app-specific-password>"
NOTARIZE=1 NOTARYTOOL_PROFILE=openclaw-notary \
BUNDLE_ID=bot.molt.mac \
APP_VERSION=2026.2.9 \
APP_BUILD="$(git rev-list --count HEAD)" \
BUILD_CONFIG=release \
SIGN_IDENTITY="Developer ID Application: <Developer Name> (<TEAMID>)" \
scripts/package-mac-dist.sh

# اختياري: شحن dSYM إلى جانب الإصدار
ditto -c -k --keepParent apps/macos/.build/release/OpenClaw.app.dSYM dist/OpenClaw-2026.2.9.dSYM.zip
```

## إدخال Appcast

استخدم مولّد ملاحظات الإصدار لكي يعرض Sparkle ملاحظات HTML منسّقة:

```bash
22. SPARKLE_PRIVATE_KEY_FILE=/path/to/ed25519-private-key scripts/make_appcast.sh dist/OpenClaw-2026.2.9.zip https://raw.githubusercontent.com/openclaw/openclaw/main/appcast.xml
```

يُنشئ ملاحظات إصدار HTML من `CHANGELOG.md` (عبر [`scripts/changelog-to-html.sh`](https://github.com/openclaw/openclaw/blob/main/scripts/changelog-to-html.sh)) ويضمّنها في إدخال appcast.
قم بعمل commit للملف المحدّث `appcast.xml` إلى جانب أصول الإصدار (zip + dSYM) عند النشر.

## النشر والتحقق

- 23. ارفع `OpenClaw-2026.2.9.zip` (و `OpenClaw-2026.2.9.dSYM.zip`) إلى إصدار GitHub للوسم `v2026.2.9`.
- تأكّد من أن رابط appcast الخام يطابق الخلاصة المضمّنة: `https://raw.githubusercontent.com/openclaw/openclaw/main/appcast.xml`.
- التحقق من المتعة:
  - `curl -I https://raw.githubusercontent.com/openclaw/openclaw/main/appcast.xml` يُرجع 200.
  - `curl -I <enclosure url>` يُرجع 200 بعد رفع الأصول.
  - على بنية عامة سابقة، شغّل «التحقق من وجود تحديثات…» من تبويب «حول» وتحقق من أن Sparkle يثبت البنية الجديدة بسلاسة.

تعريف الاكتمال: تم نشر التطبيق الموقّع وappcast، ويعمل تدفق التحديث من إصدار أقدم مُثبّت، وتم إرفاق أصول الإصدار بإصدار GitHub.
