# Veridex Finance Backend

Node.js, Express.js, and MongoDB backend for the Veridex multi-tenant accounting and insurance operations platform.

This repository currently contains a browser prototype. The prototype is the functional reference for the backend: it demonstrates the workflows, accounting rules, roles, permissions, and business entities that the API must implement. The target backend must move financial state out of browser `localStorage` and Firebase demo data into MongoDB with authentication, tenant isolation, validation, approvals, audit history, and transactional posting.

## Product Scope

Veridex is not an ecommerce application. It is an accounting platform for insurance agencies, brokers, MGAs, carriers, reinsurers, insured organizations, and general businesses.

### Core modules

- General Ledger: chart of accounts, journal entries, dimensions, trial balance, financial statements, fiscal periods, and opening balances.
- Accounts Receivable: policyholder and customer invoices, receipts, partial payments, ageing, statements, collections, credit notes, and cash application.
- Accounts Payable: carrier settlements, broker commissions, tax liabilities, vendor bills, approval queues, ACH, wire, check, and e-check disbursements.
- Billing and invoicing: policy billing, recurring or milestone billing, debit notes, credit notes, and invoice numbering.
- Bank and cash management: operating and premium trust accounts, bank statement imports, matching, exceptions, and reconciliation approval.
- Accounting engine: business event to journal-entry rules. Domain modules must publish accounting events instead of writing directly to the ledger.
- Insurance operations: policy administration, MGA and carrier relationships, binding authority, premiums, claims, bordereaux, settlements, and commission overrides.
- Commission engine: producer and MGA schedules, tiered commission, statements, clawbacks, and payable creation.
- Tax and compliance: premium tax, surplus lines tax, stamping fees, statutory reports, filing periods, and filing evidence.
- Reinsurance: treaties, quota share, excess of loss, ceded premium, recoverables, ceding commission, and claims recovery.
- Reporting and planning: P&L, balance sheet, cash flow, trial balance, ageing, budgets, forecasts, and filtered dimensional reporting.
- Governance: RBAC, MFA-ready authentication, configurable approvals, period locking, documents, webhooks, and immutable audit trail.

## Reference Insurance Flow

The prototype models three supported billing and settlement models:

| Model                        | Cash flow                                                     | Backend requirement                                                                                                            |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| DBA / Agency Bill            | Insured -> Broker -> MGA -> Carrier                           | Create broker AR, broker commission, MGA payable, tax liability, carrier bordereau receivable, and settlement journals.        |
| DBM / Direct Bill to MGA     | Insured -> MGA -> Carrier, with broker commission paid by MGA | Create MGA AR, carrier payable, broker commission payable, tax liability, MGA revenue, and carrier settlement journals.        |
| DBC / Direct Bill to Carrier | Insured -> Carrier -> MGA -> Broker                           | Create carrier AR and premium reserve, carrier commission expense, MGA receipt and broker payable, then disbursement journals. |

The standard operational sequence is bordereau-first: the MGA submits production, the carrier ingests and posts the bordereau, the MGA settles the open carrier payable, and the carrier matches the incoming cash against its receivable. Cash-first processing may be supported later through a premium suspense account.

### Reference policy scenario

The existing prototype uses this scenario for demonstrations and verification. It is seed data only, not a production default:

- Insured: Ayushi (`INS-AYUSHI`)
- Broker: HIT (`ENT-AGY-01`)
- MGA: NTA (`ENT-MGA-01`)
- Carrier: Southlake Insurance Co. (`ENT-CAR-01`)
- Policy: `POL-V8NHT`, Commercial Trucking, Texas
- Gross invoiced premium: USD 39,260.00
- Broker commission: USD 2,500.00
- MGA program fee / override: USD 3,500.00
- Texas tax and fees: USD 3,503.00
- Net carrier settlement: USD 29,757.00

## Accounting Invariants

These rules are mandatory acceptance conditions for the backend:

1. Every journal entry must balance: total debits equal total credits to cent precision.
2. Posted journal entries are immutable. Corrections use reversing or adjusting entries; no destructive edits or deletes.
3. A journal entry dated in a locked or closed fiscal period cannot be posted.
4. Entries at or above the configured approval threshold require approval before posting. The prototype default threshold is USD 10,000.
5. Every posted entry belongs to exactly one tenant and legal entity, and every line uses an account from that entity's chart of accounts.
6. Money is stored as integer minor units (`amountMinor`) plus an ISO currency code. Do not use floating-point values for persisted accounting amounts.
7. Domain events must be idempotent. A retried invoice, payment, import, or settlement must not create duplicate journal entries.
8. Trust and operating bank accounts must remain separately identifiable and reconcilable.
9. A payment may be partially allocated, fully allocated, or unapplied. Unapplied cash must remain visible as a liability or suspense balance.
10. Audit records must capture actor, tenant, entity, action, before/after data or event details, timestamp, request ID, and source module.
11. Cross-entity transactions create linked entries with a shared correlation ID; each legal entity still maintains its own ledger.
12. Role permissions are checked on the server for every protected operation. UI visibility is not a security boundary.

