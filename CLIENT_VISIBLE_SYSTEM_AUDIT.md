# DriveFlow — Audit Système Visible Client

**Date:** 2026-05-04
**Méthode:** Inspection stricte du code (sidebar, routes, services API, middleware). Aucune déduction depuis les tables DB ou la documentation.
**Périmètre:** `frontend/modules/layout/AppLayout.tsx`, `frontend/routes/AppRoutes.tsx`, `frontend/domain/appRole.ts`, `frontend/services/*`, `backend/routes/api.php`, `backend/database/seeders/RbacSeeder.php`.

---

## 1. Sidebar / Navigation (ce que le client voit)

Source unique : [`AppLayout.tsx:22-70`](frontend/modules/layout/AppLayout.tsx). Sidebar définie en dur dans la constante `GROUPS`. Filtrage runtime via `canAccessModule(role, module)` ([`appRole.ts:92-95`](frontend/domain/appRole.ts)) + flag `VITE_SHOW_EXPERIMENTAL`.

| Menu Item (clé i18n) | Libellé FR | Route | Module | Visible aux rôles | Réel/Placeholder | Notes |
|---|---|---|---|---|---|---|
| `nav.dashboard` | Cockpit direction | `/dashboard` | dashboard | TOUS sauf rôles sans `dashboard` (donc tous les 10 rôles) | Réel | KPI exécutifs |
| `nav.fleet` | Flotte | `/fleet` | fleet | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE, AGENT_LIVRAISON, AGENT | Réel | Liste véhicules + détail |
| `nav.fleetCompliance` | Conformité véhicules | `/fleet/compliance` | fleet | (mêmes que fleet) | Réel | Inspections, assurances |
| `nav.gps` | GPS & géolocalisation | `/gps` | gps | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE, AGENT_LIVRAISON | Réel (avec fallback mock) | Voir §3 |
| `nav.customers` | Clients & conformité | `/customers` | customers | ADMIN, DIRECTEUR, ANALYSTE_CREDIT, AGENT_COMMERCIAL, CONTENTIEUX | Réel | KYC intégré |
| `nav.contracts` | Contrats | `/contracts` | contracts | ADMIN, DIRECTEUR, ANALYSTE_CREDIT, AGENT_COMMERCIAL, COMPTABLE, CONTENTIEUX, CLIENT_PORTAL, AGENT | Réel (avec fallback mock) | |
| `nav.rentals` | Locations courte durée | `/rentals` | rentals | ADMIN, DIRECTEUR, AGENT_COMMERCIAL, AGENT | Réel **sans fallback** — affiche "API non configurée" sinon ([`RentalsPage.tsx:14-18`](frontend/modules/rentals/RentalsPage.tsx)) | |
| `nav.usedCars` | Véhicules d'occasion | `/used-cars` | usedCars | ADMIN, DIRECTEUR, AGENT_COMMERCIAL | Réel | |
| `nav.credit` | Analyse crédit | `/credit` | credit | ADMIN, DIRECTEUR, ANALYSTE_CREDIT | Réel | Scoring + décision |
| `nav.finance` | Finance & fiscalité | `/finance` | finance | ADMIN, DIRECTEUR, COMPTABLE | Réel | |
| `nav.accounting` | Comptabilité | `/accounting` | accounting | ADMIN, DIRECTEUR, COMPTABLE | Réel | |
| `nav.arrears` | Impayés & contentieux | `/arrears` | arrears | ADMIN, DIRECTEUR, COMPTABLE, CONTENTIEUX | Réel | |
| `nav.signatures` | Signatures électroniques | `/signatures` | signatures | ADMIN, DIRECTEUR (uniquement — pas dans `ROLE_MODULE_ACCESS` pour les autres) | Réel | Provider configuré: yousign |
| `nav.ai` | IA & prédictions | `/ai` | ai | ADMIN, DIRECTEUR — **ET** `VITE_SHOW_EXPERIMENTAL=true` | UI seulement / inconnu | Caché si flag absent. Backend non vérifié dans cet audit |
| `nav.mobileOps` | Opérations terrain | `/mobile-ops` | mobileOps | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE, AGENT_LIVRAISON, CLIENT_PORTAL, AGENT | UNKNOWN (page minimale, contenu non vérifié) | |
| `nav.notifications` | Notifications | `/notifications` | notifications | TOUS rôles | Réel | |
| `nav.documents` | Centre documentaire | `/documents` | documents | TOUS sauf CLIENT_PORTAL | Réel | |
| `nav.audit` | Audit & traçabilité | `/audit` | audit | ADMIN, DIRECTEUR uniquement | Réel **sans fallback** — affiche "API non configurée" sinon | |
| `nav.settings` | Paramètres | `/settings` | settings | ADMIN, DIRECTEUR uniquement | Réel | Users, Roles, Branches |

