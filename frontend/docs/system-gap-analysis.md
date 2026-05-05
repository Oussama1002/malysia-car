# DriveFlow — System gap analysis

**Date:** 2026-04-18  
**Scope:** React (Vite + TypeScript) front-end vs. cahier des charges–aligned target (vehicle leasing, credit, used-car sales, operations).  
**Source note:** The file `Cahier des Charges .pdf` was **not present** in the repository at audit time. This document cross-references the **codebase as implemented** and the **stated product backlog** (tasks 1–19). If the official PDF differs, reconcile terminology and priorities against that document when it is added to the repo.

---

## 1. Executive summary

The current application is a **single-page prototype** for **short-term car rental** workflows: localStorage-backed mock API, tab-based “navigation,” four main views (dashboard, clients, vehicles, reservations), and a minimal login. It does **not** yet constitute a multi-module ERP: no URL routing, no real backend integration, no role-based UI, no leasing/LOA/credit/VO/GPS/finance/contentieux domains.

**Bottom line:** Treat the existing code as **UI/UX seeds** (Tailwind styling patterns, CRUD modals, list screens) and **replace/extend** with a modular architecture, real auth, and API contracts aligned to the CDC.

---

## 2. Technology inventory (as-is)

| Area | Implementation |
|------|----------------|
| Framework | React 19, TypeScript |
| Build | Vite 6 |
| Styling | Tailwind via CDN (`index.html`), Inter font |
| Routing | **None** — `activeTab` state in `App.tsx` |
| Server state | **None** (no React Query / SWR) |
| Global state | React Context **only for auth shape**; each screen uses local `useState` |
| API | `services/mockApi.ts` — in-memory + `localStorage` persistence |
| i18n | French copy **hardcoded** in components |
| Charts / maps | **Not present** |
| Tests / ESLint | **Not configured** in `package.json` |

---

## 3. Task 1.1 — Functional audit

### 3.1 Existing pages / modules (implemented)

All are **screens** toggled by `activeTab` in `App.tsx` (not routes):

| Logical module | File | Purpose |
|----------------|------|---------|
| Auth (login) | `screens/LoginForm.tsx` | Email + password UI; submit calls mock `api.login(email)` only |
| Dashboard | `screens/Dashboard.tsx` | KPI cards from `getStats()`; static “activities” and “alerts” blocks |
| Clients | `screens/ClientsList.tsx` | Client table + modal CRUD (CIN, license, etc.) |
| Fleet / vehicles | `screens/VehiclesList.tsx` | Vehicle card grid + modal CRUD; compliance dates; status filters |
| Reservations / contracts (rental) | `screens/ReservationsList.tsx` | Reservation table, create modal, detail modal, print view for a simple rental contract |

**Shell:** `components/Sidebar.tsx` — desktop-only nav (see §3.4).

### 3.2 Missing modules (vs. CDC-aligned backlog)

These are **not implemented** as screens, routes, or services:

- Executive dashboard (dirigeant): profitability by vehicle/client, cash-flow forecast, impayés rate, drill-downs, filters (date, agency, currency, etc.)
- Fleet: full vehicle master (VIN, acquisition, valuation, branch, assignment, insurance detail, document library, full status model)
- Customers & compliance: particulier vs entreprise, KYC dossier, scoring, legal history, compliance statuses
- Legal contracts: LLD, LOA, crédit auto, VO sale; templates, wizard, amendments, audit trail
- Credit analysis: dossiers, committee, scoring UI, decision workflow
- Finance & fiscal: TVA, échéanciers, payments, exports, accounting mapping
- Arrears & recovery: relances, contentieux, timelines, rule admin
- Used vehicle sales: inventory, workflow stages, transfer checklist
- GPS: map, history, geofencing, alerts center
- Notifications center (global)
- Mobile ops / delivery missions (responsive workflows)
- Settings & admin: master data, users, branches, templates
- Audit log UI / activity timeline (cross-cutting)
- AI layer (placeholders only per backlog — intentional later phase)
- Internationalization (FR/AR/EN, RTL), multi-currency abstraction beyond ad hoc `toLocaleString('fr-MA')`

### 3.3 Partial modules (started but insufficient for CDC)

| Area | What exists | Gap |
|------|-------------|-----|
| Dashboard | Real KPIs from mock `getStats()` | No charts, no filters, no strategic KPIs; “recent activities” and “alerts” are **static placeholder UI**, not data-driven |
| Fleet | CRUD + doc **dates** + basic statuses (`AVAILABLE`, `RENTED`, `MAINTENANCE`) | No VIN, leasing/credit lifecycle, branch, contracts linkage, document uploads, CDC fleet status enum |
| Clients | Individual-style CRM fields | No entreprise flow, no KYC uploads, no compliance states, no profile tabs |
| Reservations | Rental booking + print | Labeled “contrats” but model is **daily rental**, not LLD/LOA/credit/VO; no payment schedule, clauses, GPS rules, legal engine |
| Auth | Session in `localStorage` | No password verification, no refresh/expiry UX, no forgot/reset, no RBAC |

### 3.4 Broken, misleading, or non-connected UI / behaviors