## Recommended Project Structure

```text
finance-and-accounting/
├── package.json
├── package-lock.json
├── server.js
├── .env.example
├── .env                         # local only; never commit
├── .gitignore
├── README.md
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── db.js
│   │   ├── env.js
│   │   └── logger.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.routes.js
│   │   ├── tenant.routes.js
│   │   ├── user.routes.js
│   │   ├── entity.routes.js
│   │   ├── account.routes.js
│   │   ├── journal.routes.js
│   │   ├── period.routes.js
│   │   ├── invoice.routes.js
│   │   ├── payment.routes.js
│   │   ├── bank.routes.js
│   │   ├── policy.routes.js
│   │   ├── mga.routes.js
│   │   ├── bordereau.routes.js
│   │   ├── commission.routes.js
│   │   ├── tax.routes.js
│   │   ├── reinsurance.routes.js
│   │   ├── report.routes.js
│   │   ├── approval.routes.js
│   │   ├── document.routes.js
│   │   └── webhook.routes.js
│   ├── controllers/              # HTTP parsing and response mapping only
│   ├── services/                 # use cases and transaction orchestration
│   │   ├── accounting-event.service.js
│   │   ├── journal-posting.service.js
│   │   ├── reconciliation.service.js
│   │   └── reporting.service.js
│   ├── models/                   # Mongoose schemas and indexes
│   ├── repositories/             # database access and query composition
│   ├── validators/               # Zod/Joi request and domain validation
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── tenant.middleware.js
│   │   ├── permission.middleware.js
│   │   ├── validation.middleware.js
│   │   ├── error.middleware.js
│   │   ├── request-id.middleware.js
│   │   └── upload.middleware.js
│   ├── events/                   # domain events and outbox handlers
│   ├── integrations/
│   │   ├── payments/             # Razorpay, Stripe, ACH/wire provider adapters
│   │   ├── banking/              # bank feeds and statement adapters
│   │   ├── tax/                  # tax provider and filing adapters
│   │   ├── storage/              # S3-compatible document storage
│   │   └── notifications/        # email, webhook, and queue adapters
│   ├── constants/
│   ├── utils/
│   └── seed/
│       ├── coa.seed.js
│       ├── permissions.seed.js
│       └── demo-insurance.seed.js
├── tests/
│   ├── unit/
│   ├── integration/
│   └── accounting/
├── uploads/                      # local development only; use object storage in production
└── docs/                         # existing prototype documentation and API notes
```

The proposed `product`, `order`, and generic `payment` modules should not be copied from an ecommerce template. In this domain, `product` becomes policy, coverage, or service catalog; `order` becomes invoice, policy transaction, or settlement; and payments must be split into receivables, payables, bank transactions, allocations, and disbursements.

## MongoDB Data Model

Use Mongoose or the official MongoDB driver. Every tenant-owned document should include `tenantId`, timestamps, and an appropriate compound index.

### Identity and configuration

- `tenants`: legal organization, business type, base currency, fiscal year, enabled modules, enabled dimensions, and setup stage.
- `users`: identity, password hash or external identity ID, status, MFA metadata, tenant memberships, and last login.
- `roles` and `permissions`: module/action permissions such as `view`, `create`, `edit`, `approve`, `post`, and `admin`.
- `entities`: broker, MGA, carrier, reinsurer, insured, branch, and legal entity records.
- `auditLogs`: append-only security and business audit events.

### Accounting

- `accounts`: tenant/entity chart of accounts, code, name, account group, dimensions, active status, and parent account.
- `fiscalPeriods`: period dates, status (`future`, `open`, `closed`, `locked`), close checklist, and approver.
- `journalEntries`: header, source event, status (`draft`, `pending_approval`, `posted`, `rejected`, `reversed`), totals, correlation ID, and immutable lines.
- `journalEntryLines`: account, debit minor units, credit minor units, currency, dimensions, counterparty, policy, invoice, and description.
- `accountingEvents`: idempotency key, event type, source document, processing status, and generated journal IDs.
- `approvalRequests`: approval chain, threshold, assigned approvers, decisions, comments, and timestamps.

### Commerce and insurance operations

