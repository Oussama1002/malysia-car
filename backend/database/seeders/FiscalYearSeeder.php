<?php

namespace Database\Seeders;

use App\Models\FiscalPeriod;
use App\Models\FiscalYear;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class FiscalYearSeeder extends Seeder
{
    public function run(?string $companyId = null): void
    {
        if (Schema::hasColumn('fiscal_years', 'year_label')) {
            if (!$companyId) {
                return;
            }
            $year = now()->year;
            DB::table('fiscal_years')->updateOrInsert(
                ['company_id' => $companyId, 'year_label' => (string) $year],
                [
                    'start_date' => Carbon::create($year, 1, 1)->toDateString(),
                    'end_date' => Carbon::create($year, 12, 31)->toDateString(),
                    'status' => 'open',
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );

            return;
        }

        $year = now()->year;
        $code = $companyId ? "{$year}-{$companyId}" : (string) $year;

        $fy = FiscalYear::query()->firstOrCreate(
            ['code' => $code],
            [
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'start_date' => Carbon::create($year, 1, 1)->toDateString(),
                'end_date' => Carbon::create($year, 12, 31)->toDateString(),
                'status' => 'open',
            ]
        );

        for ($month = 1; $month <= 12; $month++) {
            $start = Carbon::create($year, $month, 1)->startOfMonth();
            $end = Carbon::create($year, $month, 1)->endOfMonth();
            FiscalPeriod::query()->firstOrCreate(
                ['fiscal_year_id' => $fy->id, 'period_number' => $month],
                [
                    'id' => (string) Str::uuid(),
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'status' => 'open',
                ]
            );
        }
    }
}
