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

## 3. Complete SaaS Model Kaise Socha

Ye application ek tenant ke liye installed software nahi hai. Ye shared SaaS platform hai jahan multiple agencies, MGAs, carriers aur businesses same application use karenge.

### Login aur tenant accounting alag concepts hain

Ek person ka ek global login ho sakta hai, lekin us user ki alag-alag tenants me alag membership hogi:

```text
User: finance@example.com
  |
  +--> Tenant A membership: Accountant
  +--> Tenant B membership: Viewer
```

Isliye `User` me tenantId nahi rakha gaya. Agar user ko ek hi tenant se permanently bind kar denge to carrier consultant ya accountant multiple organizations handle nahi kar payega.

### `TenantMembership`

File: `src/models/tenant-membership.js`

Ye actual authorization boundary hai. Isme `tenantId`, `userId`, tenant-specific `role`, allowed `entityIds`, membership `status`, aur invite/join timestamps hain.

Same user multiple tenants me ho sakta hai, par har request ke saath active tenant context select hoga. Har protected query me membership verify hogi:

```text
JWT userId
  -> active TenantMembership
  -> tenantId + allowed entityIds
  -> scoped service query
```

Sirf JWT me tenantId rakhna enough nahi hai, kyunki client token manipulate ya stale ho sakta hai. Server database membership ko authority maanega.

### `User`

File: `src/models/user.js`

`User` me global identity aur login security rakhi gayi hai: email, password hash, optional external identity, status, MFA metadata aur last login. `passwordHash` ko normal queries se hide kiya gaya hai; plaintext password kabhi store nahi hoga.

### `Subscription`

File: `src/models/subscription.js`

SaaS billing tenant-level resource hai. Isme plan, subscription status, Stripe/Razorpay readiness, billing period aur limits (users, entities, monthly bordereaux) hain. Subscription suspend hone par writes restrict ho sakti hain, lekin historical accounting delete nahi hogi.

### SaaS isolation aur controlled collaboration

```text
Tenant A user -> Tenant A membership -> Tenant A query only
Tenant B user -> Tenant B membership -> Tenant B query only

MGA Tenant + Carrier Tenant
  -> active CarrierConnection
  -> allowed Bordereau workflow only
```

Carrier connection isolation ka exception nahi, controlled collaboration hai. Carrier ko MGA ke complete tenant documents nahi milte; authorized service sirf active connection ke allowed Bordereau/status data return karegi.

### Client apna portfolio kaise banayega

Veridex me har client login ke baad apne tenant ke andar one ya multiple portfolios bana sakega. Portfolio ek business book/program ka logical container hai, na ki ek doosra tenant.

Examples:

```text
MGA Tenant
  - Texas Commercial Trucking Book
  - Southlake Carrier Program
  - 2026 Renewal Portfolio

Broker Tenant
  - Commercial Clients
  - Personal Lines Book

Reinsurer Tenant
  - Quota Share Treaty Book
  - Property Catastrophe Book
```

### `Portfolio` aur `PortfolioItem`

Files: `src/models/portfolio.js`, `src/models/portfolio-item.js`

`Portfolio` header me tenant, owner entity, name, code, type, currency, visibility aur connected entities rakhe jaate hain. `PortfolioItem` me actual policy, party, entity, program ya treaty ke references rakhe jaate hain.

Items ko portfolio document ke andar array me embed nahi kiya gaya, kyunki kisi MGA ke portfolio me thousands of policies ho sakti hain. Separate item documents se pagination, add/remove history, duplicate protection aur filtering possible hoti hai.

Portfolio types:

- `book_of_business`: broker/agency ka client book.
- `mga_program`: MGA ka carrier/program book.
- `carrier_program`: carrier ka delegated program portfolio.
- `reinsurance_book`: reinsurer ke treaties/ceded business ka book.
- `client_portfolio`: kisi specific client relationship ka grouped view.

Portfolio ka ownership rule:

```text
Portfolio.tenantId -> owner tenant
Portfolio.ownerEntityId -> us tenant ki entity
PortfolioItem.tenantId -> same owner tenant
PortfolioItem.portfolioId -> parent portfolio
```

