<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $contracts = DB::table('contracts')
            ->orderBy('created_at')
            ->select('id', 'contract_number')
            ->get();

        $seq = 1;
        foreach ($contracts as $c) {
            if (str_starts_with($c->contract_number ?? '', 'CTR-') && preg_match('/^CTR-(\d+)$/', $c->contract_number)) {
                $num = (int) substr($c->contract_number, 4);
                if ($num >= $seq) {
                    $seq = $num + 1;
                }
                continue;
            }

            DB::table('contracts')
                ->where('id', $c->id)
                ->update(['contract_number' => 'CTR-' . str_pad($seq, 4, '0', STR_PAD_LEFT)]);
            $seq++;
        }
    }

    public function down(): void {}
};
