# DriveFlow — System analysis & progress inventory

**Generated:** 2026-04-23  
**Purpose:** Single reference for **what the system is**, **how it is built**, **what works today**, and **maturity** (function + design + integration).  
**Note:** `system-gap-analysis.md` (2026-04-18) describes an **older** snapshot (tab-based app, no routing). This document reflects the **current** codebase.

---

## 1. Executive summary

DriveFlow is a **Vite + React 19 + TypeScript** single-page application for **vehicle rental / fleet / ERP-style workflows** (Marocco-oriented copy and compliance fields). The product has **two “layers”**:

| Layer | Description |
|--------|-------------|
| **Modern app shell** | `react-router-dom` routes, `AppLayout` (sidebar + mobile header), i18n (`react-i18next`), role-based **module access** (`domain/appRole.ts`), and a large set of **feature modules** under `modules/`. |
| **Legacy short-term rental UI** | Original screens in `screens/` (dashboard, clients, vehicles, reservations) still available at **`/dashboard/classic`**; they use `services/mockApi.ts` and older patterns. |

**Data today:** almost all business operations run through **`erpApi`** + **`erpStore`**: a **client-side mock ERP** persisted in **localStorage** (`df_erp_v2`), with optional future HTTP calls via `apiClient` + `VITE_API_BASE` (not required for the app to run).

**Design:** **Tailwind CSS (CDN)** for utility classes, plus a **global premium theme** in `index.css` (CSS variables, glass panels, `df-card`, `df-input`, `df-btn`, app shell classes like `df-sidebar`).

**Backend:** **No mandatory live API** in the current default setup; `services/endpoints.ts` documents REST path templates for a **future** Laravel (or other) backend.

---

## 2. Technology stack

| Area | Choice |
|------|--------|
| UI | React 19, TypeScript |
| Build / dev | Vite 6 |
| Routing | `react-router-dom` 7 |
| Server/async state | `@tanstack/react-query` (`providers/QueryProvider.tsx`) |
| i18n | `i18next` + `react-i18next` (`i18n.ts`, `locales/`) |
| Maps (where used) | Leaflet + `react-leaflet` |
| Charts (where used) | Recharts |
| Validation (where used) | Zod |
| Styling | Tailwind via **CDN** in `index.html` + **global theme** in `index.css` |

---

## 3. Application entry & routing

| File | Role |
|------|------|
| `index.html` | Loads Tailwind CDN, font, and `/index.css` |
| `index.tsx` | Mounts app: `BrowserRouter`, `QueryProvider`, `AuthProvider`, `AppRoutes` |
| `App.tsx` | Re-exports `routes/AppRoutes` (thin entry) |
| `routes/AppRoutes.tsx` | All routes: public (`/login`, password reset) and **authenticated** layout (`AppLayout`) with `ModuleGate` per feature |
| `routes/ProtectedRoute.tsx` | (If used) pattern for auth guards — primary guard is inline `RequireAuth` in `AppRoutes` |
| `routes/ModuleGate.tsx` | Blocks modules the user’s role cannot access |

**Default landing:** `/` → redirect to `/dashboard` (executive module).

**Legacy path:** `/dashboard/classic` → `screens/Dashboard` (and related flows still in `mockApi` world).

---

## 4. Authentication & session

| Concern | Implementation |
|---------|----------------|
| Context | `modules/auth/AuthContext.tsx` — session, `login`, `logout`, `legacyUser` adapter, expiry handling |
| Storage | `localStorage` key `df_session` (JSON `AuthSession`) |
| Login | `erpApi.loginWithPassword` — **mock**: matches staff in `erpStore` by email, password length ≥ 4 |
| Expiry | Session `expiresAt`; `SessionExpiredBanner` + `useSessionExpiryWatcher` (see auth module) |
| Password reset | `ForgotPasswordPage` / `ResetPasswordPage` call `erpApi.requestPasswordReset` / `resetPassword` — **stub** (returns success without real email) |

**Progress:** *Auth **UX** and **session lifecycle** are implemented*; *real OAuth/JWT, refresh tokens, and server-side validation are **not** hooked up.*

---

## 5. Roles, modules, and permissions