- `parties`: insureds, brokers, producers, MGAs, carriers, reinsurers, vendors, and tax authorities.
- `policies`, `coverages`, `policyTransactions`: bind, endorse, cancel, renew, premium, state, LOB, and billing model.
- `invoices`, `invoiceLines`, `creditMemos`, `debitMemos`: AR/AP documents and balances.
- `payments`, `paymentAllocations`, `disbursements`: receipts, outgoing payments, partial allocations, refunds, and settlement references.
- `commissionSchedules`, `commissionStatements`, `commissionTransactions`: producer and MGA commission calculation and payout state.
- `bordereaux`, `bordereauRows`, `bordereauIngestionRuns`: submitted production, validation results, carrier ingestion, and posting status.
- `claims`, `claimTransactions`: loss notices, reserves, payments, recoveries, and claim expense journals.
- `taxRules`, `taxTransactions`, `filings`: jurisdiction rules, premium taxes, stamping fees, returns, and evidence.
- `reinsuranceTreaties`, `cessions`, `recoverables`: treaty terms, cessions, payable balances, and claim recoveries.

### Treasury, reporting, and files

- `bankAccounts`, `bankStatements`, `bankTransactions`, `reconciliationMatches`, `reconciliationExceptions`.
- `budgets`, `forecasts`, and `reportDefinitions`.
- `documents` and `documentVersions` with object-storage keys and checksum metadata.
- `webhookSubscriptions`, `webhookDeliveries`, and `outboxEvents` for reliable integrations.

## API Requirements

Use versioned JSON APIs under `/api/v1`. Return a consistent shape:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "..." }
}
```

Errors should include `success: false`, a stable error code, a human-readable message, field errors when applicable, and the request ID.

### Required endpoint groups

| Group               | Examples                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/mfa/verify`                                                                                   |
| Tenant and users    | `GET /tenants/me`, `PATCH /tenants/me`, `GET /users`, `POST /users`, `PATCH /users/:id`, `PUT /users/:id/permissions`                                                                           |
| Accounting setup    | `GET/POST /entities`, `GET/POST /accounts`, `GET/PATCH /periods/:id`, `POST /periods/:id/close`                                                                                                 |
| Ledger              | `GET /journal-entries`, `POST /journal-entries`, `POST /journal-entries/:id/submit`, `POST /journal-entries/:id/approve`, `POST /journal-entries/:id/post`, `POST /journal-entries/:id/reverse` |
| AR/AP               | `GET/POST /invoices`, `POST /invoices/:id/issue`, `POST /payments`, `POST /payments/:id/allocate`, `POST /disbursements`                                                                        |
| Banking             | `GET/POST /bank-accounts`, `POST /bank-statements/import`, `POST /bank-transactions/:id/match`, `POST /reconciliations/:id/approve`                                                             |
| Insurance           | `GET/POST /policies`, `POST /policies/:id/bind`, `POST /policies/:id/endorse`, `GET/POST /mgas`, `POST /bordereaux`, `POST /bordereaux/:id/ingest`                                              |
| Commissions and tax | `GET/POST /commission-schedules`, `POST /commission-statements/calculate`, `GET/POST /tax-rules`, `POST /filings`                                                                               |
| Reinsurance         | `GET/POST /reinsurance-treaties`, `POST /cessions`, `POST /recoverables`                                                                                                                        |
| Reports             | `GET /reports/trial-balance`, `GET /reports/balance-sheet`, `GET /reports/income-statement`, `GET /reports/cash-flow`, `GET /reports/ar-aging`, `GET /reports/ap-aging`                         |
| Governance          | `GET /approvals`, `POST /approvals/:id/decide`, `GET /audit-logs`, `POST /documents`, `POST /webhooks/:provider`                                                                                |

All list endpoints need pagination, sorting, filters, tenant scoping, and a maximum page size. Write endpoints need validation and an idempotency key where retries can create financial state.

## Business Rules and Conditions

- Binding a policy validates insured, broker/MGA/carrier relationship, effective date, state, LOB, premium, billing model, and commission terms.
- Issuing an invoice creates an accounting event; the accounting engine creates the AR/AP and revenue/liability journals according to the billing model.
- Receiving money never automatically clears an invoice without an allocation decision. Exact matches may be suggested; the user or policy rule confirms them.
- Partial payments update paid-to-date and invoice status without losing the original receipt.
- A bank match must not exceed the bank transaction amount or the open balance of the target document.
- Bordereau ingestion validates duplicate policy rows, required fields, totals, jurisdiction, and commission arithmetic before creating carrier entries.
- Premium tax and stamping fees are liabilities, not revenue. Tax rules must be versioned by jurisdiction and effective date.
- A disbursement above the configured threshold or a high-risk payment requires the configured approval chain before release.
- Close-period checks must reconcile subledgers, bank accounts, open approvals, and suspense balances before a period can be locked.
- Reports must calculate from posted journal entries and use dimensions for entity, MGA, broker, state, LOB, treaty, and cost center filters.

## Security Requirements

