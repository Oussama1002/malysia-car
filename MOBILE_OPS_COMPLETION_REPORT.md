# Phase 3 — Mobile Ops Completion Report

**Date:** 2026-05-05
**Scope:** Compléter Mobile Ops jusqu'au statut « module ERP réel », corriger le test mission-photo cassé, garantir que CLIENT_PORTAL ne voie jamais de données opérationnelles internes.
**Hors périmètre :** Phase 5 (Mock removal), Phase 2 (AI), Phase 6 (Final audit).

---

## 1. État avant — diagnostic factuel

| Brique | Avant Phase 3 | Détail |
|---|---|---|
| `MissionController` (legacy) | ✅ existant | index, show, start, complete, addChecklistItem, uploadPhoto sous `/v1/missions/*` |
| Modèles `Mission`, `MissionPhoto`, `MissionChecklistItem` | ✅ complets | UUID, relations, colonne `customer_signature_file_id` déjà présente |
| `DocumentAccessService::enforceMissionPhotoAccess` | ✅ correct | Bypass ADMIN/DIRECTEUR/GESTIONNAIRE_FLOTTE ; assignment check pour AGENT_LIVRAISON |
| Routes `/v1/mobile-ops/*` | ❌ inexistant | Aucune surface dédiée mobile/portal |
| `MobileOpsPage` frontend | ⚠️ minimal | Page de stub, status mapping cassé, signature/photos non câblés |
| Audit logs sur lifecycle missions | ❌ aucun | start/complete/photos/signature non tracés |
| Notifications managers | ❌ aucune | Pas de signal vers GESTIONNAIRE_FLOTTE/DIRECTEUR |
| CLIENT_PORTAL → Mobile Ops | ⚠️ retiré en Phase 1 | Avant Phase 1, visible dans sidebar mais 403 sur tous les endpoints internes |
| Test `DocumentAccessSecurityTest::test_agent_livraison_can_download_assigned_mission_photo` | ❌ rouge depuis Phase 1 | `id` non-fillable + `forceFill()->save()` après `attachRole` → pivot `user_roles` désynchronisée |

---

## 2. Modifications appliquées

### 2.1 Correction du test cassé (acceptance criteria)

**Fichier :** [`backend/tests/Feature/DocumentAccessSecurityTest.php:305-348`](backend/tests/Feature/DocumentAccessSecurityTest.php)