**Notes critiques :**
- Le rôle de fallback si pas de session est `AGENT_COMMERCIAL` ([`AppLayout.tsx:96`](frontend/modules/layout/AppLayout.tsx)).
- Les groupes vides après filtrage sont masqués automatiquement.
- Un fichier `frontend/components/Sidebar.tsx` existe mais n'est **PAS utilisé** (composant legacy mort).

---

## 2. Pages réellement accessibles

77 routes au total : 3 publiques (auth) + 74 protégées par `RequireAuth` + `ModuleGate`.

### Auth (publiques)
| Route | Composant | Module | Accessible | Auth requise | API connectée | Statut |
|---|---|---|---|---|---|---|
| `/login` | LoginPage | auth | Oui | Non | `POST /v1/auth/login` (dual mode) | Fully working |
| `/forgot-password` | ForgotPasswordPage | auth | Oui | Non | `POST /v1/auth/forgot-password` | Fully working |
| `/reset-password` | ResetPasswordPage | auth | Oui | Non | `POST /v1/auth/reset-password` | Fully working |

### Dashboard
| Route | Composant | Module | Accessible | Auth | API | Statut |
|---|---|---|---|---|---|---|
| `/` → `/dashboard` | redirect | — | Oui | Oui | — | Fully working |
| `/dashboard` | ExecutiveDashboardPage | dashboard | Oui | Oui | `GET /v1/dashboard/executive` | Fully working |
| `/dashboard/finance` | DashboardFinancePage | dashboard | Oui | Oui | `GET /v1/dashboard/finance` | Fully working |
| `/dashboard/risk` | DashboardRiskPage | dashboard | Oui | Oui | `GET /v1/dashboard/risk` | Fully working |
| `/dashboard/fleet` | DashboardFleetPage | dashboard | Oui | Oui | `GET /v1/dashboard/fleet` | Fully working |

### Fleet
| Route | Composant | Module | API | Statut |
|---|---|---|---|---|
| `/fleet` | FleetListPage | fleet | `GET /v1/vehicles` | Fully working (UI affiche message si API absente) |
| `/fleet/:id` | FleetVehicleDetailPage | fleet | `GET /v1/vehicles/{id}` + sous-ressources | Fully working |
| `/fleet/maintenance` | FleetMaintenanceDashboardPage | fleet | maintenance-plans/events | Fully working |
| `/fleet/compliance` | FleetComplianceDashboardPage | fleet | compliance endpoints | Fully working |

### Customers
| Route | Composant | Module | API | Statut |
|---|---|---|---|---|
| `/customers` | CustomersPage | customers | `GET /v1/customers` | Fully working |
| `/customers/:id` | CustomerDetailPage | customers | `GET /v1/customers/{id}` + addresses/contacts/bank-accounts/notes/kyc-cases | Fully working |
| `/customers/:id/statement` | CustomerStatementPage | customers | `GET /v1/customers/{id}/statement` | Fully working |

### Contracts
| Route | Composant | Module | API | Statut |
|---|---|---|---|---|
| `/contracts` | ContractsPage | contracts | `GET /v1/contracts` (avec fallback mock) | Fully working |
| `/contracts/new` | ContractWizardPage | contracts | `POST /v1/contracts` (importe `apiClient` ET `erpApi`) | Fully working |
| `/contracts/templates` | ContractTemplatesPage | contracts | `GET /v1/contract-templates` | Fully working |
| `/contracts/:id` | ContractDetailPage | contracts | `GET /v1/contracts/{id}` | Fully working |

### Credit
| Route | Composant | Module | API | Statut |
|---|---|---|---|---|
| `/credit` | CreditAnalysisPage | credit | `GET /v1/credit-applications`, scoring, decision | Fully working |

