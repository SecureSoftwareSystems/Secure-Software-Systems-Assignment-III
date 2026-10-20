## What this changes

<!-- One or two sentences. Link the issue: Closes #NN -->

Requirement(s): SR-

## Security checklist (SECURE_CODING_STANDARD.md)

Author ticks before requesting review; reviewer re-checks. Mark N/A with a reason if a rule does not apply.

- [ ] 1. Server-side input validation on new or changed inputs
- [ ] 2. Parameterised queries only
- [ ] 3. No eval / exec / shell=True
- [ ] 4. Secure randomness for anything security-relevant
- [ ] 5. No secrets in code; new variables added to `.env.example`
- [ ] 6. Vetted crypto libraries only
- [ ] 7. Server-side authorisation on every new endpoint
- [ ] 8. Generic client errors; no ballot + voter identity in logs
- [ ] 9. Security events written to the audit log
- [ ] 10. New dependencies listed below
- [ ] 11. Tests that try to break the security property

New dependencies:

## How it was tested

