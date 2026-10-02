# Architecture Decision Records

This directory is the home for future Modulity 2.0 Architecture Decision Records (ADRs).

Use an ADR for a major, durable, or difficult-to-reverse decision that changes platform boundaries, canonical data ownership, trust/security guarantees, public contracts, migration strategy, or a foundational technology choice.

Suggested naming:

```text
ADR-0001-short-decision-title.md
ADR-0002-short-decision-title.md
```

An ADR should state:

1. Status: proposed, accepted, superseded, or rejected.
2. Context and the problem being decided.
3. Relevant constraints and authoritative documents.
4. Considered options and trade-offs.
5. Decision and rationale.
6. Security, data, migration, operational, and compatibility consequences.
7. Superseded decisions or follow-up work.

Do not create ADRs for routine implementation details, reversible refactors, or decisions already fully governed by an existing authoritative contract. Do not retroactively invent ADRs merely to fill this directory.

If a request conflicts with `DEVELOPMENT_RULES.md` or an authoritative architecture document, stop and obtain an explicit decision before implementing the conflict. The resulting decision may be recorded here when it is architecturally significant.
