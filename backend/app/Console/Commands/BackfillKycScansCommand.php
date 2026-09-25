<?php

namespace App\Console\Commands;

use App\Models\ReaderDocument;
use App\Services\DocumentReader\DocumentReaderService;
use Illuminate\Console\Command;

/**
 * Les CIN et permis scannés avant que la checklist KYC ne les reprenne sont
 * déjà rattachés au client : cette commande les fait apparaître dans la liste
 * des documents requis. Idempotente — un même fichier n'est jamais listé deux
 * fois.
 */
class BackfillKycScansCommand extends Command
{
    protected $signature = 'driveflow:backfill-kyc-scans';

    protected $description = 'Reprend les CIN et permis déjà scannés dans la checklist KYC des clients';

    public function handle(DocumentReaderService $reader): int
    {
        $count = 0;
        ReaderDocument::query()
            ->where('linked_entity_type', 'customer')
            ->whereNotNull('linked_entity_id')
            ->whereIn('document_type', [
                ReaderDocument::TYPE_CIN,
                ReaderDocument::TYPE_PASSPORT,
                ReaderDocument::TYPE_DRIVING_LICENSE,
            ])
            ->orderBy('id')
            ->chunkById(200, function ($documents) use ($reader, &$count) {
                foreach ($documents as $document) {
                    $reader->link($document, 'customer', (string) $document->linked_entity_id);
                    $count++;
                }
            });

        $this->info("{$count} document(s) repris.");

        return self::SUCCESS;
    }
}
