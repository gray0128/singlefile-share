# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SingleFile Share** is a web archiving sharing service built on Cloudflare's developer platform. It provides seamless webpage archival upload, management, and sharing experiences, specifically designed for the SingleFile browser extension.

## Common Commands

### Development

```bash
# Start local development server (runs on http://localhost:8787)
npm run dev

# Initialize local D1 database (first time only)
npm run db:local:init

# Install dependencies
npm install
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

### Database Operations

```bash
# Execute SQL on local database
wrangler d1 execute singlefile-share-db --local --file=./schema.sql

# Execute SQL on remote database
wrangler d1 execute singlefile-share-db --remote --file=./schema.sql
```

## High-Level Architecture

### Technology Stack

- **Runtime**: Cloudflare Workers (Serverless JavaScript)
- **Storage**: Cloudflare R2 (Object Storage for HTML files)
- **Database**: Cloudflare D1 (SQLite for metadata)
- **AI/Vector**: Cloudflare AI (text embeddings) + Vectorize (semantic search)
- **Frontend**: Native ES Modules (No-Build architecture)

### Key Architectural Decisions

#### 1. No-Build Frontend Architecture

The frontend uses a **no-build** approach with native ES Modules:

- **Entry**: `public/dashboard.html` and other HTML files
- **Modules**: All JS files in `public/js/` use `type="module"`
- **Import Maps**: Dependencies managed via `<script type="importmap">` in HTML
- **CSS**: Native CSS with variables, nesting, and container queries (no preprocessors)

Key files:
- `public/js/dashboard.js` - Main dashboard logic with masonry layout
- `public/js/utils.js` - Shared utilities (date formatting, clipboard, etc.)
- `public/css/theme.css` - Design tokens and component styles

#### 2. Backend Structure

The backend is a single Cloudflare Worker (`src/worker.js`) with modular helpers:

- **`src/worker.js`** - Main entry point with route handlers
- **`src/db.js`** - D1 database operations (D1Helper class)
- **`src/r2.js`** - R2 storage operations (R2Helper class)
- **`src/auth.js`** - GitHub OAuth and JWT session management
- **`src/cron.js`** - Scheduled task handler for file sync
- **`src/utils.js`** - Text extraction from HTML for search indexing
- **`src/markdown.js`** - Markdown rendering engine (GFM, Mermaid, syntax highlighting)

#### 3. File Storage and Sync Strategy

Files are stored in R2 with a specific key structure:
- **Format**: `files/{user_id}/{filename}.html`
- **Root files**: Files uploaded to root are auto-migrated to admin's directory via Cron

**Cron-driven sync flow** (every 1 minute):
1. Cron triggers `handleScheduled()` in `src/cron.js`
2. Lists R2 objects and compares with D1 `files` table
3. New files: Extract metadata (`<title>`, size) and insert to D1
4. Root files: Move to `files/{admin_id}/{uuid}.html`

#### 4. Search Architecture

The system supports three search modes:

1. **Vector Search (AI)**: Uses Cloudflare AI (bge-m3) to generate embeddings, stored in Vectorize
   - Triggered when `type=vector` (default)
   - Falls back to metadata search if vector search fails

2. **Full-Text Search**: Uses D1 FTS5 virtual table (`files_fts`)
   - Searches in `title`, `description`, and extracted `content`

3. **Metadata Search**: Direct SQL LIKE queries on `display_name`

#### 5. Markdown File Handling

The system supports Markdown (.md) file upload and rendering:

- **Upload**: Supports `.md` files up to 10MB (same as HTML files)
- **Create New**: Directly create new Markdown files from dashboard:
  - Click "New Markdown" button to create empty file
  - Auto-generated filename: `未命名-YYYY-MM-DD.md`
  - Initial display name: "未命名"
  - Auto-opens Editor.md editor
  - Auto-updates display name from `# H1` heading on save
- **Rendering**: `/raw/:share_id` endpoint automatically renders Markdown to HTML:
  - GFM (GitHub Flavored Markdown) support
  - Mermaid diagrams (flowcharts, sequence diagrams, etc.)
  - Syntax highlighting for code blocks
- **Download Mode**: Use `?download=1` query parameter to download raw Markdown content instead of rendered HTML
- **Styling**: Optimized CSS for word-break on links and preserved whitespace in code blocks
- **Editor**: Built-in Editor.md editor with dark theme, real-time preview, math formulas (LaTeX), code folding, and TOC support

#### 5.1 Markdown Editor API

- `GET /api/files/:id/content` - Get raw file content (for editor)
- `PUT /api/files/:id/content` - Update raw file content (editor save)
- `POST /api/files/create` - Create new empty Markdown file

#### 5.2 Editor Integration Guide

See [docs/editor-integration.md](./docs/editor-integration.md) for detailed documentation on Editor.md integration, including toolbar configuration, known issues, and troubleshooting.

#### 6. Frontend Layout: JS-Driven Masonry

The dashboard uses a JavaScript-driven masonry (瀑布流) layout:

- **Implementation**: `renderMasonry()` in `dashboard.js`
- **Strategy**: Flexbox columns with shortest-column-first distribution
- **Responsive**: Dynamic column count based on container width
  - `<600px`: 1 column
  - `<900px`: 2 columns
  - `<1400px`: 3 columns
  - `>=1400px`: 4 columns

### Security Considerations

- **R2 Bucket**: Private access only; all file access routed through Worker
- **Authentication**: GitHub OAuth + JWT sessions (HTTP-only cookies)
- **Content Isolation**: Shared files served via `/raw/:share_id` with CSP sandbox
- **Admin Authorization**: Admin routes check `role === 'admin'` in both UI and API

### Environment Variables

Key environment variables (configured in `wrangler.toml` or Cloudflare Dashboard):

- `JWT_SECRET` - JWT signing key
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub OAuth credentials
- `ADMIN_GITHUB_IDS` - Comma-separated GitHub usernames for admin access
- `DISPLAY_TIMEZONE` - Timezone for date display (default: `Asia/Shanghai`)

### Database Schema

Core tables (defined in `schema.sql`):

- `users` - User accounts (GitHub OAuth)
- `files` - File metadata (R2 key, size, title, etc.)
- `shares` - Share links (share_id, is_enabled, visit_count)
- `tags` / `file_tags` - Tagging system
- `files_fts` - FTS5 virtual table for search

### Working with the Code

When modifying this codebase:

1. **Frontend changes**: Edit files in `public/` directly; no build step needed
2. **Backend changes**: Edit files in `src/`; test with `npm run dev`
3. **Database changes**: Modify `schema.sql` and run the appropriate execute command
4. **New routes**: Add handlers in `src/worker.js` following the existing pattern
5. **Static assets**: Place in `public/` directory; served via `env.ASSETS.fetch()`

### Project Rules

The `.agent/rules/no-building.md` file contains critical frontend development rules:
- **ALWAYS** use native ES Modules with `type="module"`
- **ALWAYS** use Import Maps for dependency management (no bare imports)
- **NEVER** use npm for runtime dependencies (dev tools only)
- **NEVER** generate build scripts or use bundlers
- Prefer micro-libraries over large frameworks
- Use modern CSS features (variables, nesting, container queries) without preprocessors

## 相关文档更新

当用户说更新相关文档时，需要判断以下文档是否需要更新
- README.md
- CLAUDE.md
- 技术设计.md
- 需求说明.md
