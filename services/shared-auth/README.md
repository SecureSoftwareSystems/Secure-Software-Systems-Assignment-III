# shared-auth: one auth middleware for every service

Owner: Rita (SR-15 RBAC, SR-17 session expiry). It's used by `auth-access-control`, `vote-integrity`, `results-api` and `availability-resilience`.

## Token contract

`auth-access-control` issues tokens at `POST /auth/login`. Every service accepts the same tokens:

| | |
|---|---|
| Algorithm | HS256 only (pinned, so a token can't choose `none`) |
| Key | `JWT_SIGNING_KEY`, the **same value in every service's `.env`**, at least 32 characters. There's no default; the services refuse to start without it. |
| Expiry | 15 minutes (SR-17) |
| Claims | `sub` (user id), `role` (`admin` \| `delegate` \| `auditor`), `username` |

## Use in a service

Import it by relative path, the way `availability-resilience` already imports `rbac.ts`. There's nothing to install, because this package has no runtime dependencies, and each service passes in its own `jsonwebtoken`.

```ts
import jwt from 'jsonwebtoken';
import { createAuth, actorOf } from '../../shared-auth';

const { authenticate, requireRole } = createAuth({ jwt, signingKey: process.env.JWT_SIGNING_KEY });

app.post('/count', authenticate, requireRole('delegate', 'admin'), (req, res) => {
  audit.append(actorOf(req.user), 'COUNT_STARTED');
});
```

- **Not signed in, or a bad, expired or forged token:** 401.
- **Wrong role:** 403.
- **A misspelt role in `requireRole(...)`:** throws at startup.

## Front end (Vite proxy)

The console logs in once and sends the same `Authorization: Bearer <token>` to every service. Give each service its own prefix so paths don't clash, because both `vote-integrity` and `results-api` have `/results/...` routes:

```ts
server: {
  proxy: {
    '/auth': 'http://localhost:3000',
    '/exclusions': 'http://localhost:3000',
    '/api/integrity': { target: 'http://127.0.0.1:4002', rewrite: (p) => p.replace(/^\/api\/integrity/, '') },
    '/api/results':   { target: 'http://127.0.0.1:4003', rewrite: (p) => p.replace(/^\/api\/results/, '') },
  },
},
```

Examples: `fetch('/api/integrity/count', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })` and `fetch('/api/results/public/results')`.

## Tests

`npm test` runs Node's built-in test runner. The tests cover valid login tokens, expiry, wrong key, `alg: none`, unknown role, 401 vs 403, and failing closed without a key.