Carrier connection ke baad bhi MGA ka portfolio carrier tenant me copy nahi hota. Carrier ko sirf active connection aur permission ke basis par relevant Bordereau ya shared portfolio view milega. Accounting journals dono tenants me separately generate honge.

Portfolio ke financial totals direct fields se manually update nahi hone chahiye. Reports posted journals, policy transactions aur approved Bordereau transactions se calculate karengi. Isse portfolio view aur ledger balance ke beech mismatch nahi hoga.

---

## 4. QuickBooks Jaisa Product Experience

User ko backend ke complex accounting concepts manually handle nahi karne chahiye. Product ka experience QuickBooks jaisa simple, guided aur action-based hoga; lekin Veridex ka domain insurance, MGA, carrier aur bordereau workflows honge.

### User ko kya dikhega

Login ke baad user ko apne selected tenant ka dashboard milega:

```text
Dashboard
  - Cash and bank balance
  - Accounts receivable
  - Accounts payable
  - Unpaid invoices and bills
  - Pending approvals
  - Recent transactions
  - Bordereaux awaiting carrier action
  - Profit and loss / balance sheet summary
```

User ko normally debit-credit entry type nahi karni hogi. Uske liye simple actions honge:

```text
Create invoice
Record payment
Add expense/bill
Transfer money
Reconcile bank transaction
Send bordereau to carrier
Approve settlement
Run report
```

### Simple screen ke peeche actual accounting

Example: user `Create Invoice` click karta hai.

```text
Invoice form
  -> Invoice document save
  -> InvoiceIssued AccountingEvent
  -> Accounting rules account resolve karti hain
  -> JournalEntry create hoti hai
  -> Approval required ho to ApprovalRequest
  -> AuditLog create hota hai
```

Iska matlab UI simple hai, par financial truth backend ke journal me maintain hoti hai. Direct browser/localStorage balance ko source of truth nahi banaya jayega.

### QuickBooks-style modules aur Veridex mapping

| User-facing module   | Backend/domain meaning                                             |
| -------------------- | ------------------------------------------------------------------ |
| Sales / Invoices     | Policyholder/customer receivables, invoices and credit notes       |
| Expenses / Bills     | Carrier settlements, vendor bills and payables                     |
| Banking              | Operating/trust accounts, imported transactions and reconciliation |
| Chart of Accounts    | Entity-specific `Account` records                                  |
| Reports              | Posted journal entries with dimensions                             |
| Customers/Vendors    | `Party` records for insureds, brokers, carriers and vendors        |
| Payroll-like payouts | Commissions and producer/MGA payables                              |
| Custom workflow      | Bordereaux, carrier connections, approvals and settlements         |

### Setup wizard ka thought process

QuickBooks jaisa onboarding important hai. New tenant ko blank database dekar confuse nahi karna hai. Setup wizard step-by-step chalega:

```text
1. Organization and business type
2. Base currency and fiscal year
3. Legal entities
4. Chart of accounts template
5. Bank/trust accounts
6. Users and roles
7. Tax and commission settings
8. Carrier/MGA connections
9. Opening balances
10. Go live
```

Har step tenant setup stage me record ho sakta hai. `Tenant.setupStage`, `Entity`, `Account`, `FiscalPeriod`, `TenantMembership` aur `Subscription` isi onboarding foundation ko support karte hain.

### Guided accounting ka rule

User action se accounting rule automatically choose hoga, lekin user ko preview aur explanation milni chahiye:

```text
You are recording: Carrier settlement
Debit: Carrier Payable
Credit: Premium Trust Bank
Amount: USD 29,757.00
```

User-friendly language front end ka concern hai. Final account IDs, balanced journal, approval status aur audit data backend ka concern hai.

### Insurance-specific difference

QuickBooks ke basic invoice/bill workflow ke upar Veridex ye extra capabilities rakhega:

- Policy and coverage context.
- MGA-to-carrier connection request.
- Transaction-based Bordereau submission.
- DBA/DBM/DBC billing model rules.
- Premium tax and commission splits.
- Trust versus operating cash separation.
- Carrier acceptance and settlement workflow.
- Cross-tenant collaboration without cross-tenant accounting access.

