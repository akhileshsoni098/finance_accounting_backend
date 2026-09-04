# Veridex Finance Backend - Schema Thought Process

Ye document batata hai ki MongoDB/Mongoose schemas design karte waqt humne kya socha, kis problem ko solve karne ke liye kaunsa schema banaya, schemas ek doosre se kaise connected hain, aur kaunsi business rules schema me enforce hoti hain ya service layer me enforce karni padengi.

Language intentionally Hinglish rakhi gayi hai taaki design ko code ke saath easily follow kiya ja sake.

---

## 1. Sabse Pehle Problem Ko Kaise Samjha

Ye normal ecommerce backend nahi hai. Isme `product`, `order` aur generic `payment` se kaam nahi chalega. Ye accounting plus insurance operations platform hai.

Is domain me ek action ka financial impact hota hai. Example:

1. Ek tenant insurance agency hai.
2. Us tenant ke andar broker, MGA aur carrier jaise entities hain.
3. Policy ya invoice issue hoti hai.
4. Us business event ke basis par accounting journal create hota hai.
5. Journal ke debit aur credit equal hone chahiye.
6. Amount approval threshold se bada hai to approval chahiye.
7. Period closed hai to posting allowed nahi honi chahiye.
8. Same request retry ho to duplicate journal nahi banna chahiye.
9. Har action ka audit record rehna chahiye.

Isliye schema design ka starting point screens ya UI nahi, balki accounting invariants the.

### Primary invariants

- Har journal balanced ho: total debit = total credit.
- Money floating point me persist nahi karni; integer minor units use karni hain.
- Posted journal edit/delete nahi ho sakta.
- Closed ya locked period me posting nahi ho sakti.
- Har tenant ka data doosre tenant se isolated ho.
- Retry se duplicate financial state create nahi honi chahiye.
- Trust aur operating accounts alag identify hone chahiye.
- Audit history append-only honi chahiye.

Yahi requirements schemas ke relationships decide karti hain.

---

## 2. Start Kahan Se Kiya

Design ko top-down is order me socha gaya:

```text
Tenant
  |
  +--> Entity
          |
          +--> Account
          +--> FiscalPeriod
          +--> JournalEntry

Business action
  |
  +--> AccountingEvent ---> JournalEntry
  +--> ApprovalRequest ---> JournalEntry/resource
  +--> AuditLog
```

Is order ka reason simple hai:

- Pehle organization boundary chahiye: `Tenant`.
- Tenant ke andar accounting kis legal/operating organization ki hai: `Entity`.
- Entity ke ledger me kaunse accounts hain: `Account`.
- Journal kis accounting date/period me post hogi: `FiscalPeriod`.
- Actual debit-credit transaction: `JournalEntry`.
- Journal kis business event se bani aur duplicate retry ko kaise roken: `AccountingEvent`.
- Threshold approval kaise track hoga: `ApprovalRequest`.
- Kisne kya kiya aur kab kiya: `AuditLog`.

Agar hum direct `JournalEntry` se start karte, to tenant, entity, account ownership aur period rules unclear rehte. Isliye hierarchy pehle define ki gayi.

---

## 3. `common.js` - Shared Building Blocks

File: `src/models/common.js`

Ye actual business collection nahi hai. Ye reusable schema definitions ka helper hai.

### `tenantFields`

```js
const tenantFields = {
  tenantId: { type: ObjectId, ref: "Tenant", required: true, immutable: true },
  entityId: { type: ObjectId, ref: "Entity" },
};
```

### Kya problem solve karta hai?

Har tenant-owned document me `tenantId` hona chahiye. Agar har file me manually likhenge to kisi model me field miss ho sakti hai. Shared helper duplication aur inconsistency reduce karta hai.

### `tenantId` kyun required hai?

MongoDB collection technically sab tenants ka data ek saath rakh sakti hai. Isliye har query me tenant filter mandatory hoga:

```js
JournalEntry.find({ tenantId: currentTenantId });
```

`tenantId` ko immutable rakha gaya hai kyunki existing financial document ko ek tenant se doosre tenant me move karna security risk hoga.

