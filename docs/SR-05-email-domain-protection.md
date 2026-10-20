# SR-05 — Anti-phishing and domain protection

Owner: Shubham · Status: analysis only (recommended configuration, not deployed in the prototype)

**Threat.** Attackers send voters or election staff emails that look like they come from the election domain, or set up look-alike domains such as `e1ection.example.org` or `election-example.org`. They use these to steal staff credentials or spread false results and false voting instructions.

## 1. Email authentication (DNS records)

All examples use `example.org`. Replace it with the real domain, and the mail provider's include with your actual provider's.

| Record | Value | Purpose |
|---|---|---|
| SPF `example.org TXT` | `v=spf1 include:_spf.mailprovider.example -all` | Only the listed provider may send mail as the domain, and `-all` means hard fail for everyone else |
| DKIM `s2026._domainkey.example.org TXT` | `v=DKIM1; k=rsa; p=<2048-bit public key>` | Signs each message, so tampering and forgery can be detected. Rotate the selector yearly. |
| DMARC `_dmarc.example.org TXT` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; pct=100; rua=mailto:dmarc-reports@example.org` | Receivers reject mail that fails SPF/DKIM alignment, and send daily reports |
| MTA-STS `_mta-sts.example.org TXT` + policy file at `https://mta-sts.example.org/.well-known/mta-sts.txt` | `v=STSv1; id=2026102001` / `mode: enforce` | Mail sent to the domain must use verified TLS, which blocks downgrade attacks |
| TLS-RPT `_smtp._tls.example.org TXT` | `v=TLSRPTv1; rua=mailto:tls-reports@example.org` | Reports on TLS delivery failures |
| Non-sending subdomains | `v=spf1 -all` on each, covered by `sp=reject` | Stops attackers using `results.example.org` as a sender |

**DMARC rollout.** Start with `p=none` for two weeks and read the reports to find every legitimate sender. Move to `p=quarantine`, then to `p=reject` before the election period. Going straight to `reject` risks blocking real official mail.

## 2. Domain protection

- **DNSSEC** on the zone, so DNS answers can't be forged.
- **Registrar lock** (clientTransferProhibited, clientUpdateProhibited), with MFA required on the registrar account.
- **CAA record** `example.org CAA 0 issue "letsencrypt.org"`, so only the chosen certificate authority can issue certificates. This ties in with SR-13.
- **Defensive registrations** of the most obvious look-alikes: common typos, the hyphenated form, and the main TLD variants.

## 3. Monitoring

| What | Tool / method | How often | Action |
|---|---|---|---|
| Look-alike domains | `dnstwist example.org --registered` | Weekly; daily in the election period | Report to the registrar and hosting provider, request takedown, warn the public |
| Certificates issued for our name or look-alikes | Certificate Transparency logs (crt.sh search, or a CertStream alert) | Continuous | Any unexpected certificate for our domain is an incident (SR-22) |
| DMARC aggregate reports | A DMARC report viewer | Weekly | Investigate unknown senders |
| Phishing reports | A published `report-phishing@` address | As received | Triage and take down |

## 4. People and process

- Publish the list of official domains and sender addresses on the election website.
- Never ask voters or staff for passwords, codes or ballot tokens by email. Say so in every official email footer.
- Run phishing-awareness training for election staff before the election period, especially for staff with admin or delegate roles (SR-15).

## 5. Verification

```bash
dig +short TXT example.org | grep spf1
dig +short TXT _dmarc.example.org
dig +short TXT s2026._domainkey.example.org
dig +dnssec example.org SOA | grep -c RRSIG
dig +short CAA example.org
```

Send a test email to a mailbox and check that the headers show `spf=pass`, `dkim=pass` and `dmarc=pass`.

## 6. Why this is analysis-only in the prototype

These controls live in DNS and in the mail provider's settings, not in this repository's code. The prototype has no real domain or mail service to configure them on. This document is the configuration to apply when the system is deployed.
