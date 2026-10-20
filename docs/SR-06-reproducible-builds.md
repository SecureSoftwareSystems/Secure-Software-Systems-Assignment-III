# SR-06 — Reproducible, signed builds

Owner: Dhruv · Status: analysis only (signing not implemented); reproducibility partly in place and verified, see below

## Threat

If the code that runs differs from the code that was reviewed, every other control is bypassed. That can happen through a dependency silently changing between installs, a compromised build tool, or a tampered artifact on its way to a server. For a counting system deployed to up to 40,000 terminals, one bad build would reach every terminal at once.

## What the prototype already does

| Control | How | Where |
|---|---|---|
| Dependencies pinned | Every service commits `package-lock.json`, which records the exact version and integrity hash of every package, including indirect ones | `services/*/package-lock.json` |
| Exact installs only | CI installs with `npm ci`, which uses the lockfile as-is and fails if it disagrees with `package.json`. A plain `npm install` could pick newer versions | `.github/workflows/CI.yml` |
| Missing lockfile blocks the build | CI fails any service without a committed lockfile before installing anything | `.github/workflows/CI.yml` |
| Known-vulnerable dependencies block merges | `npm audit` fails the build on high or critical issues in production dependencies | `.github/workflows/CI.yml` |
| Security tools pinned | Gitleaks 8.18.4 (downloaded file checked against its published SHA-256 checksum), Semgrep 1.85.0, setuptools 80.10.2 | `.github/workflows/CI.yml` |
| Exact versions in two services | results-api and vote-integrity list exact versions in `package.json`, not ranges | `services/*/package.json` |

## Verification: are builds actually reproducible?

`scripts/verify-reproducible-build.sh <service>` copies a service into two clean directories, runs `npm ci` and `npm run build` in each, and compares a SHA-256 hash of every output file.

Result on the current code (same machine, Node 22):

| Service | Output files | Result |
|---|---|---|
| auth-access-control | 36 | Byte-identical |
| results-api | 10 | Byte-identical |
| vote-integrity | 6 | Byte-identical |

This shows the build is deterministic given the same inputs. It does not yet show that two *different* machines produce the same output; that would need the check run in CI and on a developer machine, then the hashes compared.

## Gaps

| Gap | Risk | Fix |
|---|---|---|
| GitHub Actions pinned to version tags (`@v4`), not commit SHAs | A tag can be moved to different code by whoever controls that action | Pin each `uses:` to a full commit SHA, with Dependabot proposing updates |
| CI uses Node `22`, not an exact version | Different Node 22.x releases could produce different builds | Pin the exact version, e.g. `22.13.1`, matching `engines` in `package.json` |
| auth-access-control uses version ranges (`^`) in `package.json` | Safe in CI because of `npm ci`, but a local `npm install` can drift from the lockfile | Switch to exact versions as the other two services do |
| No signed artifacts or build provenance | Nothing proves a deployed build came from this repository's CI | Production design below |

## Production design (not implemented)

1. **Keyless build attestations.** CI signs each release build using GitHub artifact attestations (built on Sigstore). The signature is tied to the workflow and commit that produced the build, so there is no long-lived signing key to steal.
2. **Verify before deploy.** The deployment step runs `gh attestation verify` on the artifact and refuses anything not built by this repository's CI from `master`.
3. **Pin everything by hash.** Actions pinned by commit SHA, container base images pinned by digest, and Node pinned to an exact release.
4. **Cross-machine reproducibility check.** Run `verify-reproducible-build.sh` in CI on every release and compare against a developer build, so tampering in either environment shows up as a mismatch.

Signing was left out of the prototype because the prototype is never deployed, so there is nothing to verify a signature against. The reasoning and the alternatives considered (pinning only, GPG-signed releases, cosign) are in the Part Two analysis for SR-06.
