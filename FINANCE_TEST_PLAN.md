# Finance modules — map & test plan

Written for whoever is walking through finance QA on staging (or prod with a throwaway client).

## Surface at a glance

Backend is split across 10+ controllers; the web covers 7 pages; mobile only covers payments.

| Area | Web route | Backend controller | Mobile |
|---|---|---|---|
| Dashboard | `/finance` | FinancePage → aggregates from payments/invoices/expenses | — |
| Paiements | `/finance/payments` | PaymentController (index / show / store / allocate / removeAllocation) | /paiements |
| Factures | `/finance/invoices`, `/finance/invoices/:id` | InvoiceController (store / update / issue / cancel / destroy / generateFromContract) | — |
| Trésorerie | `/finance/treasury` | TreasuryController (summary / accounts CRUD / import tx / match / bulk-match) | — |
| Charges fixes | `/finance/fixed-charges` | FixedChargeController + FixedChargePaymentController + FixedChargeService | — |
| Dépenses | *(sub-tab under accounting?)* | ExpenseController (dashboard / CRUD / markPaid / byVehicle / suppliers CRUD) | — |
| Crédit | `/credit` | CreditApplicationController (+ CreditScoringService) | — |
| Impayés | `/arrears`, `/arrears/:id`, `/arrears/legal/:id` | ArrearsCaseController (CRUD / action / escalate) | — |
| Comptabilité | `/accounting/*` (chart, journals, entries, assets, 4 reports, bank reconcile) | Accounting* × 5 controllers + AccountingBridgeController | — |
| Auto-bridging to accounting | hooked at invoice issue / payment post / expense / fixed-charge payment / sub-rental payment / wallet tx / depreciation / asset disposal | AccountingBridgeController + AccountingBridgeService | — |

## Pre-requisites before testing

Have these ready on the environment you're testing:

1. One **ADMIN** and one **COMPTABLE** account.
2. At least one active **Contract** with a daily rate, `base_amount > 0`, a client and a vehicle.
3. At least one active **Client** with ICE/CIN set (needed for PDF invoice).
4. One **BankAccount** created in Trésorerie, one **CashAccount** in `cash` mode.
5. Accounting chart of accounts seeded (check `/accounting/chart` loads with rows).
6. Company TVA rate configured at `/settings/parameters?tab=finance` (if that page exists).

If any of the above is missing, that's finding #0 — stop and fix.

## Module-by-module cases

For each case: write down **actual** vs **expected**, and tag ✅/❌.

### 1. Paiements (`/finance/payments`)

Walk the normal path through the contract wizard first, because that's how most payments get created.

| # | Scenario | Expected |
|---|---|---|
| P1 | Create a Rent payment (`type=rent`, `amount=1500`, method=cash) attached to a contract | Payment appears in list, `totals.paid` of the reservation/contract increases, audit_log row `payment.created` exists |
| P2 | Create a Franchise d'assurance payment (`type=caution`) on same contract | Appears, `totals.deposit_paid` increases, `totals.paid` **does not** change (per AGENTS §5.2) |
| P3 | Create payment with each method: `cash`, `bank_transfer`, `check`, `wallet` | All accepted. `virement` / `cheque` / `espèces` strings coming from mobile normalize via PaymentMethodNormalizer |
| P4 | Create payment ≥ amount due on invoice, then call allocate | Invoice status flips to `paid`, allocation row created, cannot over-allocate |
| P5 | Remove an allocation | Invoice drops back to `partial`/`issued`, totals recalc |
| P6 | Delete a payment (if UI exposes it) | Fails if allocations exist, succeeds otherwise. Check audit log |
| P7 | Filter list by date range / client / contract / method / type | Count matches the underlying DB |
| P8 | Mobile `/paiements` screen shows the same payments created above | Same list, same amounts, French labels for method/type |
| P9 | COMPTABLE role creates a payment | Allowed (per `payments.create` permission); AGENT_COMMERCIAL also has it via the recent grant migration |
| P10 | Audit trail of a payment shows French labels (create, allocate, delete) via `AuditTrailPresenter` | Correct French verbs |

### 2. Factures (`/finance/invoices` + `/finance/invoices/:id`)

