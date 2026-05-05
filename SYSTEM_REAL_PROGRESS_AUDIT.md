# SYSTEM_REAL_PROGRESS_AUDIT — DriveFlow

> Audit technique senior réalisé sur le code, les routes, les modèles, les migrations,
> les services, les pages et la base réelle au **27/04/2026**.
> Tout ce qui est cité plus bas a été vérifié dans le repository.
> Mention `non trouvé` quand une fonction attendue n'existe pas.

---

## 1. Résumé exécutif

DriveFlow est aujourd'hui un **MVP avancé** d'ERP automobile / leasing pour le marché marocain.
Le backend Laravel 13 + Sanctum couvre **14 phases métier déjà câblées** (auth, RBAC, clients/KYC,
flotte avec entretien/réparations/accidents, contrats LLD/LOA/crédit/VO, scoring crédit,
GPS rule-driven, réservations/missions, vente VO, facturation/paiements/trésorerie,
comptabilité double entrée + bridges automatiques, contentieux + ordres de reprise,
signature électronique avec OTP interne, dashboards multi-axes). 87 tables sont
matérialisées dans `backend/driveflow_db.sql` et 32 migrations Laravel ont été ajoutées
sur le tronc Phase 4–8 + 9–13.

Le frontend React 19 + Vite expose ~70 routes protégées par `RequireAuth` + `ModuleGate`,
avec un design system maison (`df-card`, `df-btn`, `df-input`, `KpiCard`, `DataTable`, etc.).
Les pages métier les plus mûres (clients, fiche véhicule, contrats, finance, comptabilité,
contentieux, signature, used-cars, GPS, missions) **appellent réellement** l'API Laravel
via `apiClient`. Plusieurs zones restent encore en **mock localStorage** (audit, notifications,
écran historique `screens/VehiclesList`, dashboards de second rang quand `VITE_API_BASE` est vide).

**Forces réelles** : socle backend cohérent (UUID, Sanctum, services, FormRequests,
Resources, `ApiResponse` normalisé), schéma DB exhaustif, RBAC backend par rôles + permissions,
moteur comptable double entrée fonctionnel, bridges invoice/payment/depreciation/disposal,
GPS rule service, KYC documenté, signature OTP interne.

**Manques majeurs** : aucun seed admin de référence garanti, pas de table `audit_logs` câblée
(le `AuditLogger` log seulement vers `Log::info`), génération PDF contrat / facture **non trouvée**,
intégration signature externe (DocuSign/Yousign) reste un placeholder, pas de portail client,
pas de permissions fines `permission:*` mappées dans les routes (seul `role:` est utilisé en pratique),
sécurité frontend doublée backend uniquement pour quelques routes critiques (un AGENT_COMMERCIAL
peut techniquement lire/écrire la plupart des endpoints non `role:`-gardés).

**Risques livraison client** : démo plausible sur tous les modules ; **production réelle**
dépend de : (a) données réelles seedées, (b) durcissement des permissions backend par module,
(c) génération PDF, (d) audit_logs persisté, (e) bouclage IA réel et provider de signature externe.

---

## 2. Stack technique détectée

| Couche | Technologie réelle | Source |
|---|---|---|
| Backend framework | **Laravel 13** (PHP `^8.2`) | `backend/composer.json` |
| Auth API | **Laravel Sanctum 4.3** (Bearer tokens) | `backend/composer.json`, `backend/app/Http/Controllers/Api/V1/AuthController.php` |
| Base de données | **MySQL** (Laravel migrations + dump `driveflow_db.sql`) | `backend/config/database.php`, `backend/driveflow_db.sql` |
| ORM | **Eloquent** + traits `HasUuids`, `SoftDeletes` | `backend/app/Models/*.php` |
| Frontend framework | **React 19.2** + **TypeScript** + **Vite 6** | `frontend/package.json` |
| Routing | `react-router-dom 7.14` | `frontend/routes/AppRoutes.tsx` |
| Data fetching | `@tanstack/react-query 5.99`, fetch + `apiClient` maison | `frontend/services/apiClient.ts` |
| UI / Design system | TailwindCSS + classes maison `df-*` (cf. `df-card`, `df-btn`, `df-input`, `df-shell`) | `frontend/modules/layout/AppLayout.tsx` |
| Cartographie | `leaflet 1.9` + `react-leaflet 5.0` | `frontend/modules/gps/GpsDashboardPage.tsx` |
| Charts | `recharts 3.8` | `frontend/modules/dashboard/ExecutiveDashboardPage.tsx` |
| Forms | `react-hook-form 7.55` + `zod 4.3` (utilisés ponctuellement) | `frontend/package.json` |
| i18n | `i18next 26` + `react-i18next 17` (FR / EN / AR) | `frontend/modules/layout/AppLayout.tsx` |
| Stockage fichier | **Disque local Laravel** (pas de S3 effectif), `Storage::disk('local')` pour KYC, accidents, missions, photos véhicule | `backend/app/Http/Controllers/Api/V1/KycController.php`, `VehicleAccidentController`, `VehiclePhotoController`, `MissionController` |
| Tests | `phpunit/phpunit 11`, `fakerphp/faker` (présent ; pas de tests métiers exhaustifs trouvés) | `backend/composer.json` |

**Architecture réelle** :
- API JSON `/api/v1/*` mono-bloc (`backend/routes/api.php` + `backend/bootstrap/app.php`).
- Contrôleurs API dans `App\Http\Controllers\Api\V1\` (49 fichiers, cf. liste plus bas).
- Form Requests dédiées par module (ex. `App\Http\Requests\Api\V1\Fleet\StoreVehicleRequest`).
- Resources de sérialisation (`App\Http\Resources\VehicleResource`, `UserResource`, etc.).
- Services métier dans `backend/app/Services/` (ex. `Gps\GpsRuleService`, `Gps\Geo`, `MaintenanceService`,
  `VehicleCostService`, `AccidentService`, `AuditLogger`).
- SPA React avec gating route + module + (parfois) action. Aucune page rendue côté serveur.

---

## 3. Architecture globale

### 3.1 Structure backend (`backend/`)
```
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/Api/V1/        (49 contrôleurs API)
│   │   ├── Middleware/                EnsureRole.php, EnsurePermission.php
│   │   ├── Requests/Api/V1/           Form Requests par module
│   │   ├── Resources/                 API resources par entité
│   │   └── Responses/                 ApiResponse helper
│   ├── Models/                        70 modèles Eloquent (UUID + SoftDeletes)
│   └── Services/                      Services métier par domaine
├── config/                            (incl. erp.php — RBAC + permissions baseline)
├── database/
│   ├── migrations/                    32 migrations applicatives
│   └── seeders/                       (rôles & permissions de base)
├── routes/api.php                     Toutes les routes /api/v1
├── bootstrap/app.php                  Aliases middleware role/permission
└── driveflow_db.sql                   Dump complet — 87 CREATE TABLE
```

### 3.2 Structure frontend (`frontend/`)
```
frontend/
├── App.tsx                            Wrap AppRoutes
├── routes/AppRoutes.tsx               Définition complète des routes (~70)
├── routes/ModuleGate.tsx              Garde par ModuleKey + rôle
├── domain/                            appRole.ts (RBAC SPA), erpPermissions.ts
├── modules/                           Domaines fonctionnels (auth, layout, dashboard,
│   │                                  fleet, customers, contracts, credit, finance,
│   │                                  accounting, arrears, signature, usedCars, gps,
│   │                                  ai, mobileOps, notifications, settings, audit,
│   │                                  rentals, shared)
├── screens/                           Écrans legacy (VehiclesList, ReservationsList…)
├── services/                          apiClient.ts, endpoints.ts, *Api.ts (real),
│                                      erpApi.ts (mock), erpStore.ts (localStorage),
│                                      mockApi.ts (legacy facade)
├── providers/                         UIPreferencesProvider (thème, sidebar, density)
├── i18n/                              FR / EN / AR
└── package.json
```

### 3.3 Communication API
- Frontend → `apiClient(path)` qui pointe vers `${VITE_API_BASE}${path}` (ex. `http://localhost:8000/api`)
  + entête `Authorization: Bearer …` lu depuis `localStorage.df_session`.
- Si `VITE_API_BASE` n'est pas défini → `apiClient` jette ; certains wrappers (`opsApi`, `gpsApi`,
  `creditApi`, `contractsApi`) **fallback** sur `erpApi` (mock localStorage).
- 401 ⇒ purge session + redirection `/login?session=expired`.
- Réponses normalisées par `App\Http\Responses\ApiResponse::success($data, $meta?)`.

### 3.4 Stockage fichiers
- KYC : `Storage::disk('local')->put('kyc/...')` cf. `KycController::uploadDocument`.
- Accidents : `AccidentService::attachDocument` ; idem pour photos véhicule, photos mission.
- **Pas d'intégration S3 / cloud effective** ; aucune URL signée.

### 3.5 Système de permissions (réel)
- Aliases déclarés dans `backend/bootstrap/app.php` :
  - `role` → `App\Http\Middleware\EnsureRole`
  - `permission` → `App\Http\Middleware\EnsurePermission`
