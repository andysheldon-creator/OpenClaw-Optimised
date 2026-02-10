# Google Drive Plugin

OpenClaw plugin for browsing Google Drive, downloading files, reading Google Docs, and reading Google Sheets.

## Features

- **Browse files and folders**: List files in Google Drive with search and pagination
- **Get file metadata**: Retrieve detailed information about files
- **Download files**: Download regular files or export Google Workspace files (Docs, Sheets, Slides) to PDF, DOCX, etc.
- **Read Google Docs**: Extract content from Google Docs as markdown or plain text
- **Read Google Sheets**: Read cell ranges from spreadsheets via the Sheets API (A1 notation)

## Setup

### 1. OAuth Authentication

The plugin uses OAuth 2.0 with PKCE for authentication. Environment variables must be set:

- `GOOGLE_CLIENT_ID`: Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret
- `GOOGLE_OAUTH_REDIRECT_URL`: OAuth redirect URI (defaults to `http://localhost:8086/oauth2callback`)
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: Token encryption key (optional, for token storage)

#### For Fly.io Deployments

When deploying to Fly.io (especially private deployments without public IP), set these as Fly secrets:

```bash
fly secrets set GOOGLE_CLIENT_ID=your-client-id
fly secrets set GOOGLE_CLIENT_SECRET=your-client-secret
fly secrets set GOOGLE_OAUTH_REDIRECT_URL=http://localhost:8086/oauth2callback
```

**Important:** In Google Cloud Console, add `http://localhost:8086/oauth2callback` as an authorized redirect URI for your OAuth client, even though it won't actually receive the callback in manual mode.

