# Secure-Software-Systems-Assignment-III
Electronic Voting Platform — Vote Counting & Tabulation Subsystem
A secure prototype of the vote counting and results-tabulation backend of an Electronic Voting Platform, built as a group project applying secure-SDLC practice (requirements analysis → trade-off analysis → implementation → testing → CI/CD) in combination with an agile workflow.

Why this subsystem

The Electronic Voting Platform spans two subsystems (per the Assignment One threat model): the voter-facing online voting client, and vote counting & results tabulation. This group is implementing the latter — ballot ingestion, counting, the delegate/recount console, the audit log, and results publication — not voter login or ballot casting. Requirements that belong to the voting client (e.g. voter MFA, cast-as-intended return codes) are still documented and prioritised in Part One/Two of the report for completeness, but are out of this repo's implementation scope.

Scope & simplifications

Three deliberate, disclosed simplifications were made to fit a 5-person team and a short timeframe — see the report for full justification:

Ballot anonymisation (SR-03): a single randomising shuffle stands in for a full re-encryption mixnet with zero-knowledge shuffle proofs.
Counting algorithm (SR-10): House-of-Representatives-style instant-runoff counting is the primary engine; full multi-seat Senate STV (quota/surplus transfer) is a stretch goal.
Network segmentation (SR-12): represented as separate services with a controlled access path (an admin gateway), not real VLANs/physical segmentation.  


