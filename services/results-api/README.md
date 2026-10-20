# results-api — Privacy, API & Compliance

Owner: Shubham. Part of the Vote Counting & Tabulation subsystem. It publishes results that `services/vote-integrity` has already verified.

| Req | What it does | Where |
|---|---|---|
| SR-11 | Public results are withheld until `RESULTS_RELEASE_AT` (403 before). Three scopes: public, privileged JWT, and registered client. Per-IP and per-client rate limits return 429. Every result's SHA-256 hash is re-checked before it is published. | `src/app.ts`, `src/views.ts`, `src/resultsSource.ts` |
| SR-13 | TLS terminates at a Caddy reverse proxy, and the services listen on 127.0.0.1 only | `docs/SR-13-tls.md`, `deploy/Caddyfile` |
| SR-18 | zod schemas on every route (query, params, headers, body, and the upstream response). Unknown fields get 400, bad JSON gets 400, oversized bodies get 413, and errors never echo input. | `src/validation.ts` |
| SR-20 | API client contact emails are encrypted with AES-256-GCM. API keys are stored as SHA-256 hashes only. Data minimisation review. | `src/crypto/fieldEncryption.ts`, `src/clients.ts`, `docs/SR-20-privacy-review.md` |
| SR-05 | Email and domain protection (SPF, DKIM, DMARC, MTA-STS, monitoring) | `docs/SR-05-email-domain-protection.md` |

## Run

```bash
npm ci
npm test
```

Create `.env` in this folder:

```
JWT_SIGNING_KEY=<same value as vote-integrity's>
RESULTS_RELEASE_AT=2026-10-23T18:00:00+11:00
DATA_ENCRYPTION_KEY=<64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
VOTE_INTEGRITY_URL=http://127.0.0.1:4002
```

Then run `npm run dev`. The service serves on 127.0.0.1:4003 and refuses to start if a secret or the release time is missing.

## API

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/public/results` | anyone | 403 before release. Afterwards: winner, final tallies, hashes. 60 requests/min per IP. |
| GET | `/results/full` | JWT: delegate, auditor, admin | Full round-by-round results, also before release (marked EMBARGOED) |
| GET | `/results/feed` | `X-API-Key` of a registered client | Full results, after release only. 120 requests/min per client. |
| POST | `/admin/api-clients` | JWT: admin | `{name, organisation, contactEmail}`. Returns the API key once. |
| GET | `/admin/api-clients` | JWT: admin | Lists clients with decrypted emails |
| DELETE | `/admin/api-clients/:id` | JWT: admin | Revokes a key |
