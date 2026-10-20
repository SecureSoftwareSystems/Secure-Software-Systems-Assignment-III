# SR-13 — TLS on all endpoints

Owner: Shubham · Status: implemented as deployment configuration (`deploy/Caddyfile`) plus service settings

## Approach

TLS is terminated at a **reverse proxy (Caddy v2)** in front of the services, not inside the Node code. One place to manage certificates and protocol settings is easier to get right than five separate TLS setups, and it keeps private keys out of the application processes.

```
Internet ──HTTPS (TLS 1.2/1.3)──▶ Caddy :443 ──HTTP on loopback only──▶ results-api      127.0.0.1:4003
                                       │                               vote-integrity   127.0.0.1:4002
             http:// ──308 redirect────┘                               auth-access-ctrl 127.0.0.1:4001
```

## What the configuration enforces

| Control | How |
|---|---|
| Encryption in transit on every public endpoint | Caddy serves only HTTPS and redirects HTTP to HTTPS (308) automatically |
| Modern protocols only | `protocols tls1.2 tls1.3`, so SSLv3, TLS 1.0 and TLS 1.1 are refused. Caddy's default cipher suites are ECDHE key exchange with AEAD ciphers only, which gives forward secrecy. |
| Certificates | Obtained and renewed automatically via ACME (Let's Encrypt), so there are no manual renewals to forget |
| HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains`, so browsers refuse plain HTTP to the domain for a year |
| No bypass | Every Node service calls `app.listen(port, '127.0.0.1')`, so it can't be reached from the network except through the proxy |
| Correct client IPs | results-api runs with `TRUST_PROXY=1`, so rate limiting (SR-11) uses the real client address from Caddy, not the proxy's. With `TRUST_PROXY=0`, spoofed `X-Forwarded-For` headers are ignored (there is a test for this). |
| Staff console separated | `console.example.org` only accepts the election office network range and returns 403 for everyone else |
| Header hardening | `nosniff`, `no-referrer`, `X-Frame-Options: DENY`, and the `Server` header removed |

## Service-to-service traffic

results-api calls vote-integrity over `http://127.0.0.1:4002`. That traffic never leaves the host, so plain HTTP on the loopback interface is acceptable here. If the services were split across hosts, each call should go through mutual TLS, using Caddy's `reverse_proxy` with `transport http { tls_client_auth ... }` or a service mesh. This is recorded as a deployment requirement.

## Running it locally

```bash
caddy run --config deploy/Caddyfile        # needs DNS for the real domains
```

For a local demo without a domain, use Caddy's internal CA instead:

```
localhost {
	tls internal
	reverse_proxy 127.0.0.1:4003
}
```

Then run `curl -k https://localhost/public/results`. The `-k` flag is needed because the local CA isn't trusted by default.

## How to verify

```bash
curl -sI http://results.example.org/public/results         # expect 308 to https://
curl -sI https://results.example.org/public/results | grep -i strict-transport
nmap --script ssl-enum-ciphers -p 443 results.example.org   # expect only TLSv1.2 / TLSv1.3, grade A
openssl s_client -connect results.example.org:443 -tls1_1   # expect handshake failure
```

An online test such as the SSL Labs server test should give an **A** grade.

## Alternative considered: Nginx

Nginx can do the same job, using `ssl_protocols TLSv1.2 TLSv1.3;`, a `return 301 https://...` server block, `add_header Strict-Transport-Security ...`, and certbot for certificates. Caddy was chosen because certificate issuance, renewal and the HTTP-to-HTTPS redirect are automatic, so there is less configuration to get wrong.