- En pratique, **seul `role:` est utilisé** dans `routes/api.php` (le mapping `permission_roles`
  existe dans `config/erp.php` mais n'est **pas câblé** sur les routes).
- Frontend : `domain/appRole.ts` définit `ROLE_MODULE_ACCESS` (couvre 15 ModuleKeys).
  `domain/erpPermissions.ts` ne couvre que 5 permissions (`view_fleet`, `view_customers`,
  `view_contracts`, `view_finance`, `view_credit`).

### 3.6 Modules existants (réellement codés)
Auth · RBAC · Branches · Customers + KYC · Fleet (vehicles + brands + models + documents +
status history + odometer + cost profile + maintenance plans + repairs + accidents) · Contracts
+ Templates + Installments + History · Credit applications + Decisions · GPS (devices +
positions + alerts + geofences + trips + assignments) · Reservations + Missions + Checklist +
Photos · Used Cars (listings + valuations + sales + ownership transfers) · Invoicing +
Payments + Allocations · Treasury (bank accounts + transactions + matching) · Accounting
(accounts + journals + entries + lines + fiscal years + periods + taxes + fixed assets +
depreciation + bridges + reports) · Arrears + Actions + Legal cases + Repossession orders ·
Signature envelopes + signers + events · Dashboards (executive / finance / risk / fleet / gps).

### 3.7 Modules placeholders
- **IA** : `AiHubPage` + `AiAssistantPage` (textarea sans backend) ; les sous-pages
  `AiPredictionPages.tsx` calculent un score localement à partir des vraies données
  (vehicles, used-cars, arrears) — c'est de la **heuristique frontend**, pas du ML serveur.
- **Audit** : page `AuditPage` lit `erpApi.getAuditLogs()` (mock localStorage) ; backend
  `AuditLogger::log` n'écrit que dans `Log::info`, **table `audit_logs` non écrite**
  malgré son existence dans le dump SQL.
- **Notifications** : page lit `erpApi.getNotifications()` mock ; pas d'endpoint
  `/api/v1/notifications` dans `routes/api.php`.
- **Settings → Règles / Fiscalité / Templates** : 3 onglets affichant un texte d'attente.
- **`screens/VehiclesList`** (legacy) : utilisé par `FleetListPage` ; il appelle `mockApi.api`
  donc la liste flotte côté `/fleet` reste **mock** alors que `/fleet/:id` est réel.
- **`AICopilotDrawer`** + **`CommandPalette`** : présents mais sans intégration LLM.
- **Mobile-Ops UploadZone** : démos uniquement (`Photos avant livraison`, `Signature client (fichier simulé)`).

---

## 4. Base de données réelle

Sources analysées : `backend/driveflow_db.sql` (87 tables), 32 migrations dans
`backend/database/migrations/`, et 70 modèles Eloquent. Le tableau ci-dessous croise
le schéma SQL et l'usage effectif dans le code.

| Domaine | Tables détectées | Utilisé dans le code ? | Remarques |
|---|---|---|---|
| Sociétés / agences | `companies`, `branches` | Partiel | `Branch` model + `BranchController` actifs ; `companies` pas de contrôleur dédié, juste un FK utilisé. |
| Users / rôles / permissions | `users`, `roles`, `user_roles`, `permissions`, `role_permissions`, `password_reset_tokens`, `personal_access_tokens`, `user_sessions`, login history (table créée par migration custom) | Oui | `UserController`, `RoleController`, `PermissionController`, `AuthController`, `EnsureRole`, `EnsurePermission`. |
| Clients & KYC | `customers`, `customer_individual_profiles`, `customer_company_profiles`, `customer_employment_profiles`, `customer_addresses`, `customer_contacts`, `customer_bank_accounts`, `customer_kyc_cases`, `customer_kyc_documents`, `customer_blacklist_entries`, `customer_notes` | Oui | `CustomerController`, `CustomerSubresourceController`, `KycController` ; `dossier()` agrège tout. |
| Véhicules / flotte | `vehicles`, `vehicle_brands`, `vehicle_models`, `vehicle_documents`, `vehicle_registrations`, `vehicle_status_history` (`vehicle_status_histories` côté migration), `vehicle_odometer_readings`, `vehicle_insurance_policies`, `vehicle_cost_profiles` | Oui | `VehicleController`, `VehicleBrandController`, `VehicleDocumentController`, `VehicleOdometerReadingController`, `VehiclePhotoController`. `vehicle_insurance_policies` présent en SQL — non utilisé par contrôleur dédié. |
| Maintenance / réparations / accidents | `vehicle_maintenance_events`, `vehicle_maintenance_plans` (créée par migration `2026_04_26_200000`), `vehicle_repairs`, `vehicle_accidents`, `accident_documents` | Oui | `VehicleMaintenanceEventController`, `VehicleMaintenancePlanController`, `VehicleRepairController`, `VehicleAccidentController` + `MaintenanceService`, `AccidentService`. |
| Contrats | `contracts`, `contract_templates`, `contract_clauses`, `contract_installments`, `contract_status_history` (alias `contract_histories` côté migration), `contract_mileage_logs` | Oui (sauf clauses & mileage_logs) | `ContractController`, `ContractTemplateController`, `ContractHistory` model. **`contract_clauses` & `contract_mileage_logs` présents en SQL mais non écrits par les contrôleurs.** |
| Crédit | `credit_applications`, `credit_application_decisions` (migration `2026_04_23_130010`), `credit_decisions`, `credit_scores` | Oui (partiel) | `CreditApplicationController` écrit dans `credit_applications` + `credit_application_decisions`. `credit_scores` présent en SQL — non écrit (le score est stocké inline dans `credit_applications.scoring_status`). |
| GPS | `gps_devices`, `gps_device_assignments`, `gps_positions`, `gps_alerts`, `gps_trips` (alias `trips`), `geofences`, `geofence_vehicle`, `vehicle_geofence_states`, `vehicle_geofence_assignments` | Oui | `GpsController`, `GpsDeviceController`, `GpsPositionIngestionController`, `TripController`, `GeofenceController`, `VehicleGeofenceController` + `GpsRuleService`. |
| Réservations / livraisons / missions | `reservations`, `missions`, `mission_checklist_items`, `mission_photos` | Oui | `ReservationController`, `MissionController`. |
| Vente VO | `used_car_listings`, `used_car_evaluations` (alias `used_car_valuations` côté modèle), `used_car_sales`, `vehicle_ownership_transfers` (créée Phase 9) | Oui | `UsedCarController` + modèles `UsedCarListing`, `UsedCarValuation`, `UsedCarSale`, `VehicleOwnershipTransfer`. |
| Facturation / paiements | `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `payment_methods` | Oui (sauf payment_methods) | `InvoiceController`, `PaymentController`. **`payment_methods` table existe mais aucun contrôleur ; payment.method est un champ enum stocké directement.** |
| Trésorerie | `bank_accounts`, `bank_transactions` | Oui | `TreasuryController`. |
| Comptabilité | `chart_of_accounts` (alias `accounting_accounts` côté migration Phase 11), `accounting_journals`, `journal_entries` (alias `accounting_entries`), `journal_entry_lines` (alias `accounting_entry_lines`), `fiscal_years`, `fiscal_periods`, `taxes`, `fixed_assets`, `asset_depreciation_schedule` (alias `depreciation_lines`) | Oui | `AccountingAccountController`, `AccountingJournalController`, `AccountingEntryController`, `FiscalYearController`, `TaxController`, `FixedAssetController`, `AccountingReportController`, `AccountingBridgeController`. |
| Impayés / contentieux | `arrears_cases`, `arrears_actions`, `legal_cases`, `repossession_orders` (créée par migration Phase 12) | Oui | `ArrearsCaseController`, `LegalCaseController` + modèles `ArrearsCase`, `ArrearsAction`, `LegalCase`, `RepossessionOrder`. |
| Signature électronique | `signature_envelopes`, `signature_signers`, `signature_events`, `signature_providers`, `electronic_certificates` | Oui (envelopes + signers + events) | `SignatureEnvelopeController` + webhook `SignatureWebhookController`. **`signature_providers` & `electronic_certificates` présents en SQL — non écrits par le code applicatif (provider externe non implémenté).** |
| Documents / fichiers | `entity_attachments`, `files`, plus `vehicle_documents`, `customer_kyc_documents`, `accident_documents`, `mission_photos` | Partiel | Les fichiers vivent dans des tables typées par domaine. **Tables génériques `entity_attachments` & `files` existent mais ne sont pas écrites.** |
| Audit / logs | `audit_logs`, `login_history` (créée par contrôleur via `Schema::hasTable` check) | **Non câblé** | `AuditLogger::log` n'écrit que dans le log Laravel ; `audit_logs` reste vide. `login_history` est écrite par `AuthController` si la table existe. |
| Notifications | `notifications`, `notification_templates` | **Non câblé backend** | Aucune route `/api/v1/notifications` ; frontend lit du mock `erpApi`. |
| IA | `ai_models`, `ai_predictions`, `assistant_conversations`, `assistant_messages` | **Non utilisé** | Aucun contrôleur, aucun service écrit ; UI placeholders. |
| Référentiels | `currencies`, `languages`, `system_settings`, `number_sequences`, `vehicle_brands`, `vehicle_models` | Partiel | Marques/modèles utilisés ; `currencies`/`languages`/`system_settings`/`number_sequences` présents mais lus indirectement (rien n'écrit `system_settings`). |

> Cohérence de nommage : plusieurs tables existent sous **deux noms** (dump SQL `chart_of_accounts`
> vs migration Phase 11 `accounting_accounts`, `journal_entries` vs `accounting_entries`,
> `used_car_evaluations` vs `used_car_valuations`, `gps_trips` vs `trips`,
> `vehicle_status_history` vs `vehicle_status_histories`, `contract_status_history` vs
> `contract_histories`). **Le code applicatif utilise les noms portés par les migrations
> applicatives**, pas ceux du dump SQL initial. Risque réel d'incohérence si la base est
> remontée depuis le dump sans relancer les migrations.

---

## 5. Backend — routes et endpoints réels

Source : `backend/routes/api.php` (preface : `Route::prefix('v1')->group(...)` ; quasi-tout est sous
`auth:sanctum`). 49 contrôleurs sous `App\Http\Controllers\Api\V1\`.

| Méthode | Endpoint | Controller / handler | Auth | Module | Statut |
|---|---|---|---|---|---|
| GET | `/v1/health` | `HealthController@show` | Public | system | Fonctionnel |
| POST | `/v1/auth/login` | `AuthController@login` | Public + throttle | auth | Fonctionnel |
| POST | `/v1/auth/forgot-password` | `PasswordResetController@forgot` | Public + throttle | auth | Partiel (pas d'envoi mail concret) |
| POST | `/v1/auth/reset-password` | `PasswordResetController@reset` | Public + throttle | auth | Partiel |
| POST | `/v1/auth/logout` | `AuthController@logout` | Sanctum | auth | Fonctionnel |
| GET | `/v1/auth/me` | `AuthController@me` | Sanctum | auth | Fonctionnel |
| GET | `/v1/branches` | `BranchController@index` | Sanctum | admin | Fonctionnel |
| POST/PUT/PATCH/DELETE | `/v1/branches[/{branch}]` | `BranchController` | role:ADMIN,DIRECTEUR | admin | Fonctionnel |
| GET | `/v1/users[/{user}]` + `/users/{user}/branches`, `login-history`, `activate`, `deactivate` | `UserController` | role:ADMIN,DIRECTEUR | admin | Fonctionnel |
| GET/POST/PUT/DELETE | `/v1/roles[/{role}]` + `/{role}/permissions` | `RoleController` | role:ADMIN,DIRECTEUR | admin | Fonctionnel |
| GET | `/v1/permissions` | `PermissionController` | role:ADMIN,DIRECTEUR | admin | Fonctionnel |
| GET | `/v1/vehicle-brands` | `VehicleBrandController@index` | Sanctum | fleet | Fonctionnel |
| GET/POST/PUT/PATCH | `/v1/vehicles[/{vehicle}]` | `VehicleController` | Sanctum | fleet | Fonctionnel |
| POST/DELETE | `/v1/vehicles/{vehicle}/photo` | `VehiclePhotoController` | Sanctum | fleet | Fonctionnel |
| POST | `/v1/vehicles/{vehicle}/documents` | `VehicleDocumentController` | Sanctum | fleet | Fonctionnel |
| POST | `/v1/vehicles/{vehicle}/maintenance-events` | `VehicleMaintenanceEventController` | Sanctum | fleet | Fonctionnel |
| POST | `/v1/vehicles/{vehicle}/odometer-readings` | `VehicleOdometerReadingController` | Sanctum | fleet | Fonctionnel |
| GET | `/v1/vehicles/{vehicle}/profitability`, `/costs` | `VehicleProfitabilityController` | Sanctum | fleet | Fonctionnel |
| GET/POST/PUT/PATCH/DELETE | `/v1/vehicles/{vehicle}/maintenance-plans` & `/maintenance-plans/{plan}` | `VehicleMaintenancePlanController` | Sanctum | maintenance | Fonctionnel |
| GET/POST/PUT/PATCH | `/v1/vehicles/{vehicle}/repairs` & `/repairs/{repair}` | `VehicleRepairController` | Sanctum | maintenance | Fonctionnel |
| GET/POST/PUT/PATCH | `/v1/vehicles/{vehicle}/accidents` & `/accidents/{accident}` + `/transition` + `/documents` | `VehicleAccidentController` | Sanctum | maintenance | Fonctionnel |
| GET | `/v1/vehicles/{vehicle}/history` | `VehicleAccidentController@history` | Sanctum | fleet | Fonctionnel |
| GET | `/v1/fleet/vehicles[/{vehicle}]` (alias legacy) | `VehicleController` | Sanctum | fleet | Fonctionnel |
| GET/POST/PUT/PATCH/DELETE | `/v1/contract-templates` | `ContractTemplateController` | Sanctum | contracts | Fonctionnel |
| GET/POST/PUT/PATCH | `/v1/contracts[/{contract}]` + `/approve` `/activate` `/terminate` `/installments` `/generate-schedule` | `ContractController` | Sanctum | contracts | Fonctionnel |
| GET/POST/PUT/PATCH | `/v1/credit-applications[/{...}]` + `/score` `/decision` | `CreditApplicationController` | Sanctum | credit | Partiel (scoring déterministe simple) |
| GET/POST/PUT/PATCH | `/v1/gps/devices[/{...}]` + `/assign` | `GpsDeviceController` | Sanctum | gps | Fonctionnel |
| POST | `/v1/gps/positions` | `GpsPositionIngestionController` | Sanctum | gps | Fonctionnel |
| GET | `/v1/gps/vehicles/live` | `GpsController@vehiclesLive` | Sanctum | gps | Fonctionnel |
| GET | `/v1/vehicles/{vehicle}/positions` | `GpsController@vehiclePositions` | Sanctum | gps | Fonctionnel |
| GET | `/v1/vehicles/{vehicle}/trips` | `TripController@indexForVehicle` | Sanctum | gps | Fonctionnel |
| GET/POST | `/v1/geofences` | `GeofenceController` | Sanctum | gps | Fonctionnel |
| POST | `/v1/vehicles/{vehicle}/geofences` | `VehicleGeofenceController@assign` | Sanctum | gps | Fonctionnel |
| GET | `/v1/gps/alerts` | `GpsController@alerts` | Sanctum | gps | Fonctionnel |
| GET/POST | `/v1/reservations` + `/{...}/create-mission` | `ReservationController` | Sanctum | ops | Fonctionnel |
| GET | `/v1/missions[/{mission}]` + `/start` `/complete` `/checklist-items` `/photos` | `MissionController` | Sanctum | ops | Fonctionnel |
| GET/POST/PUT/PATCH/DELETE | `/v1/customers[/{customer}]` | `CustomerController` | Sanctum | customers | Fonctionnel |
| GET | `/v1/customers/{customer}/dossier` | `CustomerController@dossier` | Sanctum | customers | Fonctionnel |
| POST/PUT/DELETE | `/v1/customers/{customer}/addresses\|contacts\|bank-accounts\|notes` | `CustomerSubresourceController` | Sanctum | customers | Fonctionnel |
| POST/DELETE | `/v1/customers/{customer}/blacklist` | `CustomerSubresourceController` | role:ADMIN,DIRECTEUR,CONTENTIEUX | customers | Fonctionnel |
| GET/POST | `/v1/customers/{customer}/kyc-cases` | `KycController` | Sanctum | kyc | Fonctionnel |
| GET | `/v1/kyc-cases/{kycCase}` | `KycController@showCase` | Sanctum | kyc | Fonctionnel |
| POST/DELETE | `/v1/kyc-cases/{kycCase}/documents`, `/kyc-documents/{document}` | `KycController` | Sanctum | kyc | Fonctionnel |
| POST | `/v1/kyc-documents/{document}/verify`, `/kyc-cases/{kycCase}/approve\|reject` | `KycController` | role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT | kyc | Fonctionnel |
| GET | `/v1/used-cars/listings[/{...}]/{valuations\|transfers}` | `UsedCarController` | Sanctum | usedCars | Fonctionnel |
| POST/PUT/PATCH/DELETE | `/v1/used-cars/listings/...`, `/evaluate`, `/publish`, `/reserve` | `UsedCarController` | role:ADMIN,DIRECTEUR,AGENT_COMMERCIAL | usedCars | Fonctionnel |
| POST | `/v1/used-cars/listings/{...}/sell`, `/vehicle-ownership-transfers/{transfer}` | `UsedCarController` | role:ADMIN,DIRECTEUR | usedCars | Fonctionnel |
| GET/POST/PUT/PATCH/DELETE | `/v1/invoices[/{invoice}]` + `/issue` `/cancel` + `/contracts/{contract}/generate-invoice` | `InvoiceController` | Sanctum | finance | Fonctionnel |
| GET/POST | `/v1/payments[/{...}]` + `/{...}/allocate` | `PaymentController` | Sanctum | finance | Fonctionnel |
| DELETE | `/v1/payment-allocations/{allocation}` | `PaymentController@removeAllocation` | Sanctum | finance | Fonctionnel |
| GET | `/v1/customers/{customer}/balance\|statement` | `CustomerBalanceController` | Sanctum | finance | Fonctionnel |
| GET | `/v1/treasury/summary`, `/bank-accounts[/{...}/transactions]` | `TreasuryController` | Sanctum | finance | Fonctionnel |
| POST/PUT/PATCH/DELETE | `/v1/treasury/bank-accounts...`, `/transactions/import`, `/match` | `TreasuryController` | role:ADMIN,DIRECTEUR,COMPTABLE | finance | Fonctionnel |
| GET | `/v1/accounting/accounts\|journals\|entries[/{...}]` | `Accounting*Controller` | Sanctum | accounting | Fonctionnel |
| POST/PUT/PATCH/DELETE | `/v1/accounting/accounts\|journals\|entries[/{...}]` + `/post` `/cancel` | `Accounting*Controller` | role:ADMIN,DIRECTEUR,COMPTABLE | accounting | Fonctionnel |
| GET | `/v1/accounting/general-ledger\|trial-balance\|balance-sheet\|income-statement\|tax-report` | `AccountingReportController` | Sanctum | accounting | Fonctionnel |
| POST | `/v1/accounting/bridge/invoice/{invoice}\|payment/{payment}\|depreciation/{...}\|asset-disposal/{...}` | `AccountingBridgeController` | role:ADMIN,DIRECTEUR,COMPTABLE | accounting | Fonctionnel |
| GET/POST/PUT/DELETE | `/v1/taxes[/{tax}]` | `TaxController` | role:ADMIN,DIRECTEUR,COMPTABLE | accounting | Fonctionnel |
| GET/POST | `/v1/fiscal-years[/{...}]` + `/current-period` + `/close` | `FiscalYearController` | role:ADMIN,DIRECTEUR,COMPTABLE | accounting | Fonctionnel |
| GET/POST/PUT | `/v1/fixed-assets[/{...}]` + `/dispose` `/depreciate` | `FixedAssetController` | role:ADMIN,DIRECTEUR,COMPTABLE | accounting | Fonctionnel |
| GET/POST/PUT/PATCH | `/v1/arrears/cases[/{...}]` + `/action` `/escalate` | `ArrearsCaseController` | Sanctum | arrears | Fonctionnel |
| GET | `/v1/legal-cases[/{...}]` | `LegalCaseController` | Sanctum | arrears | Fonctionnel |
| POST/PUT/PATCH | `/v1/legal-cases/...`, `/repossession-orders[/{...}]` | `LegalCaseController` | role:ADMIN,DIRECTEUR,CONTENTIEUX | arrears | Fonctionnel |
| GET/POST | `/v1/signatures/envelopes[/{id}]` + `/events` `/send` `/void` `/verify-otp` `/sign` `/decline` | `SignatureEnvelopeController` | Sanctum | signature | Partiel (provider externe placeholder) |
| POST | `/v1/v1/signatures/webhooks/provider` | `SignatureWebhookController@handle` | Public + HMAC | signature | Partiel (`/v1/v1/...` est un **bug de double prefix** dans `routes/api.php` ligne 62) |
| GET | `/v1/dashboard/executive\|finance\|risk\|fleet\|gps` | `DashboardController` | Sanctum | dashboard | Fonctionnel |
| — | `/v1/notifications` | non trouvé | — | notifications | **Non implémenté backend** |
| — | `/v1/audit*` | non trouvé | — | audit | **Non implémenté backend** |
| — | endpoints IA (`/v1/ai/*`) | non trouvé | — | ai | **Non implémenté backend** |

---

## 6. Backend — modules réellement développés

### Module : Auth
- Tables : `users`, `personal_access_tokens`, `password_reset_tokens`, `login_history`.
- Models : `User` (HasUuids, HasApiTokens), `LoginHistory`.
- Controllers : `AuthController`, `PasswordResetController`.
- Services : aucun service dédié ; logique inline.
- Form Requests : `Api\V1\Auth\LoginRequest` (validation login).
- Endpoints : login / logout / me / forgot / reset.
- Fonctions disponibles : login + token Sanctum, mise à jour `last_login_at`,
  enregistrement d'attempts `login_history`, `me` retourne l'utilisateur + `permissions[]` calculées.
- Fonctions manquantes : `auth/refresh` est listé dans `endpoints.ts` côté frontend mais
  **non implémenté** en backend ; envoi réel d'email pour reset (tokens créés mais Mail non câblé).
- Maturité : **75%**.
- Risques : pas de 2FA, pas d'IP whitelisting ; throttle est en place mais limites par défaut.

### Module : Users & rôles
- Tables : `users`, `roles`, `user_roles`, `permissions`, `role_permissions`, `branches`.
- Models : `User`, `Role`, `Permission`, `Branch`.
- Controllers : `UserController`, `RoleController`, `PermissionController`, `BranchController`.
- Services : aucun.
- Form Requests : `UserStoreRequest`, `UserUpdateRequest`, `RoleStoreRequest`, etc.
- Endpoints : CRUD users + roles + permissions(GET) + branches + assign branches + activate/deactivate + login history.
- Fonctions disponibles : multi-rôles, multi-agences (avec `is_primary`), `User::hasPermission()`
  qui croise `roles` + `permissions` + `role_permissions` (avec `Schema::hasTable` checks).
- Fonctions manquantes : pas de gestion de **groupes**, pas d'audit complet sur les changements de rôle.
- Maturité : **75%**.
- Risques : `hasPermission` accorde tout à ADMIN (par design) — toute escalade vers ADMIN
  donne tous les droits.

### Module : Dashboard
- Tables exploitées : agrégats sur `vehicles`, `contracts`, `invoices`, `payments`,
  `arrears_cases`, `credit_applications`, `vehicle_maintenance_events`, `gps_alerts`, `gps_devices`.
- Controllers : `DashboardController` (5 méthodes : executive / finance / risk / fleet / gps).
- Services : aucun ; requêtes inline `DB::table(...)`.
- Endpoints : 5 GET sous `/dashboard/*`.
- Fonctions disponibles : KPIs réels (valeur parc, CA mensuel, taux d'impayés, prévision cash 30j,
  rentabilité par véhicule/client, séries temporelles).
- Fonctions manquantes : pas de cache (chaque hit recalcule), pas de drill-down, pas d'export.
- Maturité : **70%**.

### Module : Clients & conformité (KYC)
- Tables : `customers` + 11 tables liées (`customer_*`).
- Models : `Customer`, `CustomerIndividualProfile`, `CustomerCompanyProfile`,
  `CustomerEmploymentProfile`, `CustomerAddress`, `CustomerContact`, `CustomerBankAccount`,
  `CustomerKycCase`, `CustomerKycDocument`, `CustomerBlacklistEntry`, `CustomerNote`.
- Controllers : `CustomerController`, `CustomerSubresourceController`, `KycController`.
- Services : aucun (`riskLevelFromScore` est inline dans `KycController`).
- Form Requests : présentes pour create/update.
- Endpoints : CRUD client + sous-ressources + dossier + KYC workflow + blacklist.
- Fonctions disponibles : création client → ouverture KYC `pending` automatique, upload
  documents → KYC passe `in_review`, vérification document, approve/reject, blacklist add/remove,
  dossier agrégé (KYC, blacklist, notes, contrats, paiements).
- Fonctions manquantes : pas de génération de fiche client PDF, pas de vérification automatique
  CIN/ICE, pas de vérification adresse.
- Maturité : **80%**.
- Risques : `Schema::hasTable` checks suggèrent que la base peut avoir un schéma incomplet
  silencieusement.

### Module : Véhicules / flotte
- Tables : `vehicles` + 7 tables liées (brands, models, documents, status_histories,
  odometer_readings, cost_profiles, insurance_policies (non écrite)).
- Models : `Vehicle` (UUID), `VehicleBrand`, `VehicleModel`, `VehicleDocument`,
  `VehicleStatusHistory`, `VehicleOdometerReading`, `VehicleCostProfile`.
- Controllers : `VehicleController`, `VehicleBrandController`, `VehicleDocumentController`,
  `VehicleOdometerReadingController`, `VehiclePhotoController`, `VehicleProfitabilityController`.
- Services : `VehicleCostService` (calcul rentabilité).
- Form Requests : `Fleet\StoreVehicleRequest`, `Fleet\UpdateVehicleRequest`.
- Endpoints : CRUD véhicule + photo + documents + relevés km + profitabilité + costs + history.
- Fonctions disponibles : changement de statut historisé, snapshot `current` (statut + km),
  documents, photo principale, calcul de rentabilité.
- Fonctions manquantes : pas d'écran assurance (`vehicle_insurance_policies` non écrit),
  pas de gestion de la mise en sortie de flotte automatisée.
- Maturité : **80%**.

### Module : Entretien / réparations / accidents
- Tables : `vehicle_maintenance_events`, `vehicle_maintenance_plans`, `vehicle_repairs`,
  `vehicle_accidents`, `accident_documents`.
- Models / Controllers : `VehicleMaintenanceEvent(Controller)`, `VehicleMaintenancePlan(Controller)`,
  `VehicleRepair(Controller)`, `VehicleAccident(Controller)` + `AccidentDocument`.
- Services : `MaintenanceService`, `AccidentService`.
- Endpoints : CRUD plans / events / repairs / accidents + transition d'accident + upload doc.
- Fonctions disponibles : workflow accident `declared → under_review → repaired → closed`,
  documents (photo / rapport / assurance / expertise / constat), historique consolidé véhicule.
- Fonctions manquantes : pas de relances automatiques d'échéance d'entretien (les plans
  calculent `next_due_at` mais pas de cron), pas de notifications sur expiration assurance/visite.
- Maturité : **75%**.

### Module : Contrats
- Tables : `contracts`, `contract_templates`, `contract_installments`, `contract_histories`.
- Models : `Contract`, `ContractTemplate`, `ContractInstallment`, `ContractHistory`.
- Controllers : `ContractController`, `ContractTemplateController`.
- Services : aucun service dédié ; logique inline dans le contrôleur.
- Form Requests : `Contract\StoreContractRequest`, `Contract\UpdateContractRequest`,
  `Contract\GenerateScheduleRequest`.
- Endpoints : CRUD + approve / activate / terminate / installments / generate-schedule + templates.
- Fonctions disponibles : génération de numéro, écriture history sur chaque action,
  calcul d'échéancier (durée, mensualité, TVA inline).
- Fonctions manquantes : **génération PDF contrat** non trouvée, pas de gestion de
  `contract_clauses` (table existe non écrite), pas de `contract_mileage_logs`,
  pas de gestion automatique LLD ↔ TVA loyer ↔ vente VR.
- Maturité : **65%**.

### Module : Crédit
- Tables : `credit_applications`, `credit_application_decisions`, `credit_decisions` (?),
  `credit_scores` (non écrite).
- Controllers : `CreditApplicationController`.
- Services : aucun ; scoring déterministe inline (debt_ratio + apport).
- Endpoints : CRUD + score + decision (option `create_contract: true` génère un draft Contract).
- Fonctions disponibles : scoring très simple (3 paliers), workflow décision avec création
  optionnelle de contrat brouillon.
- Fonctions manquantes : connecteurs **CNSS / FICP / Bank Al-Maghrib non trouvés**,
  pas d'historique de scores (`credit_scores` non écrite), pas de simulation de mensualité
  côté backend (la simulation est faite par le wizard frontend).
- Maturité : **45%**.

### Module : GPS
- Tables : `gps_devices`, `gps_device_assignments`, `gps_positions`, `gps_alerts`,
  `gps_trips` (alias `trips`), `geofences`, `geofence_vehicle`, `vehicle_geofence_states`.
- Models : `GpsDevice`, `GpsPosition`, `GpsAlert`, `Geofence`, `Trip`.
- Controllers : `GpsController`, `GpsDeviceController`, `GpsPositionIngestionController`,
  `TripController`, `GeofenceController`, `VehicleGeofenceController`.
- Services : `Gps\GpsRuleService` (règles : mouvement non autorisé, dépassement km,
  immobilisation, transitions geofence, agrégation trip), `Gps\Geo` (Haversine, point-in-circle).
- Endpoints : CRUD device + assign + ingestion positions + live + positions véhicule + trips + geofences + assign + alerts.
- Fonctions disponibles : ingestion temps réel (latitude / longitude / vitesse / odo),
  détection règles à chaque position, agrégation de trips, assignation geofence par véhicule.
- Fonctions manquantes : **pas d'API webhook** standardisé pour fournisseurs (Teltonika, Geotab) ;
  ingestion accepte n'importe quel JSON Sanctum.
- Maturité : **75%**.

### Module : Réservations / missions
- Tables : `reservations`, `missions`, `mission_checklist_items`, `mission_photos`.
- Controllers : `ReservationController`, `MissionController`.
- Services : aucun.
- Endpoints : CRUD reservation + create-mission + missions + start/complete + checklist + photos upload.
- Fonctions disponibles : flux réservation → mission → checklist + photos preuves + fin de mission.
- Fonctions manquantes : pas de calendrier multi-agences, pas d'optimisation de tournée, pas de signature client capturée en DB (le frontend `mobile-ops` est encore mock pour l'upload signature).
- Maturité : **65%**.

### Module : Vente VO
- Tables : `used_car_listings`, `used_car_valuations` (alias `used_car_evaluations`),
  `used_car_sales`, `vehicle_ownership_transfers`.
- Controllers : `UsedCarController`.
- Services : aucun.
- Endpoints : CRUD listing + evaluate + publish + reserve + sell + transfers + updateTransfer.
- Fonctions disponibles : workflow draft → evaluated → published → reserved → sold,
  `sell` crée `UsedCarSale`, marque le véhicule `sold` et initie un `VehicleOwnershipTransfer`.
- Fonctions manquantes : pas de **publication marketplace** externe, pas de calcul automatique
  TVA marge, pas de génération PDF certificat de cession.
- Maturité : **65%**.

### Module : Finance / facturation / paiements
- Tables : `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `bank_accounts`, `bank_transactions`.
- Controllers : `InvoiceController`, `PaymentController`, `CustomerBalanceController`, `TreasuryController`.
- Services : aucun ; logique riche dans les contrôleurs.
- Endpoints : CRUD facture + issue/cancel + generate-from-contract + paiements + allocate +
  unallocate + balance/statement client + treasury summary + bank accounts + import + match.
- Fonctions disponibles : auto-overdue (mise à jour status), allocation à factures et
  installments contrat avec recalcul des totaux, statement client, summary trésorerie,
  rapprochement bancaire (`matched`/`unmatched`/`ignored`).
- Fonctions manquantes : **pas de génération PDF facture**, pas de numérotation conforme à un
  séquencer fiscal validé, `payment_methods` non câblée comme référentiel.
- Maturité : **70%**.

### Module : Comptabilité
- Tables : `accounting_accounts`, `accounting_journals`, `accounting_entries`,
  `accounting_entry_lines`, `fiscal_years`, `fiscal_periods`, `taxes`, `fixed_assets`,
  `depreciation_lines`.
- Controllers : `AccountingAccountController`, `AccountingJournalController`,
  `AccountingEntryController`, `AccountingReportController`, `AccountingBridgeController`,
  `FixedAssetController`, `FiscalYearController`, `TaxController`.
- Services : aucun (toute la logique est dans `AccountingEntryController` et le bridge).
- Endpoints : ~40 sous `/accounting/*` + bridges (invoice / payment / depreciation / asset disposal).
- Fonctions disponibles : double entrée vraie (équilibre validé avant `post`), extourne
  par création d'écriture inverse, mise à jour `current_balance` des comptes, états
  (grand livre, balance, bilan, compte de résultat, état TVA), bridge automatique.
- Fonctions manquantes : pas de **plan comptable marocain (PCG-MA) seedé** par défaut (la
  table `chart_of_accounts` SQL existe mais aucun seeder applicatif vérifié),
  pas de clôture exercice → report à nouveau automatique, pas d'export FEC.
- Maturité : **70%**.

### Module : Impayés / contentieux
- Tables : `arrears_cases`, `arrears_actions`, `legal_cases`, `repossession_orders`.
- Controllers : `ArrearsCaseController`, `LegalCaseController`.
- Services : aucun.
- Endpoints : CRUD case + action + escalate + legal cases + repossession-orders.
- Fonctions disponibles : auto-calcul du montant overdue, advancement de stage progressif,
  paiements partiels, ouverture de dossier juridique, ordres de reprise.
- Fonctions manquantes : pas de génération PDF mise en demeure, pas de connecteur huissier,
  pas de calcul d'intérêts de retard.
- Maturité : **65%**.

### Module : Signature électronique
- Tables : `signature_envelopes`, `signature_signers`, `signature_events`, `signature_providers` (non écrite), `electronic_certificates` (non écrite).
- Controllers : `SignatureEnvelopeController`, `SignatureWebhookController`.
- Services : aucun (la logique OTP / sequential signing est inline dans le contrôleur).
- Endpoints : CRUD envelope + send + void + verify-otp + sign + decline + events + webhook.
- Fonctions disponibles : provider **interne** (OTP envoyé via `Log::info` !), workflow
  séquentiel des signataires, marquage `signable` (typiquement `Contract`).
- Fonctions manquantes : provider externe (DocuSign / Yousign / Adobe) **placeholder**,
  pas de génération du PDF signé, pas de scellement / certificat horodaté,
  webhook public mais le route est buggé (`/v1/v1/signatures/webhooks/provider` cf. §13).
- Maturité : **50%**.

### Module : Documents
- Tables typées par domaine (`vehicle_documents`, `customer_kyc_documents`,
  `accident_documents`, `mission_photos`).
- Tables génériques `entity_attachments`, `files` : présentes en SQL, **non écrites**.
- Pas de service `DocumentManager` central. Pas d'antivirus, pas d'OCR.
- Maturité : **45%**.

### Module : Notifications
- Tables `notifications`, `notification_templates` présentes en SQL.
- Aucun controller, aucune route, aucun service. La page frontend lit du mock.
- Maturité : **5%**.

### Module : Audit
- Tables `audit_logs` présente en SQL.
- `App\Services\AuditLogger::log()` n'écrit que dans le log Laravel (`Log::info('audit', …)`).
- Page frontend `AuditPage` lit `erpApi.getAuditLogs()` — **mock localStorage**.
- Aucun appel à `AuditLogger::log` n'a été retrouvé dans les contrôleurs métiers
  (à confirmer par grep ; à priori non câblé, donc audit *de facto* absent).
- Maturité : **10%**.

### Module : IA
- Tables `ai_models`, `ai_predictions`, `assistant_conversations`, `assistant_messages` présentes.
- Aucun controller / service backend.
- Frontend : `AiHubPage`, `AiAssistantPage` (textarea sans envoi réel), `AiPredictionPlaceholder`
  (3 sous-pages : maintenance, pricing VO, risque impayés) qui calculent des **scores
  heuristiques côté frontend** à partir des vraies données API ; aucun ML serveur.
- Maturité : **15%** (UI propre + heuristique frontend, mais pas de moteur IA).

---

## 7. Frontend — pages et routes réelles

Source : `frontend/routes/AppRoutes.tsx`. Toutes les routes protégées sont sous
`<RequireAuth />` + `<AppLayout />` + `<ModuleGate module="…">`.

| Route | Page / Component | Module | Connectée API réelle ? | Données mock ? | Statut UI |
|---|---|---|---|---|---|
| `/login` | `LoginPage` | auth | Oui (`laravelAuthApi`) avec fallback mock si pas de `VITE_API_BASE` | Si pas de base | Complet |
| `/forgot-password` | `ForgotPasswordPage` | auth | Partiel | Possible | Partiel |
| `/reset-password` | `ResetPasswordPage` | auth | Partiel | Possible | Partiel |
| `/dashboard` | `ExecutiveDashboardPage` | dashboard | Oui (`dashboardApi.getExecutiveDashboard`) | Non | Complet |
| `/dashboard/classic` | `screens/Dashboard` (legacy) | dashboard | Non — utilise `mockApi` | Oui | Placeholder |
| `/dashboard/finance` | `DashboardFinancePage` | dashboard | Oui | Non | Complet |
| `/dashboard/risk` | `DashboardRiskPage` | dashboard | Oui | Non | Complet |
| `/dashboard/fleet` | `DashboardFleetPage` | dashboard | Oui | Non | Complet |
| `/fleet` | `FleetListPage` → rend `screens/VehiclesList` (legacy `mockApi`) | fleet | **Non** (la liste affichée est mock) | Oui | Partiel (la liste est en mock, alors que le backend `/v1/vehicles` existe) |
| `/fleet/:id` | `FleetVehicleDetailPage` | fleet | Oui (vehicles, plans, repairs, accidents, history, costs) | Fallback mock | Complet |
| `/customers` | `CustomersPage` | customers | Oui (`customersApi.listCustomers`) | Non | Complet |
| `/customers/:id` | `CustomerDetailPage` | customers | Oui (`getCustomerDossier`) + KYC + blacklist | Non | Complet |
| `/customers/:id/statement` | `CustomerStatementPage` | finance | Oui | Non | Complet |
| `/contracts` | `ContractsPage` | contracts | Oui (`contractsApi.list`) | Fallback mock | Complet |
| `/contracts/new` | `ContractWizardPage` | contracts | Partiel (wizard appelle `contractsApi.create`) | Fallback mock | Partiel (étape "review" propose `ai` factice) |
| `/contracts/templates` | `ContractTemplatesPage` | contracts | Oui | Non | Partiel |
| `/contracts/:id` | `ContractDetailPage` | contracts | Oui | Non | Complet |
| `/credit` | `CreditAnalysisPage` | credit | Oui (`creditApi.list`) | Fallback mock | Partiel |
| `/finance` | `FinancePage` | finance | Oui (`getTreasurySummary`) | Non | Complet |
| `/finance/invoices[/{id}]` | `InvoicesPage`, `InvoiceDetailPage` | finance | Oui (`financeApi`) | Non | Complet |
| `/finance/payments` | `PaymentsPage` | finance | Oui | Non | Complet |
| `/finance/treasury` | `TreasuryPage` | finance | Oui | Non | Complet |
| `/accounting` | `AccountingPage` | accounting | Oui (`getTrialBalance`, `getIncomeStatement`) | Non | Complet |
| `/accounting/chart` | `ChartOfAccountsPage` | accounting | Oui | Non | Complet |
| `/accounting/journals` | `JournalsPage` | accounting | Oui | Non | Complet |
| `/accounting/entries[/new\|/:id]` | `EntriesPage`, `JournalEntryForm`, `EntryDetailPage` | accounting | Oui | Non | Complet |
| `/accounting/fixed-assets[/:id]` | `FixedAssetsPage`, `FixedAssetDetailPage` | accounting | Oui | Non | Complet |
| `/accounting/reports/{trial-balance,balance-sheet,income-statement,tax-report}` | 4 pages | accounting | Oui | Non | Complet |
| `/accounting/settings` | `AccountingSettingsPage` | accounting | Oui (taxes, fiscal-years) | Non | Partiel |
| `/arrears` | `ArrearsDashboardPage` | arrears | Oui (`arrearsApi`) | Non | Complet |
| `/arrears/legal[/:id]` | `LegalCasesPage`, `LegalCaseDetailPage` | arrears | Oui | Non | Complet |
| `/arrears/:id` | `ArrearsCaseDetailPage` | arrears | Oui | Non | Complet |
| `/signatures[/:id]` | `SignatureEnvelopesPage`, `SignatureEnvelopeDetailPage` | signatures | Oui (`signatureApi`) | Non | Complet |
| `/used-cars[/:id]` | `UsedCarsPage`, `UsedCarDetailPage` | usedCars | Oui (`usedCarsApi`) | Non | Complet |
| `/gps` | `GpsDashboardPage` (Leaflet, alertes, KPIs, geofences) | gps | Oui (`gpsApi`) | Fallback mock | Complet |
| `/gps/alerts` | `GpsAlertsPage` | gps | Oui | Non | Complet |
| `/gps/geofences` | `GeofencesPage` | gps | Oui | Non | Complet |
| `/gps/vehicles/:id/live` | `VehicleLiveTrackingPage` | gps | Oui | Non | Complet |
| `/gps/vehicles/:id/trips` | `VehicleTripsPage` | gps | Oui | Non | Complet |
| `/ai` | `AiHubPage` | ai | Non (FeatureGate + lien) | Sans données | Placeholder |
| `/ai/assistant` | `AiAssistantPage` | ai | Non (textarea) | Sans données | Design only |
| `/ai/predictions/:topic` | `AiPredictionPlaceholder` (maintenance / pricing / risk) | ai | Oui (consomme `/v1/vehicles`, `/v1/used-cars/listings`, `/v1/arrears/cases`) mais scoring purement frontend | Non | Partiel |
| `/mobile-ops` | `MobileOpsPage` | mobileOps | Oui (`opsApi`) | Fallback mock | Partiel (UploadZone démo) |
| `/notifications` | `NotificationsPage` | notifications | **Non** (`erpApi.getNotifications` mock) | Oui | Placeholder |
| `/settings` | `SettingsPage` (4 onglets : Règles, Fiscalité, Templates, Agences) | settings | Partiel (Branches lit erpApi mock, autres = texte) | Oui (3 onglets) | Placeholder |
| `/settings/users` | `UserManagementPage` | settings | Oui (`adminApi`) | Non | Complet |
| `/settings/roles` | `RolesPermissionsPage` | settings | Oui | Non | Complet |
| `/settings/branches` | `BranchManagementPage` | settings | Oui | Non | Complet |
| `/audit` | `AuditPage` | audit | **Non** (`erpApi.getAuditLogs` mock) | Oui | Placeholder |
| `/rentals` | `RentalsPage` | rentals | Si `getApiBase()` → `ReservationsOpsPage` (real) sinon `screens/ReservationsList` (mock) | Conditionnel | Partiel |
| `*` (catch-all) | redirige vers `/dashboard` | — | — | — | — |

---

## 8. Frontend — composants et design system

Source : `frontend/modules/shared/components/` (23 composants) + `modules/layout/AppLayout.tsx`.

| Élément | Composant réutilisable | Fichier | Réutilisable ? | Codé en dur ailleurs ? |
|---|---|---|---|---|
| Layout principal | `AppLayout` | `modules/layout/AppLayout.tsx` | Oui | Non |
| Sidebar | bloc `<Sidebar>` interne à `AppLayout` | idem | Réutilisable via `AppLayout` | Hardcodé : `GROUPS` (5 groupes, 15 items) en haut du fichier |
| Topbar | bloc `<header className="df-topbar">` interne | idem | Réutilisable via `AppLayout` | Hardcodé |
| Tables | `DataTable<T>` | `shared/components/DataTable.tsx` | **Oui** (utilisé partout : customers, contracts, invoices, users…) | Quelques tables sont rendues à la main (cf. `AiPredictionPages`) |
| Forms | Pas de composant générique ; chaque écran refait son `<form>` (`UserForm`, `RoleForm`, `CustomerForm`, `MaintenancePlanForm`, `RepairForm`, `AccidentForm`…) | divers | **Non** | Oui — duplication |
| Modals | `ConfirmModal`, `DrawerPanel`, `DocumentPreviewModal` | `shared/components/` | Oui | Quelques drawers `DrawerPanel` réutilisés à fond |
| Badges / status | `StatusBadge`, `StatusChip` | `shared/components/` | Oui | Quelques badges hardcodés (cf. `FleetVehicleDetailPage` `planStatusBadge`, `severityBadge`, `accidentStatusBadge`) |
| KPI cards | `KpiCard` | `shared/components/KpiCard.tsx` | Oui | Une réimplémentation locale dans `AiPredictionPages.tsx` (`KpiCard` interne) |
| Charts | `recharts` directement (LineChart, BarChart, PieChart, RadarChart, AreaChart) | utilisé dans dashboards et IA | Pas de wrapper réutilisable | Oui — chaque page configure ses charts |
| Maps | `react-leaflet` (`MapContainer`, `TileLayer`, `Marker`, `Circle`, `useMap`) | utilisé dans `GpsDashboardPage`, `VehicleLiveTrackingPage`, `VehicleTripsPage` | Pas de wrapper, mais helpers (icon factory) | Oui |
| File upload | `UploadZone` | `shared/components/UploadZone.tsx` | Oui | KYC `CustomerDetailPage`, accidents `FleetVehicleDetailPage` font leur propre `<input type="file">` |
| Signature | Pas de composant signature WYSIWYG ; `SignatureEnvelopesPage` + `SignatureEnvelopeDetailPage` consomment l'API | `modules/signature/` | Spécifique au module | OTP côté frontend → input numérique |
| Divers | `Icon` (lib d'icônes maison), `TabsSection`, `Skeleton`, `Sparkline`, `RiskMeter`, `Timeline`, `EmptyState`, `PermissionGate`, `ActionPermissionGate`, `FeatureGate`, `ThemeToggle`, `DensityToggle`, `CommandPalette`, `AICopilot`, `SearchFilterBar` | `shared/components/` | Oui | — |

Design system tokens (CSS) : variables `--df-*` (couleurs, surfaces, ombres),
classes utilitaires `df-card`, `df-card--elev`, `df-card__body`, `df-card__header`,
`df-btn`, `df-btn--primary|ghost|danger|subtle|sm|icon`, `df-input`, `df-input--sm`,
`df-label`, `df-num`, `df-shimmer`, `df-shell`, `df-pulse-dot`, `df-tabs/df-tab/df-tab--active`,
`df-grid-bg`, `df-heroMark`, `df-kbd`, `df-crumb*`, `df-nav-link*`, `df-sidebar`, `df-topbar`.

---

## 9. Accès, rôles et permissions

### 9.1 Rôles existants

Backend : `backend/config/erp.php → app_roles` :
`ADMIN`, `DIRECTEUR`, `ANALYSTE_CREDIT`, `AGENT_COMMERCIAL`, `GESTIONNAIRE_FLOTTE`,
`COMPTABLE`, `CONTENTIEUX`, `AGENT_LIVRAISON`, `CLIENT_PORTAL`, `AGENT` (legacy).
Frontend : `frontend/domain/appRole.ts → APP_ROLES` (mêmes 10 codes).

### 9.2 Permissions existantes

Backend `erp.php → permission_roles` (5 clés seulement) :
`view_fleet`, `view_customers`, `view_contracts`, `view_finance`, `view_credit`.
Côté SPA, `domain/erpPermissions.ts` réplique exactement ces 5 clés.

Le module `Permission` côté DB est plus large (table `permissions` + `role_permissions`)
mais les routes API utilisent `role:` et **quasiment jamais `permission:`**.

### 9.3 Navigation par rôle

`ROLE_MODULE_ACCESS` (frontend, `domain/appRole.ts`) :

| Rôle | Modules affichés en sidebar |
|---|---|
| ADMIN | tous (15 modules) |
| DIRECTEUR | tous (15 modules) |
| ANALYSTE_CREDIT | dashboard, customers, credit, contracts, notifications |
| AGENT_COMMERCIAL | dashboard, customers, contracts, fleet, usedCars, rentals, notifications, mobileOps |
| GESTIONNAIRE_FLOTTE | dashboard, fleet, gps, mobileOps, notifications |
| COMPTABLE | dashboard, finance, contracts, arrears, notifications |
| CONTENTIEUX | dashboard, arrears, customers, contracts, notifications |
| AGENT_LIVRAISON | dashboard, mobileOps, fleet, gps, notifications |
| CLIENT_PORTAL | dashboard, contracts, notifications, mobileOps |
| AGENT (legacy) | dashboard, fleet, customers, contracts, rentals, notifications, mobileOps |

> **Bug détecté** : `AppRoutes.tsx` utilise `<ModuleGate module="signatures">` et
> `<ModuleGate module="accounting">`, mais la `ModuleKey` union dans `domain/appRole.ts`
> ne contient **ni `signatures` ni `accounting`**. La fonction `canAccessModule()` ne renvoie
> donc `true` que pour ADMIN/DIRECTEUR (qui bypassent), et **redirige vers `/dashboard`**
> les autres rôles (y compris COMPTABLE pour `/accounting`). Cf. §13.

### 9.4 Protection des routes

- **Frontend** :
  - `RequireAuth` protège tout `/`.
  - `ModuleGate` redirige hors `/dashboard` si rôle n'a pas accès au module.
  - `PermissionGate` / `ActionPermissionGate` existent comme composants utilitaires
    (`shared/components/`) mais ne sont utilisés que dans quelques actions.
- **Backend** :
  - `auth:sanctum` partout sauf `health`, `auth/login`, `auth/forgot-password`,
    `auth/reset-password`, `signatures/webhooks/provider`.
  - `role:` utilisé pour : branches (CRUD), users (CRUD), roles (CRUD), permissions (lecture),
    customers blacklist, KYC verify/approve/reject, used-cars CRUD/sell/transfer,
    treasury CRUD/match, accounting CRUD/post/cancel/bridge, taxes CRUD,
    fiscal-years CRUD/close, fixed-assets CRUD/dispose/depreciate, legal-cases CRUD/repossession.
  - **Permissions fines `permission:*` ne sont câblées sur aucune route** (mapping `permission_roles`
    présent mais inutilisé en pratique).

### 9.5 Actions sensibles

| Action | Protégée backend ? |
|---|---|
| Login / refresh / reset | Oui (throttle) |
| Créer contrat / activer / résilier | **Non `role:`** (n'importe quel user authentifié peut le faire — risque) |
| Approuver crédit | **Non `role:`** sur `/credit-applications/{id}/decision` (à vérifier ; pas de garde role détectée) |
| Approuver KYC | Oui (`role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT`) |
| Blacklister un client | Oui (`role:ADMIN,DIRECTEUR,CONTENTIEUX`) |
| Vendre un VO | Oui (`role:ADMIN,DIRECTEUR`) |
| Émettre une facture / annuler | **Non** (juste auth) |
| Allouer / désallouer un paiement | **Non** (juste auth) |
| Comptabiliser une écriture | Oui (`role:ADMIN,DIRECTEUR,COMPTABLE`) |
| Importer un relevé bancaire | Oui (`role:ADMIN,DIRECTEUR,COMPTABLE`) |
| Clôturer un exercice fiscal | Oui (`role:ADMIN,DIRECTEUR,COMPTABLE`) |
| Lancer un dossier juridique | Oui (`role:ADMIN,DIRECTEUR,CONTENTIEUX`) |
| Envoyer une enveloppe signature | **Non** (juste auth) |
| Modifier un véhicule / accident / réparation | **Non** (juste auth) |
| Supprimer un client | **Non** (juste auth) |

| Rôle | Modules accessibles (UI) | Actions backend possibles | Remarques |
|---|---|---|---|
| ADMIN | tous | toutes (passe tous les `role:`) | Bypass intégral. |
| DIRECTEUR | tous | toutes | Idem ADMIN. |
| ANALYSTE_CREDIT | dashboard, customers, credit, contracts, notifications | KYC verify/approve/reject ; tout ce qui est juste `auth:sanctum` | Pas de garde sur création de crédit / décision en backend. |
| AGENT_COMMERCIAL | dashboard, customers, contracts, fleet, usedCars, rentals, notifications, mobileOps | CRUD listings VO, évaluer, publier, réserver ; tout ce qui est juste `auth:sanctum` | Peut créer/clôturer un contrat (pas gardé). |
| GESTIONNAIRE_FLOTTE | dashboard, fleet, gps, mobileOps, notifications | flotte, GPS, mais aussi tout ce qui est juste `auth:sanctum` (factures, contrats…) | Risque : aucune restriction backend hors `role:` explicit. |
| COMPTABLE | dashboard, finance, contracts, arrears, notifications | Comptabilité, taxes, fiscal years, fixed assets, treasury | UI : `/accounting` redirige vers `/dashboard` à cause du bug ModuleGate (cf. §13). |
| CONTENTIEUX | dashboard, arrears, customers, contracts, notifications | blacklist customers, legal-cases CRUD, repossession-orders | OK. |
| AGENT_LIVRAISON | dashboard, mobileOps, fleet, gps, notifications | tout `auth:sanctum` non gardé | Idem GESTIONNAIRE_FLOTTE (risque). |
| CLIENT_PORTAL | dashboard, contracts, notifications, mobileOps | tout `auth:sanctum` non gardé | **À durcir** — un CLIENT_PORTAL ne devrait pas pouvoir lire `/customers`. |
| AGENT (legacy) | dashboard, fleet, customers, contracts, rentals, notifications, mobileOps | tout `auth:sanctum` non gardé | À déprécier au profit des rôles spécialisés. |

**Verdict sécurité** : la sécurité est **fortement frontend** ; le backend protège
correctement les opérations critiques de comptabilité, contentieux, KYC, blacklist,
gestion users/roles/branches, vente VO. **Mais** la majorité des opérations CRUD
métier (contrats, factures, paiements, accidents, réparations, missions, signatures,
dashboards) sont seulement gardées par `auth:sanctum` ; n'importe quel utilisateur
authentifié peut donc les appeler.

---

## 10. Fonctions métier couvertes

| Fonction métier | Couvert ? | Où dans le code ? | Niveau | Commentaire |
|---|---|---|---|---|
| Création client particulier | Oui | `CustomerController@store` + `CustomersPage` + `CustomerForm` | Fonctionnel | Crée customer + individual_profile + contacts + KYC `pending`. |
| Création client entreprise | Oui | idem (branche `customer_type=ENTREPRISE`) | Fonctionnel | Crée company_profile (ICE, RC, IF, CNSS, repr. légal). |
| KYC documents | Oui | `KycController@uploadDocument`, `customersApi.uploadKycDocument`, checklist `KYC_CHECKLIST` | Fonctionnel | Upload local, types CIN, RC, ICE, RIB, etc. |
| Validation KYC | Oui | `KycController@verifyDocument/approve/reject` | Fonctionnel | Workflow `pending → in_review → approved/rejected/expired`. |
| Blacklist client | Oui | `CustomerSubresourceController@blacklist/unblacklist` + `customer_blacklist_entries` | Fonctionnel | Gardé `role:ADMIN,DIRECTEUR,CONTENTIEUX`. |
| Création véhicule | Oui | `VehicleController@store` + `Fleet\StoreVehicleRequest` | Fonctionnel | UUID, statut historisé. |
| Documents véhicule | Oui | `VehicleDocumentController@store` | Fonctionnel | Stockage local. |
| Entretien véhicule | Oui | `VehicleMaintenancePlanController` + `VehicleMaintenanceEventController` + `MaintenanceService` | Fonctionnel | Plans récurrents + events réalisés ; alertes statut `due_soon/overdue`. |
| Réparation véhicule | Oui | `VehicleRepairController` | Fonctionnel | Workflow `reported → in_progress → completed`. |
| Accident véhicule | Oui | `VehicleAccidentController` + `AccidentService` + `accident_documents` | Fonctionnel | Workflow + documents (PV, constat, expertise…). |
| Suivi GPS | Oui | `GpsPositionIngestionController`, `GpsController@vehiclesLive`, `GpsRuleService` | Fonctionnel | Live + alertes calculées à l'ingestion. |
| Géofencing | Oui | `GeofenceController`, `VehicleGeofenceController`, `Geo` (point-in-circle) | Fonctionnel | Type `CIRCLE` implémenté (`POLYGON` accepté en payload mais évaluation = circle uniquement). |
| Historique trajets | Oui | `TripController@indexForVehicle`, agrégation par `GpsRuleService` | Fonctionnel | — |
| Création contrat LLD | Oui | `ContractController@store` + wizard `ContractWizardPage` | Backend partiel | Stocké, mais TVA loyers / mileage logs non câblés. |
| Création contrat LOA | Oui | idem (type=LOA) | Backend partiel | Valeur résiduelle stockée mais pas de calcul automatique de l'option d'achat à terme. |
| Création crédit auto | Oui | `CreditApplicationController` + `decision(create_contract:true)` | Backend partiel | Scoring déterministe ; pas de connecteur CNSS/FICP. |
| Vente véhicule occasion | Oui | `UsedCarController@store/evaluate/publish/sell` | Fonctionnel | Crée sale + transfer ; pas de PDF certificat. |
| Génération échéancier | Oui | `ContractController@generateSchedule` | Fonctionnel | Crée N `contract_installments` ; TVA inline. |
| Facturation | Oui | `InvoiceController@store/issue/cancel/generateFromContract` | Fonctionnel | Auto-overdue ; pas de PDF. |
| Paiement | Oui | `PaymentController@store/allocate` | Fonctionnel | — |
| Allocation paiement | Oui | `PaymentController@allocate/removeAllocation` | Fonctionnel | Allocation factures + installments avec recalcul. |
| Impayés | Oui | `ArrearsCaseController@store/index` | Fonctionnel | Auto-compute overdue + advancement de stage. |
| Relance | Oui | `ArrearsCaseController@action` | Backend partiel | Enregistre actions (call, email, notice…) ; pas d'envoi réel. |
| Contentieux | Oui | `LegalCaseController` + `repossession_orders` | Fonctionnel | Mais pas de génération doc juridique. |
| Comptabilité double entrée | Oui | `AccountingEntryController@store/post/cancel` | Fonctionnel | Equilibre validé ; extourne par contre-écriture. |
| Plan comptable | Oui | `AccountingAccountController` + `accounting_accounts` | Backend partiel | **Pas de seed PCG-MA standard** vérifié. |
| Journaux comptables | Oui | `AccountingJournalController` | Fonctionnel | — |
| Amortissement véhicule | Oui | `FixedAssetController@depreciate` + `DepreciationLine` + `AccountingBridgeController@fromDepreciation/fromAssetDisposal` | Fonctionnel | Linéaire ; pas de dégressif. |
| Signature électronique | Oui | `SignatureEnvelopeController` (provider interne OTP) | Backend partiel | Provider externe non implémenté ; OTP envoyé par `Log::info`. |
| Génération PDF (contrat / facture / mise en demeure / certificat de cession) | **Non trouvé** | aucun service `PdfService` / `dompdf` / `barryvdh/laravel-dompdf` détecté dans `composer.json` | Non existant | À implémenter. |
| Audit logs | **Non câblé** | `AuditLogger::log` n'écrit que dans `Log::info`, table `audit_logs` non écrite | UI seulement (mock) | Fort risque conformité. |
| Notifications | **Non câblé backend** | aucune route `/notifications`, page lit du mock | UI seulement | — |
| Dashboard KPIs | Oui | `DashboardController` + `ExecutiveDashboardPage` (+ DashboardFinance/Risk/Fleet) | Fonctionnel | — |
| IA scoring (crédit) | Heuristique | `CreditApplicationController@score` (paliers fixes) | Mock / Backend partiel | Pas de modèle ML. |
| IA pricing VO / risk impayés / maintenance | Heuristique frontend | `AiPredictionPages.tsx` | UI seulement | Calcul côté client à partir de vraies données. |
| Assistant IA | Placeholder | `AiAssistantPage` | UI seulement | Aucun adapter LLM. |

---

## 11. Écart avec le cahier des charges

| Exigence CDC | Couvert actuellement ? | Module concerné | Gap | Priorité |
|---|---|---|---|---|
| Gestion parc complète (acquisition, suivi, sortie) | Partiel | fleet | Pas de workflow de mise en sortie automatisée, assurance non écrite | P2 |
| Clients particuliers / entreprises (avec ICE, RC, IF, CNSS) | Oui | customers | Pas de vérification automatique des références marocaines | P3 |
| KYC complet (CIN, justificatifs, vérification) | Oui | customers | Pas d'OCR / vérification automatique | P3 |
| Contrats LLD / LOA / Crédit / Vente VO | Oui (création + workflow) | contracts | **Pas de PDF**, pas de gestion CGV par template, pas de mileage logs | P1 |
| Analyse crédit (scoring) | Backend partiel | credit | Scoring déterministe trivial ; pas de connecteur externe | P2 |
| CNSS (vérification employeur) | Non | customers / credit | Aucun connecteur | P3 |
| Finance / fiscalité Maroc (TVA, retenue à la source, IR, IS) | Backend partiel | finance / accounting | TVA capturée par ligne, mais pas de schéma fiscal complet | P2 |
| Comptabilité complète (PCG-MA) | Backend partiel | accounting | **Pas de seed PCG-MA**, pas de FEC, pas de report à nouveau auto | P1 |
| TVA loyers (LLD/LOA) | Partiel | contracts / finance | TVA générée à la facture, mais règles spécifiques loyers non séparées | P2 |
| TVA marge VO | Non | usedCars / finance | Pas de calcul TVA marge ni d'écran fiscal dédié | P2 |
| Immobilisations / amortissements | Oui | accounting | Linéaire seulement | P2 |
| Impayés / contentieux | Oui | arrears | Pas de génération mise en demeure PDF | P2 |
| Vente VO | Oui | usedCars | Pas de PDF certif. cession ; pas de marketplace | P3 |
| GPS temps réel | Oui | gps | Pas de webhook fournisseur normalisé | P2 |
| Géofencing | Oui (cercles) | gps | POLYGON non évalué côté backend | P3 |
| Kilométrage contrat (suivi vs forfait) | Non | contracts | Table `contract_mileage_logs` présente mais non écrite | P2 |
| IA scoring / pricing / cash-flow / maintenance | Heuristique | ai | Pas de modèle ML serveur | P3 |
| Dashboard dirigeant | Oui | dashboard | — | OK |
| Multi-langue (FR/EN/AR) | Oui | i18n | Quelques labels en dur en FR | P3 |
| Application mobile / agents | Partiel | mobileOps | Page web responsive seulement, pas d'app native | P3 |
| Réservation / livraison | Oui | ops | Pas d'optimisation tournée | P2 |
| Signature électronique | Backend partiel | signature | Provider externe non implémenté ; pas de PDF signé persisté | P1 |
| Entretien / réparation / accidents | Oui | maintenance | Pas de cron rappel, pas d'intégration assureur | P2 |

---

## 12. Données mock vs données réelles

| Zone | Type de données | Fichier | Risque |
|---|---|---|---|
| Liste flotte `/fleet` | Mock localStorage (legacy) | `frontend/screens/VehiclesList.tsx` (utilise `services/mockApi`) — appelé par `FleetListPage.tsx` | **Élevé** : la liste flotte n'est pas connectée à `/v1/vehicles` ; les utilisateurs voient des véhicules mock. |
| Dashboard classique `/dashboard/classic` | Mock | `frontend/screens/Dashboard.tsx` | Faible (route secondaire) |
| Notifications `/notifications` | Mock localStorage | `frontend/services/erpApi.ts` `getNotifications/markNotificationRead` ; `frontend/services/erpStore.ts` | Élevé (le client va voir des notifications fictives) |
| Audit `/audit` | Mock localStorage | `frontend/services/erpApi.ts` `getAuditLogs` | Élevé (audit factice) |
| Settings tab "Règles / Fiscalité / Templates" | Texte d'attente | `frontend/modules/settings/SettingsPage.tsx` | Moyen |
| Settings tab "Agences" | `erpApi.getBranches()` (mock) au lieu de `/v1/branches` | `frontend/modules/settings/SettingsPage.tsx` | Moyen (alors que `/settings/branches` est réel via `BranchManagementPage`) |
| Reservations legacy | Mock | `frontend/screens/ReservationsList.tsx` (rendu si pas de `VITE_API_BASE`) | Moyen |
| Wizard contrat — recommandations IA | Hardcodées | `frontend/modules/contracts/ContractWizardPage.tsx` (`ai: 'Loyer IA optimal: 4 200 MAD/mois...'`) | Élevé (texte client laissé dans la page) |
| AI Hub / Assistant | Texte / FAB sans backend | `frontend/modules/ai/AiHubPage.tsx`, `AiAssistantPage.tsx` | Moyen (faux engagement IA) |
| Mobile-Ops UploadZone | Composant démo (`Signature client (fichier simulé)`) | `frontend/modules/mobileOps/MobileOpsPage.tsx` | Moyen |
| Coordonnées GPS sur dashboard si pas de positions réelles | `fakeCoords(id)` (déterministe) | `frontend/modules/gps/GpsDashboardPage.tsx` | Élevé : marqueurs visibles même sans GPS réel — confusion possible |
| `erpStore.ts` | Tout l'état mock (clients, véhicules, contrats, paiements, geofences, alertes, missions, audit logs…) localStorage | `frontend/services/erpStore.ts` | Trace : **DTO mock co-existent avec DTO API**, certains écrans passent encore par la voie mock |
| `mockApi.ts` (legacy facade) | Réutilisé par `screens/VehiclesList`, `screens/Dashboard` | `frontend/services/mockApi.ts` | Élevé |
| `seeders` Laravel | Présents dans `backend/database/seeders/` (rôles, permissions baseline, peut-être users) | non détaillé ici | Moyen — vérifier qu'aucune fixture client/contrat n'est seedée en prod |

---

## 13. Bugs, risques et dette technique

### Routes / endpoints cassés ou incohérents
- `routes/api.php` ligne 62 : `Route::post('v1/signatures/webhooks/provider', …)` est **dans** un
  `Route::prefix('v1')->group(...)` → URL effective `/api/v1/v1/signatures/webhooks/provider`
  (double prefix). À corriger : retirer le `v1/` ou sortir du group.
- `endpoints.ts` côté frontend liste `/v1/auth/refresh` → **aucune route backend**.
- `endpoints.ts` liste `/v1/finance/schedule` et `/v1/finance/payments` → **routes inexistantes**
  (les vraies sont `/v1/payments` et `/v1/contracts/{id}/installments`).
- `endpoints.ts` liste `/v1/audit`, `/v1/settings/users`, `/v1/settings/master-data` → inexistants.

### Bug critique RBAC frontend
- `<ModuleGate module="signatures">` (signatures) et `<ModuleGate module="accounting">`
  ne sont **pas dans `ModuleKey`** de `domain/appRole.ts`.
  Conséquence : seul ADMIN/DIRECTEUR (qui bypassent) peuvent ouvrir `/signatures*` et
  `/accounting*` ; un COMPTABLE est **redirigé vers `/dashboard`**, alors qu'il a backend
  l'autorisation de tout faire en comptabilité. **Bug bloquant** pour la livraison COMPTABLE.

### Sécurité backend insuffisante
- Routes critiques sans `role:` : `contracts` (CRUD/approve/activate/terminate),
  `credit-applications` (CRUD/decision), `invoices` (CRUD/issue/cancel), `payments`
  (CRUD/allocate/unallocate), `arrears/cases`, `signatures/envelopes` (CRUD/send/sign/decline),
  `vehicles` (CRUD), `vehicle_repairs/accidents/maintenance-events`, `missions`, `reservations`,
  `customers` (CRUD), `dashboard`. Tout utilisateur authentifié (y compris CLIENT_PORTAL,
  qui devrait être très restreint) peut techniquement appeler ces endpoints.
- Le mapping `permission_roles` (`config/erp.php`) n'est **jamais utilisé** sur les routes.

### Imports inutilisés / composants non utilisés
- `frontend/services/endpoints.ts` expose des routes qui n'existent pas backend (cf. ci-dessus).
- `frontend/services/mockApi.ts` reste exporté pour compat mais ne devrait plus servir
  (utilisé par `screens/VehiclesList`, `screens/Dashboard`, `screens/ReservationsList`).
- `frontend/services/erpApi.ts` est encore consommé par : `AuditPage`, `NotificationsPage`,
  `SettingsPage` (branches tab), `MobileOpsPage` fallback, `MaintenancePage(legacy)`, etc.
- `frontend/screens/Dashboard.tsx` (legacy) accessible via `/dashboard/classic` — semble inutile
  une fois le nouveau dashboard validé.
- `domain/erpPermissions.ts` ne couvre que 5 permissions ; le reste du code n'utilise pas
  réellement ce gating.

### Endpoints sans validation
- Plusieurs contrôleurs ont leur validation via `$request->validate(...)` inline sans Form
  Request dédiée (ex. `VehicleAccidentController@store/update/transition/uploadDocument`,
  `KycController`, `ArrearsCaseController`, `UsedCarController`, `TreasuryController`).
  Pas critique, mais incohérent avec la convention Form Request d'autres modules.

### Tables non utilisées (dans dump SQL mais jamais écrites par le code)
- `entity_attachments`, `files`, `payment_methods`, `notification_templates`, `notifications`,
  `signature_providers`, `electronic_certificates`, `system_settings`, `currencies`,
  `languages`, `number_sequences`, `contract_clauses`, `contract_mileage_logs`,
  `customer_employment_profiles`, `customer_addresses` (alias pluriel/singulier sus-cité),
  `vehicle_insurance_policies`, `credit_scores`, `ai_models`, `ai_predictions`,
  `assistant_conversations`, `assistant_messages`, `audit_logs`, `vehicle_geofence_states`
  (utilisée par GpsRuleService — partiellement).

### Tables / migrations / modèles à double nom
- Voir §4 (chart_of_accounts vs accounting_accounts, etc.). Risque si un seul des deux
  schémas est appliqué.

### Formulaires incomplets
- `ContractWizardPage` : étapes "annexes" et "review" présentent des recommandations IA
  hardcodées et n'envoient **pas** de pièces jointes au backend (juste un `contractsApi.create`).
- `FleetVehicleDetailPage` onglet "Documents" est un texte d'attente.
- `SettingsPage` : 3 onglets sur 4 sont du texte.

### Absence d'audit
- Aucune table `audit_logs` écrite. `AuditLogger::log` non appelée par les contrôleurs
  métier (à confirmer par grep).

### Données hardcodées
- `ContractWizardPage` : recommandations IA, articles légaux DOC, suggestions VR.
- `GpsDashboardPage` : `fakeCoords(id)` génère des coordonnées plausibles autour de Casablanca
  même sans positions réelles → **affiche du faux GPS** au client.
- `AiPredictionPages.tsx` : `Math.random()` dans la 5e dimension du radar de risque (ligne 382).

### Incohérences de statuts
- Statuts contrat côté backend : libres (`draft`, `pending_approval`, `approved`, `awaiting_signature`, `active`, `suspended`, `closed`, `terminated`) — pas d'enum strict.
- Statuts véhicule côté backend (`AVAILABLE / RENTED / MAINTENANCE / BLOCKED / SOLD / RESERVED…`) ne sont validés que par la Form Request, pas par contrainte DB.
- Statuts mission côté backend (`planned / in_progress / completed / failed`) vs frontend (`PENDING / IN_PROGRESS / DONE`) : `opsApi.missions()` fait la conversion, mais d'autres écrans manipulent l'enum brut.

### Build / config
- `frontend/package.json` : `react: ^19.2.4` est très récent ; certaines libs (recharts, leaflet)
  doivent être vérifiées. Pas d'erreur visible mais à tester en CI.
- Pas de `.env.example` au niveau racine pour expliquer `VITE_API_BASE`.

---

## 14. Score de maturité par module

Score sur 100. UI = qualité visible client. Backend = endpoints + services. DB = tables + modèles.
Business rules = règles métier réelles. Production = prêt à l'emploi.

| Module | UI | Backend | DB | Business rules | Production readiness | Score global |
|---|---:|---:|---:|---:|---:|---:|
| Auth | 80 | 80 | 90 | 70 | 70 | **78** |
| Users & rôles | 90 | 80 | 90 | 70 | 75 | **81** |
| Dashboard | 85 | 75 | 90 | 70 | 70 | **78** |
| Clients & KYC | 90 | 85 | 95 | 80 | 75 | **85** |
| Véhicules / flotte | 75 | 80 | 95 | 75 | 65 | **78** |
| Entretien / réparations / accidents | 80 | 80 | 90 | 75 | 65 | **78** |
| Contrats | 75 | 70 | 90 | 60 | 50 | **69** |
| Crédit | 65 | 50 | 80 | 40 | 35 | **54** |
| GPS / Géofencing | 80 | 75 | 90 | 75 | 65 | **77** |
| Réservations / missions | 70 | 70 | 85 | 60 | 55 | **68** |
| Vente VO | 75 | 70 | 85 | 65 | 55 | **70** |
| Finance / facturation / paiements | 80 | 75 | 90 | 70 | 60 | **75** |
| Comptabilité | 80 | 80 | 90 | 75 | 60 | **77** |
| Impayés / contentieux | 80 | 70 | 85 | 65 | 55 | **71** |
| Signature électronique | 75 | 55 | 80 | 50 | 35 | **59** |
| Documents | 50 | 50 | 80 | 40 | 35 | **51** |
| Notifications | 30 | 5 | 70 | 5 | 5 | **23** |
| Audit | 30 | 10 | 80 | 10 | 5 | **27** |
| IA | 55 | 10 | 70 | 25 | 15 | **35** |

---

## 15. Plan d'action priorisé

### Priorité 1 — Bloquant livraison client

| # | Module | Fichier(s) concerné(s) | Action précise | Difficulté |
|---|---|---|---|---|
| P1.1 | RBAC frontend | `frontend/domain/appRole.ts` | Ajouter `signatures` et `accounting` à `ModuleKey` + autoriser les rôles concernés (COMPTABLE → accounting ; ADMIN/DIRECTEUR/AGENT_COMMERCIAL/CONTENTIEUX → signatures). Sinon les rôles non-admin sont coupés des écrans clés. | Faible |
| P1.2 | Sécurité backend | `backend/routes/api.php` | Ajouter `role:` ou `permission:` sur : contrats, credit-applications, invoices, payments, signatures, customers (CRUD), reservations, missions, vehicles. Sans cela, un CLIENT_PORTAL peut tout lire/écrire. | Moyenne |
| P1.3 | Liste flotte | `frontend/modules/fleet/FleetListPage.tsx`, `frontend/screens/VehiclesList.tsx` | Remplacer `screens/VehiclesList` (mock) par un appel `apiClient('/v1/vehicles')`. Sinon `/fleet` montre des données mock à un client en démo. | Moyenne |
| P1.4 | Audit logs | `backend/app/Services/AuditLogger.php` + tous les contrôleurs sensibles | Persister dans `audit_logs` (table déjà présente dans le SQL) ; appeler depuis : auth login/logout, customers blacklist, KYC approve/reject, contracts approve/activate/terminate, invoices issue/cancel, payments allocate, accounting post/cancel, signature send/sign/void, used-car sell. Frontend : remplacer `erpApi.getAuditLogs()` par un endpoint réel `/v1/audit-logs`. | Moyenne |
| P1.5 | Webhook signature | `backend/routes/api.php` (l. 62) | Corriger le double prefix `/v1/v1/signatures/webhooks/provider`. Implémenter l'intégration provider externe ou retirer la fonctionnalité du discours commercial. | Faible |
| P1.6 | Génération PDF (contrat / facture / mise en demeure / certif. cession) | nouveau `app/Services/PdfService.php` (ex. dompdf) ; routes `contracts/{id}/pdf`, `invoices/{id}/pdf`, `arrears/cases/{id}/notice/pdf`, `used-cars/sales/{id}/pdf` | Implémenter le rendu PDF basé sur templates. Sans cela : non livrable pour signature, fiscalité, juridique. | Haute |
| P1.7 | Données mock résiduelles | `frontend/modules/notifications/NotificationsPage.tsx`, `frontend/modules/audit/AuditPage.tsx`, `frontend/modules/settings/SettingsPage.tsx` (tab branches), `screens/Dashboard.tsx`, `screens/VehiclesList.tsx`, `frontend/services/mockApi.ts`, `frontend/services/erpApi.ts` | Brancher sur API ou désactiver l'écran. Pas tolérable en démo client. | Moyenne |

### Priorité 2 — Important métier

| # | Module | Fichier(s) concerné(s) | Action précise | Difficulté |
|---|---|---|---|---|
| P2.1 | Contrats | `backend/app/Http/Controllers/Api/V1/ContractController.php` + nouvelle table `contract_mileage_logs` (déjà en SQL) | Brancher la table `contract_mileage_logs` (insertion à chaque relevé km LLD/LOA) + écran frontend `Contrat → Suivi km vs forfait`. | Moyenne |
| P2.2 | Comptabilité | `backend/database/seeders/` | Seeder le **PCG marocain** (chart_of_accounts) en valeurs canoniques. | Moyenne |
| P2.3 | Comptabilité | `AccountingReportController` | Ajouter export FEC (fichier des écritures comptables) + clôture exercice avec report à nouveau. | Haute |
| P2.4 | TVA | `Tax`, `InvoiceController`, `ContractController` | Implémenter règles TVA loyers (LLD/LOA) et TVA marge VO (différence prix achat / prix vente). | Haute |
| P2.5 | Crédit | `CreditApplicationController@score` | Améliorer le scoring (ajouter ratio dépenses / âge / situation pro / blacklist) ou exposer un service `ScoringService` injectable. | Moyenne |
| P2.6 | Crédit | nouveau `App\Services\CnssAdapter` | Connecter (ou stubber) la vérification CNSS pour les clients particuliers. | Haute |
| P2.7 | GPS | `GpsPositionIngestionController` | Ajouter un schéma webhook normalisé (HMAC) pour les fournisseurs (Teltonika, Geotab, Wialon). | Moyenne |
| P2.8 | Géofencing | `App\Services\Gps\Geo` | Implémenter `pointInPolygon` pour les geofences `POLYGON`. | Moyenne |
| P2.9 | Notifications | nouveau `NotificationController` + Laravel Notifications | Notifier lors de : KYC à valider, paiement reçu, échéance dépassée, expiration assurance, alerte GPS critique, signature en attente. | Haute |
| P2.10 | Réservations / missions | `MissionController` | Capturer la signature client (image) sur la mission et la persister dans `mission_photos` ou nouvelle table `mission_signatures`. | Moyenne |
| P2.11 | Mise en demeure | `ArrearsCaseController@action` | Génération PDF + envoi mail (couplé P1.6). | Moyenne |
| P2.12 | Form Requests | `VehicleAccidentController`, `KycController`, `ArrearsCaseController`, `UsedCarController`, `TreasuryController`, `MissionController`, `ReservationController` | Extraire les `$request->validate(...)` en Form Requests dédiées (cohérence avec le reste). | Faible |
| P2.13 | Permissions fines | `backend/routes/api.php` + `EnsurePermission` | Câbler le mapping `permission_roles` (`view_fleet`, `view_customers`, etc.) sur les routes pour avoir un RBAC granulaire et auditable. | Moyenne |

### Priorité 3 — Amélioration / polish

| # | Module | Fichier(s) | Action | Difficulté |
|---|---|---|---|---|
| P3.1 | Doc projet | `frontend/.env.example` + `backend/.env.example` | Documenter les variables `VITE_API_BASE`, `MAIL_*`, `SANCTUM_STATEFUL_DOMAINS`, `FILESYSTEM_DISK`. | Faible |
| P3.2 | Tests | `backend/tests/Feature/` | Ajouter tests Feature minimum sur Auth, Customers, Contracts, Invoices, Payments, Accounting (post/cancel), Signature workflow. | Moyenne |
| P3.3 | i18n | `frontend/i18n/` | Compléter les traductions en EN/AR sur tous les modules métier (audit visuel : nombreux libellés FR en dur). | Moyenne |
| P3.4 | Composants formulaires | `frontend/modules/shared/` | Extraire un `<Field/>`, `<FormSection/>` pour mutualiser les formulaires (~10 dupliqués). | Moyenne |
| P3.5 | Données mock GPS | `GpsDashboardPage.tsx` `fakeCoords` | Désactiver la génération de coordonnées factices quand `liveVehicles` est vide ; afficher un état vide explicite. | Faible |
| P3.6 | Wizard contrat | `ContractWizardPage.tsx` | Retirer les recommandations IA hardcodées ou les marquer `démo`. | Faible |
| P3.7 | Legacy | `frontend/screens/Dashboard.tsx`, `screens/VehiclesList.tsx`, `screens/ReservationsList.tsx`, `services/mockApi.ts` | Supprimer après bascule complète sur l'API. | Faible |
| P3.8 | IA | `frontend/modules/ai/` | Soit câbler un provider (OpenAI / Anthropic / Mistral) avec adapter backend, soit retirer l'AICopilot du layout en livraison. | Haute |
| P3.9 | Mobile native | nouveau projet RN / Capacitor | Si le CDC exige une app mobile, lancer un projet dédié réutilisant l'API existante. | Haute |
| P3.10 | Documents | nouveau `DocumentManager` central | Unifier tous les uploads (KYC, accident, mission, vehicle, contract) dans `entity_attachments` + URLs signées. | Haute |

---

## 16. Verdict final

**Livrable au client tel quel ?** — **Non en l'état**, mais le système est largement plus
qu'un prototype : c'est un MVP fonctionnel sur 14 modules métiers déjà câblés au
backend Laravel + base MySQL réelle. Les 7 actions Priorité 1 (notamment le bug
`ModuleGate` accounting/signatures, la sécurisation backend, le branchement de la liste
flotte, l'audit, et la génération PDF) doivent être traitées avant toute livraison.

**Utilisable en démo ?** — **Oui**, à condition :
1. de seeder un jeu de données réalistes (déjà partiellement fait via `erpStore` mais à
   **migrer côté MySQL réel** via seeders Laravel),
2. de démontrer en se connectant en **ADMIN** ou **DIRECTEUR** uniquement (les autres
   rôles tombent sur le bug ModuleGate accounting/signatures),
3. d'éviter les écrans Audit, Notifications, AI Assistant, Settings (tabs Règles/Fiscalité/Templates),
4. de désactiver `fakeCoords` du dashboard GPS si la table `gps_positions` est vide,
5. d'utiliser `/fleet/:id` plutôt que `/fleet` (la liste flotte est encore mock).

**Utilisable en production ?** — **Pas avant** :
- traitement de **toute la Priorité 1** (RBAC frontend, RBAC backend complet, audit_logs
  persisté, génération PDF, branchement liste flotte, suppression des mocks visibles client),
- seeding du **PCG marocain** (Priorité 2.2),
- intégration d'un **provider de signature externe** ou repli explicite sur signature interne
  reconnue contractuellement,
- tests Feature backend minimaux (Priorité 3.2),
- environnement / `.env.example` documenté,
- politique de stockage durci (S3 + URLs signées si engagement client là-dessus).

**Modules à finaliser avant livraison** (prioritaire) :
1. **Contrats** (PDF + clauses + mileage logs + TVA loyers).
2. **Comptabilité** (PCG seedé + FEC + clôture exercice).
3. **Signature** (provider externe ou interne juridiquement défensable + PDF signé).
4. **Notifications** (backend complet + envoi mail/SMS).
5. **Audit** (table câblée + appels dans tous les contrôleurs sensibles).
6. **Crédit** (scoring crédible + connecteurs externes).
7. **Documents** (DocumentManager central + URLs signées).

**Risques à expliquer au client** :
- L'IA est aujourd'hui essentiellement de l'**heuristique frontend** sur de vraies données ;
  un vrai modèle ML demande un projet ad-hoc.
- L'audit est pour l'instant **non persistant** ; tous les changements sont peut-être
  perdus à la rotation des logs Laravel — risque conformité.
- Les permissions backend sont **partielles** ; certains rôles peuvent appeler des routes
  qui ne devraient pas leur être accessibles.
- Plusieurs écrans listent encore des **données mock** (Notifications, Audit, liste flotte
  par défaut) — non utilisables en production sans branchement API.
- Aucune intégration **mail / SMS / portail client** réelle ; les flux qui en dépendent
  (relances, OTP signature, reset mot de passe) ne fonctionnent qu'en log.
- La table `audit_logs`, `notifications` et plusieurs autres existent mais sont **vides
  en pratique** ; cela peut surprendre le client à l'usage.

---

*Audit généré sur la base d'une revue exhaustive des fichiers `backend/routes/api.php`,
`backend/bootstrap/app.php`, `backend/config/erp.php`, `backend/composer.json`, des 49 contrôleurs
de `backend/app/Http/Controllers/Api/V1/`, des 70 modèles de `backend/app/Models/`, des 32
migrations de `backend/database/migrations/`, du dump `backend/driveflow_db.sql`, du
`frontend/package.json`, de `frontend/routes/AppRoutes.tsx`, de `frontend/routes/ModuleGate.tsx`,
de `frontend/domain/appRole.ts`, de `frontend/domain/erpPermissions.ts`, de
`frontend/services/{apiClient,endpoints,erpApi,mockApi,opsApi,gpsApi,creditApi,contractsApi,
customersApi,financeApi,accountingApi,arrearsApi,signatureApi,usedCarsApi,adminApi,laravelAuthApi,
dashboardApi,erpStore}.ts`, et des pages clés de chaque module
(`modules/{auth,layout,dashboard,fleet,customers,contracts,credit,finance,accounting,arrears,
signature,usedCars,gps,ai,mobileOps,notifications,settings,audit,rentals,shared}/`).*