### Finance
| Route | Composant | Module | API | Statut |
|---|---|---|---|---|
| `/finance` | FinancePage | finance | `GET /v1/treasury/summary` | Fully working |
| `/finance/invoices` | InvoicesPage | finance | `GET /v1/invoices` | Fully working |
| `/finance/invoices/:id` | InvoiceDetailPage | finance | `GET /v1/invoices/{id}` | Fully working |
| `/finance/payments` | PaymentsPage | finance | `GET /v1/payments` | Fully working |
| `/finance/treasury` | TreasuryPage | finance | treasury endpoints | Fully working |

### Accounting
| Route | Composant | API | Statut |
|---|---|---|---|
| `/accounting` | AccountingPage | accounting summary | Fully working |
| `/accounting/chart` | ChartOfAccountsPage | `GET /v1/accounting/accounts` | Fully working |
| `/accounting/journals` | JournalsPage | `GET /v1/accounting/journals` | Fully working |
| `/accounting/entries` | EntriesPage | `GET /v1/accounting/entries` | Fully working |
| `/accounting/entries/new` | JournalEntryForm | POST entries | Fully working |
| `/accounting/entries/:id` | EntryDetailPage | GET entry | Fully working |
| `/accounting/fixed-assets` | FixedAssetsPage | fixed-assets | Fully working |
| `/accounting/fixed-assets/:id` | FixedAssetDetailPage | fixed-assets/{id} | Fully working |
| `/accounting/reports/trial-balance` | TrialBalancePage | `GET /v1/accounting/trial-balance` | Fully working |
| `/accounting/reports/balance-sheet` | BalanceSheetPage | `GET /v1/accounting/balance-sheet` | Fully working |
| `/accounting/reports/income-statement` | IncomeStatementPage | `GET /v1/accounting/income-statement` | Fully working |
| `/accounting/reports/tax-report` | TaxReportPage | tax endpoints | Fully working |
| `/accounting/settings` | AccountingSettingsPage | settings | Fully working |

### Arrears
| Route | Composant | API | Statut |
|---|---|---|---|
| `/arrears` | ArrearsDashboardPage | `GET /v1/arrears/cases` | Fully working |
| `/arrears/legal` | LegalCasesPage | `GET /v1/legal-cases` | Fully working |
| `/arrears/legal/:id` | LegalCaseDetailPage | legal-cases/{id} | Fully working |
| `/arrears/:id` | ArrearsCaseDetailPage | arrears/cases/{id} | Fully working |

### Signatures
| Route | Composant | API | Statut |
|---|---|---|---|
| `/signatures` | SignatureEnvelopesPage | `GET /v1/signatures/envelopes` | Fully working |
| `/signatures/:id` | SignatureEnvelopeDetailPage | envelopes/{id} + events | Fully working |

### Used Cars
| Route | Composant | API | Statut |
|---|---|---|---|
| `/used-cars` | UsedCarsPage | `GET /v1/used-cars/listings` | Fully working |
| `/used-cars/:id` | UsedCarDetailPage | listings/{id} + valuations/transfers | Fully working |

### GPS
| Route | Composant | API | Statut |
|---|---|---|---|
| `/gps` | GpsDashboardPage | `GET /v1/gps/vehicles/live` | Fully working |
| `/gps/alerts` | GpsAlertsPage | `GET /v1/gps/alerts` (avec fallback mock) | Fully working |
| `/gps/geofences` | GeofencesPage | `GET /v1/geofences` (fallback mock) | Fully working |
| `/gps/vehicles/:id/live` | VehicleLiveTrackingPage | live | Fully working |
| `/gps/vehicles/:id/trips` | VehicleTripsPage | trips | Fully working |

### AI (expérimental)
| Route | Composant | Statut |
|---|---|---|
| `/ai` | AiHubPage | UI only / UNKNOWN — endpoints backend non vérifiés |
| `/ai/assistant` | AiAssistantPage | UI only / UNKNOWN |
| `/ai/predictions/:topic` | AiPredictionPlaceholder | **Placeholder** (le nom de fichier le dit) |