Isliye target product `QuickBooks clone` nahi hai. Target hai: **QuickBooks jaisa easy accounting experience plus insurance operations-grade controls.**

---

## 5. `common.js` - Shared Building Blocks

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

## 6. `Tenant` Schema

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

## 7. `Entity` Schema

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

## 8. `Account` Schema - Chart of Accounts

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

## 9. `FiscalPeriod` Schema

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

## 10. `JournalEntry` Schema - Core Accounting Record

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

## 11. Bordereau Ka Complete Scene

README ke reference flow me bordereau important hai. Ab is workflow ke liye actual models implement hain: `carrier-connection.js`, `bordereau.js`, `bordereau-transaction.js`, aur `bordereau-ingestion-run.js`. Ledger foundation pehle banane ka reason ye tha ki bordereau ingestion ka final output journal entries hota hai.

### Bordereau hota kya hai?

Bordereau MGA ya broker ki taraf se carrier ko bheja gaya production/settlement statement hai. Isme policy-level rows hoti hain, jaise:

```text
Policy number
Insured
Effective date
State
Gross premium
Broker commission
MGA fee/override
Tax and fees
Net carrier settlement
```

Ye simple file upload nahi hai. Ye operational data ko validate karke accounting state me convert karne wala workflow hai.

### Bordereau ke liye teen documents kyun sochne chahiye?

Ek hi huge document me header, har row aur processing errors rakhne se retry, debugging aur reporting difficult ho jayegi. Isliye logical separation:

```text
Bordereau
  |
  +--> BordereauRow[]
  +--> BordereauIngestionRun[]
```

#### 1. `Bordereau`

Ye submission ka header/identity document hoga.

Implemented fields:

- `tenantId`: kis tenant ki submission hai.
- `mgaEntityId`: submitting MGA.
- `carrierEntityId`: receiving carrier.
- `periodStart`, `periodEnd`: production period.
- `bordereauNumber`: tenant ke andar unique submission number.
- `billingModel`: DBA, DBM ya DBC.
- `currency`: submission currency.
- `status`: draft, submitted, validating, accepted, rejected, ingested, posted.
- `sourceFileId`: uploaded original document ka reference.
- `rowCount`, `grossPremiumMinor`, `taxMinor`, `commissionMinor`, `netSettlementMinor`: summary totals.
- `submittedBy`, `submittedAt`, `acceptedAt`: workflow evidence.
- `correlationId`: related settlement/journals ko trace karne ke liye.

#### 2. `BordereauRow`

Ye policy-level financial/operational row hogi. Isse separate collection rakhna better hai kyunki ek bordereau me hundreds ya thousands of policies ho sakti hain.

Implemented fields:

- `tenantId`, `bordereauId`: ownership and parent connection.
- `policyId`: existing policy ka reference.
- `policyNumber`: external/business identifier.
- `insuredPartyId`: insured reference.
- `state`, `lineOfBusiness`: reporting dimensions.
- `grossPremiumMinor`: total premium.
- `brokerCommissionMinor`: broker share.
- `mgaFeeMinor`: MGA override/program fee.
- `taxMinor`, `feesMinor`: liabilities/fees.
- `netCarrierSettlementMinor`: carrier ko payable amount.
- `currency`: ISO currency.
- `rowStatus`: pending, valid, invalid, posted.
- `validationErrors`: row-level errors.
- `sourceRowNumber`: original file row for traceability.

#### 3. `BordereauIngestionRun`

Ye processing attempt ka record hoga. Iski zarurat retry aur audit ke liye hai.

Implemented fields:

- `tenantId`, `bordereauId`.
- `idempotencyKey`: same file/request dobara process hone par duplicate state roke.
- `status`: received, validating, failed, completed.
- `totalRows`, `validRows`, `invalidRows`.
- `duplicateRows`, `rejectedRows`.
- `errorSummary`.
- `startedAt`, `completedAt`, `startedBy`.
- `journalEntryIds`: generated accounting entries.

### Bordereau ka connection graph