- Hash passwords with Argon2 or bcrypt; never store plaintext passwords or secrets in MongoDB.
- Use short-lived access tokens, refresh-token rotation, secure cookies where applicable, rate limiting, and account lockout controls.
- Enforce tenant and entity authorization in middleware and again in service queries.
- Validate and sanitize all request bodies, query parameters, upload metadata, and webhook signatures.
- Store uploads outside the application container and scan files before making them available.
- Redact tokens, passwords, bank account credentials, and sensitive personal data from logs.
- Use HTTPS, secure headers, CORS allowlists, request IDs, structured logging, and centralized error handling.
- Never expose MongoDB or payment-provider credentials to the browser.

## Local Development

### Prerequisites

- Node.js 20 LTS or newer
- MongoDB 7 or a MongoDB Atlas database
- npm

### Environment

Copy `.env.example` to `.env` and configure at least:

```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/veridex_finance
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-another-long-random-secret
CLIENT_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

### Suggested scripts

```bash
npm install
npm run dev
npm test
npm run seed
```

The existing HTML prototype can continue to run as a static reference. The backend should be verified independently through API integration tests and should not depend on browser `localStorage` or Firebase for production behavior.

## Testing Strategy

The current prototype includes accounting verification scripts for DBA, DBM, and DBC flows. Rebuild those checks as automated backend tests:

- Unit tests for money arithmetic, journal balancing, tax calculations, commission calculations, ageing, and allocation rules.
- Integration tests using a disposable MongoDB database for auth, tenant isolation, posting, approval, period locking, and idempotency.
- Accounting scenario tests for complete DBA, DBM, and DBC lifecycles, including every entity's journal entries and final balances.
- API tests for validation failures, permission failures, duplicate requests, partial payments, unapplied cash, and invalid period dates.
- Security tests for cross-tenant access, broken object-level authorization, invalid JWTs, upload restrictions, and webhook signature verification.
- Reporting tests that confirm trial balance totals, balance sheet equation, P&L totals, cash movement, and dimensional filters.

Minimum accounting scenario acceptance condition: every generated journal entry balances, all expected invoices and payables reach the correct status, carrier and intermediary settlement totals agree, and no cross-tenant document is readable or mutable.

## Migration Map from the Prototype

| Prototype surface                                               | Backend target                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `js/gl-engine.js` and `chart-of-accounts.html`                  | `accounts`, `fiscalPeriods`, `journalEntries`, accounting services   |
| `js/insurance-ops.js`, `pas-policy.html`, `mga-operations.html` | `policies`, `parties`, `bordereaux`, `invoices`, policy services     |
| `accounts-receivable.html`                                      | `invoices`, `payments`, `paymentAllocations`, AR services            |
| `accounts-payable.html`                                         | AP invoices, `disbursements`, approval and payment integrations      |
| `bank-reconciliation.html`                                      | bank accounts, bank transactions, matches, reconciliation exceptions |
| `config-engine.js`, `admin-config-center.html`                  | tenant configuration, modules, dimensions, COA templates             |
| `user-management.html`, `data/users.json`                       | users, roles, permissions, auth and tenant membership                |
| `workflow-approvals.html`                                       | approval policies, approval requests, decisions, notifications       |
| `period-locking.html`                                           | fiscal period service and posting guard                              |
| `reinsurance-accounting.html`                                   | treaties, cessions, recoverables, reinsurance journals               |
| `tax-engine.html`, `premium-tax-calculator.html`                | tax rules, tax transactions, filings, filing documents               |
| `audit-trail.html`                                              | append-only audit log and request correlation                        |
| `js/app.js`, `js/firebase-db.js`                                | MongoDB persistence, repositories, outbox, and integration adapters  |
| `test-accounting-flows.js` and `verify-accounting-flows.js`     | Jest/Vitest API and accounting integration suites                    |

## Delivery Phases

1. Bootstrap Express, environment validation, MongoDB connection, logging, error handling, health checks, and API versioning.
2. Implement tenants, entities, users, RBAC, authentication, audit logging, and tenant isolation.
3. Implement chart of accounts, periods, immutable journal posting, approval thresholds, and trial balance.
4. Implement invoices, AR/AP, payments, allocations, disbursements, and bank reconciliation.
5. Implement policy, MGA, carrier, commission, tax, bordereau, and DBA/DBM/DBC accounting workflows.
6. Implement reinsurance, claims, statutory filings, reports, documents, webhooks, and external payment/bank adapters.
7. Replace prototype data access with API clients, run migration and parity tests, then harden deployment and observability.

## Definition of Done

A module is complete only when it has request validation, authenticated and authorized routes, tenant-scoped persistence, service-level business rules, audit events, idempotency behavior for financial writes, unit tests, integration tests, API documentation, and a demonstrated balanced journal flow where applicable.
