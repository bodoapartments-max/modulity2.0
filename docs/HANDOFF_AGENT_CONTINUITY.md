## Multi-Agent Handoff / Repository Continuity

This repository may be developed by different coding agents over time. The repository and its canonical documentation are the project memory.

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
