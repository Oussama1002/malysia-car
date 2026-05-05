# MySQL / `driveflow_db` (XAMPP)

The canonical schema is **`api/driveflow_db.sql`** (phpMyAdmin export). It defines the full ERP model (users, companies, roles, `user_roles`, etc.).

## 1. Create the database and import

1. Open **http://localhost/phpmyadmin**
2. Create database: **`driveflow_db`**, collation `utf8mb4_unicode_ci`
3. **Import** the file: `C:\xampp2\htdocs\driveflow\api\driveflow_db.sql`

## 2. Configure Laravel (`api/.env`)

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=driveflow_db
DB_USERNAME=root
DB_PASSWORD=
```

Adjust `DB_USERNAME` / `DB_PASSWORD` if your XAMPP MySQL uses different credentials.

## 3. Run only the “Laravel runtime” migrations

After import, `users` and most business tables already exist. The included migrations add what is missing (e.g. `sessions`, `cache`, `jobs`, `personal_access_tokens` for Sanctum) and **skip** creating `users` if the table is already there.

```bash
cd api
php artisan migrate
```

Do **not** run `migrate:fresh` on this database (it would drop your ERP schema).

## 4. First user / login

The SQL export is often **structure-only** (no rows in `users`). The API authenticates against the ERP `users` table:

- `email`
- `password_hash` (bcrypt of the password)
- `company_id` (required FK to `companies`)
- Roles are linked via `user_roles` → `roles` (`roles.code` is exposed to the SPA as `user.role`)

You must insert at least one **company**, one **user**, one **role** (or use existing rows), and link **user_roles**, with a bcrypt `password_hash`. Example (adjust UUIDs and role id to match your tables):

```sql
-- Example only: replace UUIDs and role_id with real values from your DB
INSERT INTO companies (id, code, legal_name, country_code, default_currency_code, status, created_at, updated_at)
VALUES (UUID(), 'DF', 'DriveFlow Demo', 'MA', 'MAD', 'active', NOW(), NOW());

-- Then create a user with company_id = that company id, set password_hash to bcrypt('password')
-- and insert user_roles (user_id, role_id).
```

For quick local testing **without** MySQL, you can use **SQLite** instead (see comments in `api/.env` and `php artisan migrate:fresh --seed`).

## 5. SQLite dev vs MySQL

| Mode    | `DB_CONNECTION` | Users table                         | Seeder `DatabaseSeeder`  |
|--------|-------------------|--------------------------------------|--------------------------|
| SQLite | `sqlite`          | Simple Laravel dev table + `role`   | Yes (admin@driveflow.com) |
| MySQL  | `mysql`           | ERP `users` from `driveflow_db.sql`  | **Skipped** (use SQL/admin UI) |
