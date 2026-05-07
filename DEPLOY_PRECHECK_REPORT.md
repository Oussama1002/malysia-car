# DriveFlow Deployment Precheck Report

**Date**: 2026-05-07  
**Scope**: Local safety snapshot and deployment gate checks before server changes  
**Result**: **FAILED GATE** (deployment halted before server actions)

## 1) Snapshot and backups created

- Full project archive: `snapshots/driveflow-backup-20260507-032254.zip`
- Backend env backups:
  - `snapshots/20260507-032254/backend.env.backup`
  - `snapshots/20260507-032254/backend.env.example.backup`
- Frontend env backups:
  - `snapshots/20260507-032254/frontend.env.local.backup`
  - `snapshots/20260507-032254/frontend.env.example.backup`
- Deploy config backup:
  - `snapshots/20260507-032254/deploy/`

## 2) Git status and modified files

- Git repository detected: `true`
- `git status --short`:
  - `m .claude/worktrees/vibrant-chebyshev-e17620`
  - `?? driveflow-refresh-20260507-0320.zip`
  - `?? snapshots/`
- `git diff --name-only`:
  - `.claude/worktrees/vibrant-chebyshev-e17620`

## 3) Migrations pending status

- Command run: `php artisan migrate:status`
- Result: all listed migrations are in `Ran` status; no pending migration detected locally.

## 4) Environment status

- Backend env files found:
  - `backend/.env`
  - `backend/.env.example`
- Frontend env files found:
  - `frontend/.env.local`
  - `frontend/.env.example`
- DB schema backup attempt:
  - `mysql` / `mysqldump` binaries not available in local shell (`CommandNotFoundException`), so schema dump could not be produced in this environment.

## 5) Frontend build status

- Command run: `npm run build` (frontend)
- Result: **PASS**

## 6) Backend test status

- Command run: `php artisan test` (backend)
- Result: **FAIL** (`16 failed, 114 passed`)
- Main failure cluster: `Tests\Feature\SubRentalTest`
- Error pattern: sqlite schema mismatch (`supplier_agencies` has no column `branch_id` in in-memory test DB)

## 7) Additional validation requested

- Command run: `npm run test:no-mock` (frontend)
- Result: **PASS** (`Production mock guard passed.`)

## 8) Deployment decision

Per requested policy, deployment is **stopped** because required validation failed (`php artisan test` not green).  
No server-side deployment command was executed in this run.
