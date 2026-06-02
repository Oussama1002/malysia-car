<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Re-sequence existing customer codes from CUS-XXXXXXXX to CL-0001, CL-0002, ...
 */
return new class extends Migration
{
    public function up(): void
    {
        $customers = DB::table('customers')
            ->orderBy('created_at')
            ->select('id', 'customer_code')
            ->get();

        $seq = 1;
        foreach ($customers as $c) {
            // Skip if already in new format
            if (str_starts_with($c->customer_code ?? '', 'CL-')) {
                $num = (int) substr($c->customer_code, 3);
                if ($num >= $seq) {
                    $seq = $num + 1;
                }
                continue;
            }

            DB::table('customers')
                ->where('id', $c->id)
                ->update(['customer_code' => 'CL-' . str_pad($seq, 4, '0', STR_PAD_LEFT)]);
            $seq++;
        }
    }

    public function down(): void
    {
        // No rollback — codes were random before anyway
    }
};
