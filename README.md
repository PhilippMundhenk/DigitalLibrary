```markdown
# Digital Library

A simple web service to manage a digital book library. Book records are stored as individual JSON files on disk (no database).

Features
- Add books by author + title or by ISBN (auto-completes metadata from OpenLibrary/Google Books).
- Scan barcodes via smartphone camera (QuaggaJS).
- Batch import CSV or JSON files.
- Each book record has a location identifier.
- Edit any field on a book.
- Gallery view (covers), searchable across all fields, and filter by field (author, title, location).
- Table view showing configurable columns.
- All data stored as JSON files in `data/books/`.
- Deployable as Docker container.
- GitHub Actions workflow provided to build and push image to GitHub Container Registry (GHCR).

Run locally
1. Install dependencies:
   npm install

2. Start:
   npm start

3. Open http://localhost:3000

API (HTTP)
- GET /api/books                -> list books (query params: q=free-text, field=author|title|location)
- GET /api/books/:id            -> get book by id
- POST /api/books               -> create book (body JSON: { title, author, isbn, location, ... })
- PUT /api/books/:id            -> update book
- DELETE /api/books/:id         -> delete book
- POST /api/import              -> multipart upload (file field `file`) supports CSV or JSON

Data format
Each book is saved as a JSON file under data/books/<uuid>.json. Example fields:
{
  "id": "...",
  "title": "...",
  "authors": ["..."],
  "isbn": "978...",
  "cover": "https://...",
  "location": "shelf-A1",
  "notes": "...",
  "created_at": "...",
  "updated_at": "..."
}

Docker
Build:
  docker build -t digital-library:latest .

Run:
  docker run -p 3000:3000 -v $(pwd)/data:/usr/src/app/data digital-library:latest

GitHub Actions
See .github/workflows/docker-publish.yml for an example workflow that builds and pushes to GHCR.

Notes
- No authentication included by design.
- The app uses OpenLibrary first and falls back to Google Books when fetching metadata.
```