| Concept | Location |
|---------|----------|
| ERP-style roles | `AppRole` in `domain/appRole.ts` (e.g. `ADMIN`, `DIRECTEUR`, `AGENT_COMMERCIAL`, …) |
| Module keys | `ModuleKey` (dashboard, fleet, customers, contracts, credit, finance, …) |
| **Who sees what** | `ROLE_MODULE_ACCESS` + `canAccessModule()` |

**Progress:** *RBAC at **navigation and route gate** level is implemented.* *Fine-grained per-field or per-API policy on a real server is **out of scope** until a backend enforces it.*

---

## 6. Layout & design system

### 6.1 App shell

| Piece | File | Notes |
|--------|------|--------|
| Main layout | `modules/layout/AppLayout.tsx` | Glass-style sidebar, nav from `NAV` + i18n labels, user block, language toggles, logout, mobile drawer |
| Shared widgets | `modules/shared/components/*` | Tables, KPI cards, search bar, modals, skeletons, etc. |

### 6.2 Global theme (`index.css`)

- **Page background:** layered radial gradients (premium SaaS look).
- **Utility classes:** `df-card`, `df-input`, `df-btn` (`--primary`, `--ghost`, `--danger`), `df-sidebar`, `df-topbar`, `df-heroMark`, etc.
- **Leaflet:** RTL fix for map containers when `dir="rtl"`.

**Progress:** *Cohesive “premium” shell and reusable primitives are in place*; *individual module pages may still mix raw Tailwind with `df-*` over time (incremental migration is normal).*

### 6.3 Tailwind

Tailwind is loaded from the **CDN** in `index.html` (no `tailwind.config` in repo). New utilities rely on default Tailwind palette + arbitrary values; custom look is often layered via `index.css`.

---

## 7. Data layer (functions & persistence)

### 7.1 `services/erpStore.ts`

- **State shape:** `ErpState` — branches, staff, customers, fleet vehicles, reservations (legacy), contracts, credit, payments, arrears, used cars, geofences, GPS alerts, notifications, missions, audit logs.
- **Persistence:** `localStorage` key `df_erp_v2` (+ migration helpers like `syncLegacyKeys`).
- **Seeding:** Initial/demo data and mapping from legacy `types` → DTOs.

**Progress:** *Full **in-browser** domain model and CRUD-style mutations are possible without a server.*

### 7.2 `services/erpApi.ts`

- **Primary API surface** for modules: auth, executive dashboard DTO, fleet, customers, contracts, finance rows, etc.
- **Implementation:** reads/writes `loadErpState` / `saveErpState` / `mutate()`.
- Comments in code mark areas intended for **future** HTTP (`loginWithPassword` → OAuth2/JWT, etc.).

**Progress:** *Feature screens can be “complete” in **demo** form; production requires replacing this layer with real API calls.*

### 7.3 `services/mockApi.ts`

- Used by **`screens/*`** legacy list pages.
- **Progress:** *Maintained for **classic** routes; main product path prefers `erpApi` + DTOs.*

### 7.4 `services/apiClient.ts` + `services/endpoints.ts`

- `apiClient` throws if `VITE_API_BASE` is unset — designed for **Laravel (or any REST) backend** later.
- `endpoints` lists URL templates for future integration.

**Progress:** *Contract stubs exist; **no** default production backend in this repo.*

### 7.5 Database

- `database.sql` / `laravel_backend_documentation.md` exist for **documented** or **planned** server-side storage — the running SPA does not require MySQL/PHP to operate in mock mode.

---

## 8. Feature modules (inventory & progress)

Legend for **Status**:

- **A** = Available in UI (route exists behind auth + module gate)
- **M** = Backed by **mock / local** data (`erpApi` + `erpStore`)
- **B** = **Backend** (real HTTP) integrated by default
- **L** = **Legacy** classic screen (`screens/` + `mockApi`)

