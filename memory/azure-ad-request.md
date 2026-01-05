# Azure AD App Registration Request

**For:** Steve (AI Assistant) — SharePoint/OneDrive Integration  
**Requested by:** David Hurley  
**Date:** January 5, 2026

---

## What We Need

An Azure AD App Registration to allow Steve (our AI assistant) to search and read documents from One Point's SharePoint/OneDrive.

## App Registration Details

**Suggested App Name:** `Steve - Document Access`

**Application Type:** Confidential client (server-side)

**Required API Permissions:**

| Permission | Type | Purpose |
|------------|------|---------|
| `Files.Read.All` | Application | Read files across SharePoint/OneDrive |
| `Sites.Read.All` | Application | List and access SharePoint sites |
| `User.Read` | Delegated | Basic profile (optional) |

**Note:** These are **read-only** permissions. Steve cannot modify, delete, or upload files.

## What We Need Back

1. **Tenant ID** — Your M365 tenant identifier
2. **Client ID** — The app's application ID
3. **Client Secret** — A secret key for authentication (or certificate if preferred)

## How It Will Be Used

- Steve runs on David's machine
- Connects to SharePoint via Microsoft Graph API
- Downloads and indexes documents locally for search
- Answers questions like "What do we know about [community]?"
- **Read-only** — no modifications to any files

## Security Notes

- Credentials stored securely (not in code)
- Access limited to read operations only
- Can be scoped to specific sites/folders if needed
- Can be revoked anytime via Azure AD

## Alternative: Delegated Auth

If application permissions are a concern, we can use delegated auth instead:
- David logs in via browser
- Token refreshes periodically
- Access limited to what David can see

Let me know which approach works better for your security policies.

---

**Questions?** Contact David Hurley — dhurley@onepoint-partners.com