```text
MGA Entity
   |
   +--> Bordereau
           |
           +--> BordereauRow --> Policy --> Insured/Parties
           |
           +--> IngestionRun
           |
           +--> AccountingEvent: BordereauAccepted/Ingested
                         |
                         +--> JournalEntry for MGA/carrier entity
                         +--> ApprovalRequest if threshold crossed
                         +--> AuditLog
```

### Bordereau-first operational flow

README ka standard flow ye hai:

```text
1. MGA production submit karta hai.
2. System bordereau header aur rows save karta hai.
3. Validation run duplicate policy rows, required fields aur totals check karta hai.
4. Carrier submission ingest/accept karta hai.
5. Accounting event publish hota hai.
6. Accounting engine journals generate karta hai.
7. MGA carrier payable settle karta hai.
8. Carrier incoming cash ko receivable se match karta hai.
```

### Validation me kya check hoga?

#### Row-level checks

- Required policy number present hai.
- Policy tenant ke andar exist karti hai.
- Policy duplicate row me repeat nahi hui.
- Effective date aur state valid hain.
- Premium amounts integer minor units me hain.
- Commission premium se zyada nahi hai.
- Tax negative nahi hai.
- Currency consistent hai.

#### Header/total checks

- Row totals header totals se match karte hain.
- `gross premium - commissions - tax/fees` business rule ke according net settlement se match karta hai.
- MGA aur carrier relationship authorized hai.
- Period open/valid hai.
- Same `idempotencyKey` ka successful ingestion pehle nahi hua.

### Bordereau se journal kaise banegi?

Actual debit-credit billing model par depend karega. Generic example:

```text
Debit  Carrier Receivable       net carrier settlement
Debit  Commission Expense       broker commission
Credit Premium/Settlement Revenue gross or applicable amount
Credit Tax Liability             tax and fees
```

Exact accounts tenant ke chart of accounts aur DBA/DBM/DBC rule se resolve honge. Bordereau model ko khud account balances update nahi karne chahiye. Uska kaam validated production data dena hai; accounting event aur accounting engine journal create karega.

### DBA / DBM / DBC me difference

- `DBA / Agency Bill`: insured broker ko pay karta hai; broker MGA/carrier settlement banata hai.
- `DBM / Direct Bill to MGA`: insured MGA ko pay karta hai; MGA carrier payable aur broker commission payable track karta hai.
- `DBC / Direct Bill to Carrier`: insured carrier ko pay karta hai; carrier receivable/reserve aur MGA/broker payable track karta hai.

Isliye `billingModel` bordereau header par rakhna important hai. Same row data ka journal mapping billing model ke basis par change ho sakta hai.

### Bordereau aur current schemas

- `Bordereau.tenantId` -> `Tenant._id`
- `Bordereau.mgaEntityId` -> `Entity._id`
- `Bordereau.carrierEntityId` -> `Entity._id`
- `BordereauRow.bordereauId` -> `Bordereau._id`
- `BordereauRow.policyId` -> future `Policy._id`
- `BordereauIngestionRun.bordereauId` -> `Bordereau._id`
- `AccountingEvent.sourceDocumentId` -> `Bordereau._id`
- `JournalEntry.accountingEventId` -> `AccountingEvent._id`
- `JournalEntry.correlationId` -> bordereau settlement workflow
- `AuditLog.resourceId` -> bordereau/run/journal ID

### Carrier connection request ka model

File: `src/models/carrier-connection.js`

Carrier ko sirf `carrierEntityId` se connect nahi kiya gaya, kyunki carrier kisi doosre tenant ka owner ho sakta hai. `CarrierConnection` dono sides ko explicitly record karta hai:

- `requesterTenantId` + `requesterEntityId`: MGA side.
- `carrierTenantId` + `carrierEntityId`: carrier side.
- `status`: pending, active, rejected, suspended ya revoked.
- `permissions`: submit, view, accept aur settlement posting capabilities.
- `requestedBy`, `decidedBy`, timestamps: request aur approval history.
- `configuration`: carrier reference, frequency aur required fields.

Flow:

```text
MGA user login
  -> MGA apne tenant se carrier configure/select karta hai
  -> CarrierConnection status = pending
  -> Carrier tenant ka authorized user request dekhta hai
  -> Carrier approve karta hai
  -> status = active
  -> MGA active connection ke through bordereau submit karta hai
```

