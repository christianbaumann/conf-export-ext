# Project: Conf Export Ext

## Stack
- **Language:** Vanilla JavaScript (no frameworks)
- **Bundling:** JSZip — used to package exported files into a `.zip` download
- **Markdown conversion:** Turndown — converts HTML to Markdown
- **API:** Confluence REST API — source of page content and metadata

## Conventions
- No build step, no transpilation. Plain `.js` files loaded directly by the extension.
- Keep dependencies as vendored scripts in `vendor/` (loaded via `manifest.json`), not via npm.
