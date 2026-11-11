# Lotuz — Coding Standards

## 1. General approach

Write readable, maintainable code. Favor small cohesive units, composition over inheritance and SOLID principles where useful. Avoid unnecessary abstractions, boilerplate, dependencies and premature optimization. Follow established code conventions rather than creating parallel patterns.

## 2. Backend package-by-feature structure

Organize the Spring Boot modular monolith by **business feature**, with internal layers as needed:

```text
com/uselotuz/
├── common/                # Small cross-cutting concerns only
├── identity/
├── business/
└── inventory/
    ├── controller/
    ├── dto/
    │   ├── request/
    │   └── response/
    ├── service/
    ├── repository/
    ├── entity/
    └── mapper/
```

Add folders/classes when used; do not create empty layers for every module. Avoid a single global controllers/services package for all domains. Keep cross-feature dependencies explicit and limited.

## 3. Java design patterns

- **Builder:** Prefer builders for complex construction or many optional fields; Lombok `@Builder` is permitted. Avoid builders for trivial objects.
- **DTO:** Separate request and response DTOs; never return JPA entities directly from REST endpoints. Prefer Java records for simple immutable DTOs; use Jakarta Bean Validation for input.
- **Mapper:** Use dedicated mappers; MapStruct or clear manual mapping is acceptable. Do not accidentally expose internal entity relationships.
- **Service:** Keep controllers thin; place business workflows and transaction boundaries in services. Use constructor injection; avoid field injection.
- **Repository:** Use Spring Data JPA; keep queries out of controllers and avoid unnecessary repository wrappers.
- Use interfaces when they provide a meaningful boundary, not automatically for every service.

## 4. APIs and errors

Use resource-oriented REST routes, appropriate HTTP status codes, pagination for large collections and consistent errors (prefer Spring `ProblemDetail`). Validate requests; never expose stack traces or internal implementation details to clients.

## 5. Persistence, transactions and tenant security

- Version schema changes with Flyway; do not rely on automatic schema updates in production.
- Use suitable constraints/indexes and avoid accidental eager loading or N+1 queries.
- Enforce tenant/business membership and permissions server-side; do not trust a supplied business ID without authorization.
- Keep inventory movements auditable; protect against inconsistent stock updates and duplicate imports.
- Do not log secrets/tokens. Validate upload type/size and handle files securely.

## 6. Frontend implementation

Use strict TypeScript and functional React components. Reuse shared components and API logic; follow `DESIGN_SYSTEM.md` for appearance and interaction. Apply appropriate form validation and accessible responsive behavior. Do not duplicate shared UI or introduce new styling systems without approval.

## 7. Testing and review

- Backend: JUnit 5, Mockito, Spring Boot Test; Testcontainers with PostgreSQL where valuable.
- Frontend: Vitest and React Testing Library; Playwright for critical end-to-end journeys.
- Test business rules, invalid input, transaction behavior, tenant isolation and important failure cases.
- During review, check correctness, security, database behavior, API contracts, error handling, test coverage and unnecessary complexity.
- Run relevant tests/builds where possible and report actual outcomes; identify checks that were not run.

## 8. Changes to conventions

Prefer consistency with existing modules. Propose meaningful deviations before implementing them and update this document only after the decision is accepted. AI workflow and approval rules are in `AGENTS.md`.
