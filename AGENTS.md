# UseLotuz — Codex and AI Agent Instructions

## Before changing code

1. Read `README.md` and the documentation relevant to the task:
   - `docs/ARCHITECTURE.md` — architecture, technologies, hosting, integration boundaries
   - `docs/DESIGN_SYSTEM.md` — visual conventions and shared UI behavior
   - `docs/CODING_STANDARDS.md` — implementation patterns, quality and testing
   - `docs/PRODUCT_ROADMAP.md` — product scope, priority and deferred features
2. Inspect the existing code and configuration. Implemented code/configuration is authoritative for current behavior; flag conflicts with the docs rather than silently choosing one.
3. If a necessary decision is marked TBD, ask before committing to an irreversible choice.

## Scope and workflow

- Implement only the requested task. Do not scaffold future SaaS products or add unrequested features.
- For significant changes, first propose a concise plan and affected files; wait for approval when the user requests it or when architecture, hosting, dependencies or security boundaries would materially change.
- Reuse existing components, modules and patterns; avoid introducing new libraries without justification.
- Keep changes small and reviewable. Update relevant documentation when an approved decision changes.
- Never commit secrets, credentials or real `.env` files. Never deploy or modify production infrastructure without explicit approval.
- Run relevant builds, tests and checks when possible. State exactly what ran, what passed or failed, and what could not be run; do not claim unexecuted checks passed.
- Treat authentication, tenant isolation, cross-product sharing and data migrations as security-sensitive changes requiring careful review.

## Output after work

Summarize files changed, key design choices, tests executed/results, and any open questions or risks.