### `entityId` optional kyun hai?

Har document legal entity specific nahi hota. Tenant khud entity-level configuration rakh sakta hai. Lekin accounting documents jaise `Account`, `FiscalPeriod` aur `JournalEntry` me `entityId` explicitly required kiya gaya hai.

### `moneyAmount`

Money ke liye `Number` ke saath `Number.isSafeInteger` validation hai.

Example:

```text
USD 39,260.00 -> amountMinor: 3926000
USD 2,500.00  -> amountMinor: 250000
```

Floating point `39260.00` use nahi kiya gaya kyunki decimal calculations me rounding errors aa sakte hain. Integer minor units me addition exact hota hai.

### `currency`

Currency ko three uppercase letters ke format me rakha gaya hai:

```text
USD, EUR, INR
```

Isse invalid values jaise `dollar` ya `US` reject hoti hain.

---

## 4. `Tenant` Schema

File: `src/models/tenant.js`

### Tenant ka matlab

Tenant ek independent customer organization hai jo application use kar rahi hai. Example:

```text
Tenant: Veridex Demo Agency
slug: veridex-demo-agency
businessType: agency
baseCurrency: USD
```

### Main fields aur thought process

- `name`: organization ka readable naam.
- `slug`: API URLs, lookup aur unique identification ke liye stable value.
- `businessType`: agency, broker, MGA, carrier, reinsurer ya general business.
- `baseCurrency`: tenant ki default currency.
- `fiscalYearStartMonth`: financial year kab start hota hai.
- `approvalThresholdMinor`: is amount ke upar approval require hoga.
- `enabledModules`: tenant ke enabled product modules.
- `enabledDimensions`: reporting dimensions jaise state, LOB, MGA.
- `setupStage`: setup, active ya suspended.

### `slug` unique kyun hai?

Do tenants same slug ke saath nahi hone chahiye. Isliye:

```js
tenantSchema.index({ slug: 1 }, { unique: true });
```

### Tenant kis se connected hai?

- One Tenant -> many Entities
- One Tenant -> many Accounts
- One Tenant -> many FiscalPeriods
- One Tenant -> many JournalEntries
- One Tenant -> many AccountingEvents
- One Tenant -> many Approvals
- One Tenant -> many AuditLogs

Tenant root boundary hai. Baaki tenant-owned documents isi boundary ke andar rehne chahiye.

---

## 5. `Entity` Schema

File: `src/models/entity.js`

### Entity ki zarurat kyun padi?

Ek tenant ke andar multiple legal ya operating organizations ho sakti hain. Insurance example:

```text
Tenant: Veridex Group
  - HIT Broker
  - NTA MGA
  - Southlake Carrier
```

Accounting me har entity ka chart of accounts aur ledger alag ho sakta hai. Isliye sirf `tenantId` enough nahi hai; accounting records me `entityId` bhi chahiye.

### Main fields

- `tenantId`: entity kis tenant ki hai.
- `code`: short stable identifier, jaise `ENT-MGA-01`.
- `name`: display name.
- `type`: broker, MGA, carrier, reinsurer, insured, branch ya legal.
- `baseCurrency`: entity ki currency.
- `status`: active ya inactive.

### Connection

```text
Tenant 1 ---- many Entity
Entity 1 ---- many Account
Entity 1 ---- many FiscalPeriod
Entity 1 ---- many JournalEntry
```

### Index

```js
{ tenantId: 1, code: 1 } unique
```

Code tenant ke andar unique hona chahiye. Lekin doosre tenant me same code valid ho sakta hai. Isi ko tenant-scoped uniqueness kehte hain.

---

## 6. `Account` Schema - Chart of Accounts

File: `src/models/account.js`

### Account ka matlab

Account ledger ka bucket hai jahan debit ya credit post hota hai. Examples:

```text
1000 - Operating Bank
1100 - Accounts Receivable
2000 - Carrier Payable
4000 - Commission Revenue
5000 - Commission Expense
```

### Main fields

