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
            'Dacia'      => ['Logan', 'Sandero', 'Duster', 'Dokker', 'Lodgy', 'Spring'],
            'Renault'    => ['Clio', 'Symbol', 'Megane', 'Kadjar', 'Captur', 'Kangoo', 'Trafic'],
            'Peugeot'    => ['208', '301', '308', '2008', '3008', '5008', 'Partner', 'Expert'],
            'Citroën'    => ['C3', 'C4', 'C5', 'Berlingo', 'Jumpy', 'Jumper'],
            'Volkswagen' => ['Polo', 'Golf', 'Passat', 'Tiguan', 'T-Roc', 'Caddy', 'Transporter'],
            'Ford'       => ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'EcoSport', 'Transit'],
            'Hyundai'    => ['i10', 'i20', 'i30', 'Tucson', 'Santa Fe', 'H-1'],
            'Kia'        => ['Picanto', 'Rio', 'Ceed', 'Sportage', 'Sorento'],
            'Toyota'     => ['Yaris', 'Corolla', 'Camry', 'RAV4', 'Land Cruiser', 'Hilux'],
            'Suzuki'     => ['Swift', 'Vitara', 'S-Cross', 'Jimny', 'Alto'],
            'Fiat'       => ['Punto', 'Tipo', '500', 'Doblo', 'Ducato'],
            'Seat'       => ['Ibiza', 'Leon', 'Arona', 'Ateca'],
            'Skoda'      => ['Fabia', 'Octavia', 'Rapid', 'Karoq', 'Kodiaq'],
            'Opel'       => ['Corsa', 'Astra', 'Insignia', 'Crossland', 'Mokka', 'Vivaro'],
            'Mercedes'   => ['Classe A', 'Classe C', 'Classe E', 'GLA', 'GLC', 'Sprinter', 'Vito'],
            'BMW'        => ['Série 1', 'Série 3', 'Série 5', 'X1', 'X3', 'X5'],
            'Audi'       => ['A1', 'A3', 'A4', 'A6', 'Q2', 'Q3', 'Q5'],
            'Nissan'     => ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Navara'],
            'Mitsubishi' => ['Colt', 'ASX', 'Eclipse Cross', 'Outlander', 'L200'],
            'Chevrolet'  => ['Spark', 'Aveo', 'Cruze', 'Captiva', 'Orlando'],
        ];

        foreach ($catalog as $brandName => $models) {
            $brand = VehicleBrand::firstOrCreate(['name' => $brandName]);
            foreach ($models as $modelName) {
                VehicleModel::firstOrCreate(['brand_id' => $brand->id, 'name' => $modelName]);
            }
        }
    }
}
