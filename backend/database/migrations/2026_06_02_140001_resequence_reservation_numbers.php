<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $reservations = DB::table('reservations')
            ->orderBy('created_at')
            ->select('id', 'reservation_number')
            ->get();

        $seq = 1;
        foreach ($reservations as $r) {
            if (str_starts_with($r->reservation_number ?? '', 'RSV-') && preg_match('/^RSV-(\d+)$/', $r->reservation_number)) {
                $num = (int) substr($r->reservation_number, 4);
                if ($num >= $seq) {
                    $seq = $num + 1;
                }
                continue;
            }

            DB::table('reservations')
                ->where('id', $r->id)
                ->update(['reservation_number' => 'RSV-' . str_pad($seq, 4, '0', STR_PAD_LEFT)]);
            $seq++;
        }
    }

    public function down(): void {}
};
