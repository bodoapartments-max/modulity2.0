## Multi-Agent Handoff / Repository Continuity

This repository may be developed by different coding agents over time. The repository and its canonical documentation are the project memory. Maintained by all coding agents; never owned by one.

## Fresh Agent Continuation Test

A capable coding Agent with zero conversation history must be able to:

1. identify the currently verified baseline and the active milestone;
2. understand the product's core architecture and non-negotiable invariants;
3. locate canonical Engines/Services/Identities;
4. understand trusted boundaries and prohibited patterns;
5. locate Known Gaps with their plan/placement;
6. locate all ADRs and know which are superseded;
7. distinguish verified implementation/contribution path from future architecture;
8. run the canonical test suites (`npm test`, `node --test functions/src/*Engine.test.js`, `npm run test:rules`, `npm run build`, live E2E where relevant);
9. continue safely from repository evidence alone.

If any of these fail, the milestone documentation/handoff is incomplete: this is a blocking gap.

## Development Continuity Contract

Every coding Agent must behave as if seen by fresh eyes every time:

1. identify the repo; 2. identify the branch; 3. confirm the expected starting SHA; 4. confirm a clean tree (never reset/stash unknown work);
5. read the governance chain in order; 6. audit the repository before changing; 7. preserve verified architecture;
8. search canonical implementation first; 9. never bypass trusted boundaries; 10. do not refactor when no milestone requires it;
11. always run the relevant tests; 12. accurately label verification level (AUTOMATED VERIFIED / LIVE DEV VERIFIED / MANUALLY VERIFIED / NOT VERIFIED);
13. update docs/gaps/roadmap on real architecture change; 14. leave a final SHA and clean hand-off.

Repository evidence wins over assumptions or self-declared history.

## Multi-Agent Development Protocol

Uncontrolled concurrent edits across agents are prohibited. Valid patterns:

| Pattern | Rule |
|---|---|
| A | Implementation first, independent review (fresh agent) afterwards |
| B | Milestone closure → handoff at next milestone |
| C | explicit scope separation per file/feature (disjoint scopes only, ownership declared up front) |

## Reviewer Role

Reviews may be done by Agents too. Reviewers do not rewrite verified architecture out of personal preference. Permission to change requires evidence: milestone requirement, reproducible defect, security issue, invariant break, or documented architecture blocker.

### Non-negotiable rules

- Do NOT redesign or replace existing verified architecture merely because you would have implemented it differently.
- Repository evidence (docs, ADRs, tests, changelog) wins over agent preference.
- Do not silently introduce competing identity models, permission systems, repositories, command systems, notification systems, audit systems, caches, renderers, record/entity abstractions, organization models, or capability architectures.
- Change existing architecture ONLY when: (1) the milestone explicitly requires it; (2) a reproducible defect requires correction; (3) a security/integrity problem requires correction; or (4) repository evidence demonstrates violation of canonical Modulity architecture.
- Preserve these invariants: `MODULE != FORM != RECORD != ENTITY`; `USER != PERSON != EMPLOYEE != MEMBERSHIP != ROLE != POSITION != PERMISSION != MODULE ACCESS != GROUP != ASSIGNMENT != CONTACT`; `RECORD != CONVERSATION != MESSAGE`; `GROUP != CHAT CHANNEL`; `UI visibility != authorization`; `presentation cache != canonical data`; `AI/Agent != trusted authority`.

### Start-of-task checklist

1. Confirm branch = `main`, correct repository, clean working tree, and the required starting SHA from the milestone request.
2. Read: `AGENTS.md`, `DEVELOPMENT_RULES.md`, `MODULITY_MASTER_ROADMAP.md`, `KNOWN_GAPS_REGISTER.md`, `CHANGELOG.md`, and the relevant ADRs/architecture docs before writing any code.
3. Audit (read-only) the existing implementation first. Do not assume; check.
4. Preserve verified architecture. Where an equivalence exists between old and new (e.g. user vs person), do NOT introduce a parallel mechanism unless a milestone explicitly queues one.
5. Do not regress the current milestone invariants. Always run the repository's full test suite and rules-emulator suite before and after.

### Steps after implementing a change

1. Run unit/UI tests (`npm test`), functions tests (`node --test functions/src/*Engine.test.js`), rules/emulator tests (`npm run test:rules`), build (`npm run build`), and relevant live E2E.
2. Record any new Known Gaps in `docs/KNOWN_GAPS_REGISTER.md`.
3. Update roadmap + doc references where the milestone's step status changes.
4. Commit only when the tree is clean and all suites pass.

Failure to honor these makes the system drift — and every Modulity milestone must remain reviewable by the next agent without context.

## Repair & Control Gates (permanent rule)

After every five product milestones, a mandatory Repair & Control Gate (RC-01, RC-02, …) must run before the next product milestone starts. The next milestone is blocked until the gate passes. RC gates do not consume or renumber roadmap milestone numbers.

## Remote CI closure rule (permanent rule)

A product milestone or RC gate must never be called verified solely because local tests pass. Where an active remote CI pipeline exists, closure requires the canonical GitHub Actions workflow to be green for the final pushed SHA — all required jobs completed, none skipped because of an earlier failure. A local "tests passed" statement does not override a red remote run.

Verification split today:
- Remote CI (`.github/workflows/ci.yml`): lint, unit/UI tests, Functions unit tests (`node --test`), production build.
- Local/emulator-gated: `npm run test:rules` (Firestore Security Rules suite requires the Firestore Emulator toolchain; run locally before every milestone/RC closure).
