# HTML Email Reference

## Default: Plain Text

By default, send **plain text only**. It's universally readable and never breaks.

## Intent-Based Formatting

Only use HTML when the user explicitly requests it:

| User Says                             | Format               | What to Send                                     |
| ------------------------------------- | -------------------- | ------------------------------------------------ |
| "Send an email" / "Write an email"    | **Plain text only**  | No HTML, no MML multipart                        |
| "Styled email" / "nicer" / "polished" | **Editorial style**  | Clean black/white design, Medium-like typography |
| "Marketing email" / colors / branding | **Full styled HTML** | Colors, buttons, backgrounds, table layout       |

**Critical Rule:** The plain text and HTML parts must be **content-equivalent** - same message, different rendering. Never use a throwaway "fallback" with different content.

## Tier 1: Plain Text (default)

```
From: you@example.com
To: recipient@example.com
Subject: Meeting Tomorrow

Hi,

Just confirming our meeting tomorrow at 2pm.

Best,
Name
```

## Tier 2: Editorial Style

Clean black/white design inspired by Medium. Typography-focused, no colors except black (#333) and gray (#666). Generous whitespace, clear hierarchy.

**Characteristics:**

- Typography-focused: System font stack (Arial, sans-serif)
- Black/white only: Text in #333 (dark gray), secondary in #666
- Generous whitespace: 30px padding, 1.6 line-height
- Clean hierarchy: h1 for title, p for body, subtle separators
- No buttons or colored CTAs: Links are underlined text
- Max width 600px: Standard email width
- No backgrounds/borders: Just clean content

```
From: you@example.com
To: recipient@example.com
Subject: Meeting Tomorrow

<#multipart type=alternative>
Hi,

Just confirming our meeting tomorrow at 2pm.

Best,
Name
<#part type=text/html>
<html><body style="margin:0; padding:0; font-family:Arial,sans-serif; line-height:1.6; background:#fff;">
<table role="presentation" style="width:100%; max-width:600px; margin:0 auto;">
<tr><td style="padding:30px;">
<h1 style="color:#333; margin:0 0 20px 0; font-size:24px; font-weight:normal;">Meeting Tomorrow</h1>
<p style="color:#333; margin:0 0 16px 0;">Hi,</p>
<p style="color:#333; margin:0 0 16px 0;">Just confirming our meeting tomorrow at 2pm.</p>
<p style="color:#666; margin:20px 0 0 0; font-size:14px;">Best,<br>Name</p>
</td></tr>
</table>
</body></html>
<#/multipart>
```

**Key:** Plain text and HTML say THE SAME THING. No colors, no buttons - just clean typography.

## Tier 3: Styled HTML

Full email HTML with tables, inline styles, colors, and buttons. Use for marketing emails or when specific branding is requested.

```
From: you@example.com
To: recipient@example.com
Subject: Project Update

<#multipart type=alternative>
Project Update

We have completed the first milestone. View the full report here:
https://example.com/report

Thanks,
The Team
<#part type=text/html>
<!DOCTYPE html>
<html><body style="margin:0; padding:0; font-family:Arial,sans-serif;">
<table role="presentation" style="width:100%; max-width:600px;">
<tr><td style="padding:20px; background:#ffffff;">
<h1 style="color:#333;">Project Update</h1>
<p style="color:#666;">We have completed the first milestone.</p>
<a href="https://example.com/report"
   style="background:#1268FB; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px; display:inline-block;">
   View Report
</a>
<p style="color:#666; margin-top:20px;">Thanks,<br>The Team</p>
</td></tr>
</table>
</body></html>
<#/multipart>
```

**Key:** Plain text includes the link URL since HTML has a button.

## Quick Reference: What Works in Styled Emails

| Safe              | Limited        | Avoid        |
| ----------------- | -------------- | ------------ |
| Tables for layout | Media queries  | CSS Grid     |
| Inline styles     | Web fonts      | Flexbox      |
| Background colors | CSS animations | External CSS |
| 600px max width   | `calc()`       | JavaScript   |

## Styled Email Rules

1. **Tables are mandatory** - Outlook uses Word's rendering engine
2. **Inline styles required** - Gmail strips `<style>` tags on mobile
3. **600px width maximum** - Standard for email preview panes
4. **`role="presentation"`** - On layout tables for accessibility

## Testing

Test in: Outlook Windows, Gmail (web + app), Apple Mail

## References

- [Can I Email](https://caniemail.com) - Feature support tables
