# Secure-Software-Systems-Assignment-III

Electronic Voting Platform — Vote Counting & Tabulation Subsystem

A secure prototype of the vote counting and results-tabulation backend of an Electronic Voting Platform, built as a group project applying secure-SDLC practice (requirements analysis → trade-off analysis → implementation → testing → CI/CD) in combination with an agile workflow.

Team
Name	Student ID	GitHub ID	Theme
Rita Sabu	S4233381	amritha-sabu	Authentication & Access Control
Siddhant Luthra	S4223690	uhghgh-907	Vote Integrity & Counting
Rosalyne Tran	S3926819	rosie1705	Availability & Resilience
Shubham Chauhan	S4227830	shubhamcahuahan	Privacy, API & Compliance
Dhruv Kathuria	S3993592	Dhruv-Kathuria	DevSecOps, Supply Chain & CI
Why this subsystem

The Electronic Voting Platform spans two subsystems (per the Assignment One threat model): the voter-facing online voting client, and vote counting & results tabulation. This group is implementing the latter — ballot ingestion, counting, the delegate/recount console, the audit log, and results publication — not voter login or ballot casting. Requirements that belong to the voting client (e.g. voter MFA, cast-as-intended return codes) are still documented and prioritised in Part One/Two of the report for completeness, but are out of this repo's implementation scope.

Scope & simplifications

Three deliberate, disclosed simplifications were made to fit a 5-person team and a short timeframe — see the report for full justification:

Ballot anonymisation (SR-03): a single randomising shuffle stands in for a full re-encryption mixnet with zero-knowledge shuffle proofs.
Counting algorithm (SR-10): House-of-Representatives-style instant-runoff counting is the primary engine; full multi-seat Senate STV (quota/surplus transfer) is a stretch goal.
Network segmentation (SR-12): represented as separate services with a controlled access path (an admin gateway), not real VLANs/physical segmentation.
Requirements & status

22 security requirements (SR-01 – SR-22) were selected and prioritised in Part One of the report, with candidate solutions and a cost-benefit analysis for each in Part Two. Full detail, including priority/complexity ratings and per-requirement justification, is in the written report; a summary by owner:

Owner	Requirements	Area
Rita	SR-01, SR-02, SR-08, SR-15, SR-17	Authentication & Access Control
Siddhant	SR-03, SR-07, SR-09, SR-10	Vote Integrity & Counting
Rosalyne	SR-04, SR-12, SR-19, SR-22	Availability & Resilience
Shubham	SR-05, SR-11, SR-13, SR-18, SR-20	Privacy, API & Compliance
Dhruv	SR-06, SR-14, SR-16, SR-21	DevSecOps, Supply Chain & CI

Each requirement is tracked as a GitHub Issue with its own acceptance criteria. SR-01 and SR-02 are analysis only (voting-client subsystem, out of this repo's build scope); the remaining requirements are implemented, partially implemented, or analysis-only as recorded against their Issue and in the report's contribution table.

Architecture

Four independent Node.js/TypeScript/Express services, each with its own SQLite database (better-sqlite3), sit behind a Caddy reverse proxy that terminates TLS (SR-13). Authentication and RBAC logic is implemented once, in services/shared-auth, and imported by all four services so there is a single source of truth for how a token is verified. A React/TypeScript/Vite admin console provides the GUI for the authentication & access control service. See the report's Technologies & Architecture section for the full diagram.

services/
  auth-access-control/   — login, RBAC, maker-checker, admin console frontend (Rita)
  vote-integrity/         — ballot anonymisation, replay protection, audit log, counting engines (Siddhant)
  results-api/            — results embargo/access tiers, TLS config, input validation, encryption at rest (Shubham)
  availability-resilience/— isolated tally store, backups, logging & alerting (Rosalyne)
  shared-auth/             — shared JWT verification + RBAC middleware used by all four services above
Getting started

Prerequisites: Node.js 22, npm.

Clone the repo and install each service's dependencies:
   git clone https://github.com/SecureSoftwareSystems/Secure-Software-Systems-Assignment-III.git
   cd Secure-Software-Systems-Assignment-III
   for d in services/*/; do (cd "$d" && npm install); done
   cd services/auth-access-control/frontend && npm install && cd ../../..
Generate local environment files (one shared JWT_SIGNING_KEY across all four services, plus each service's own additional secrets):
   node scripts/setup-local-env.js

Pass --keep-jwt on a later run to keep an existing signing key instead of generating a new one. 3. Run each service in its own terminal:

   cd services/auth-access-control && npm run dev   # http://localhost:3000
   cd services/vote-integrity && npm run dev        # http://localhost:4002
   cd services/results-api && npm run dev           # http://localhost:4003
   cd services/availability-resilience && npm run dev # http://localhost:4004
Run the admin console frontend (proxies /auth and /exclusions to the auth-access-control service on port 3000):
   cd services/auth-access-control/frontend && npm run dev

Local development runs over plain HTTP; TLS termination (SR-13) is a deployment-time concern handled by the Caddy reverse proxy, not something you need running locally.

Testing

Each service has its own Jest test suite covering its core security properties (RBAC, maker-checker self-approval, replay protection, hash-chain tamper detection, counting-engine comparator, encryption, input validation, and more):

cd services/<service-name> && npm test
CI/CD

Every pull request runs through .github/workflows/ci.yml:

service-tests — lockfile check, npm ci, npm audit --omit=dev --audit-level=high, build, and the Jest suite, for each service.
secret-scan — Gitleaks (pinned version, checksum-verified install, self-tested) scans the full git history for committed secrets.
sast — Semgrep runs in two passes: an informational report first, then a blocking pass that fails the build on ERROR-severity findings, including custom rules (e.g. banning non-cryptographic randomness in the ballot shuffle).
ci-passed — an aggregate required check that all of the above must pass before a PR can be merged.
Contributing
Read SECURE_CODING_STANDARD.md before opening a PR — every PR is checked against it.
Every PR requires at least one approval and a passing ci-passed check before it can be merged (branch protection).
Changes to sensitive paths (the counting engine, the audit log, and CI configuration) require review from the relevant CODEOWNERS.
Use the PR template checklist to confirm security-relevant changes have corresponding tests.
Further documentation

Detailed per-requirement analysis for items marked analysis-only is in docs/, including SR-05-email-domain-protection.md, SR-06-reproducible-builds.md, SR-13-tls.md, and SR-20-privacy-review.md. The full requirements list, solution trade-off analysis, architecture diagram, code walkthrough, and commit-history evidence are in the written assignment report submitted alongside this repository.