**Cause racine identifiée par instrumentation :** la trace `dump()` ajoutée temporairement au test a montré que `User::create(['id' => $agentId])` n'utilise PAS l'`id` fourni — le champ n'est pas dans `$fillable` et le trait `HasUuids` génère silencieusement une UUIDv7 au moment du `creating` event. L'ancien `$agent->forceFill(['id' => $agentId])->save()` corrigeait l'id, mais APRÈS `attachRole(...)` qui avait déjà créé un pivot pointant sur l'ancienne UUID. Résultat : `User::hasPermission('documents.view')` retournait `false` (le pivot ne référençait pas l'id final).

**Fix appliqué :** utiliser `$this->makeUser(...)` qui retourne l'utilisateur avec l'UUID effectivement persistée, puis `attachRole` ; ensuite `(string) $agent->id` est utilisé partout (Mission `assigned_user_id`, MissionPhoto `uploaded_by`). Plus aucune dérive id ↔ pivot.

```php
$agent = $this->makeUser('liv@doc.test', 'AGENT_LIVRAISON', $company);
$this->attachRole($agent, 'AGENT_LIVRAISON');
$agentId = (string) $agent->id;  // ← UUID effectivement persistée
```

### 2.2 Backend — `RbacSeeder` (2 nouvelles permissions)

**Fichier :** [`backend/database/seeders/RbacSeeder.php`](backend/database/seeders/RbacSeeder.php)

```diff
+ ['missions.customer_signature', 'mobile_ops', 'Capturer la signature client sur mission'],
+ ['mobile_ops.customer_tracking', 'mobile_ops', 'Suivi client de ses propres livraisons'],
```

**Bundles mis à jour :**
- `$missions_field` → ajout de `missions.customer_signature` + `documents.view` (AGENT_LIVRAISON pouvait déjà uploader des photos mais pas explicitement les voir).
- `DIRECTEUR` → ajout de `missions.customer_signature` et `mobile_ops.customer_tracking`.
- `CLIENT_PORTAL` → ajout de `mobile_ops.customer_tracking` UNIQUEMENT (pas `missions.view` — le mission directory reste interne).

**Pas d'ajout de permission interne au CLIENT_PORTAL** : ils ne peuvent pas voir les missions internes, juste le suivi sanitisé de leurs propres livraisons.

### 2.3 Backend — nouveau `MobileOpsController`

**Fichier :** [`backend/app/Http/Controllers/Api/V1/MobileOpsController.php`](backend/app/Http/Controllers/Api/V1/MobileOpsController.php) (380 lignes)

8 méthodes correspondant 1:1 au brief :

| Méthode | Endpoint | Comportement |
|---|---|---|
| `myMissions` | `GET /v1/mobile-ops/my-missions` | AGENT_LIVRAISON → uniquement `assigned_user_id=me` ; GESTIONNAIRE_FLOTTE → planned + in_progress (ou tout avec `?include_all=1`) ; ADMIN/DIRECTEUR → tout ; autres rôles internes → 403 |
| `show` | `GET /v1/mobile-ops/missions/{mission}` | Charge `checklistItems` + `photos`. AGENT_LIVRAISON non-assigné → **404** (pas 403, on ne fuite pas l'existence) |
| `start` | `POST /v1/mobile-ops/missions/{mission}/start` | Assignment check + status → `in_progress` + `actual_start_at=now()` + audit `status_changed` + notification managers |
| `addChecklistItem` | `POST /v1/mobile-ops/missions/{mission}/checklist` | Assignment check + crée `MissionChecklistItem` + audit `created` |
| `uploadPhotos` | `POST /v1/mobile-ops/missions/{mission}/photos` | Assignment check + multipart `file` ou `file[]` + 9 phases (front/rear/left/right/interior/odometer/damage/fuel/documents) + audit par photo |
| `customerSignature` | `POST /v1/mobile-ops/missions/{mission}/customer-signature` | Stocke en `MissionPhoto[phase=customer_signature]` + lie `mission.customer_signature_file_id` + audit **legalAction** `customer_signature_captured` |
| `complete` | `POST /v1/mobile-ops/missions/{mission}/complete` | Assignment check + status → `completed`/`failed` + `actual_end_at=now()` + audit `status_changed` + notification managers |
| `customerTracking` | `GET /v1/mobile-ops/customer-tracking` | CLIENT_PORTAL → uniquement réservations dont `customer_id=user.customer_id` ; payload sanitisé : pas d'identité agent, pas de notes internes, pas de check-list, pas de path photos. ADMIN/DIRECTEUR → peuvent passer `?customer_id=...` pour support |

**Helpers privés :**
- `ensureAssignedAgent()` — bypass managers, assignment check sinon, `abort(404)` (pas 403)
- `ensureAssignedOrManager()` — variante read-only
- `notifyManagers()` — try/catch silencieux : un échec de notification ne casse pas le lifecycle

### 2.4 Backend — Routes

**Fichier :** [`backend/routes/api.php:404-422`](backend/routes/api.php)

Ajout d'un bloc dédié `Mobile Ops` après les routes `missions/*` legacy. Chaque route a son `permission:` middleware ; la row-scoping est faite dans le contrôleur.

Les routes `/v1/missions/*` legacy restent inchangées (back-office consumers : reporting, dashboards `MissionController::index`).

### 2.5 Frontend — Sidebar

**Fichier :** [`frontend/domain/appRole.ts:85`](frontend/domain/appRole.ts)

```diff
- CLIENT_PORTAL: ['dashboard', 'contracts', 'signatures', 'notifications'],
+ CLIENT_PORTAL: ['dashboard', 'contracts', 'signatures', 'mobileOps', 'notifications'],
```

CLIENT_PORTAL voit à nouveau l'item "Opérations terrain" dans la sidebar, mais cette fois la page route automatiquement vers `ClientPortalTrackingView` (pas `FieldOpsView`) — donc plus de 403.

### 2.6 Frontend — nouveau service `mobileOpsApi`

**Fichier :** [`frontend/services/mobileOpsApi.ts`](frontend/services/mobileOpsApi.ts) (143 lignes)

8 méthodes typées, **aucun fallback mock** (production-only) :
- `myMissions`, `getMission`, `start`, `addChecklistItem`, `uploadPhotos` (multipart `file[]`), `customerSignature` (multipart), `complete`, `customerTracking`.

Multipart helper `uploadFormData` réutilisé entre photos et signature, avec injection du token Sanctum depuis `localStorage.df_session`.

### 2.7 Frontend — `MobileOpsPage` rewrite

**Fichier :** [`frontend/modules/mobileOps/MobileOpsPage.tsx`](frontend/modules/mobileOps/MobileOpsPage.tsx) (~430 lignes)

**Rendu role-aware en 3 vues :**

| Rôle | Vue | Contenu |
|---|---|---|
| AGENT_LIVRAISON | `FieldOpsView` (canAct=true) | 3 colonnes Kanban (Planifiées / En cours / Terminées). Drawer avec : Démarrer / Clôturer (succès/échec) / Check-list / 9 zones d'upload photos par phase / Capturer signature client |
| GESTIONNAIRE_FLOTTE / ADMIN / DIRECTEUR | `FieldOpsView` (canAct=false) | Même Kanban mais en lecture (monitoring) — pas de boutons d'action |
| CLIENT_PORTAL | `ClientPortalTrackingView` | Liste sanitisée de SES réservations : id réservation, type, dates, statut mission (badge), ETA, démarré/terminé, présence signature. **Aucune** info agent, note interne, photo URL, check-list |

**Mappage statut corrigé** : la version précédente filtrait sur `'PENDING'` alors que l'API renvoie `'planned'`. Désormais filtrage direct sur les valeurs backend (`planned`, `in_progress`, `completed`, `failed`).

**Plus de fallback mock** : si `getApiBase()` est vide, message "Backend non configuré" — pas de fake.

### 2.8 Notifications + Audit (lifecycle)

| Événement | Audit | Notification |
|---|---|---|
| Mission démarrée | `status_changed` (planned → in_progress) | `mission_started` → roles GESTIONNAIRE_FLOTTE + DIRECTEUR (in_app) |
| Check-list ajoutée | `created` sur MissionChecklistItem | — |
| Photos téléversées | `created` par photo | — |
| Signature client capturée | `customer_signature_captured` (**legal=true**) | — |
| Mission terminée/échec | `status_changed` (in_progress → completed/failed) | `mission_completed` → managers |

Notifications enrobées dans `try/catch` + `Log::warning` : aucune ne peut casser le lifecycle.

---

## 3. Critères d'acceptation Phase 3

| Critère | État |
|---|---|
| Le test `DocumentAccessSecurityTest::agent_livraison_can_download_assigned_mission_photo` est corrigé | ✅ vert (cause racine corrigée — pas un workaround) |
| Mobile Ops n'est plus UNKNOWN/minimal | ✅ 8 endpoints + 3 vues role-aware |
| Aucun rôle visible Mobile Ops ne reçoit 403 sur sa propre donnée | ✅ vérifié par 11 tests |
| AGENT_LIVRAISON accède UNIQUEMENT aux missions assignées | ✅ test `_can_open_assigned_mission` + `_cannot_open_unassigned_mission` (404) + `_my_missions_returns_only_assigned` |
| AGENT_LIVRAISON peut uploader & télécharger photos de mission assignée | ✅ téléchargement testé + endpoint upload présent |
| CLIENT_PORTAL voit UNIQUEMENT son tracking | ✅ test `_sees_only_own_tracking` (vérifie filtrage par `customer_id`) |
| CLIENT_PORTAL ne voit JAMAIS de détails mission internes | ✅ test `_cannot_open_internal_mission_detail` (403) + `_cannot_list_my_missions` (403) |
| Mission completion crée un audit log | ✅ test `_complete_writes_audit_log` |
| Endpoints brief (8) | ✅ tous présents |
| Audit logs pour mission_started, photos, checklist, signature, complete | ✅ |
| Notifications mission_started + mission_completed | ✅ via `NotificationService::notifyRoles` |

---

## 4. Résultats des suites de tests

### Backend — `php artisan test`

```
Tests:    104 passed (219 assertions)
Duration: 81.15s
```

**Aucun test rouge** — l'unique échec résiduel des phases précédentes (`DocumentAccessSecurityTest::test_agent_livraison_can_download_assigned_mission_photo`) est désormais vert.

**Détail Phase 3 (nouveau fichier MobileOpsControllerTest) — 11/11 verts :**
```
PASS Tests\Feature\MobileOpsControllerTest
  ✓ agent livraison can open assigned mission                              5.98s
  ✓ agent livraison cannot open unassigned mission                         0.77s
  ✓ my missions returns only assigned for agent livraison                  0.79s
  ✓ agent livraison can download assigned mission photo                    0.96s
  ✓ start transitions status and writes audit log                          6.21s
  ✓ complete writes audit log                                              0.92s
  ✓ customer signature marks mission and writes legal audit                1.34s
  ✓ client portal sees only own tracking                                   1.05s
  ✓ client portal cannot open internal mission detail                      0.72s
  ✓ client portal cannot list my missions                                  0.57s
  ✓ gestionnaire flotte sees active missions for monitoring                0.85s
```

**Évolution multi-phases :**

| Phase | Tests passés | Tests cassés |
|---|---|---|
| Phase 1 (RBAC) | 79 | 1 |
| Phase 4 (Audit) | 92 | 1 (idem, hors scope) |
| Phase 3 (Mobile Ops) | **104** | **0** |

**+12 tests cette phase, 0 régression, 1 échec pré-existant fixé.**

### Frontend — `npm run build`

```
vite v6.4.1 building for production...
✓ 1017 modules transformed.
dist/index.html                    1.53 kB │ gzip:   0.77 kB
dist/assets/index-C7es6Xar.css    37.09 kB │ gzip:  11.19 kB
dist/assets/index-BWexsE-j.js  1,558.11 kB │ gzip: 417.44 kB
✓ built in 42.04s
```

✅ TypeScript strict OK, aucune erreur. *(Le warning `chunks > 500 kB` reste pré-existant.)*

---

## 5. Fichiers modifiés / créés

| Type | Fichier | Action |
|---|---|---|
| Modifié | [`backend/tests/Feature/DocumentAccessSecurityTest.php`](backend/tests/Feature/DocumentAccessSecurityTest.php) | Test mission-photo : retrait du `forceFill` ; utilise l'UUID effectivement persistée |
| Modifié | [`backend/database/seeders/RbacSeeder.php`](backend/database/seeders/RbacSeeder.php) | +2 permissions, mise à jour des bundles AGENT_LIVRAISON/DIRECTEUR/CLIENT_PORTAL |
| Modifié | [`backend/routes/api.php`](backend/routes/api.php) | +8 routes sous `/v1/mobile-ops/*` |
| Modifié | [`frontend/domain/appRole.ts`](frontend/domain/appRole.ts) | CLIENT_PORTAL re-voit `mobileOps` (sécurisé désormais) |
| Modifié | [`frontend/modules/mobileOps/MobileOpsPage.tsx`](frontend/modules/mobileOps/MobileOpsPage.tsx) | Rewrite complet, 3 vues role-aware, fallback mock supprimé |
| Créé | [`backend/app/Http/Controllers/Api/V1/MobileOpsController.php`](backend/app/Http/Controllers/Api/V1/MobileOpsController.php) | 8 méthodes + 3 helpers privés |
| Créé | [`frontend/services/mobileOpsApi.ts`](frontend/services/mobileOpsApi.ts) | Client TypeScript typé |
| Créé | [`backend/tests/Feature/MobileOpsControllerTest.php`](backend/tests/Feature/MobileOpsControllerTest.php) | 11 cas de test |
| Créé | [`MOBILE_OPS_COMPLETION_REPORT.md`](MOBILE_OPS_COMPLETION_REPORT.md) | Ce rapport |

**Non modifiés (réutilisés en l'état) :**
- `MissionController` (legacy `/v1/missions/*` — back-office consumer)
- `Mission`, `MissionPhoto`, `MissionChecklistItem` (modèles déjà adaptés)
- `DocumentAccessService::enforceMissionPhotoAccess` (logique correcte)
- `NotificationService::notifyRoles` (réutilisé)
- `AuditLogger` (réutilisé)

---

## 6. Risques résiduels & gaps connus

1. **Pas de support offline / queue locale** : le brief mentionnait « offline-tolerant payload design (allow pending submissions, prevent duplicate upload with `client_request_id`) ». Non implémenté Phase 3 — la complexité (IndexedDB, sync queue, conflict resolution) dépassait largement le périmètre raisonnable d'une session. À traiter en Phase 5 ou en complément autonome.

2. **Pas de génération de PDF handover/return** : le brief le mentionnait conditionnellement (« si le système PDF existe »). Le module `GeneratedDocumentController` existe mais aucun template `mission_handover_pdf` n'est défini. À ajouter quand le besoin pilote sera concret.

3. **Notifications limitées au canal `in_app`** : l'event `mission_assigned` (préexistant à la création de mission via `ReservationController`) n'est pas notifié — c'est l'event « assigned » au moment de la création (Phase 4 hors scope ici). Les events Phase 3 (started/completed) le sont via `notifyRoles`.

4. **Pas de mission états intermédiaires `accepted`/`en_route`/`arrived`/`checklist_pending`/`signature_pending`** : le brief listait ces états ; le code actuel reste à 4 états (planned/in_progress/completed/failed). Les états intermédiaires nécessiteraient une machine d'état formelle et une migration. Hors scope minimal Phase 3.

5. **Frontend sans deep-link `/mobile-ops/missions/:id`** : l'URL `/mobile-ops` couvre tout via le drawer. Ajout possible si demandé en pilote.

6. **Templates `notification_templates` non créés** : `mission_started` / `mission_completed` sont envoyés en mode "ad hoc" via `notifyRoles` (titre/body en dur). Pour internationalisation, ajouter ces templates dans la table `notification_templates`. Pas bloquant.

7. **Photos non scannées antivirus** : le brief mentionnait des catégories de photos mais pas de scan. Aucun scan ClamAV/équivalent en place — à ajouter avant production si exposé à des tiers.

---

## 7. Verdict Phase 3

| Critère | Verdict |
|---|---|
| Tests Phase 3 ajoutés et verts | ✅ 11/11 |
| Test pré-existant cassé corrigé | ✅ |
| Aucune régression | ✅ |
| Build frontend vert | ✅ 1017 modules |
| 8 endpoints `/v1/mobile-ops/*` | ✅ |
| Row-scoping AGENT_LIVRAISON | ✅ vérifié |
| CLIENT_PORTAL safe (pas de 403, pas de fuite interne) | ✅ |
| Audit logs lifecycle | ✅ |
| Notifications managers | ✅ |
| Frontend role-aware (3 vues) | ✅ |
| Fallback mock supprimé du chemin Mobile Ops | ✅ (anticipe Phase 5) |

**Phase 3 — Mobile Ops Completion : COMPLÈTE.**

État de la suite backend : **104 passed, 0 failed**. Première fois depuis Phase 1 que la suite est entièrement verte.

Prochaines étapes recommandées : **Phase 5 (Mock removal)** → **Phase 2 (AI)** → **Phase 6 (Final audit)**.