- `tenantId`: account kis tenant ka hai.
- `entityId`: kis entity ke chart of accounts ka account hai.
- `code`: account number.
- `name`: readable account name.
- `accountGroup`: asset, liability, equity, revenue ya expense.
- `normalBalance`: debit ya credit.
- `parentAccountId`: account hierarchy ke liye.
- `isControl`: subledger/control account hai ya nahi.
- `isTrust`: premium trust account ko operating account se distinguish karne ke liye.
- `dimensions`: allowed reporting dimensions.
- `active`: account future use ke liye active hai ya nahi.

### `entityId` required kyun hai?

Agar same tenant ki do entities ke account codes same hon, to unka ledger mix nahi hona chahiye. Isliye unique index:

```js
{ tenantId: 1, entityId: 1, code: 1 } unique
```

### `parentAccountId` kyun hai?

Chart of accounts tree jaisa hota hai:

```text
1000 Assets
  1100 Cash
    1110 Operating Bank
    1120 Premium Trust Bank
```

`parentAccountId` se reporting aur account hierarchy possible hoti hai.

### Important service-level rule

Schema ye validate kar sakta hai ki parent ID ObjectId hai. Lekin ye prove nahi karta ki parent same tenant/entity ka hai ya circular hierarchy nahi bana raha. Ye checks account service/repository me karne honge.

---

## 7. `FiscalPeriod` Schema

File: `src/models/fiscal-period.js`

### Fiscal period kya solve karta hai?

Accounting date ko period status ke against check karna hota hai. Example:

```text
January 2026 -> open
December 2025 -> closed
Old audit period -> locked
```

Agar koi journal closed period me post hoti hai to financial reports corrupt ho jayengi.

### Main fields

- `tenantId`, `entityId`: period ki ownership.
- `name`: jaise `January 2026`.
- `startDate`, `endDate`: period range.
- `status`: future, open, closed, locked.
- `closedAt`, `closedBy`: close action ka evidence.
- `lockedAt`, `lockedBy`: hard lock ka evidence.
- `closeChecklist`: close se pehle required checks.

### Local validation

`endDate` ko `startDate` se baad hona chahiye. Ye schema validator check karta hai.

### Index

Period lookup usually tenant + entity + date/status se hota hai, isliye compound indexes rakhe gaye hain.

### Important limitation

Do periods date range me overlap na karein, ye normal Mongoose unique index se enforce nahi hota. Service layer ko transaction ke andar overlap check karna hoga.

### Journal se connection

`JournalEntry.fiscalPeriodId` batata hai ki journal kis period ki hai. Posting service ko:

1. Journal date read karni hai.
2. Matching fiscal period find karna hai.
3. Check karna hai status `open` hai.
4. Approval pass hone ke baad post karna hai.

---

## 8. `JournalEntry` Schema - Core Accounting Record

File: `src/models/journal-entry.js`

Ye sabse important schema hai. Actual financial state isi me record hoti hai.

### Header aur lines ko ek document me kyun rakha?

Do choices hoti hain:

1. `JournalEntry` aur `JournalEntryLine` separate collections.
2. Journal ke andar `lines[]` embedded array.

Initial design me embedded lines choose ki gayi kyunki:

- Debit-credit balance ek document me calculate hota hai.
- Draft se posted transition atomic ban sakta hai.
- Posted document ko immutable rakhna easier hai.
- Journal header aur lines alag save hone ka partial-failure risk kam hota hai.

Large-scale reporting ke time lines ko separate collection me move karna possible hai, lekin current accounting boundary ke liye embedded design simple aur safe hai.

### Journal header fields

- `tenantId`: tenant isolation.
- `entityId`: kis entity ke ledger me entry hai.
- `entryNumber`: human-readable ledger number.
- `entryDate`: accounting date.
- `fiscalPeriodId`: period relationship.
- `status`: draft, pending_approval, posted, rejected, reversed.
- `description`: transaction explanation.
- `sourceType`, `sourceId`: source business document.
- `accountingEventId`: event se journal ka link.
- `approvalRequestId`: approval se link.
- `correlationId`: cross-entity ya workflow tracing.
- `currency`: entry currency.
- `totalDebitMinor`, `totalCreditMinor`: calculated totals.
- `postedAt`, `postedBy`: posting evidence.