| # | Scenario | Expected |
|---|---|---|
| I1 | Generate invoice from a contract (`generateFromContract`) | Draft invoice created with line items from the contract, correct TVA, correct client |
| I2 | Edit invoice draft (change lines) | PATCH works, totals recomputed, PDF preview matches |
| I3 | Issue the invoice | Status → `issued`, invoice number assigned from the configured sequence, PDF rendered through `PdfService` → GeneratedDocument row created |
| I4 | Cancel an issued invoice | Status → `cancelled`, audit log + accounting bridge reverses the journal entry if one was posted |
| I5 | Pay the invoice fully (via Paiements → allocate) | Status → `paid`, bridge pushes new accounting entry (debit bank, credit AR) |
| I6 | Delete a draft (`destroy`) | Allowed; deleting an issued one is refused |
| I7 | Download invoice PDF | Matches blade template `invoice.blade.php`, shows client ICE/CIN, totals |
| I8 | Customer statement (`/finance/customers/.../statement` via `CustomerStatementPage`) | Lists issued invoices + payments + deposits with correct running balance |

### 3. Trésorerie (`/finance/treasury`)

| # | Scenario | Expected |
|---|---|---|
| T1 | `summary` endpoint — total cash + bank + wallet matches actual sums | Numbers match SQL `SELECT SUM(amount)` on relevant tables |
| T2 | Create a BankAccount (IBAN, RIB, currency) | CRUD works. IBAN format validated. |
| T3 | Edit / delete empty account | Delete refused if transactions exist |
| T4 | Import bank transactions (CSV / PDF statement) | Lines appear as unmatched with correct date, amount, label |
| T5 | Match a transaction to an existing Payment | Payment gets linked, transaction status flips to `matched` |
| T6 | Bulk auto-match (score 100%) — recent feature | Lines with identical amount+label+date flip to matched; lower-score candidates stay unmatched |
| T7 | Remove a match | Transaction → unmatched, Payment loses link |
| T8 | Reconcile view at `/accounting/bank-reconciliation` | Unmatched count matches Trésorerie, matched entries show journal entry id |

### 4. Charges fixes (`/finance/fixed-charges`)

| # | Scenario | Expected |
|---|---|---|
| F1 | Create a monthly fixed charge (loyer locaux, salaire, abonnement) with `amount`, `due_day`, `vendor` | Row created, next due date computed |
| F2 | Dashboard shows this month's expected charges + paid/unpaid chip | Numbers match |
| F3 | Generate the month's payment from the charge card (`generatePayment`) | FixedChargePayment created, bridge posts to accounting (via `fromFixedChargePayment`) |
| F4 | Mark a FixedChargePayment paid | Status → `paid`, due date recomputed, next cycle appears |
| F5 | Overdue charges fire the `finance.fixed_charge_overdue` notification | Notification received by CONTENTIEUX/ADMIN on the day after the due date (needs queue worker running) |

### 5. Dépenses (`ExpenseController`)

The web page's route isn't in the main nav — expenses show up on a sub-tab somewhere; check /accounting or /finance for the UI. If you can't find the UI, the route is missing.

| # | Scenario | Expected |
|---|---|---|
| E1 | Create an Expense with `vehicle_id` and `supplier_id` | Row created, supplier exists |
| E2 | Dashboard (`dashboard`) returns totals grouped by category | Numbers match DB |
| E3 | Mark paid | Accounting bridge posts (`fromExpense`) |
| E4 | `byVehicle` lists all expenses for one vehicle | Shows what you created |
| E5 | Suppliers CRUD | Create / edit / delete works; delete refused if expenses reference it |

### 6. Crédit (`/credit`)

| # | Scenario | Expected |
|---|---|---|
| C1 | Create a CreditApplication for an existing client | Scoring runs synchronously via CreditScoringService, returns a score |
| C2 | Score is stored on the application | Numeric, 0–1000 or whatever the scale is |
| C3 | Update / approve / reject | Status transitions logged, audit trail reads in French |

### 7. Impayés (`/arrears`)

| # | Scenario | Expected |
|---|---|---|
| A1 | Open the list, see one case per overdue invoice/contract | Age, amount, severity shown |
| A2 | Open a case detail (`/arrears/:id`) | History of actions (relance SMS, relance email, mise en demeure) shown |
| A3 | Add an action (`action`) with type `call` / `email` / `sms` / `letter` | Row logged with timestamp + agent |
| A4 | Escalate to legal (`escalate`) | Case moves to `/arrears/legal`, status `legal`, CONTENTIEUX gets notification |
| A5 | Legal detail page (`/arrears/legal/:id`) shows legal timeline | Page renders, upload docs works |

