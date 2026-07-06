<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reservations', function (Blueprint $table) {
            $table->decimal('daily_rate', 18, 2)->nullable()->after('estimated_price');
            $table->decimal('deposit_amount', 18, 2)->nullable()->after('daily_rate');
            $table->decimal('allowed_km_per_day', 10, 2)->nullable()->after('deposit_amount');
            $table->string('payment_method', 50)->nullable()->after('allowed_km_per_day');
        });
    }

    public function down(): void
    {
        Schema::table('reservations', function (Blueprint $table) {
            $table->dropColumn(['daily_rate', 'deposit_amount', 'allowed_km_per_day', 'payment_method']);
        });
    }
};
