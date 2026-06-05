<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $invoices = DB::table('invoices')
            ->orderBy('created_at')
            ->select('id', 'invoice_number')
            ->get();

        $seq = 1;
        foreach ($invoices as $inv) {
            if (str_starts_with($inv->invoice_number ?? '', 'FAC-') && preg_match('/^FAC-(\d+)$/', $inv->invoice_number)) {
                $num = (int) substr($inv->invoice_number, 4);
                if ($num >= $seq) {
                    $seq = $num + 1;
                }
                continue;
            }

            DB::table('invoices')
                ->where('id', $inv->id)
                ->update(['invoice_number' => 'FAC-' . str_pad($seq, 4, '0', STR_PAD_LEFT)]);
            $seq++;
        }
    }

    public function down(): void {}
};
