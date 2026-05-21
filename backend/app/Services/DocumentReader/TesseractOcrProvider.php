<?php

namespace App\Services\DocumentReader;

use RuntimeException;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

/**
 * Free, self-hosted Tesseract OCR provider.
 *
 * Requires the `tesseract` binary on the PATH. PDFs are converted to images
 * first (one page at a time) using `pdftoppm` (poppler-utils). Both tools are
 * widely available on Linux/Mac/Windows and remain free of charge.
 *
 * Configuration: `config/document_reader.php` → tesseract.bin / pdftoppm.bin / lang.
 */
class TesseractOcrProvider implements OcrProviderInterface
{
    public function __construct(
        private readonly string $tesseractBin = 'tesseract',
        private readonly string $pdftoppmBin = 'pdftoppm',
        private readonly string $defaultLang = 'eng+fra+ara',
        private readonly int $timeoutSeconds = 120,
    ) {}

    public function name(): string
    {
        return 'tesseract';
    }

    public function extract(string $absolutePath, array $options = []): OcrResult
    {
        if (! is_file($absolutePath)) {
            throw new RuntimeException("OCR source file not found: {$absolutePath}");
        }

        $lang = (string) ($options['lang'] ?? $this->defaultLang);
        $ext = strtolower(pathinfo($absolutePath, PATHINFO_EXTENSION));

        $imagePaths = $ext === 'pdf'
            ? $this->renderPdfPages($absolutePath)
            : [$absolutePath];

        try {
            $text = '';
            foreach ($imagePaths as $image) {
                $text .= $this->runTesseract($image, $lang)."\n\n";
            }
        } finally {
            if ($ext === 'pdf') {
                foreach ($imagePaths as $tmp) {
                    @unlink($tmp);
                }
            }
        }

        return new OcrResult(rawText: trim($text), confidence: null, provider: $this->name());
    }

    private function runTesseract(string $image, string $lang): string
    {
        // `tesseract <image> stdout -l <lang> --oem 1 --psm 6 \
        //    -c preserve_interword_spaces=1 -c user_defined_dpi=300 \
        //    -c tessedit_do_invert=0`
        //
        // --oem 1 = LSTM only (best modern accuracy for the fonts on Moroccan IDs).
        // --psm 6 = "uniform block of text" — faster than --psm 4 for our use
        //          case and still recovers cleanly all the field labels we
        //          parse for. Cut typical OCR time per page from ~25s to ~10s.
        // tessedit_do_invert=0 skips the dark-on-light inversion pass —
        //                      Moroccan CINs are always printed dark-on-light
        //                      so the second pass is wasted CPU.
        $process = new Process([
            $this->tesseractBin,
            $image,
            'stdout',
            '-l', $lang,
            '--oem', '1',
            '--psm', '6',
            '-c', 'preserve_interword_spaces=1',
            '-c', 'user_defined_dpi=300',
            '-c', 'tessedit_do_invert=0',
        ]);
        $process->setTimeout($this->timeoutSeconds);

        try {
            $process->mustRun();
        } catch (ProcessFailedException $e) {
            throw new RuntimeException(
                'Tesseract OCR failed: '.$e->getProcess()->getErrorOutput(),
                previous: $e,
            );
        }

        return $process->getOutput();
    }

    /**
     * Render every page of a PDF as a PNG (300 DPI) using poppler `pdftoppm`,
     * then return the list of generated image paths.
     *
     * @return list<string>
     */
    private function renderPdfPages(string $pdfPath): array
    {
        $prefix = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_ocr_'.bin2hex(random_bytes(6));

        // 300 DPI grayscale: fastest setting that still delivers reliable
        // recognition on Moroccan CIN/Permis labels. Going higher (400/500)
        // multiplies render+OCR time without proportional accuracy gains,
        // and pushes us past the default Nginx 60s read timeout.
        $process = new Process([
            $this->pdftoppmBin,
            '-r', '300',
            '-png',
            '-gray',
            $pdfPath,
            $prefix,
        ]);
        $process->setTimeout($this->timeoutSeconds);

        try {
            $process->mustRun();
        } catch (ProcessFailedException $e) {
            throw new RuntimeException(
                'PDF rendering failed (pdftoppm). Install poppler-utils. '.$e->getProcess()->getErrorOutput(),
                previous: $e,
            );
        }

        $pages = glob($prefix.'-*.png') ?: [];
        sort($pages);

        return $pages;
    }
}
