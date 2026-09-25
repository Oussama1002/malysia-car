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
        $convertedSource = null;
        // A cheque is a single page, so render one page only — the recto/verso
        // A4 render is what pushed the synchronous scan past the web server's
        // timeout. Resolution stays full: a scanner puts the cheque in a band
        // of an A4 page, so scaling the whole page down leaves the cheque at
        // half the detail a photo of the same cheque gives Tesseract.
        $isCheque = $docType === 'cheque';

        if ($ext === 'pdf') {
            $imagePaths = $this->renderPdfPages($absolutePath, $isCheque ? 1 : 2);
            // Crop the surrounding white so the cheque fills the frame, the way
            // it does in a photo.
            foreach ($imagePaths as $page) {
                $this->trimMargins($page);
            }
            $needsCleanup = true;
        } else {
            // Tesseract only reads jpg/jpeg/png natively. Convert anything else
            // (HEIC/HEIF from iPhones, WebP, TIFF, BMP, GIF) to PNG first via
            // ImageMagick so all image formats work, not just the three.
            $source = $absolutePath;
            if (! in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
                $convertedSource = $this->convertToPng($absolutePath);
                if ($convertedSource !== null) {
                    $source = $convertedSource;
                }
            }
            // Phone cameras produce 12+ MP images — resize before OCR. Une CIN
            // ou un permis est une carte de 85 mm : 1600 px la rendent déjà à
            // plus de 450 dpi, et Tesseract y passe deux fois moins de temps
            // que sur 2400 px. Un chèque ou une carte grise garde la pleine
            // définition, ses chiffres sont fins.
            $resized = $this->downsizeImage($source, $isPinkDoc || $docType === 'passport' ? 1600 : 2400);
            $working = $resized ?? $source;
            // Preprocessing writes in place. A small jpg/png needs neither
            // conversion nor resizing, so without a copy here we would grayscale
            // and rotate the uploaded file itself — the one kept as the proof.
            if ($working === $absolutePath) {
                $working = $this->copyToTemp($absolutePath) ?? $absolutePath;
            }
            $imagePaths = [$working];
            $needsCleanup = $working !== $absolutePath;
        }

        try {
            $text = '';
            foreach ($imagePaths as $i => $image) {
                // Pink docs (permis/CIN): red-channel watermark suppression.
                // Everything else: gentle grayscale + mild contrast that keeps
                // thin digit strokes intact.
                $this->preprocessImage($image, $isPinkDoc);
                // --psm 6 reads a block of upright text, so a page scanned
                // sideways comes back as column-wise gibberish. Straighten it
                // first, and for a cheque fall back to trying the quarter turns
                // when the host has no `osd` traineddata.
                $this->autoRotate($image);
                $pageText = $this->runTesseract($image, $lang);
                if ($isCheque && ! $this->looksLikeCheque($pageText)) {
                    $pageText = $this->retryRotations($image, $lang, $pageText);
                }
                // The amount is handwritten, on a line of its own, in a
                // guilloche background: --psm 6 wants a uniform block and often
                // drops it. Sparse mode picks up scattered writing, so give the
                // parser a second chance when nothing amount-like came back.
                if ($isCheque && ! $this->hasAmountSignal($pageText)) {
                    $sparse = $this->runTesseractSparse($image, $lang);
                    if ($sparse !== '') {
                        $pageText .= "\n--- sparse pass ---\n".$sparse."\n";
                    }
                }
                // Still nothing: the amount is pen over the guilloche security
                // pattern, and the gentle preprocessing above keeps both. Drop
                // everything but the dark ink and read that.
                if ($isCheque && ! $this->hasAmountSignal($pageText)) {
                    $ink = $this->readInkOnly($image, $lang);
                    if ($ink !== '') {
                        $pageText .= "\n--- ink pass ---\n".$ink."\n";
                    }
                }
                $text .= $pageText."\n\n";

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
            if ($convertedSource !== null && $convertedSource !== $absolutePath) {
                @unlink($convertedSource);
            }
        }

        return new OcrResult(rawText: trim($text), confidence: null, provider: $this->name());
    }

    /**
     * Convert an image in any ImageMagick-readable format (HEIC/HEIF from
     * iPhones, WebP, TIFF, BMP, GIF…) to a PNG that Tesseract can read. Returns
     * the temp PNG path, or null if conversion isn't possible (ImageMagick
     * missing, or missing the HEIC delegate) — the caller then falls back to the
     * original file.
     */
    private function convertToPng(string $imagePath): ?string
    {
        try {
            $tmp = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_conv_'.bin2hex(random_bytes(6)).'.png';
            // `[0]` takes the first frame/page for multi-frame inputs (animated
            // GIF, multi-page TIFF).
            $process = new Process([
                $this->convertBin,
                $imagePath.'[0]',
                $tmp,
            ]);
            $process->setTimeout(60);
            $process->mustRun();

            return is_file($tmp) ? $tmp : null;
        } catch (Throwable) {
            return null; // ImageMagick missing / unsupported format — use original.
        }
    }

    /**
     * Straighten a sideways page using Tesseract's orientation detection
     * (`--psm 0`, needs the `osd` traineddata). Best-effort: a host without
     * `osd` or ImageMagick keeps the page as it is.
     */
    private function autoRotate(string $image): void
    {
        try {
            $probe = new Process([$this->tesseractBin, $image, 'stdout', '--psm', '0', '-l', 'osd']);
            $probe->setTimeout(60);
            $probe->run();
            $report = $probe->getOutput().$probe->getErrorOutput();
            if (! preg_match('/Rotate:\s*(\d{1,3})/i', $report, $m)) {
                return;
            }
            $this->rotateImage($image, (int) $m[1]);
        } catch (Throwable) {
            // Orientation detection is optional — carry on with the page as-is.
        }
    }

    /** Scratch copy of the upload, so OCR never edits the stored original. */
    private function copyToTemp(string $path): ?string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION)) ?: 'png';
        $tmp = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_ocr_src_'.bin2hex(random_bytes(6)).'.'.$ext;

        return @copy($path, $tmp) ? $tmp : null;
    }

    /**
     * Crop the uniform border around a scanned page. Best-effort: without
     * ImageMagick the page is read as it is.
     */
    private function trimMargins(string $image): void
    {
        $tmp = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_trim_'.bin2hex(random_bytes(6)).'.png';

        try {
            $process = new Process([
                $this->convertBin,
                $image,
                '-bordercolor', 'white',
                '-border', '10',
                '-fuzz', '12%',
                '-trim',
                '+repage',
                $tmp,
            ]);
            $process->setTimeout(60);
            $process->mustRun();

            // A trim that ate the page (blank or very noisy scan) is worse than
            // no trim, so keep the render unless a real page is left.
            $before = @getimagesize($image);
            $after = @getimagesize($tmp);
            if ($before && $after && $after[0] > $before[0] * 0.2 && $after[1] > $before[1] * 0.2) {
                @rename($tmp, $image);
            }
        } catch (Throwable) {
            // Leave the rendered page untouched.
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }

    private function rotateImage(string $image, int $degrees): bool
    {
        $degrees %= 360;
        if ($degrees === 0) {
            return false;
        }

        try {
            $process = new Process([$this->convertBin, $image, '-rotate', (string) $degrees, $image]);
            $process->setTimeout(60);
            $process->mustRun();

            return true;
        } catch (Throwable) {
            return false; // ImageMagick missing — leave the page untouched.
        }
    }

    /** Digits next to DH/MAD, or an amount spelled out in French. */
    private function hasAmountSignal(string $text): bool
    {
        return (bool) preg_match('/\b(?:DH|DHS|MAD|DIRHAMS?)\b[^\da-z\n\r]{0,6}\d/iu', $text)
            || (bool) preg_match('/\b(?:mille|cents?|vingt|trente|quarante|cinquante|soixante|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/iu', $text);
    }

    /**
     * Sparse-text pass (--psm 11): finds text scattered anywhere on the page,
     * which is how the handwritten amount sits on a cheque.
     */
    private function runTesseractSparse(string $image, string $lang): string
    {
        try {
            $process = new Process([
                $this->tesseractBin,
                $image,
                'stdout',
                '-l', $lang,
                '--oem', '1',
                '--psm', '11',
                '-c', 'preserve_interword_spaces=1',
                '-c', 'user_defined_dpi=300',
                '-c', 'tessedit_do_invert=0',
            ]);
            $process->setTimeout($this->timeoutSeconds);
            $process->mustRun();

            return $process->getOutput();
        } catch (Throwable) {
            return '';
        }
    }

    /**
     * Keep only the dark strokes — pen ink — and drop the pale printed
     * guilloche the amount is written over, then read that copy.
     */
    private function readInkOnly(string $image, string $lang): string
    {
        $tmp = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_ink_'.bin2hex(random_bytes(6)).'.png';

        try {
            $process = new Process([
                $this->convertBin,
                $image,
                '-colorspace', 'Gray',
                '-level', '35%,65%',   // pale pattern → white, ink stays dark
                '-despeckle',
                $tmp,
            ]);
            $process->setTimeout(60);
            $process->mustRun();

            return $this->runTesseractSparse($tmp, $lang);
        } catch (Throwable) {
            return '';
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }

    /** Does this OCR text carry anything a cheque parser can use? */
    private function looksLikeCheque(string $text): bool
    {
        return (bool) preg_match('/\b(BANK|BANQUE|CH[EÈ]QUE|BARID|DH|MAD|S[ÉE]RIE)\b/iu', $text)
            || (bool) preg_match('/\b\d{6,8}\b/', $text);
    }

    /**
     * Last resort when orientation detection is unavailable: OCR the page at
     * each quarter turn and keep the first read that looks like a cheque.
     */
    private function retryRotations(string $image, string $lang, string $fallback): string
    {
        foreach ([90, 180, 90] as $step) { // 90 → 180 → 270 (cumulative)
            if (! $this->rotateImage($image, $step)) {
                return $fallback;
            }
            $text = $this->runTesseract($image, $lang);
            if ($this->looksLikeCheque($text)) {
                return $text;
            }
        }

        return $fallback;
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
    private function downsizeImage(string $imagePath, int $maxDim = 2400): ?string
    {
        try {
            $info = @getimagesize($imagePath);
            if (! $info) {
                return null;
            }
            [$w, $h] = $info;
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
    private function renderPdfPages(string $pdfPath, int $lastPage = 2, int $scaleTo = 3508): array
    {
        $prefix = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_ocr_'.bin2hex(random_bytes(6));

        $process = new Process([
            $this->pdftoppmBin,
            '-f', '1',          // first page
            '-l', (string) $lastPage, // up to page 2 — ID docs are recto/verso. The
                                // Moroccan permis prints "Fin de validité"
                                // (expiry) and the MRZ on the verso, so page 1
                                // alone can never yield the expiry date. Each
                                // page is still capped by -scale-to, so two
                                // pages stay bounded.
            '-r', '300',        // base DPI (overridden by -scale-to for large pages)
            '-scale-to', (string) $scaleTo, // cap longest dimension at 3 508 px (~A4 @ 300 DPI);
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