MGA tenant ka accounting data carrier tenant ko automatically expose nahi hota. Carrier ko authorized service query ke through sirf connection ke allowed bordereau/status data dikhaya jayega. Dono tenants ke journals aur accounts apne-apne `tenantId` aur `entityId` me isolated rahenge.

### Transaction-based implementation

`BordereauTransaction` ko header me embedded array nahi banaya gaya, kyunki ek submission me bahut saari policy transactions ho sakti hain. Separate records se individual transaction validate, duplicate detect, correct aur paginate ki ja sakti hai.

Transaction arithmetic:

```text
net carrier settlement
  = gross premium
  - broker commission
  - MGA fee
  - tax
  - other fees
```

Current schema isi arithmetic ko validate karta hai. `direction: reversal` future correction flow ke liye hai; posted journal mutate karne ke bajay reversal transaction aur reversing journal create hogi.

### Important design decision

Bordereau ko direct `JournalEntry` ka child nahi banana hai. Correct direction ye hai:

```text
Bordereau data
  -> validation
  -> ingestion event
  -> accounting rules
  -> journal entry
```

Isse operational correction aur accounting correction alag rehte hain. Invalid bordereau ko edit/re-upload kiya ja sakta hai; posted journal ko edit nahi, reversing/adjusting entry se correct kiya jayega.

---

## 12. `AccountingEvent` Schema - Business Action Se Ledger Tak

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

## 13. `ApprovalRequest` Schema

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

## 14. `AuditLog` Schema

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

## 15. Complete Connection Example

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

## 16. Kya Schema Enforce Karta Hai, Kya Service Karegi

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

## 17. Naming Aur Indexing Ka Thought Process

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

## 18. Future Schemas Kaise Add Honge

Next domain layers is dependency order me add karni chahiye:

1. `Role`, `Permission`, auth sessions and refresh-token rotation.
2. `Party` for insured, broker, MGA, carrier, vendors.
3. `Policy`, `Coverage`, `PolicyTransaction`.
4. `Invoice`, `InvoiceLine`, credit/debit memos.
5. `Payment`, `PaymentAllocation`, `Disbursement`.
6. `BankAccount`, statements, transactions and reconciliation.
7. Commission and tax schemas.
8. Bordereau and carrier-connection APIs/services.
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

## 19. Current Design Ka Short Summary

Simple words me:

- `Tenant` batata hai customer kaun hai.
- `Entity` batata hai customer ke andar accounting kis organization ki hai.
- `Account` batata hai paisa kis ledger bucket me jayega.
- `FiscalPeriod` batata hai kis date range me posting allowed hai.
- `JournalEntry` actual debit-credit truth hai.
- `AccountingEvent` business action ko accounting se connect karta hai aur retry duplicate rokta hai.
- `ApprovalRequest` posting se pehle control lagata hai.
- `AuditLog` complete history preserve karta hai.
- `User` global login identity hai.
- `TenantMembership` user ko tenant-specific role aur entity access deta hai.
- `Subscription` SaaS plan, billing status aur product limits rakhta hai.
- `Portfolio` client ka tenant-owned business book/program define karta hai.
- `PortfolioItem` portfolio ke andar policies, parties, entities, programs ya treaties ko scalable way me link karta hai.
- `CarrierConnection` MGA aur carrier tenants ke beech controlled request/approval boundary hai.
- `BordereauTransaction` policy-level production ko transaction basis par validate karta hai.

Current code SaaS persistence foundation tak aa gaya hai. Complete SaaS workflow ke liye next implementation auth routes, JWT/refresh-token service, tenant-context middleware, membership authorization, carrier connection request APIs, Bordereau submission/acceptance APIs, aur accounting transaction service honge.

Product direction: user experience QuickBooks jaisa simple aur guided hoga, lekin backend insurance operations, multi-tenant isolation, approvals aur audit controls ke saath enterprise-grade rahega.

Is design ka central rule hai: financial state ko directly mutate nahi karna; validated event ke through controlled journal posting karni hai.
