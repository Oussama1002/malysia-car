<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La durée d'un message vocal. Elle est affichée avant l'écoute : on doit
 * savoir si l'on écoute cinq secondes ou deux minutes.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chat_messages')) {
            return;
        }

        if (! Schema::hasColumn('chat_messages', 'attachment_duration')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->unsignedSmallInteger('attachment_duration')->nullable();
            });
        }

        // Un message peut n'être qu'une pièce jointe — un vocal n'a pas de
        // texte. La migration qui l'avait autorisé passait par une requête
        // MySQL brute, sans effet ailleurs : on le refait de façon portable.
        try {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->text('body')->nullable()->change();
            });
        } catch (\Throwable) {
            // Déjà nullable, ou moteur qui ne sait pas modifier la colonne.
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('chat_messages') && Schema::hasColumn('chat_messages', 'attachment_duration')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->dropColumn('attachment_duration');
            });
        }
    }
};