### Journal line fields

- `accountId`: debit/credit kis account par hai.
- `debitMinor`: debit amount in minor units.
- `creditMinor`: credit amount in minor units.
- `currency`: line currency.
- `dimensions`: state, LOB, MGA, broker, treaty, cost center jaise filters.
- `counterpartyId`: party reference.
- `policyId`: insurance policy reference.
- `invoiceId`: invoice reference.
- `description`: line-level explanation.

### Line invariant

Ek line me exactly ek positive side honi chahiye:

```text
Valid:
  debitMinor: 1000, creditMinor: 0

Valid:
  debitMinor: 0, creditMinor: 1000

Invalid:
  debitMinor: 1000, creditMinor: 1000
  debitMinor: 0, creditMinor: 0
```

Isliye line-level pre-validation hai.

### Entry balance invariant

Example:

```text
Debit  Accounts Receivable  39,260.00
Credit Premium Revenue      35,757.00
Credit Tax Liability         3,503.00
--------------------------------------
Total Debit                 39,260.00
Total Credit                39,260.00
```

Schema pre-validation lines se totals calculate karta hai aur unequal totals reject karta hai.

### At least two lines kyun?

Single-sided journal accounting equation break karegi. Isliye minimum two lines required hain.

### Posted immutable kyun?

Posted journal report aur balances ka source hai. Agar posted entry edit/delete ho gayi to audit trail aur previous financial reports change ho jayenge. Correction ka pattern hona chahiye:

```text
Original posted entry
        |
        +--> Reversing entry
        +--> Correcting/adjusting entry
```

Schema me immutable fields aur update/delete hooks initial guard provide karte hain. Real enforcement ke liye service methods bhi sirf allowed status transitions expose karenge.

### Journal indexes

- Tenant + entity + entry number: duplicate entry number roknay ke liye.
- Tenant + entity + date + status: ledger listing/reporting ke liye.
- Tenant + accounting event: same event se duplicate journal roknay ke liye.
- Tenant + correlation ID: cross-entity workflow trace karne ke liye.

---

## 9. `AccountingEvent` Schema - Business Action Se Ledger Tak

File: `src/models/accounting-event.js`

### Directly invoice se journal kyun nahi banaya?

Requirement ke according domain modules ko directly ledger write nahi karna chahiye. Unhe accounting event publish karna chahiye.

Example:

```text
Invoice issued
  -> InvoiceIssued event
  -> Accounting engine reads event
  -> JournalEntry generated
```

Isse invoice service ko debit-credit rules ka knowledge nahi rakhna padta.

### Main fields

- `idempotencyKey`: retry ko identify karta hai.
- `eventType`: jaise `InvoiceIssued`, `PaymentReceived`, `BordereauIngested`.
- `sourceDocumentType`, `sourceDocumentId`: event kis document se aaya.
- `payload`: event ke time ka business data snapshot.
- `payloadVersion`: future event format compatibility.
- `status`: received, processing, processed, failed.
- `journalEntryIds`: generated journals.
- `correlationId`: same workflow ke records connect karta hai.
- `occurredAt`, `processedAt`: timing evidence.
- `failure`: processing error details.

### Idempotency ka flow

```text
Request arrives with idempotency key K
  |
  +--> Event K already processed? Return existing journal
  |
  +--> Event K new? Create event
          |
          +--> Generate journal in transaction
          +--> Save journal ID
          +--> Mark event processed
```

Unique index `{ tenantId, idempotencyKey }` database-level duplicate protection deta hai.

### AccountingEvent aur JournalEntry connection

- One accounting event normally one ya multiple journals generate kar sakta hai.
- Journal me `accountingEventId` back-reference hai.
- Event me `journalEntryIds` list hai.
- Dono links debugging aur audit ke liye useful hain.

### Important service-level rule

Event status transition transaction ke andar honi chahiye. Agar event `processed` mark ho gaya lekin journal save nahi hui, to financial state inconsistent hogi.