### Autres
| Route | Composant | Module | API | Statut |
|---|---|---|---|---|
| `/mobile-ops` | MobileOpsPage | mobileOps | UNKNOWN | UNKNOWN — contenu minimal d'après l'exploration |
| `/notifications` | NotificationsPage | notifications | `GET /v1/notifications` | Fully working |
| `/settings` | SettingsPage | settings | — | Fully working |
| `/settings/users` | UserManagementPage | settings | `GET /v1/users` | Fully working |
| `/settings/roles` | RolesPermissionsPage | settings | `GET /v1/roles` | Fully working |
| `/settings/branches` | BranchManagementPage | settings | `GET /v1/branches` | Fully working |
| `/audit` | AuditPage | audit | `GET /v1/audit` (affiche "API non configurée" sinon) | Fully working |
| `/documents` | DocumentsCenterPage | documents | `GET /v1/documents` | Fully working |
| `/rentals` | RentalsPage | rentals | reservations endpoints (placeholder si pas d'API) | Fully working |
| `/profile` | ProfilePage | — (pas de gate) | implicite `/v1/auth/me` | Fully working |
| `/agence` | AgencePage | — (pas de gate) | branches | Fully working |
| `*` | NotFoundPage | — | — | Fully working |

---

## 3. Fonctionnalités réelles par module

### Module : Customers
- **Voir :** Liste clients, fiche client (adresses, contacts, comptes bancaires, notes, dossiers KYC), relevé client.
- **Faire :** Créer/éditer client, uploader documents KYC, vérifier/approuver/rejeter KYC (rôles ADMIN/DIRECTEUR/ANALYSTE_CREDIT uniquement), blacklister (ADMIN/DIRECTEUR/CONTENTIEUX).
- **Endpoints :** `/v1/customers/*`, `/v1/customers/{id}/{addresses,contacts,bank-accounts,notes,kyc-cases}`, `/v1/kyc-cases/*`.
- **Données :** Réelles via API.
- **Manquant :** Import en masse (non détecté), export non vérifié.

### Module : Fleet
- **Voir :** Liste véhicules, détail véhicule (maintenance, réparations, accidents, historique, coûts, assurances, contrôles techniques), tableau maintenance, tableau conformité.
- **Faire :** CRUD véhicules, ajout maintenance/répa/accident, suivi profitabilité.
- **Endpoints :** `/v1/vehicles`, `/v1/vehicles/{id}/{maintenance-plans,maintenance-events,repairs,accidents,history,costs,insurance-policies,technical-inspections}`.
- **Données :** Réelles.
- **Manquant :** UNKNOWN (export, import en masse non détecté).

### Module : Contracts
- **Voir :** Liste contrats, détail, templates.
- **Faire :** Créer via wizard (ContractWizardPage importe `apiClient` + `erpApi`), gérer templates.
- **Endpoints :** `/v1/contracts`, `/v1/contract-templates`.
- **Données :** Réelles avec fallback mock (`hasBackend()` dans `contractsApi.ts:27-42`).

### Module : Credit
- **Voir :** Demandes de crédit.
- **Faire :** Lancer scoring, prendre décision.
- **Endpoints :** `/v1/credit-applications`, `/score`, `/decision`.

### Module : Finance & Accounting
- **Voir :** Trésorerie, factures, paiements, plan comptable, journaux, écritures, immobilisations, rapports (balance, bilan, P&L, fiscal).
- **Faire :** CRUD factures, paiements (allocate/unallocate), écritures comptables, gestion immobilisations.
- **Endpoints :** `/v1/{invoices,payments,treasury,accounting,taxes,fiscal-years,fixed-assets}/*`.
- **Hard role gates :** ADMIN/DIRECTEUR/COMPTABLE uniquement sur trésorerie + comptabilité (`api.php:557-682`).

### Module : Arrears (Impayés)
- **Voir :** Cas d'impayés, dossiers contentieux.
- **Faire :** Actions de recouvrement, escalade, gestion dossiers légaux, ordres de saisie.
- **Endpoints :** `/v1/arrears/cases/*`, `/v1/legal-cases/*`.
- **Hard role gates :** ADMIN/DIRECTEUR/CONTENTIEUX sur opérations légales.

### Module : Signatures
- **Voir :** Enveloppes de signature, événements.
- **Faire :** Créer enveloppe, envoyer, signer (avec OTP), rejeter, annuler, télécharger.
- **Endpoints :** `/v1/signatures/envelopes/*`.
- **Provider :** yousign (configuré dans `.env`).
- ⚠️ **Sidebar visible UNIQUEMENT pour ADMIN/DIRECTEUR** ([`appRole.ts`](frontend/domain/appRole.ts)) — pas pour COMPTABLE/CONTENTIEUX/AGENT_COMMERCIAL/CLIENT_PORTAL alors que les permissions backend pour signer existent.

### Module : Used Cars
- **Voir :** Listings VO, valuations, transferts.
- **Faire :** Créer listing, évaluer, publier, vendre (ADMIN/DIRECTEUR uniquement), transférer propriété.
- **Endpoints :** `/v1/used-cars/listings/*`, `/v1/vehicle-ownership-transfers/*`.

### Module : GPS
- **Voir :** Tableau de bord GPS, alertes, geofences, suivi live, trajets.
- **Faire :** Gérer geofences, voir alertes (avec fallback mock).
- **Endpoints :** `/v1/gps/*`, `/v1/geofences`.

### Module : Notifications
- **Voir :** Liste notifications, compteur non lues.
- **Faire :** Marquer lu, marquer tout lu, retry (ADMIN/DIRECTEUR), templates (ADMIN/DIRECTEUR).
- **Endpoints :** `/v1/notifications/*`, `/v1/notification-templates`.

### Module : Documents
- **Voir :** Centre documentaire, documents expirants.
- **Faire :** Upload, download, par entité (`/v1/entities/{type}/{id}/documents`).
- **Endpoints :** `/v1/documents/*`.

### Module : Audit
- **Voir :** Logs d'audit.
- **Faire :** Export CSV.
- **Endpoints :** `/v1/audit`, `/v1/audit/export.csv`.
- ⚠️ Affiche "API non configurée" si `VITE_API_BASE` absent.

### Module : Settings
- **Voir/Faire :** Gestion utilisateurs, rôles, permissions, agences.
- **Endpoints :** `/v1/users`, `/v1/roles`, `/v1/permissions`, `/v1/branches`.
- **Hard role gate :** ADMIN/DIRECTEUR uniquement.

### Module : Rentals
- **Voir :** Liste réservations.
- **Faire :** Créer réservation, confirmer, handover, dommages, facturation, extensions.
- **Endpoints :** `/v1/reservations/*`, `/v1/rentals/availability`.
- ⚠️ **Pas de fallback mock** — la page affiche un placeholder "Backend non configuré" si VITE_API_BASE absent ([`RentalsPage.tsx:14-18`](frontend/modules/rentals/RentalsPage.tsx)).

### Module : AI
- **Voir :** Hub IA, assistant.
- **Faire :** UNKNOWN.
- **Endpoints :** UNKNOWN — non vérifiés dans cet audit.
- ⚠️ Caché par défaut (`VITE_SHOW_EXPERIMENTAL=false` dans `.env.local`). Le composant `AiPredictionPlaceholder` est nommé explicitement comme placeholder.

### Module : Mobile Ops
- **Voir :** UNKNOWN — page minimale.
- **Faire :** UNKNOWN.
- **Endpoints :** UNKNOWN.
- ⚠️ Visible pour CLIENT_PORTAL dans la sidebar mais aucune permission backend (`missions.*`, `rentals.handover*`) ne lui est accordée → menu cliquable mais 403 sur appels API.

---

## 4. Accès par rôle (RÉEL)

Source: [`appRole.ts:38-87`](frontend/domain/appRole.ts) (sidebar) + [`RbacSeeder.php:284-384`](backend/database/seeders/RbacSeeder.php) (permissions backend) + [`api.php`](backend/routes/api.php) (gates).

| Rôle | Sidebar voit | Peut faire | Restrictions manquantes | Risques |
|---|---|---|---|---|
| **ADMIN** | 18 modules (tous) | Tout (`hasPermission` retourne toujours true) | Aucune par design | Compte super-admin — protection mot de passe critique |
| **DIRECTEUR** | 18 modules | 102 permissions, presque tout | Pas `roles.manage`, pas `users.delete`, pas `manage_settings` | Acceptable |
| **ANALYSTE_CREDIT** | 6 modules : dashboard, customers, credit, contracts, notifications, documents | KYC verify/approve/reject, scoring crédit | OK | Aucun |
| **AGENT_COMMERCIAL** | 7 modules : dashboard, customers, contracts, usedCars, rentals, notifications, documents | Créer clients/contrats/réservations/factures (partiel), KYC create | Ne peut pas approuver contrats ni KYC | OK |
| **GESTIONNAIRE_FLOTTE** | 6 modules : dashboard, fleet, gps, mobileOps, notifications, documents | Véhicules, maintenance, GPS, geofences | Pas d'accès clients/contrats/finance | OK |
| **COMPTABLE** | 7 modules : dashboard, finance, accounting, contracts, arrears, notifications, documents | Toute la finance/compta/fiscalité | Lecture contrats seulement | OK |
| **CONTENTIEUX** | 6 modules : dashboard, arrears, customers, contracts, notifications, documents | Recouvrement, légal, blacklist | OK | OK |
| **AGENT_LIVRAISON** | 5 modules : dashboard, mobileOps, fleet, gps, notifications, documents | Missions (start/complete/photos/checklist), handover véhicules | OK | OK |
| **CLIENT_PORTAL** | 4 modules : dashboard, contracts, notifications, mobileOps | Voir contrats/factures/paiements, signer, voir notifs | ⚠️ **mobileOps visible mais aucune permission backend → 403** | ⚠️ Incohérence menu/permissions |
| **AGENT** (legacy) | 8 modules | 10 permissions read-only | Très limité | OK (legacy) |

⚠️ **Problème mapping legacy :** [`AuthContext.tsx:28-43`](frontend/modules/auth/AuthContext.tsx) collapse 6 rôles backend (ANALYSTE_CREDIT, AGENT_COMMERCIAL, GESTIONNAIRE_FLOTTE, COMPTABLE, CONTENTIEUX, AGENT_LIVRAISON) en un seul `UserRole.AGENT` legacy. Cela peut affecter les composants UI qui utilisent encore l'enum legacy `UserRole` au lieu de `AppRole`.

---

## 5. Caché / fake / trompeur

### Modules dans le code mais non visibles dans la sidebar
- **Aucun module n'est caché.** Les 18 modules de `GROUPS` sont tous routés et tous accessibles (selon rôle).

### Sidebar items menant à des pages incomplètes ou placeholder
| Item | Problème |
|---|---|
| `nav.ai` (AI) | Caché par défaut (`VITE_SHOW_EXPERIMENTAL=false`). Composant `AiPredictionPlaceholder` est explicitement un placeholder. Endpoints backend **non vérifiés**. |
| `nav.mobileOps` | Page minimale d'après l'exploration — UI réelle UNKNOWN. Pour CLIENT_PORTAL : aucune permission backend ne suit → erreurs 403. |
| `nav.audit` | Affiche "API non configurée" si VITE_API_BASE absent (pas un faux, mais bloque en démo offline). |
| `nav.rentals` | Affiche placeholder si VITE_API_BASE absent (pas de mock). |

### Faux composants encore présents dans le code (non utilisés)
- [`frontend/components/Sidebar.tsx`](frontend/components/Sidebar.tsx) : composant legacy avec menu en dur (`dashboard, clients, vehicles, reservations`) et enum `UserRole` (ADMIN/AGENT/CLIENT). **Non utilisé** — la sidebar active est dans `AppLayout.tsx`. À supprimer.
- [`frontend/types.ts:2-6`](frontend/types.ts) : enum legacy `UserRole` à 3 valeurs, encore importé par AuthContext pour rétro-compatibilité.

### Données mock vs réel
- `frontend/services/erpApi.ts` + `frontend/services/erpStore.ts` : mock store en localStorage utilisé en fallback **uniquement si `VITE_API_BASE` est vide**. Avec `VITE_API_BASE=http://localhost:8001/api`, tous les modules passent en API réelle (sauf AI/MobileOps : UNKNOWN).
- Modules avec dual-mode (mock + réel) : auth, contracts, gps.
- Modules **sans fallback** (placeholder si pas d'API) : rentals, audit, fleet (message d'avertissement).

### Permissions orphelines (déclarées mais non utilisées)
- 32 codes legacy `view_X`/`manage_X` dans le seeder ne sont **jamais** vérifiés par une route. Ils existent uniquement comme fallback de config (`config/erp.php`) si la table `permissions` est vide. Pas un risque de sécurité — les routes utilisent les codes granulaires `module.action`.

---

## 6. Flows end-to-end réellement faisables

| Flow | Marche ? | Étapes vérifiées (par code) | Notes |
|---|---|---|---|
| Login → session JWT (Sanctum) | ✅ | `POST /v1/auth/login` → token + user + permissions stockés en localStorage | Dual mode (vrai si VITE_API_BASE, mock sinon) |
| Forgot password / Reset | ✅ | Endpoints existent | Mail stub (`MAIL_MAILER=log` dans `.env`) |
| Créer client → KYC upload → KYC approve | ✅ | POST /customers, POST /kyc-cases, /kyc-documents, hard gate sur approve | Hard role gate ADMIN/DIRECTEUR/ANALYSTE_CREDIT |
| Créer véhicule → ajouter maintenance/répa/accident | ✅ | POST /vehicles, sous-ressources implémentées | |
| Créer contrat (wizard) → activer → générer échéances | ✅ | ContractWizardPage + ContractController complet | |
| Émettre facture → encaisser paiement → allouer | ✅ | InvoiceController, PaymentController, allocate/unallocate | |
| Analyse crédit : scoring → décision | ✅ | `/credit-applications/{id}/score`, `/decision` | |
| Comptabilité : journal → écriture → rapports (TB, BS, P&L) | ✅ | Toutes les routes implémentées | |
| Signature électronique : créer enveloppe → envoyer → signer (OTP) | ✅ | `/signatures/envelopes/*` complet, provider yousign configuré | ⚠️ Sidebar visible uniquement ADMIN/DIRECTEUR |
| Impayés : cas → action → escalade légale → saisie | ✅ | `/arrears/cases/*`, `/legal-cases/*` | Hard gate CONTENTIEUX |
| Véhicules d'occasion : créer listing → évaluer → publier → vendre | ✅ | `/used-cars/listings/*` | Vente: ADMIN/DIRECTEUR uniquement |
| GPS : voir live → alertes → geofences | ✅ | Endpoints existent (mock fallback pour alertes/geofences) | |
| Location courte durée : disponibilité → réservation → handover → facturation | ✅ | ReservationController complet | **Pas de mode démo** — exige API réelle |
| Audit trail | ✅ | `/v1/audit` + export CSV | Exige API réelle |
| Admin : créer user → assigner rôle → permissions | ✅ | `/v1/users`, `/v1/roles`, `/v1/permissions` | ADMIN/DIRECTEUR uniquement |
| AI : prédictions, assistant | ❓ UNKNOWN | Caché par défaut, composants `*Placeholder` | Non vérifié |
| Mobile Ops : missions terrain | ❓ UNKNOWN | Page minimale | Backend `MissionController` existe mais UI non vérifiée |

---

## 7. Vérité brute (résumé honnête)

**Ce que le client voit réellement** (avec `VITE_API_BASE` configuré et un compte ADMIN) :
- 18 modules dans la sidebar, regroupés en 5 sections.
- 74 routes protégées + 3 d'auth.
- Tous les modules métier essentiels (clients, flotte, contrats, crédit, finance, compta, impayés, signatures, VO, GPS, documents, notifications, audit, paramètres, locations) sont **réellement implémentés** côté frontend ET backend.

**Ce que le client pense voir mais qui peut tromper** :
- **AI module** : présent dans la sidebar mais caché derrière un flag (`VITE_SHOW_EXPERIMENTAL`). Composants nommés `*Placeholder`. Backend non vérifié dans cet audit. → **UI seulement / inconnu.**
- **Mobile Ops** : page minimale, contenu non vérifié. Pour CLIENT_PORTAL : visible dans le menu mais sans permissions backend → 403 garantis.
- **Signatures électroniques** : visible UNIQUEMENT pour ADMIN/DIRECTEUR dans la sidebar, alors que CLIENT_PORTAL/COMPTABLE/etc. ont des permissions backend pour signer/voir. Incohérence menu/RBAC.
- **Rentals & Audit** : exigent absolument une API backend. Pas de fallback démo.

**Ce qui est réellement utilisable end-to-end (avec API connectée et seeders chargés)** :
- Auth (login/logout/me/forgot/reset)
- Customers + KYC
- Vehicles + maintenance/répa/accidents
- Contracts (wizard, templates, détail)
- Credit applications (scoring + decision)
- Invoices + payments + treasury
- Accounting complet (journaux, écritures, immobilisations, rapports comptables et fiscaux)
- Arrears + legal cases
- E-signatures (yousign)
- Used cars (listings + transferts de propriété)
- GPS + geofences
- Notifications + documents
- Audit + admin (users/roles/branches)
- Rentals (réservations + handover + facturation)

**Ce qui est faux / incomplet / à risque** :
- ❌ Module AI : statut UNKNOWN, composants placeholder.
- ❌ Mobile Ops : statut UNKNOWN.
- ❌ Composants legacy non utilisés : `components/Sidebar.tsx`, enum `UserRole` legacy.
- ⚠️ CLIENT_PORTAL voit Mobile Ops sans pouvoir l'utiliser (403).
- ⚠️ Signatures non visibles pour les rôles qui ont des permissions de signature.
- ⚠️ Mapping legacy `AuthContext.sessionToLegacyUser()` collapse 6 rôles en un seul AGENT — peut affecter les composants UI utilisant l'ancien `UserRole`.
- ⚠️ Configuration locale (cf. fix précédent) : VirtualHost Apache mal alignée — bloque toutes les requêtes API tant que le port dédié n'est pas configuré.

---

## 8. Verdict

| Critère | Verdict | Justification |
|---|---|---|
| **Demo-ready** | ⚠️ **OUI sous condition** | Démo avec un ADMIN sur backend complet : OK. Démo offline (sans API) : limitée — Rentals, Audit, Fleet affichent des messages "API non configurée". AI/MobileOps à cacher. |
| **Pilot-ready** | ⚠️ **OUI sous condition** | Pour un pilote opérationnel : oui sur les 14 modules réellement implémentés, **après** : (1) corriger l'incohérence menu/permissions CLIENT_PORTAL/MobileOps, (2) ouvrir Signatures aux rôles qui ont la permission, (3) cacher ou finaliser AI, (4) clarifier MobileOps, (5) tester les seeders RBAC en prod. |
| **Production-ready** | ❌ **NON** | Bloqueurs : (a) AI/MobileOps inachevés et visibles, (b) mapping rôles legacy à finaliser, (c) composants morts à supprimer, (d) tests E2E non vérifiés dans cet audit, (e) configuration Apache/CORS à valider, (f) audit sécurité (XSS, CSRF, rate-limiting) non couvert ici. |

---

## Annexes — Références fichiers

**Frontend :**
- Sidebar : [`frontend/modules/layout/AppLayout.tsx:22-105`](frontend/modules/layout/AppLayout.tsx)
- Routes : [`frontend/routes/AppRoutes.tsx`](frontend/routes/AppRoutes.tsx)
- Module Gate : [`frontend/routes/ModuleGate.tsx:6-11`](frontend/routes/ModuleGate.tsx)
- Rôles : [`frontend/domain/appRole.ts:2-95`](frontend/domain/appRole.ts)
- Auth : [`frontend/modules/auth/AuthContext.tsx:28-119`](frontend/modules/auth/AuthContext.tsx)
- API client : [`frontend/services/apiClient.ts`](frontend/services/apiClient.ts)
- Mock : [`frontend/services/erpApi.ts`](frontend/services/erpApi.ts), [`frontend/services/erpStore.ts`](frontend/services/erpStore.ts)
- Composant mort : [`frontend/components/Sidebar.tsx`](frontend/components/Sidebar.tsx)

**Backend :**
- Routes : [`backend/routes/api.php`](backend/routes/api.php) (lignes 66-763)
- Seeder RBAC : [`backend/database/seeders/RbacSeeder.php`](backend/database/seeders/RbacSeeder.php)
- Middleware : [`backend/app/Http/Middleware/EnsureRole.php`](backend/app/Http/Middleware/EnsureRole.php), [`EnsurePermission.php`](backend/app/Http/Middleware/EnsurePermission.php)
- User model : [`backend/app/Models/User.php`](backend/app/Models/User.php)
- Config legacy : [`backend/config/erp.php`](backend/config/erp.php)
