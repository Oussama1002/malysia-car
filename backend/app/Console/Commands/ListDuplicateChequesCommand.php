<?php

namespace App\Console\Commands;

use App\Support\ChequeRegistry;
use Illuminate\Console\Command;

/**
 * List the cheques recorded more than once — client payments, supplier
 * payments and franchises together. Read-only: it never touches a row.
 */
class ListDuplicateChequesCommand extends Command
{
    protected $signature = 'cheques:duplicates';

    protected $description = 'List cheques entered more than once (read-only)';

    public function handle(): int
    {
        $groups = ChequeRegistry::all();
        $duplicates = array_filter($groups, fn ($rows) => count($rows) > 1);

        if ($duplicates === []) {
            $this->info('Aucun chèque en double. '.count($groups).' chèque(s) enregistré(s) au total.');

            return self::SUCCESS;
        }

        $this->warn(count($duplicates).' chèque(s) enregistré(s) plusieurs fois :');

        foreach ($duplicates as $number => $rows) {
            $this->newLine();
            $this->line('Chèque n° '.$number);
            $this->table(
                ['Type', 'Référence', 'Banque', 'Montant', 'Date', 'Table', 'Id'],
                array_map(fn ($r) => [
                    $r['label'],
                    $r['reference'],
                    $r['bank'] ?? '—',
                    $r['amount'] !== null ? number_format($r['amount'], 2, ',', ' ') : '—',
                    $r['date'] ? substr((string) $r['date'], 0, 10) : '—',
                    $r['table'],
                    $r['id'],
                ], $rows),
            );
        }

        $this->newLine();
        $this->line('Rien n\'a été modifié — supprimez la ligne en trop depuis l\'application.');

        return self::SUCCESS;
    }
}
