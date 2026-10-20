# SR-20 — Privacy Act 1988 compliance: data minimisation review

Owner: Shubham · Scope: Vote Counting & Tabulation subsystem (`services/vote-integrity`, `services/results-api`)

This review lists every field the subsystem stores, why it is needed, and how it is protected. The aim is the one in the Australian Privacy Principles (APPs): collect only what is needed (APP 3), use it only for that purpose (APP 6), keep it secure (APP 11.1), and destroy it when no longer needed (APP 11.2).

## 1. Personal information held

| Service | Table.field | Personal information? | Why it is needed | Protection |
|---|---|---|---|---|
| results-api | `api_clients.contact_email_enc` | **Yes**: a person's work email | Tell a registered outlet if its key is revoked or compromised | AES-256-GCM at rest, random IV, row id as AAD, key from secrets store |
| results-api | `api_clients.name`, `organisation` | No (business information) | Know who a key belongs to | Admin-only API, validated input |
| results-api | `api_clients.key_hash` | No | Recognise an API key | SHA-256 only; the key itself is never stored |
| results-api | `api_clients.created_at`, `revoked_at` | No | Key lifecycle | — |
| vote-integrity | `ballots.preferences` | No (anonymous by design) | Count the vote | No voter id, IP or timestamp stored; random UUID key; `WITHOUT ROWID` (SR-03) |
| vote-integrity | `consumed_tokens.token_hash` | No | Stop replays (SR-07) | SHA-256 only; no timestamp; not linked to the ballot |
| vote-integrity | `audit_log.actor` | Staff user id (pseudonymous) | Accountability for admin actions (SR-09) | Append-only, hash-chained; holds no voter data |
| vote-integrity | `count_results` | No | Verified result | Append-only |

## 2. Data deliberately **not** collected

- **Voter identity of any kind** in the tabulation subsystem. Voter authentication belongs to the voting client and stays there.
- **Arrival time or order of ballots.** It could be matched against when a voter voted.
- **Per-ballot audit entries.** These would recreate that ordered, timestamped record.
- **Phone numbers or addresses for API clients.** Email alone is enough to contact them, and the API rejects any extra field with 400 (SR-18).
- **IP addresses.** Rate limiting keeps counters in memory for one minute and writes nothing to disk.
- **Raw API keys and raw ballot tokens.** Only their hashes are stored.

## 3. APP mapping

| APP | How the subsystem meets it |
|---|---|
| APP 1 (open and transparent management) | This document, kept in the repository with the code |
| APP 3 (collection of solicited information) | Only the fields in §1; strict schemas reject anything else |
| APP 6 (use or disclosure) | Contact email is used only for key notices and is visible only to admins |
| APP 8 (cross-border disclosure) | No data is sent to overseas services; both services run on the same host |
| APP 11.1 (security) | Encryption at rest, hashing, RBAC, TLS in transit (SR-13), secrets outside code (SR-16) |
| APP 11.2 (destruction or de-identification) | See §4 |
| APP 12/13 (access and correction) | Admins can list and revoke a client's record on request |

## 4. Retention

- **API client records:** revoke when the client relationship ends, and delete the record 90 days after revocation, once any incident follow-up is complete. Deletion is an admin task and is not automated in the prototype.
- **Ballots and consumed tokens:** keep until the legal challenge period for the election has passed, then delete. The verified result and the audit log are kept as the public record.

## 5. Key management

- `DATA_ENCRYPTION_KEY` is 256 bits, generated with `crypto.randomBytes(32)`, and lives only in `.env` (git-ignored) or GitHub Actions secrets (SR-16). The service refuses to start without it.
- Stored values are prefixed `v1:`, so a future key rotation can re-encrypt records and switch the prefix to `v2:` without guessing which key a record used.
- Losing the key means the contact emails can't be recovered. That is acceptable, because clients can simply be re-registered.

## 6. Residual risks

- Anyone with both the database and `DATA_ENCRYPTION_KEY` can read contact emails. Mitigation: keep the key on a separate secrets store from the database backups (SR-12).
- The audit log's `actor` field identifies staff. This is accepted, because accountability for admin actions requires it.
