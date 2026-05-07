<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class MoroccanTaxesSeeder extends Seeder
{
    public function run(?string $companyId = null): void
    {
        $rows = [
            ['code' => 'TVA_COL_20', 'name' => 'TVA collectee standard 20%', 'rate' => 20, 'tax_type' => 'vat', 'applies_to' => 'service', 'account_code' => '4455'],
            ['code' => 'TVA_DED_20', 'name' => 'TVA deductible standard 20%', 'rate' => 20, 'tax_type' => 'vat', 'applies_to' => 'purchase', 'account_code' => '3455'],
            ['code' => 'TVA_MARGE_VO', 'name' => 'TVA sur marge VO', 'rate' => 20, 'tax_type' => 'vat', 'applies_to' => 'used_car_margin', 'account_code' => '4457'],
            ['code' => 'EXONERE', 'name' => 'Exonere / hors champ', 'rate' => 0, 'tax_type' => 'other', 'applies_to' => 'all', 'account_code' => null],
        ];

        $legacy = Schema::hasColumn('taxes', 'tax_code');
        foreach ($rows as $row) {
            if ($legacy) {
                if (!$companyId) {
                    continue;
                }
                DB::table('taxes')->updateOrInsert(
                    ['company_id' => $companyId, 'tax_code' => $row['code']],
                    [
                        'tax_name' => $row['name'],
                        'tax_type' => $row['tax_type'],
                        'rate_percent' => $row['rate'],
                        'application_scope' => $row['applies_to'],
                        'is_active' => 1,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            } else {
                $existing = DB::table('taxes')->where('code', $row['code'])->first();
                $payload = [
                    'code' => $row['code'],
                    'name' => $row['name'],
                    'rate' => $row['rate'],
                    'tax_type' => $row['tax_type'],
                    'applies_to' => $row['applies_to'],
                    'is_active' => 1,
                    'account_code' => $row['account_code'],
                    'updated_at' => now(),
                ];
                if ($existing) {
                    DB::table('taxes')->where('id', $existing->id)->update($payload);
                } else {
                    $payload['id'] = (string) Str::uuid();
                    $payload['created_at'] = now();
                    DB::table('taxes')->insert($payload);
                }
            }
        }
    }
}
