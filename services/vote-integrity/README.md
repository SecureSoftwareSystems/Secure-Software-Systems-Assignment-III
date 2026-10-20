# vote-integrity — Vote Integrity & Counting

Owner: Sidhant (SR-10 paired with Dhruv). Part of the Vote Counting & Tabulation subsystem.

| Req | What it does | Where |
|---|---|---|
| SR-03 | Ballots are stripped to their preferences and shuffled with Fisher-Yates + `crypto.randomInt` before counting. Storage keeps no arrival order (random UUID key, `WITHOUT ROWID`, no timestamps). | `src/shuffle/shuffle.ts`, `src/ballots.ts` |
| SR-07 | Each ballot's one-time token is burned in the same transaction that stores the ballot. `consumed_tokens` has a PRIMARY KEY on SHA-256(token), so a replay gets 409. | `src/tokens/replayGuard.ts` |
| SR-09 | Append-only audit log: hash = SHA-256(prev_hash ‖ entry). Triggers block UPDATE/DELETE, `verifyChain()` finds the first altered entry, and HMAC-signed checkpoints catch a full rewrite. | `src/audit/auditLog.ts` |
| SR-10 | Two independently written IRV engines (recount-from-scratch vs ballot-pile transfers) plus a comparator that checks every round. Any disagreement halts the count and is logged. | `src/counting/` |

## Run

```bash
npm ci
cp ../../.env.example .env        # then set JWT_SIGNING_KEY and AUDIT_LOG_HMAC_KEY (32+ chars each)
npm test                          # Jest security tests
npm run dev                       # builds, then serves on 127.0.0.1:4002
npm run demo                      # in a second terminal: synthetic ballot feed + full walkthrough
```

The service refuses to start if either secret is missing or shorter than 32 characters.

## API

All routes except `/health` need `Authorization: Bearer <JWT>` (HS256, `role` = admin | delegate | auditor).

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/contest` | admin | Set candidates and open intake (once only) |
| GET | `/contest` | any | Contest status |
| POST | `/ballots` | admin (ballot feed) | Submit `{token, preferences}`. Returns 201, 400 if invalid, 409 if replayed |
| POST | `/contest/close` | admin | Stop accepting ballots |
| POST | `/count` | delegate, admin | Shuffle, count with both engines, compare. Returns 200 VERIFIED or 409 HALTED |
| GET | `/results/latest` | delegate, auditor, admin | Latest verified result + hashes |
| GET | `/audit` | auditor, admin | Audit entries (viewing is itself logged) |
| GET | `/audit/verify` | auditor, admin | Checks the chain. Returns 200 if valid, 409 with `firstInvalidSeq` if not |
| POST | `/audit/checkpoint` | admin | HMAC-signed head of the chain, for the isolated store (SR-12) |

## Design notes

- Accepted ballots are not logged one by one. A timestamped, ordered record of each ballot would undo SR-03.
- IRV tie-break: countback through earlier rounds, then exclude the candidate listed last (a deterministic stand-in for drawing lots).
- `src/auth.ts` is a stand-in until `services/auth-access-control` is merged. It should then import that middleware.
- Multi-seat STV is a stretch goal and isn't implemented yet.