**Note:** In Fly.io containers, the OAuth flow will automatically use manual mode (you'll paste the redirect URL). This works because:

- The plugin detects Fly.io environment via `FLY_APP_NAME` or `FLY_MACHINE_ID`
- It also detects SSH/remote environments automatically
- You'll open the OAuth URL in your local browser and paste the callback URL back

#### Using Tailscale for Automatic OAuth (Advanced)

If you're using Tailscale VPN (as configured in `fly-tailscale-start.sh`), you can optionally use Tailscale Funnel for automatic OAuth callbacks:

1. **Set up Tailscale Funnel** (makes the callback publicly accessible):

   ```bash
   # In your Fly.io container, expose the OAuth callback endpoint
   tailscale funnel --set-path /oauth2callback --yes 8086
   ```

2. **Get your Tailscale DNS name:**

   ```bash
   tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//'
   # Example output: your-app.tailnet-xxxx.ts.net
   ```

3. **Update redirect URI:**

   ```bash
   # Use your Tailscale Funnel URL
   fly secrets set GOOGLE_OAUTH_REDIRECT_URL=https://your-app.tailnet-xxxx.ts.net/oauth2callback
   ```

4. **Add to Google Cloud Console:** Add the Tailscale Funnel URL as an authorized redirect URI.

**Note:** Manual mode (pasting the redirect URL) is simpler and recommended for most users. Tailscale Funnel is only needed if you want fully automatic OAuth callbacks.

### 2. Authenticate

Run the authentication command:

```bash
openclaw models auth login --provider google-drive
```

**Local environment:**

1. Browser will open automatically for Google authentication
2. Request access to Google Drive (read-only), Google Docs (read-only), and Google Sheets (read-only)
3. Store the credentials in `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`

**Fly.io / Remote environment:**

1. A URL will be displayed - open it in your **local browser** (not in the container)
2. Complete Google authentication in your browser
3. Copy the redirect URL from your browser's address bar
4. Paste it back into the terminal/SSH session
5. Credentials will be stored in `/data/.openclaw/agents/<agentId>/agent/auth-profiles.json` (on the Fly.io volume)

### 3. Enable the Tool

Add `google_drive` to your agent's tool allowlist:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        tools: {
          allow: ["google_drive"],
        },
      },
    ],
  },
}
```

Or enable for all agents:

```json5
{
  tools: {
    allow: ["google_drive"],
  },
}
```

## Usage

### List Files

Listing works for **My Drive** and **Shared Drives**. Use `driveId` when listing a Shared Drive (or a folder inside one).

```json
{
  "action": "list",
  "folderId": "root",
  "driveId": "0ABC...",
  "query": "name contains 'report'",
  "maxResults": 100,
  "pageToken": "..."
}
```

- **folderId**: Folder ID to list, or `"root"` for the root of My Drive (or the Shared Drive when `driveId` is set).
- **driveId**: Optional. Shared Drive ID. When set, listing is scoped to that drive; use with `folderId` to list a folder inside it, or omit `folderId`/use `"root"` to list the Shared Drive root.
- **query**, **maxResults**, **pageToken**: Optional (search, limit, pagination).

### Get File Metadata

```json
{
  "action": "get",
  "fileId": "1abc123..."
}
```

### Download File

```json
{
  "action": "download",
  "fileId": "1abc123...",
  "exportFormat": "pdf", // Optional: for Google Workspace files (pdf, docx, txt, etc.)
  "outputPath": "downloads/file.pdf" // Optional: output path (relative to workspace)
}
```

Supported export formats for Google Workspace files:

- **Docs**: `pdf`, `docx`, `txt`, `html`, `rtf`, `odt`
- **Sheets**: `pdf`, `xlsx`, `csv`, `tsv`
- **Slides**: `pdf`, `pptx`, `png`, `jpg`, `svg`
- **Drawings**: `pdf`, `png`, `jpg`, `svg`

### Read Google Docs

```json
{
  "action": "read_docs",
  "fileId": "1abc123...",
  "format": "markdown"
}
```

### Read Google Sheets

```json
{
  "action": "read_sheets",
  "spreadsheetId": "1abc123...",
  "range": "Sheet1!A1:D10"
}
```

Use A1 notation for `range` (e.g. `Sheet1!A1:Z`, `A1:D10`). Returns `values` (array of rows) and `range`.

## Examples

### Browse root folder

```json
{
  "action": "list",
  "folderId": "root"
}
```

### Search for PDF files

```json
{
  "action": "list",
  "query": "mimeType = 'application/pdf'"
}
```

### Download Google Doc as PDF

```json
{
  "action": "download",
  "fileId": "1abc123...",
  "exportFormat": "pdf"
}
```

### Read a Google Doc

```json
{
  "action": "read_docs",
  "fileId": "1abc123...",
  "format": "markdown"
}
```

### Read a Google Sheets range

```json
{
  "action": "read_sheets",
  "spreadsheetId": "1abc123...",
  "range": "Sheet1!A1:D10"
}
```

## Scopes

The plugin requests the following OAuth scopes:

- `https://www.googleapis.com/auth/drive.readonly` - Read-only access to Google Drive
- `https://www.googleapis.com/auth/documents.readonly` - Read-only access to Google Docs
- `https://www.googleapis.com/auth/spreadsheets.readonly` - Read-only access to Google Sheets

## Troubleshooting

### "No Google Drive credentials found"

Run `openclaw models auth login --provider google-drive` to authenticate.

### "Export format not available"

Not all export formats are available for all file types. Use the `get` action first to see available `exportFormats` for a specific file.

### Permission errors

Ensure your Google account has access to the files you're trying to access. Shared files may require explicit permission grants.

### OAuth issues on Fly.io

If OAuth fails in a Fly.io container:

1. **Verify secrets are set:**

   ```bash
   fly secrets list
   ```

2. **Check redirect URL:** Ensure `GOOGLE_OAUTH_REDIRECT_URL` matches what's configured in Google Cloud Console. For Fly.io, you can use `http://localhost:8086/oauth2callback` (the plugin will use manual mode).

3. **Use manual flow:** The plugin should automatically detect Fly.io and use manual OAuth flow. If not, ensure you're running via `fly ssh console` and the environment variables are set.

4. **Check Google Cloud Console:** Ensure your OAuth client allows `http://localhost:8086/oauth2callback` as an authorized redirect URI (even though it won't actually be called in manual mode).

## Security

- Credentials are stored encrypted in `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`
- The plugin only requests read-only scopes
- File downloads are saved to the workspace directory (respects sandboxing)