---

## 10. `ApprovalRequest` Schema

File: `src/models/approval-request.js`

### Approval alag document kyun hai?

Approval ek workflow hai, journal ka simple boolean field nahi. Isme multiple approvers, ordered steps, decisions, comments aur timestamps ho sakte hain.

Example:

```text
Amount >= USD 10,000
  -> Manager approval
  -> Finance approval
  -> Posting allowed
```

### Main fields

- `resourceType`, `resourceId`: approval kis resource ke liye hai.
- `journalEntryId`: ledger approval case me direct link.
- `thresholdMinor`, `currency`: approval kis amount par trigger hui.
- `status`: pending, approved, rejected, cancelled.
- `steps[]`: ordered approver chain.
- `requestedBy`, `requestedAt`: requester evidence.
- `completedAt`: workflow completion.

### `steps[]` me kya hai?

- `order`: sequence.
- `approverUserId`: assigned user.
- `decision`: pending, approved, rejected.
- `comment`: decision explanation.
- `decidedAt`: decision timestamp.

### Journal se connection

```text
JournalEntry.status = pending_approval
  |
  +--> ApprovalRequest.status = pending
          |
          +--> All required steps approved
                  |
                  +--> JournalEntry.status = posted
```

Agar koi step reject kare, journal post nahi honi chahiye.

### Pending unique index

Ek resource ke liye ek time par multiple pending approval requests create nahi honi chahiye. Partial unique index isi active pending state ko protect karta hai.

### Important service-level rule

Schema array me duplicate approvers ya incorrect step order fully enforce nahi kar raha. Approval service ko ye validate karna hoga:

- Same approver duplicate na ho.
- Step order continuous ho.
- User same tenant ka ho.
- Approver ke paas required permission ho.
- Rejected request dobara silently post na ho.

---

## 11. `AuditLog` Schema

File: `src/models/audit-log.js`

### Audit log kyun zaruri hai?

Finance system me sirf current data enough nahi hota. Hume pata hona chahiye:

```text
Kisne action kiya?
Kis tenant/entity par?
Kis resource par?
Kya change hua?
Kab hua?
Kis request se hua?
Kaunsa module responsible tha?
```

### Main fields

- `tenantId`, `entityId`: scope.
- `actorUserId`: actor.
- `action`: create, approve, post, reverse, login, etc.
- `resourceType`, `resourceId`: affected object.
- `before`: previous snapshot.
- `after`: new snapshot.
- `details`: event-specific metadata.
- `requestId`: HTTP request trace.
- `sourceModule`: module that caused action.
- `correlationId`: related workflow trace.
- `occurredAt`: event timestamp.

### Append-only kyun?

Audit log edit kar denge to audit ka purpose khatam ho jayega. Isliye update/delete middleware explicitly error throw karta hai.

Production me database permissions bhi audit collection par insert-only access ke liye configure karni chahiye. Sirf Mongoose hook par security depend nahi karni chahiye.

### Audit connections

Audit log directly almost har protected operation se connect hoga:

```text
User request
  -> Controller
  -> Service
  -> Domain document change
  -> AuditLog insert
```

Ideally business write aur audit write same MongoDB transaction me honi chahiye.

---

## 12. Complete Connection Example

Reference scenario: USD 39,260 invoice issue hui.

```text
Tenant: Agency A
  |
  +--> Entity: Broker HIT
          |
          +--> Account: Accounts Receivable
          +--> Account: Premium Revenue
          +--> Account: Tax Liability
          +--> FiscalPeriod: January 2026

InvoiceIssued event
  |
  +--> AccountingEvent
          |
          +--> JournalEntry
                  |
                  +--> JournalLine: Debit AR 39,260.00
                  +--> JournalLine: Credit Revenue 35,757.00
                  +--> JournalLine: Credit Tax Liability 3,503.00

If threshold exceeded:
  JournalEntry
    +--> ApprovalRequest

For every action:
  +--> AuditLog
```

ObjectId relationship conceptually:

