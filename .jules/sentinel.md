## 2026-01-28 - Security Headers and Control UI XSS Prevention

**Vulnerability:** The Moltbot Gateway and associated servers (Media, Browser Control) lacked standard security headers, increasing the risk of MIME-type sniffing, clickjacking, and cross-origin information leakage. Additionally, the Control UI injected configuration data into `<script>` tags using raw `JSON.stringify`, which is vulnerable to XSS if a string contains `</script>`.

**Learning:** Even internal-first applications benefit significantly from "Defense in Depth" security measures like standard HTTP headers. Templating data into scripts is a common XSS vector that is often overlooked when using simple `JSON.stringify`.

**Prevention:**
- Always set `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN` (or `DENY`) on all HTTP responses.
- When injecting JSON into HTML script tags, escape `<` as `\u003c` to prevent tag-breaking and XSS.