| Issue | Location | Description |
|-------|----------|-------------|
| **No mobile navigation** | `Sidebar.tsx` | `hidden md:flex` — sidebar hidden on small screens with **no alternative** (hamburger, bottom nav). Comment claims mobile drawer; **not implemented**. |
| **Password ignored** | `LoginForm.tsx` / `mockApi.login` | Only `email` is sent; any password works if email matches heuristic (`admin` / `agent` in email). |
| **AuthContext usage** | `App.tsx` | `useAuth` is exported but **only valid inside provider after login**; no consumers; pattern is fragile if routes split later. |
| **Unused state** | `ClientsList.tsx` | `selectedClientHistory` is declared and never used — dead code. |
| **Reservation vs vehicle status** | `mockApi.createReservation` | New reservation is created with `PENDING` status but vehicle is immediately set to `RENTED`, which **conflicts** with a pending booking and with `VehiclesList` filtering “available” vehicles. |
| **Static dashboard blocks** | `Dashboard.tsx` | “Dernières activités” / “Alertes documents” do not call API — **not connected** to fleet/client data. |
| **Missing asset** | `index.html` | References `/index.css` — file **not present** in project tree (potential 404; verify in network tab). |
| **Tailwind “animate-in” classes** | Multiple screens | Utility classes such as `animate-in`, `fade-in` may rely on a plugin not configured for CDN Tailwind — **may have no effect** (cosmetic). |

### 3.5 Route map

**There is no URL-level routing** (no `react-router` or file-based routes).

| User-facing “route” | Mechanism | Path / URL |
|---------------------|-----------|------------|
| Login | Conditional render | Always `/` when `!user` |
| Dashboard | `activeTab === 'dashboard'` | `/` (no deep link) |
| Clients | `activeTab === 'clients'` | `/` |
| Vehicles | `activeTab === 'vehicles'` | `/` |
| Reservations | `activeTab === 'reservations'` | `/` |

**Implication:** Refresh loses tab context; no shareable links; browser history does not reflect modules.

### 3.6 State management map

| State | Where | Notes |
|-------|-------|-------|
| `user`, `login`, `logout` | `AuthContext` in `App.tsx` | Session restored from `localStorage` key `df_session` |
| Active module tab | `App.tsx` — `useState` | Not synchronized to URL |
| Screen data | Each screen — `useState` + `useEffect` | Independent fetches; no shared cache |
| Persistent domain data | `mockApi` | `localStorage`: `df_clients`, `df_vehicles`, `df_reservations` |

No global store (Redux/Zustand), no React Query cache, no optimistic update framework.

### 3.7 API integration map

| Layer | Implementation |
|-------|----------------|
| HTTP client | **None** |
| Base URL / env | Vite defines `GEMINI_API_KEY` in `vite.config.ts` — **unused by React app** for domain API |
| Backend | `laravel_backend_documentation.md` + `database.sql` describe a **Laravel/JWT** style API — **not wired** to the UI |
| Current API | `services/mockApi.ts` singleton `api` |

**Mock API surface (approximate):** `login`, `getClients`, `addClient`, `updateClient`, `deleteClient`, `getVehicles`, `addVehicle`, `updateVehicle`, `deleteVehicle`, `getReservations`, `createReservation`, `updateReservationStatus`, `deleteReservation`, `getStats`.

### 3.8 Reusable component inventory

There is **no shared component library**. Patterns repeated inline:

- Page header + description
- Search input + icon
- Filter pill buttons
- Tables (`<table>` in clients/reservations)
- Card grid (vehicles)
- Modal overlays for create/edit
- Status badges (inline functions per screen)

**Single shared layout component:** `Sidebar.tsx`.

### 3.9 Technical debt (high level)

1. **No router** — blocks scalable modules, deep links, lazy loading, guards.
2. **Mock-only data layer** — no DTOs, validation, or error contract with a real API.
3. **Weak auth model** — no password, no token, no session expiry, roles unused in UI.
4. **Data integrity bugs** in mock (reservation pending vs vehicle rented — §3.4).
5. **Mobile UX gap** — navigation missing below `md` breakpoint.
6. **Hardcoded French** — no i18n/RTL readiness.
7. **CDN Tailwind** — not ideal for production (version pinning, purging, custom design tokens); acceptable for prototype only.
8. **No test/lint pipeline** in npm scripts.
9. **Types drift** — e.g. `ClientsList` uses `any[]` alongside `Client` type.
10. **README** still describes “AI Studio” / Gemini — misaligned with ERP direction unless AI is explicitly in scope.

### 3.10 Recommended module implementation order (front-end, dependency-aware)

Aligned with **foundations first**, then **data pillars**, then **risk/compliance**:

