# Digital Library

A self-hosted web application to manage a personal book library. Stores each book as an individual JSON file — no database required.

> [!WARNING]
> This is a fully vibe-coded app with absolutely no guarantee for anything! The code has not been reviewed and it has not been extensively tested.

## Features

- **Add books** by title/author or ISBN with automatic metadata fetching
- **Barcode scanning** via smartphone camera (native BarcodeDetector API + zbar-wasm fallback)
- **Multi-source metadata** from OpenLibrary, Google Books, and Deutsche Nationalbibliothek (DNB)
- **Cover images** stored as base64 — click the cover preview in the edit modal to upload or take a photo, or auto-fetch from metadata sources
- **Batch import** from CSV, JSON, or plain text (one ISBN per line)
- **Multi-select operations** — select all, bulk delete, bulk set location
- **Gallery and table views** with search across all fields and location filtering
- **Custom fields** — add arbitrary fields (e.g., Genre, Rating) via settings
- **Keyboard shortcuts** for power users (see below)
- **ISBN-10 auto-fix** — automatically corrects check digits for scanned barcodes
- **Per-file JSON storage** — each book is a separate file, easy to backup, version, and migrate

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open http://localhost:3000
```

## Docker

```bash
# Build and run
docker build -t digital-library .
docker run -p 3000:3000 -v library-data:/app/data digital-library

# Or use docker-compose
docker compose up -d
```

The Docker image is also published to GitHub Container Registry on every push to main and on tagged releases:

```bash
docker pull ghcr.io/<owner>/digital-library:latest
docker pull ghcr.io/<owner>/digital-library:v1.0.0  # tagged release
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/books` | List books (query: `?q=search&field=title`) |
| `GET` | `/api/books/:id` | Get book by ID |
| `POST` | `/api/books` | Create book |
| `PUT` | `/api/books/:id` | Update book |
| `DELETE` | `/api/books/:id` | Delete book |
| `GET` | `/api/locations` | List distinct locations |
| `POST` | `/api/books/bulk-delete` | Delete multiple books `{ ids: [...] }` |
| `PUT` | `/api/books/bulk-update` | Update multiple books `{ ids: [...], update: {...} }` |
| `GET` | `/api/metadata/:isbn` | Fetch metadata for ISBN |
| `POST` | `/api/import` | Import file (multipart, field: `file`) |
| `POST` | `/api/upload-cover` | Upload cover image (multipart, field: `cover`) |
| `GET` | `/api/settings` | Get settings |
| `PUT` | `/api/settings` | Update settings |
| `POST` | `/api/clear` | Clear entire library |

## Data Format

Books are stored as individual JSON files in `data/books/{id}.json`:

```json
{
  "id": "uuid",
  "title": "Book Title",
  "authors": ["Author Name"],
  "isbn": "9780134685991",
  "cover": "data:image/jpeg;base64,...",
  "location": "shelf-A1",
  "notes": "",
  "publisher": "Publisher",
  "publishDate": "2020",
  "pages": 350,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

Settings are stored in `data/settings.json`.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Add new book |
| `E` | Edit focused book |
| `S` | Open barcode scanner |
| `/` or `F` | Focus search box |
| `?` | Show keyboard shortcuts help |
| `Ctrl+A` | Select all visible books |
| `Arrow keys` / `J`/`K` | Navigate through books |
| `Enter` | Open detail of focused book |
| `Space` | Toggle select focused book |
| `Delete` | Delete selected books |
| `Escape` | Close modal / clear selection |
| `Ctrl+Enter` | Save book (in modal) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `./data` | Directory for library.json storage |
| `ALLOWED_ORIGINS` | `*` (dev) | Comma-separated list of allowed CORS origins |
| `NODE_ENV` | `development` | Set to `production` for production mode, `test` to disable rate limiting |

## Development

```bash
# Run with auto-reload
npm run dev

# Run unit and API tests
npm test

# Run end-to-end tests
npm run ci:e2e
```

## Testing

- **Unit tests**: ISBN validation, metadata fetching, storage operations
- **API tests**: All REST endpoints, import, cover upload, bulk operations
- **E2E tests**: Cypress tests for full user workflows

```bash
npm test           # Jest unit + API tests
npm run ci:e2e     # Cypress end-to-end tests
```

## Security

See [SECURITY.md](SECURITY.md) for the full security audit report.

Key security features:
- Input sanitization with field whitelisting and prototype pollution prevention
- File upload validation (type, size)
- Rate limiting on API and metadata endpoints
- Security headers via Helmet.js (CSP, HSTS, X-Frame-Options, etc.)
- Strict ISBN validation to prevent SSRF
- Non-root Docker user

## CI/CD

GitHub Actions workflows:
- **CI** (`.github/workflows/ci.yml`): Runs unit tests on Node 18 & 20, then Cypress e2e tests
- **Docker** (`.github/workflows/docker-publish.yml`): Triggered automatically after CI passes on main (via `workflow_run`), or on version tags and manual dispatch. Builds multi-arch images and pushes to GHCR

### Creating a Release

Tag a version to trigger a tagged Docker image:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This creates Docker images tagged `v1.0.0`, `1.0`, `1`, and `latest`.

## License

[MIT](LICENSE)
