<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class DatabaseSeeder extends Seeder
{
    /**
     * Demo users for **SQLite** only (minimal `users` table).
     * For MySQL + `driveflow_db.sql`, create staff in the admin UI or via SQL (see `docs/DATABASE-LOCAL.md`).
     */
    public function run(): void
    {
        // Always seed the RBAC catalogue (idempotent, safe on MySQL and SQLite).
        $this->call(RbacSeeder::class);

        if (config('database.default') !== 'sqlite') {
            $this->command?->info('Skipping user seeder: use driveflow_db users or insert via SQL (see docs/DATABASE-LOCAL.md).');

            return;
        }
        if (! Schema::hasColumn('users', 'role')) {
            $this->command?->warn('Skipping user seeder: expected legacy sqlite `users` schema with `role` column.');

            return;
        }

        $users = [
            [
                'name' => 'Directeur DriveFlow',
                'email' => 'admin@driveflow.com',
                'password' => 'password',
                'role' => 'DIRECTEUR',
            ],
            [
                'name' => 'Agent Commercial',
                'email' => 'agent@driveflow.com',
                'password' => 'password',
                'role' => 'AGENT_COMMERCIAL',
            ],
        ];

        foreach ($users as $u) {
            User::query()->firstOrCreate(
                ['email' => $u['email']],
                [
                    'name' => $u['name'],
                    'password' => Hash::make($u['password']),
                    'role' => $u['role'],
                ]
            );
        }
    }
}
