<?php

namespace App\Services\DocumentReader;

use RuntimeException;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;
use Throwable;

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
        private readonly string $defaultLang = 'fra+eng',
        private readonly int $timeoutSeconds = 570,
        // ImageMagick `convert` binary — used to suppress the pink Moroccan
        // permis watermark before Tesseract sees the page. Best-effort: if it's
        // missing on the host we silently fall back to the raw page render.
        private readonly string $convertBin = 'convert',
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
        $docType = (string) ($options['doc_type'] ?? '');
        $ext = strtolower(pathinfo($absolutePath, PATHINFO_EXTENSION));

        // The pink-watermark red-channel preprocessing is tuned for the Moroccan
        // permis / CIN. On a plain grayscale carte grise it destroys thin digit
        // strokes (turns "6"→"@", garbles VIN digits), so apply only to the
        // pink docs and use gentle grayscale contrast for everything else.
        $isPinkDoc = in_array($docType, ['driving_license', 'cin'], true);

        $needsCleanup = false;
        if ($ext === 'pdf') {
            $imagePaths = $this->renderPdfPages($absolutePath);
            $needsCleanup = true;
        } else {
            // Phone cameras produce 12+ MP images — resize to max 2400px
            // longest edge before OCR so Tesseract runs in ~5-10s not 60s.
            $resized = $this->downsizeImage($absolutePath);
            $imagePaths = [$resized ?? $absolutePath];
            $needsCleanup = $resized !== null;
        }

        try {
            $text = '';
            foreach ($imagePaths as $i => $image) {
                // Pink docs (permis/CIN): red-channel watermark suppression.
                // Everything else: gentle grayscale + mild contrast that keeps
                // thin digit strokes intact.
                $this->preprocessImage($image, $isPinkDoc);
                $text .= $this->runTesseract($image, $lang)."\n\n";

                // Digit-focused second pass. For the permis this targets the
                // verso (page 2). For the carte grise the whole document is a
                // dense field table, so run it on every page to recover the VIN,
                // fiscal power and expiry digits that the multilingual pass
                // mangles (letters pulled out of numbers). Appended so the
                // classifier can pick up cleaner digit readings.
                $runDigitPass = ($ext === 'pdf' && $i >= 1)
                    || $docType === 'vehicle_registration';
                if ($runDigitPass) {
                    $digits = $this->runTesseractDigits($image);
                    if ($digits !== '') {
                        $text .= "\n--- digit pass ---\n".$digits."\n";
                    }
                }
            }
        } finally {
            if ($needsCleanup) {
                foreach ($imagePaths as $tmp) {
                    if ($tmp !== $absolutePath) {
                        @unlink($tmp);
                    }
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
     * Narrow OCR pass for the Moroccan permis verso: digits + date separators
     * only, sparse-text PSM, English language (no Arabic/French dictionary
     * pulling letters out of dates). Recovers dates like "15/09/2030" that the
     * multilingual main pass turns into letter garbage ("ECO" / "PR ET RTE")
     * because of the decorative background.
     *
     * Soft-fails: any error returns '' so the main extraction is never broken
     * by this best-effort second pass.
     */
    private function runTesseractDigits(string $image): string
    {
        $process = new Process([
            $this->tesseractBin,
            $image,
            'stdout',
            '-l', 'eng',
            '--oem', '1',
            '--psm', '11',                 // sparse text — best for scattered numbers
            '-c', 'tessedit_char_whitelist=0123456789/-. ',
            '-c', 'user_defined_dpi=300',
            '-c', 'tessedit_do_invert=0',
        ]);
        $process->setTimeout($this->timeoutSeconds);

        try {
            $process->mustRun();
        } catch (Throwable) {
            return '';
        }

        return $process->getOutput();
    }

    /**
     * Suppress the pink/red watermark on the Moroccan permis (and similar
     * Moroccan ID documents) so the digits underneath become readable.
     *
     * Mechanism: split the RGB image into channels and keep only the RED
     * channel as the new grayscale image. On these documents the watermark is
     * a saturated pink (R ≈ 220-255, low G/B), while ink is dark (R ≈ 0-30).
     * Reading the red channel maps the pink to near-white and ink to near-black
     * — far higher text/background contrast than Tesseract's default Otsu
     * binarisation can achieve from a grayscale render.
     *
     * Best-effort: if ImageMagick isn't installed, the call fails silently and
     * Tesseract still gets the original colour PNG (no regression).
     */
    private function preprocessImage(string $imagePath, bool $isPinkDoc = true): void
    {
        if (! is_file($imagePath)) {
            return;
        }

        if ($isPinkDoc) {
            // Pink permis/CIN: isolate the red channel to drop the watermark,
            // then aggressive contrast to recover the digits underneath.
            $args = [
                '-colorspace', 'sRGB',
                '-channel', 'R',
                '-separate',
                '+channel',
                '-sharpen', '0x1',
                '-level', '20%,90%',
            ];
        } else {
            // Plain scans (carte grise, etc.): gentle grayscale + mild contrast.
            // No channel dropping, no hard threshold — preserves thin digit
            // strokes so "6" stays "6" and VIN characters survive.
            $args = [
                '-colorspace', 'Gray',
                '-normalize',
                '-sharpen', '0x1',
            ];
        }

        $process = new Process([
            $this->convertBin,
            $imagePath,
            ...$args,
            $imagePath,
        ]);
        $process->setTimeout(60);

        try {
            $process->mustRun();
        } catch (Throwable) {
            // ImageMagick missing / version mismatch / weird input — fall back
            // to the unprocessed image; Tesseract will still try.
        }
    }

    /**
     * Downsize a large image (phone cameras produce 12+ MP) to max 2400 px on
     * the longest edge. Returns the path to a temporary resized file, or null
     * if no resize was needed or ImageMagick is unavailable.
     */
    private function downsizeImage(string $imagePath): ?string
    {
        try {
            $info = @getimagesize($imagePath);
            if (! $info) {
                return null;
            }
            [$w, $h] = $info;
            $maxDim = 2400;
            if ($w <= $maxDim && $h <= $maxDim) {
                return null; // already small enough
            }

            $tmp = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_resize_'.bin2hex(random_bytes(6)).'.png';
            $process = new Process([
                $this->convertBin,
                $imagePath,
                '-resize', $maxDim.'x'.$maxDim.'>',
                '-quality', '95',
                $tmp,
            ]);
            $process->setTimeout(30);
            $process->mustRun();

            return is_file($tmp) ? $tmp : null;
        } catch (Throwable) {
            return null; // ImageMagick missing — use original
        }
    }

    /**
     * Render PDF pages as PNG using poppler `pdftoppm`, then return the list
     * of generated image paths.
     *
     * Key constraints:
     * - `-f 1 -l 2`        → first two pages. ID docs are recto/verso: the
     *                         Moroccan permis prints "Fin de validité" (expiry)
     *                         and the MRZ on the verso, so page 1 alone can
     *                         never yield the expiry. We cap at 2 pages (not
     *                         "all pages") because phone-camera PDFs often embed
     *                         the image at native sensor resolution (e.g.
     *                         56×42 in); combined with -scale-to each page stays
     *                         bounded. Multi-page rental contracts should still
     *                         be split into separate uploads.
     * - `-scale-to 2480`   → cap the longest dimension at 2 480 px (≈ A4 at
     *                         300 DPI). Regardless of the PDF's declared page
     *                         size, Tesseract never sees a gigantic image.
     * - `-r 150`           → render at 150 DPI as a starting point; the
     *                         -scale-to cap is what actually controls output
     *                         size for oversized pages.
     *
     * @return list<string>
     */
    private function renderPdfPages(string $pdfPath): array
    {
        $prefix = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_ocr_'.bin2hex(random_bytes(6));

        $process = new Process([
            $this->pdftoppmBin,
            '-f', '1',          // first page
            '-l', '2',          // up to page 2 — ID docs are recto/verso. The
                                // Moroccan permis prints "Fin de validité"
                                // (expiry) and the MRZ on the verso, so page 1
                                // alone can never yield the expiry date. Each
                                // page is still capped by -scale-to, so two
                                // pages stay bounded.
            '-r', '300',        // base DPI (overridden by -scale-to for large pages)
            '-scale-to', '3508', // cap longest dimension at 3 508 px (~A4 @ 300 DPI);
                                 // small fields like the VIN and fiscal-power digit
                                 // need the extra resolution to be read correctly.
            '-png',
            // Render in COLOUR (no -gray) so the preprocessing step can isolate
            // the red channel: on the pink-watermarked Moroccan permis verso,
            // dark text has near-zero red while the pink background is near-max
            // red — separating red turns the digits into near-black on near-
            // white, which Tesseract can actually read. See preprocessImage().
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
