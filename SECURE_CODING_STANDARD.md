# Secure Coding Standard

Applies to all code in this repository (SR-14). Based on the OWASP Secure Coding Practices checklist, cut down to the rules that matter for the Vote Counting & Tabulation subsystem. Every pull request is reviewed against this list. Rules marked **[CI]** are also enforced automatically and will fail the build.

## Rules

1. **Validate input on the server.** Check type, length and allowed values for every request field; reject invalid input rather than trying to clean it. Client-side checks are for usability only. (SR-18)
2. **Parameterised queries only.** Never build SQL by joining strings with user-supplied or ballot data. Use SQLite placeholders (`?`) for every value.
3. **No dynamic code execution.** No `eval` or `new Function` **[CI]**, and no `child_process.exec` with any input that came from a request.
4. **Cryptographically secure randomness.** Anything security-relevant (ballot shuffling, tokens, IDs) uses Node's `crypto` module (`randomInt`, `randomBytes`, `randomUUID`), never `Math.random()`. (SR-03) **[CI]**
5. **No secrets in code.** Credentials, keys and tokens come from environment variables or GitHub Actions secrets. Add new variable names to `.env.example` with no value. (SR-16) **[CI]**
6. **Use vetted crypto libraries.** No home-made hashing or encryption. Use SHA-256 or stronger for the audit hash chain. (SR-09)
7. **Authorise every request on the server.** Deny by default; check the caller's role on each endpoint using the shared JWT middleware from `services/auth-access-control`, and always `jwt.verify`, never `jwt.decode`. (SR-15) **[CI]**
8. **Fail safely.** Clients get generic error messages; details go to the server log. Never log a ballot alongside anything that identifies a voter. (SR-20)
9. **Log security events.** Recounts, exclusions, failed logins, permission denials and result releases are written to the audit log. (SR-09, SR-19)
10. **Control dependencies.** Commit each service's `package-lock.json` and install with `npm ci`. Add packages only through the lockfile, and call out every new dependency in the PR description so the reviewer checks it.
11. **Test the security property.** Each security requirement ships with tests that try to break it (for example, "a tampered log entry breaks the hash chain"), not only tests that it works.

## Review process

- All changes reach `main` through a pull request; direct pushes are blocked.
- At least one approval from another team member is required. Changes to the counting engine, audit log and CI configuration also need approval from a code owner (see `.github/CODEOWNERS`).
- All CI checks (Secret scan, SAST, Unit tests) must pass before merging.
- The reviewer ticks the checklist in the pull request template. A rule that does not apply can be marked N/A, but not skipped.
