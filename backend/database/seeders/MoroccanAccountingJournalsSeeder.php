<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class MoroccanAccountingJournalsSeeder extends Seeder
{
    public function run(?string $companyId = null): void
    {
        $rows = [
            ['code' => 'VE', 'name' => 'Journal des ventes', 'journal_type' => 'sales'],
            ['code' => 'AC', 'name' => 'Journal des achats', 'journal_type' => 'purchases'],
            ['code' => 'BQ', 'name' => 'Journal de banque', 'journal_type' => 'bank'],
            ['code' => 'CA', 'name' => 'Journal de caisse', 'journal_type' => 'cash'],
            ['code' => 'OD', 'name' => 'Operations diverses', 'journal_type' => 'general'],
            ['code' => 'AN', 'name' => 'A nouveaux', 'journal_type' => 'general'],
        ];

        $legacy = Schema::hasColumn('accounting_journals', 'journal_code');
        foreach ($rows as $row) {
            if ($legacy) {
                if (!$companyId) {
                    continue;
                }
                DB::table('accounting_journals')->updateOrInsert(
                    ['company_id' => $companyId, 'journal_code' => $row['code']],
                    [
                        'journal_name' => $row['name'],
                        'journal_type' => $row['journal_type'],
                        'is_active' => 1,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            } else {
                $existing = DB::table('accounting_journals')->where('code', $row['code'])->first();
                $payload = [
                    'company_id' => null,
                    'code' => $row['code'],
                    'name' => $row['name'],
                    'journal_type' => $row['journal_type'],
                    'is_active' => 1,
                    'is_default' => $row['code'] === 'OD' ? 1 : 0,
                    'sequence_prefix' => $row['code'],
                    'sequence_next' => 1,
                    'updated_at' => now(),
                ];
                if ($existing) {
                    DB::table('accounting_journals')->where('id', $existing->id)->update($payload);
                } else {
                    $payload['id'] = (string) Str::uuid();
                    $payload['created_at'] = now();
                    DB::table('accounting_journals')->insert($payload);
                }
            }
        }
    }
}