| Module / area | Route(s) (indicative) | Status | Notes |
|---------------|------------------------|--------|--------|
| Executive dashboard | `/dashboard` | A + M | KPIs/charts from `getExecutiveDashboard` (seed + computed) |
| Classic dashboard | `/dashboard/classic` | A + L | `screens/Dashboard` + `mockApi` |
| Fleet list / detail | `/fleet`, `/fleet/:id` | A + M | DTOs, vehicle master fields |
| Customers / CRM | `/customers`, `/customers/:id` | A + M | |
| Contracts | `/contracts`, `new`, `:id`, templates | A + M | Wizard, templates, detail — **business rules** still demo-level |
| Credit | `/credit` | A + M | Analysis / cases UI |
| Finance | `/finance` | A + M | Schedules, payments (mock) |
| Arrears / contentieux | `/arrears` | A + M | |
| Used cars (VO) | `/used-cars` | A + M | |
| GPS | `/gps` | A + M | Map-related deps present |
| AI hub / assistant | `/ai`, `/ai/assistant`, predictions | A + M/placeholder | Some screens may be placeholders |
| Mobile ops | `/mobile-ops` | A + M | |
| Notifications | `/notifications` | A + M | |
| Settings / users | `/settings`, `/settings/users` | A + M | |
| Audit | `/audit` | A + M | |
| Rentals (short-term) | `/rentals` | A + M | Aligned with legacy domain |
| Auth | `/login`, `/forgot-password`, `/reset-password` | A + M | Reset flows stubbed |
| i18n | N/A | Partial | `locales/` + keys; not every string may be extracted |

**AI / predictions:** follow naming like `AiPredictionPlaceholder` for topics that are **scaffolded** but not full ML.

---

## 9. Internationalization (i18n)

- **Setup:** `i18n.ts` + language resources under `locales/`.
- **AppLayout:** quick **fr / en / ar** toggles (with `setLanguage`); Arabic may require `dir="rtl"` on `html` for best layout (theme includes Leaflet RTL note).

**Progress:** *Infrastructure is there*; *full translation coverage of all modules is **not** guaranteed.*

---

## 10. Notable file map (for navigation)

| Path | Role |
|------|------|
| `routes/` | Route table, auth wrapper, module gate |
| `modules/` | Feature areas (auth, layout, dashboard, fleet, customers, contracts, …) |
| `modules/shared/components/` | Reusable UI (e.g. `DataTable`, `KpiCard`, `SearchFilterBar`, modals) |
| `services/` | `erpApi`, `erpStore`, `mockApi`, `apiClient`, `dtos` |
| `domain/` | Roles and module access |
| `components/Sidebar.tsx` | **Legacy** sidebar (used if old shell still references it — main app uses `AppLayout`) |
| `screens/` | **Legacy** pages for classic rental flow |
| `index.css` | Global theme and design tokens |
| `types.ts` | Shared enums/interfaces for legacy + overlap |

---

## 11. Overall progress (honest scorecard)

| Dimension | Maturity (typical) | Comment |
|------------|--------------------|--------|
| **UI shell & navigation** | High | Routed app, sidebar, i18n toggles, module gate |
| **Feature breadth** | High (demo) | Many modules exist with screens |
| **Depth / business rules** | Low–medium | ERP-grade workflows need product + backend spec |
| **Data** | Mock-first | Durable in localStorage, not multi-user safe |
| **Real backend** | Not default | `VITE_API_BASE` + `apiClient` path prepared |
| **Tests / CI** | Varies | Run `npm run build` for compile check; E2E/unit not implied |
| **Design** | Improving | Central theme in `index.css`; per-page consistency ongoing |

**One-line verdict:** the codebase is a **strong front-end and domain prototype** (and demo ERP) with a **clear path** to connect `erpApi` → real REST, but **production** still needs **backend auth, validation, and API contracts** locked in.

---

## 12. Suggested next steps (engineering)

1. **Backend contract:** implement Laravel (or other) to match `services/endpoints.ts` and DTOs in `services/dtos` (or generate OpenAPI and align both sides).
2. **Replace `erpStore` writes** with **API mutations**; keep a thin cache with React Query.
3. **Auth:** JWT/OAuth, refresh, secure httpOnly cookies if applicable.
4. **Retire or merge** `screens/*` + `mockApi` once `rentals` / classic flows are fully covered in `modules/`.
5. **Unify design:** migrate remaining raw Tailwind blocks to `df-*` and shared components.

---

## 13. How to update this document

When you add a module, route, or API:

1. Add a row in **Section 8**.
2. Bump “Generated” date at the top.
3. If the architecture changes (e.g. Redux, new API layer), edit **Sections 2–7**.

---

*This file is a living inventory. It is not a legal or contractual deliverable; it describes the repository as code reflects it.*
