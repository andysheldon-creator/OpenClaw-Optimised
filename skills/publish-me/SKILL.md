---
name: publish-me
description: Transform Markdown/HTML into premium web pages and publish to a global URL.
homepage: https://github.com/steipete/publish_to_web
metadata: {"clawdis":{"emoji":"🌐","requires":{"bins":["publish_me"]},"install":[{"id":"manual","kind":"manual","instructions":"Custom tool at ~/TOOLS/publish_to_web/publish_me"}]}}
---

# publish-me

Use `publish_me` to publish documents (Markdown or HTML) to the web. It handles transformation to high-quality typography and provides globally accessible URLs via VPS.

## Configuration

Requires VPS settings in `~/.publish_to_web_config` or `.env`:
- `VPS_USER`: SSH username
- `VPS_HOST`: Server hostname/IP
- `VPS_PATH`: Remote directory (e.g., /var/www/landing-pages)
- `PUBLIC_URL`: Publicly accessible base URL

## Usage

- **Basic**: `publish_me <file.md>`
- **Custom Slug**: `publish_me --slug "my-post" <file.md>`
- **Specific Template**: `publish_me --template mack-books <file.md>`
- **Direct HTML**: `publish_me --direct <file.html>` (Publishes raw HTML exactly as provided, bypassing all typography and template processing. Ideal for pre-rendered pages).
- **All Templates**: `publish_me --all-templates <file.md>` (Generates a multi-tab view with all available templates at once).

## Available Templates

- `fitzcarraldo` - Classic literary style
- `mack-books` - Minimalist art book
- `standards-manual` - Design documentation style
- `folio-society` - Ornate typography
- `the-new-york-times` - Classic newspaper style
- `the-new-yorker` - Magazine-style layout (default)
- `steidl` - Modern editorial style

Run `publish_me --help` to see all available templates and options.

## When to Use

- When the user wants to "share this online", "publish a report", or "create a webpage".
- To provide a better reading experience than raw text/markdown in the terminal.
- For polished, typography-rich HTML output with global accessibility.

## Output Schema

The tool returns a JSON object. **Always extract and display the URL to the user.**

```json
{
  "status": "success",
  "slug": "article-name",
  "template": "the-new-yorker",
  "url": "http://212.28.182.235:8080/slug/slug-manuscript.html",
  "vps": {
    "host": "212.28.182.235",
    "path": "/var/www/landing-pages/slug"
  },
  "local_file": "/path/to/output/file.html"
}
```

## Notes

- Publishes to VPS at the configured path; ensure SSH credentials (keys) are set up.
- Automatically regenerates the publication index at the base URL.
- Generated files are also saved locally in `~/TOOLS/publish_to_web/output/`.
- Custom slugs create nested directory structures.
- Use `--verbose` for detailed debugging information.

## Troubleshooting

- **SSH fails**: Check VPS credentials in `~/.publish_to_web_config`. Ensure `ssh` access to the host works without a password.
- **Template error**: Verify the template name exists by running `publish_me --help`.
- **Permission denied**: Ensure the remote directory on the VPS has correct write permissions for the `VPS_USER`.