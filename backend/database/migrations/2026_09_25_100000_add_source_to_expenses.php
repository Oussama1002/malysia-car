<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * D'où vient une dépense. Les paiements fournisseur, entretiens et réparations
 * alimentent désormais les Dépenses : on garde le lien vers l'événement
 * d'origine pour ne pas créer la même dépense deux fois, et pour remonter à la
 * ligne qui l'a produite.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('expenses')) {
            return;
        }

        Schema::table('expenses', function (Blueprint $table) {
            if (! Schema::hasColumn('expenses', 'source_type')) {
                $table->string('source_type', 60)->nullable()->index();
            }
            if (! Schema::hasColumn('expenses', 'source_id')) {
                $table->uuid('source_id')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('expenses')) {
            return;
        }

        Schema::table('expenses', function (Blueprint $table) {
            foreach (['source_type', 'source_id'] as $column) {
                if (Schema::hasColumn('expenses', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