```text
AccountingEvent.sourceDocumentId -> Invoice._id
JournalEntry.accountingEventId  -> AccountingEvent._id
JournalEntry.fiscalPeriodId     -> FiscalPeriod._id
JournalEntry.entityId           -> Entity._id
JournalLine.accountId           -> Account._id
ApprovalRequest.journalEntryId  -> JournalEntry._id
AuditLog.resourceId             -> changed document _id
```

Schemas me `ref` sirf relationship information deta hai. `ref` automatic authorization nahi deta. Tenant ownership service query me dobara verify karni hogi.

---

## 13. Kya Schema Enforce Karta Hai, Kya Service Karegi

### Schema/Mongoose level

- Required fields.
- String enums and formats.
- Currency format.
- Integer minor-unit amounts.
- Minimum two journal lines.
- Exactly one debit/credit side per line.
- Equal journal totals.
- Fiscal period end after start.
- Tenant-scoped unique indexes.
- Event idempotency unique index.
- Posted/audit update guards.

### Service/repository/transaction level

- Current user tenant access.
- Entity belongs to current tenant.
- Account belongs to same tenant/entity as journal.
- Journal date belongs to selected period.
- Period status is open.
- Approval threshold and permission chain.
- Cross-entity linked entries.
- No overlapping fiscal periods.
- Parent account belongs to same chart and no cycle exists.
- Idempotent event processing transaction.
- Audit and business write atomicity.
- Sensitive data redaction.
- Role and permission checks.

Ye separation intentional hai. Schema local document shape validate karta hai; service business workflow and authorization validate karti hai.

---

## 14. Naming Aur Indexing Ka Thought Process

### Naming

- Collection/model names singular PascalCase: `JournalEntry`, `FiscalPeriod`.
- Database collection Mongoose pluralize karega.
- IDs relationship ke saath suffix: `tenantId`, `entityId`, `accountId`.
- Money fields explicit: `debitMinor`, `creditMinor`, `thresholdMinor`.
- Status values limited enums me rakhe gaye hain.

### Indexing

Queries ka normal shape tenant se start hota hai, isliye indexes me `tenantId` first field rakha gaya hai.

Example:

```js
{ tenantId: 1, entityId: 1, entryDate: 1, status: 1 }
```

Isse tenant ke andar entity/date/status filter efficient hota hai.

Unique indexes global nahi rakhe gaye, kyunki same account code ya entity code alag tenants me valid ho sakta hai.

---

## 15. Future Schemas Kaise Add Honge

Next domain layers is dependency order me add karni chahiye:

1. `User`, `Role`, `Permission`, tenant memberships.
2. `Party` for insured, broker, MGA, carrier, vendors.
3. `Policy`, `Coverage`, `PolicyTransaction`.
4. `Invoice`, `InvoiceLine`, credit/debit memos.
5. `Payment`, `PaymentAllocation`, `Disbursement`.
6. `BankAccount`, statements, transactions and reconciliation.
7. Commission and tax schemas.
8. Bordereau and ingestion runs.
9. Reinsurance treaties, cessions, recoverables.
10. Documents, webhooks, outbox events and reporting definitions.

Har new financial module ka pattern ye hona chahiye:

```text
Domain document
  -> validated business action
  -> AccountingEvent
  -> Accounting engine
  -> JournalEntry
  -> Approval if required
  -> AuditLog
```

Domain module ko direct ledger totals update nahi karne chahiye.

---

## 16. Current Design Ka Short Summary

Simple words me:

- `Tenant` batata hai customer kaun hai.
- `Entity` batata hai customer ke andar accounting kis organization ki hai.
- `Account` batata hai paisa kis ledger bucket me jayega.
- `FiscalPeriod` batata hai kis date range me posting allowed hai.
- `JournalEntry` actual debit-credit truth hai.
- `AccountingEvent` business action ko accounting se connect karta hai aur retry duplicate rokta hai.
- `ApprovalRequest` posting se pehle control lagata hai.
- `AuditLog` complete history preserve karta hai.

Is design ka central rule hai: financial state ko directly mutate nahi karna; validated event ke through controlled journal posting karni hai.
