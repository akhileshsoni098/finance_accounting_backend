# MongoDB Schema Design

The initial persistence boundary follows the accounting invariants in `Readme.md`.

## Models

- `Tenant`: organization configuration, base currency, fiscal year, modules, and approval threshold.
- `Entity`: tenant-owned legal or operating entity. Each entity has its own chart of accounts and ledger.
- `Account`: entity chart-of-accounts record. `isTrust` keeps premium trust accounts identifiable from operating accounts.
- `FiscalPeriod`: entity period with `future`, `open`, `closed`, or `locked` status.
- `JournalEntry`: immutable ledger header with embedded `lines`. Embedded lines keep balance validation and posting atomic.
- `AccountingEvent`: idempotent domain-event record that links source documents to generated journal entries.
- `ApprovalRequest`: ordered approval steps for threshold-controlled financial writes.
- `AuditLog`: append-only actor, request, source-module, before/after, and correlation record.

## Conventions

- All tenant-owned documents carry `tenantId`; ledger documents also carry `entityId`.
- Persisted money uses integer minor units and a three-letter ISO currency code.
- Compound indexes begin with `tenantId` to support tenant-scoped queries.
- Unique keys are tenant-scoped, including entity codes, account codes, event idempotency keys, and entry numbers.
- Mongoose validation checks local shape and balance. Services must check cross-document ownership, period status, approval rules, and MongoDB transaction boundaries.
- Posted journal entries and audit logs must be changed through reversing or compensating records, never destructive updates.

## Deferred Models

Users/RBAC, parties, policies, invoices, payments, bank reconciliation, commissions, tax, reinsurance, documents, webhooks, and outbox events should be added as their service workflows are implemented. References in journal lines use `ref` values now so those models can be introduced without changing the ledger contract.