1. **Platform foundations** — Router, layout shell, design tokens, shared UI kit (tables, forms, modals), `apiClient` + React Query, error boundary, env-based API base URL.
2. **Auth & RBAC** — Real login, session, role/feature/module guards, user profile shell.
3. **Settings / master data** — Agencies, branches, currencies, statuses (feeds all modules).
4. **Fleet** — Vehicle master + detail route (contracts and GPS attach here later).
5. **Customers & KYC** — Particulier/entreprise, compliance states, document upload.
6. **Contracts** — Wizard + types (LLD/LOA/credit/VO) once customers + fleet exist.
7. **Finance** — Échéanciers, payments, receivables (depends on contracts).
8. **Credit analysis** — Can parallelize with contracts partially; needs customer + documents.
9. **Arrears & recovery** — After finance payments exist.
10. **Used cars (VO)** — Often ties fleet + contracts + finance; can follow core fleet.
11. **GPS** — Map provider integration, vehicle/contract linking (after fleet/contracts).
12. **Notifications** — Cross-cutting; implement when events exist (payments, GPS, etc.).
13. **Executive dashboard** — Aggregate KPIs once underlying APIs exist (avoid fake charts early).
14. **Mobile ops / delivery** — After core workflows stable.
15. **AI placeholders** — Feature flags + empty adapters (per backlog; no fake domain logic).

---

## 4. Task 1.2 — Architecture audit

### 4.1 Routing structure

- **Current:** Tab state in `App.tsx` — **single URL, no nested routes, no code splitting by route.**
- **CDC need:** Module-based routes (`/fleet`, `/customers`, `/contracts`, …), detail routes (`/vehicles/:id`), optional query params for filters.
- **Gap:** **Critical** — introduce a router before scaling modules.

### 4.2 Auth flow

- **Current:** `localStorage` user object; login by email pattern to mock user; password field **cosmetic**.
- **CDC need:** Secure credentials, token refresh, forgot/reset, session expiry handling, optional SSO later.
- **Gap:** **Critical**.

### 4.3 Role handling

- **Types:** `UserRole` enum: `ADMIN`, `AGENT`, `CLIENT` in `types.ts`.
- **Runtime:** Roles are **not enforced** in UI — no conditional menus, no permission checks.
- **CDC need:** Granular roles (Directeur, Analyste crédit, Comptable, Contentieux, etc.) — map to RBAC + feature flags.
- **Gap:** **Critical** — extend model and centralize permission checks (e.g. `PermissionGate` + policy config).

### 4.4 API service layer

- **Current:** Single `MockApiService` class; no separation of transport, DTO mapping, or error normalization.
- **CDC need:** `apiClient`, `endpoints`, `queryKeys`, adapters, typed models — as per backlog.
- **Gap:** **Critical**.

### 4.5 Form architecture

- **Current:** Local `useState` form objects inside modals; `required` HTML attributes only.
- **CDC need:** Schema validation (e.g. Zod), multi-step wizards, autosave drafts for large forms.
- **Gap:** **High**.

### 4.6 Table / list architecture

- **Current:** Ad hoc `<table>` + manual filter `useMemo` / `useEffect`.
- **CDC need:** Shared `DataTable`, pagination, column defs, server-side filtering/sorting.
- **Gap:** **High**.

### 4.7 Modal / drawer architecture

- **Current:** Full-screen overlay modals per screen; no reusable `Modal` primitive; **no drawer** for details.
- **CDC need:** Standardized modal/drawer, detail panels for quick view vs full page.
- **Gap:** **High** — introduce shared primitives before duplicating more screens.

### 4.8 File upload handling

- **Current:** **None** (image URLs for vehicles only).
- **CDC need:** Upload zones, document categories, preview — **not started**.
- **Gap:** **Critical** for KYC and fleet documents.

### 4.9 Localization readiness

- **Current:** French strings inline; `toLocaleString('fr-MA')` in places; `index.html` `lang="fr"`.
- **CDC need:** FR default + AR + EN, RTL for Arabic, translation keys.
- **Gap:** **High** — introduce i18n framework and key extraction early to avoid rework.

### 4.10 Mobile responsiveness readiness

- **Current:** Tailwind responsive grids; **sidebar missing on mobile**; large tables may overflow.
- **CDC need:** Mobile-first agent workflows, director compact dashboard.
- **Gap:** **High** for navigation shell; medium for content once components are standardized.

### 4.11 Map / GPS integration readiness

- **Current:** **No** map library, tiles, or geolocation hooks.
- **CDC need:** Map dashboard, markers, geofencing admin — requires choosing a stack (e.g. Mapbox, Leaflet) and backend feed.
- **Gap:** **Critical** for GPS module; zero prep in repo today.

---

## 5. Artifacts in repo relevant to future backend alignment

- `database.sql` — MySQL schema for **rental-era** entities only (users, clients, vehicles, reservations).
- `laravel_backend_documentation.md` — Illustrative Laravel API patterns — **not connected** to front-end.

**Implication:** Evolve schema and API specs for leasing/credit/VO **before** building screens that assume relational joins that do not exist yet.

---

## 6. Next steps (recommended)

1. Add **router + layout** and migrate tab state to routes (preserve URLs).
2. Replace mock layer with **contract-first** TypeScript types + mock adapters behind `apiClient` for parallel backend work.
3. Fix **mobile navigation** and **reservation/vehicle status** consistency in mock (or drop mock once API exists).
4. Import or link the **official Cahier des Charges PDF** into `/docs` and add a requirements traceability matrix (module → CDC section).

---

*End of gap analysis.*