### 8. Comptabilité — bridge coverage

This is the most leak-prone area. Verify each financial event posts a journal entry:

| # | Trigger | Expected |
|---|---|---|
| B1 | Issue invoice | `journal_entries` row (débit 411 client, crédit 70* produit, crédit 445 TVA) |
| B2 | Post payment allocated to that invoice | Second journal entry (débit 512 banque / 530 caisse, crédit 411 client) |
| B3 | Cancel the invoice | Reversing entry, net balance zero |
| B4 | Fixed-charge payment | Débit 6* charge, crédit 512 |
| B5 | Expense (`fromExpense`) | Débit 6* charge, crédit 401 fournisseur or 512 banque if paid immediately |
| B6 | Depreciation line booked | Débit 681 dotations, crédit 28* amortissements |
| B7 | Asset disposal | Compound entry on 675 / 775 / 28* / 2* |
| B8 | Sub-rental payment | Correct 611 or 622 (depending on your chart mapping) |
| B9 | Wallet top-up | Débit 512, crédit wallet liability account |
| B10 | Reports `/accounting/reports/trial-balance` & `/balance-sheet` & `/income-statement` & `/tax-report` & `/supplier-auxiliary` | Each loads, numbers balance, debits = credits |

### 9. Mobile `/paiements`

| # | Scenario | Expected |
|---|---|---|
| M1 | Login as AGENT_COMMERCIAL on mobile, open `/paiements` | List loads with same payments as web |
| M2 | Open a payment detail | Amount + method + type in French (Loyer location, Franchise d'assurance…) |
| M3 | Login as COMPTABLE on mobile | Approval flow fires (admin-approval feature). After approval, Paiements is one of the 5 modules shown |
| M4 | COMPTABLE on mobile sees Paiements/Contrats/Documents/Sous-location/Discussions only | No Flotte / Réservations / Clients / GPS tiles |

## Cross-cutting checks (don't skip)

1. **Permissions** — log in as each role (ADMIN, COMPTABLE, AGENT_COMMERCIAL, CONTENTIEUX, DIRECTEUR) and confirm the finance module nav + create/edit buttons behave per `erp.php` permission map. Especially: AGENT_COMMERCIAL should be able to `payments.create` (per the recent grant migration) but not see Comptabilité.
2. **Audit log** — every write across all modules above must produce an `audit_logs` row. Open `/audit`, filter by module `finance|contracts|accounting`, and spot-check 10 random rows: the French `action_label` must make sense.
3. **Dates** — every date field renders dd/MM/yyyy (AGENTS §5.6). Pick 3 fields per page and verify.
4. **Response envelope** — hit any finance endpoint with devtools open; response should be `{"data": {...}, "meta": null, "links": null}` (AGENTS §6).
5. **Worker jobs** — run `tail -f /var/www/driveflow/backend/storage/logs/laravel.log` during testing. Watch for `OverdueDetector`, `ArrearsNotifier`, `AccountingBridgeJob` failures. Any stack trace = finding.
6. **Queue** — confirm `systemctl status driveflow-worker` is active before testing scheduled things (overdue detection, notifications).

## Suggested execution order

1. **Pre-reqs** (15 min)
2. **Paiements P1–P10** (45 min) — most central, break early
3. **Factures I1–I8** (45 min)
4. **Bridge B1–B3** immediately after (15 min) — easiest to spot drift
5. **Trésorerie T1–T8** (30 min)
6. **Charges fixes F1–F5** (20 min)
7. **Dépenses E1–E5** (20 min)
8. **Crédit C1–C3** (15 min)
9. **Impayés A1–A5** (20 min)
10. **Bridge B4–B10 + reports** (30 min)
11. **Mobile M1–M4** (15 min)
12. **Cross-cutting checks** (20 min)

Total: ~5 hours for one tester.

## What to report back

Don't send every result. Only:
- Row number of each **failed** case (e.g. "P5, I4, B2") + one-line observed behaviour
- Any 500 / 422 / 403 you didn't expect
- Any journal entry where debit ≠ credit

That's enough to bisect each regression and fix.
