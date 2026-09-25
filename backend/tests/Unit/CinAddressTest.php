<?php

namespace Tests\Unit;

use App\Services\DocumentReader\DocumentParser;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * L'adresse de la CIN est saisie à la main dans la fiche client alors qu'elle
 * est imprimée sur la carte : le scan doit la rendre.
 */
class CinAddressTest extends TestCase
{
    private function address(string $text): ?string
    {
        $method = new ReflectionMethod(DocumentParser::class, 'parseCin');
        $method->setAccessible(true);

        return $method->invoke(new DocumentParser, $text)['address'];
    }

    public function test_it_reads_an_address_printed_on_the_label_line(): void
    {
        $this->assertSame(
            '12 RUE IBN SINA APPT 4 CASABLANCA',
            $this->address("Nom: EL HADI\nAdresse: 12 RUE IBN SINA APPT 4 CASABLANCA\nValable jusqu'au 12/05/2030\n"),
        );
    }

    public function test_it_joins_the_lines_that_follow_the_label(): void
    {
        $this->assertSame(
            '45 LOT AL AMANE RUE 7 HAY MOHAMMADI CASABLANCA',
            $this->address("Adresse العنوان\n45 LOT AL AMANE RUE 7\nHAY MOHAMMADI CASABLANCA\nCIN BV819234\n"),
        );
    }

    public function test_it_keeps_a_value_the_ocr_spread_out(): void
    {
        $this->assertSame(
            'DOUAR OULED SAID COMMUNE SIDI BENNOUR',
            $this->address("Adresse :  DOUAR  OULED  SAID     COMMUNE  SIDI  BENNOUR\nValable jusqu'au 01/01/2031\n"),
        );
    }

    public function test_it_stays_empty_when_the_card_has_no_address(): void
    {
        $this->assertNull($this->address("Nom: TEST\nPrenom: USER\nCIN AB12345\n"));
    }
}
