# Security Audit Report

**Application:** Digital Library
**Date:** 2026-04-04
**Auditor:** Automated security review

## Scope

Full review of server-side (Node.js/Express) and client-side (vanilla JS) code covering OWASP Top 10, input validation, file uploads, external API calls, and infrastructure.

## Security Controls Implemented

### Input Validation & Sanitization
- **Book payloads** are sanitized through `sanitizeBookPayload()` which whitelists allowed fields, enforces type checks, and limits string lengths (server.js)
- **Settings payloads** are sanitized through `sanitizeSettingsPatch()` with field whitelisting and length limits
- **Prototype pollution** prevented by explicitly filtering `__proto__`, `constructor`, and `prototype` keys
- **ISBN validation** uses strict regex `^(?:\d{9}[\dXx]|\d{13})$` before any external API calls (lib/metadata.js)
- **Search queries** are truncated to 200 characters to prevent abuse

### File Upload Security
- **Cover uploads** restricted to image MIME types (JPEG, PNG, GIF, WebP) via multer fileFilter
- **File size limits**: 5MB for cover uploads, 10MB for import files
- **Import entries** capped at 10,000 rows to prevent memory exhaustion
- **Bulk operations** limited to 1,000 IDs per request

### API Security
- **Helmet.js** adds security headers: CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy
- **Rate limiting**: 300 requests/15min for general API, 20 requests/min for metadata fetching
- **CORS** configurable via `ALLOWED_ORIGINS` environment variable (defaults to permissive for development)
- **No-cache headers** on all API responses to prevent sensitive data caching
- **Error messages** sanitized — internal errors logged server-side, generic messages returned to clients

### Content Security Policy
```
default-src 'self';
script-src 'self' 'unsafe-eval';  (required for zbar-wasm barcode scanning)
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self';
object-src 'none';
frame-src 'none';
```

### External API Calls (SSRF Mitigation)
- ISBN is validated with strict regex before being used in URL construction
- Only three known API endpoints are called (OpenLibrary, Google Books, DNB)
- All external calls have 5-second timeouts
- Cover image downloads validate Content-Type headers and minimum size (>1KB)

### Docker Security
- Runs as non-root user (`appuser:appgroup`, UID/GID 1001)
- Production dependencies only (no devDependencies in image)
- Health check configured
- Data directory mounted as named volume

### Frontend Security
- All user-generated content rendered via `textContent` (not `innerHTML`) — prevents XSS
- Custom field names sanitized to alphanumeric + underscore only

## Accepted Risks

### No Authentication
This application is designed for personal/home use on trusted networks. No authentication is implemented by design. For internet-facing deployments, place behind a reverse proxy with authentication (e.g., Authelia, Traefik forward-auth, or cloud IAP).

### `unsafe-eval` in CSP
Required by the zbar-wasm barcode scanning library. This is scoped to `script-src` only and mitigated by the strict `default-src 'self'` policy.

### `unsafe-inline` in CSP styles
Used for minor inline styles in the settings modal. All dynamic content uses DOM APIs, not inline event handlers.

## Recommendations for Production Deployment

1. Set `ALLOWED_ORIGINS` environment variable to restrict CORS to your domain
2. Deploy behind a reverse proxy (nginx, Traefik) with TLS termination
3. Add authentication via reverse proxy if exposed to the internet
4. Use Docker named volumes or bind mounts for data persistence
5. Monitor application logs for unusual activity patterns
6. Keep Node.js and npm dependencies updated

## Dependency Audit

Run `npm audit` regularly to check for known vulnerabilities in dependencies. The CI pipeline runs tests on every push to ensure functionality remains intact.
