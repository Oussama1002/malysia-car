<?php

namespace Database\Seeders;

use App\Models\VehicleBrand;
use App\Models\VehicleModel;
use Illuminate\Database\Seeder;

class VehicleBrandSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = [
            // ── Marques les plus populaires au Maroc ─────────────────────────
            'Dacia' => [
                'Logan', 'Logan MCV', 'Sandero', 'Sandero Stepway', 'Duster',
                'Dokker', 'Dokker Van', 'Lodgy', 'Spring', 'Jogger',
            ],
            'Renault' => [
                'Clio', 'Clio Estate', 'Symbol', 'Megane', 'Megane Estate',
                'Kadjar', 'Captur', 'Kangoo', 'Kangoo Van', 'Trafic',
                'Master', 'Express', 'Austral', 'Espace', 'Arkana',
                'Scenic', 'Koleos', 'Twingo', 'Rafale', 'Zoe',
            ],
            'Peugeot' => [
                '108', '208', '301', '308', '308 SW', '408', '508', '508 SW',
                '2008', '3008', '5008',
                'Partner', 'Partner Tepee', 'Expert', 'Boxer',
                'Rifter', 'Traveller', 'Landtrek',
                'e-208', 'e-2008', 'e-308',
            ],
            'Citroën' => [
                'C1', 'C3', 'C3 Aircross', 'C4', 'C4 X', 'C4 Cactus',
                'C5', 'C5 X', 'C5 Aircross',
                'Berlingo', 'Berlingo Van', 'Jumpy', 'Jumper',
                'SpaceTourer', 'ë-C4', 'ë-Berlingo', 'Ami',
            ],
            'Volkswagen' => [
                'Polo', 'Golf', 'Golf Variant', 'Passat', 'Passat Variant',
                'Arteon', 'Jetta',
                'T-Cross', 'T-Roc', 'Tiguan', 'Tiguan Allspace', 'Touareg',
                'Caddy', 'Caddy Cargo', 'Transporter', 'Multivan', 'Crafter',
                'Amarok', 'ID.3', 'ID.4', 'ID.5', 'ID.Buzz', 'Taigo', 'Up!',
            ],
            'Hyundai' => [
                'i10', 'i20', 'i30', 'i30 N', 'i30 Fastback',
                'Elantra', 'Sonata', 'Accent',
                'Bayon', 'Kona', 'Tucson', 'Santa Fe', 'Palisade',
                'H-1', 'Staria', 'H-100',
                'Ioniq', 'Ioniq 5', 'Ioniq 6',
                'Creta', 'Venue',
            ],
            'Toyota' => [
                'Aygo', 'Aygo X', 'Yaris', 'Yaris Cross', 'Corolla',
                'Corolla Touring Sports', 'Camry', 'Crown',
                'C-HR', 'RAV4', 'Highlander', 'Land Cruiser', 'Land Cruiser 300',
                'Fortuner', 'Hilux', 'Hiace', 'Proace', 'Proace City',
                'Prius', 'bZ4X', 'Supra', 'GR86',
                'Avanza', 'Rush', 'Urban Cruiser',
            ],
            'Kia' => [
                'Picanto', 'Rio', 'Ceed', 'Ceed SW', 'ProCeed',
                'Cerato', 'K5', 'Stinger',
                'Stonic', 'Seltos', 'Niro', 'Sportage', 'Sorento',
                'EV6', 'EV9', 'Soul',
                'Carnival', 'K2500',
            ],
            'Ford' => [
                'Fiesta', 'Focus', 'Focus ST', 'Mondeo',
                'Puma', 'EcoSport', 'Kuga', 'Explorer', 'Bronco',
                'Mustang', 'Mustang Mach-E',
                'Transit', 'Transit Connect', 'Transit Custom', 'Transit Courier',
                'Ranger', 'Everest', 'Tourneo', 'Tourneo Connect',
                'Galaxy', 'S-Max',
            ],
            'Nissan' => [
                'Micra', 'Note', 'Juke', 'Qashqai', 'X-Trail',
                'Pathfinder', 'Patrol', 'Navara', 'NV200', 'NV300',
                'NV400', 'Interstar', 'Townstar',
                'Leaf', 'Ariya', 'Kicks', 'Terra',
                'Sentra', 'Altima', 'Maxima',
            ],

            // ── Marques premium ──────────────────────────────────────────────
            'Mercedes-Benz' => [
                'Classe A', 'Classe B', 'Classe C', 'Classe C Estate',
                'Classe E', 'Classe E Estate', 'Classe S', 'CLA', 'CLS',
                'GLA', 'GLB', 'GLC', 'GLC Coupé', 'GLE', 'GLE Coupé', 'GLS',
                'Classe G', 'Classe V',
                'Sprinter', 'Vito', 'Citan',
                'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'EQV',
                'AMG GT', 'AMG GT 4 portes', 'Maybach',
            ],
            'BMW' => [
                'Série 1', 'Série 2', 'Série 2 Gran Coupé', 'Série 2 Active Tourer',
                'Série 3', 'Série 3 Touring', 'Série 4', 'Série 4 Gran Coupé',
                'Série 5', 'Série 5 Touring', 'Série 7', 'Série 8',
                'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'XM',
                'Z4', 'M2', 'M3', 'M4', 'M5', 'M8',
                'iX1', 'iX3', 'iX', 'i4', 'i5', 'i7',
            ],
            'Audi' => [
                'A1', 'A3', 'A3 Sportback', 'A4', 'A4 Avant', 'A5', 'A5 Sportback',
                'A6', 'A6 Avant', 'A7', 'A8',
                'Q2', 'Q3', 'Q3 Sportback', 'Q4 e-tron', 'Q5', 'Q5 Sportback',
                'Q7', 'Q8', 'Q8 e-tron',
                'e-tron GT', 'RS3', 'RS4', 'RS5', 'RS6', 'RS7',
                'TT', 'R8', 'S3', 'S4', 'S5',
            ],
            'Volvo' => [
                'XC40', 'XC60', 'XC90', 'C40 Recharge',
                'S60', 'S90', 'V60', 'V60 Cross Country', 'V90', 'V90 Cross Country',
                'EX30', 'EX90', 'EC40',
            ],
            'Jaguar' => [
                'XE', 'XF', 'XJ', 'F-Type',
                'E-Pace', 'F-Pace', 'I-Pace',
            ],
            'Land Rover' => [
                'Defender', 'Defender 90', 'Defender 110', 'Defender 130',
                'Discovery', 'Discovery Sport',
                'Range Rover', 'Range Rover Sport', 'Range Rover Velar',
                'Range Rover Evoque',
            ],
            'Porsche' => [
                'Cayenne', 'Cayenne Coupé', 'Macan',
                '911', '718 Boxster', '718 Cayman',
                'Panamera', 'Taycan', 'Taycan Cross Turismo',
            ],
            'Lexus' => [
                'CT', 'IS', 'ES', 'LS', 'LC',
                'UX', 'NX', 'RX', 'GX', 'LX',
                'RZ',
            ],
            'Infiniti' => [
                'Q30', 'Q50', 'Q60', 'Q70',
                'QX30', 'QX50', 'QX55', 'QX60', 'QX80',
            ],

            // ── Marques généralistes européennes ─────────────────────────────
            'Fiat' => [
                'Panda', 'Punto', 'Tipo', 'Tipo Cross', 'Tipo Station Wagon',
                '500', '500X', '500L', '500e',
                'Doblo', 'Fiorino', 'Ducato', 'Scudo', 'Ulysse',
                'Fullback', 'Toro',
            ],
            'Seat' => [
                'Ibiza', 'Leon', 'Leon Sportstourer', 'Arona', 'Ateca',
                'Tarraco', 'Mii', 'Toledo', 'Alhambra',
            ],
            'Cupra' => [
                'Formentor', 'Leon', 'Leon Sportstourer', 'Born',
                'Ateca', 'Tavascan', 'Terramar',
            ],
            'Skoda' => [
                'Fabia', 'Fabia Combi', 'Rapid', 'Scala', 'Octavia', 'Octavia Combi',
                'Superb', 'Superb Combi',
                'Kamiq', 'Karoq', 'Kodiaq',
                'Enyaq', 'Enyaq Coupé',
            ],
            'Opel' => [
                'Corsa', 'Corsa-e', 'Astra', 'Astra Sports Tourer', 'Insignia',
                'Crossland', 'Mokka', 'Mokka-e', 'Grandland',
                'Combo', 'Combo Life', 'Vivaro', 'Movano', 'Zafira Life',
                'Rocks-e',
            ],
            'Alfa Romeo' => [
                'Giulietta', 'Giulia', 'Stelvio', 'Tonale',
                '4C', 'Junior',
            ],
            'DS Automobiles' => [
                'DS 3', 'DS 3 Crossback', 'DS 4', 'DS 7', 'DS 9',
            ],
            'Mini' => [
                'Cooper', 'Cooper S', 'Cooper SE', 'Clubman',
                'Countryman', 'Countryman SE', 'Paceman',
                'John Cooper Works',
            ],
            'Smart' => [
                'ForTwo', 'ForFour', '#1', '#3',
            ],

            // ── Marques japonaises ───────────────────────────────────────────
            'Suzuki' => [
                'Alto', 'Celerio', 'Swift', 'Baleno', 'Ciaz', 'Dzire',
                'Ignis', 'Vitara', 'S-Cross', 'Jimny', 'Grand Vitara',
                'Ertiga', 'XL7', 'Carry',
            ],
            'Mitsubishi' => [
                'Space Star', 'Colt', 'Lancer', 'ASX',
                'Eclipse Cross', 'Outlander', 'Pajero', 'Pajero Sport',
                'L200', 'Triton', 'Xpander',
            ],
            'Honda' => [
                'Jazz', 'Civic', 'Civic Type R', 'Accord', 'City',
                'HR-V', 'CR-V', 'ZR-V',
                'e:Ny1', 'Honda e',
            ],
            'Mazda' => [
                'Mazda2', 'Mazda3', 'Mazda6',
                'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-80',
                'MX-5', 'MX-30',
            ],
            'Subaru' => [
                'Impreza', 'XV', 'Crosstrek', 'Legacy', 'Outback',
                'Forester', 'Solterra', 'WRX', 'BRZ', 'Levorg',
            ],
            'Isuzu' => [
                'D-Max', 'MU-X',
            ],

            // ── Marques coréennes ────────────────────────────────────────────
            'SsangYong' => [
                'Tivoli', 'Korando', 'Rexton', 'Musso',
                'Torres', 'Actyon',
            ],
            'Genesis' => [
                'G70', 'G80', 'G90',
                'GV60', 'GV70', 'GV80',
            ],

            // ── Marques américaines ──────────────────────────────────────────
            'Chevrolet' => [
                'Spark', 'Aveo', 'Cruze', 'Malibu', 'Camaro',
                'Trax', 'Equinox', 'Blazer', 'Traverse', 'Tahoe', 'Suburban',
                'Captiva', 'Orlando',
                'Colorado', 'Silverado',
                'Bolt EV', 'Bolt EUV',
            ],
            'Jeep' => [
                'Renegade', 'Compass', 'Cherokee', 'Grand Cherokee',
                'Grand Cherokee L', 'Wrangler', 'Gladiator',
                'Avenger', 'Commander',
            ],
            'Dodge' => [
                'Challenger', 'Charger', 'Durango', 'Journey',
                'Ram 1500', 'Ram 2500',
            ],
            'Chrysler' => [
                '300', 'Pacifica', 'Voyager',
            ],
            'Cadillac' => [
                'CT4', 'CT5', 'Escalade', 'XT4', 'XT5', 'XT6', 'Lyriq',
            ],
            'GMC' => [
                'Sierra', 'Canyon', 'Yukon', 'Acadia', 'Terrain', 'Hummer EV',
            ],
            'Lincoln' => [
                'Corsair', 'Nautilus', 'Aviator', 'Navigator',
            ],
            'Tesla' => [
                'Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck',
            ],

            // ── Marques chinoises (présentes au Maroc) ───────────────────────
            'DFSK' => [
                'Glory 330', 'Glory 560', 'Glory 580', 'Glory 500',
                'K01', 'K02', 'K05', 'K07',
                'EC31', 'EC35', 'EC71',
                'Seres 3',
            ],
            'Chery' => [
                'QQ', 'Arrizo 5', 'Arrizo 6', 'Arrizo 7', 'Arrizo 8',
                'Tiggo 2', 'Tiggo 3', 'Tiggo 4', 'Tiggo 5x',
                'Tiggo 7', 'Tiggo 8', 'Tiggo 8 Pro',
                'Omoda 5', 'Omoda C5', 'Jaecoo J7',
            ],
            'MG' => [
                'MG3', 'MG4', 'MG5', 'MG6', 'MG7',
                'ZS', 'ZS EV', 'HS', 'Marvel R',
                'Cyberster', 'MG One', 'VS',
            ],
            'BYD' => [
                'Dolphin', 'Seal', 'Han', 'Tang',
                'Atto 3', 'Song Plus', 'Yuan Plus',
                'Seal U', 'Frigate 7',
            ],
            'Geely' => [
                'Coolray', 'Azkarra', 'Okavango', 'Emgrand',
                'Monjaro', 'Atlas', 'Tugella',
            ],
            'Changan' => [
                'Alsvin', 'Eado', 'Uni-T', 'Uni-K', 'Uni-V',
                'CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'CS85',
                'Hunter', 'Deepal S07',
            ],
            'Great Wall' => [
                'Wingle 5', 'Wingle 7', 'Poer',
                'Haval H2', 'Haval H6', 'Haval H9',
                'Haval Jolion', 'Haval Dargo',
                'Tank 300', 'Tank 500',
                'Ora Good Cat',
            ],
            'JAC' => [
                'S2', 'S3', 'S4', 'S7',
                'J7', 'T6', 'T8', 'X200',
                'e-JS1', 'iEV7S',
            ],
            'Maxus' => [
                'T60', 'T90', 'D90',
                'Deliver 3', 'Deliver 9',
                'Euniq 5', 'Euniq 6', 'Mifa 9',
            ],
            'Haval' => [
                'H2', 'H6', 'H9', 'Jolion', 'Dargo',
                'Big Dog', 'Raptor',
            ],
            'Dongfeng' => [
                'AX7', 'AX4', 'Rich 6', 'Rich Pick-up',
                'Shine Max', 'Aeolus',
                'E70', 'Box',
            ],

            // ── Marques italiennes sport/luxe ────────────────────────────────
            'Maserati' => [
                'Ghibli', 'Quattroporte', 'MC20',
                'Grecale', 'Levante', 'GranTurismo', 'GranCabrio',
            ],
            'Ferrari' => [
                'Roma', 'Portofino M', '296 GTB', '296 GTS',
                'F8 Tributo', 'F8 Spider', 'SF90 Stradale',
                '812 Superfast', '812 GTS', 'Purosangue',
            ],
            'Lamborghini' => [
                'Huracán', 'Huracán Spyder', 'Urus', 'Revuelto',
            ],
            'Bentley' => [
                'Continental GT', 'Continental GTC', 'Flying Spur', 'Bentayga',
            ],
            'Rolls-Royce' => [
                'Ghost', 'Wraith', 'Dawn', 'Phantom', 'Cullinan', 'Spectre',
            ],
            'Aston Martin' => [
                'Vantage', 'DB11', 'DB12', 'DBS', 'DBX', 'Valkyrie',
            ],
            'McLaren' => [
                '540C', '570S', '600LT', '720S', '750S',
                'GT', 'Artura',
            ],

            // ── Autres marques présentes au Maroc ────────────────────────────
            'Mahindra' => [
                'KUV100', 'XUV300', 'XUV500', 'XUV700',
                'Scorpio', 'Thar', 'Bolero', 'Pik-Up',
            ],
            'Tata' => [
                'Nexon', 'Harrier', 'Safari', 'Punch',
                'Tigor', 'Tiago',
            ],
            'Proton' => [
                'Saga', 'X50', 'X70',
            ],
            'Peugeot Professional' => [
                'Partner Van', 'Expert Van', 'Boxer Van',
                'Landtrek', 'e-Partner', 'e-Expert',
            ],
            'Iveco' => [
                'Daily', 'Eurocargo', 'S-Way',
            ],
            'Man' => [
                'TGE', 'TGL', 'TGM', 'TGS', 'TGX',
            ],
            'Renault Trucks' => [
                'Master Red Edition', 'D', 'D Wide', 'C', 'K', 'T', 'T High',
            ],
        ];

        foreach ($catalog as $brandName => $models) {
            $brand = VehicleBrand::firstOrCreate(['name' => $brandName]);
            foreach ($models as $modelName) {
                VehicleModel::firstOrCreate(['brand_id' => $brand->id, 'name' => $modelName]);
            }
        }
    }
}
