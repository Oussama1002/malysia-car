
# Documentation Backend Laravel DriveFlow

Cette application utilise une API REST standard. Voici les structures clés pour implémenter le backend Laravel.

## 1. Migrations (Exemple Reservation)

```php
Schema::create('reservations', function (Blueprint $table) {
    $table->id();
    $table->foreignId('client_id')->constrained()->onDelete('cascade');
    $table->foreignId('vehicle_id')->constrained()->onDelete('cascade');
    $table->date('start_date');
    $table->date('end_date');
    $table->decimal('total_price', 10, 2);
    $table->enum('status', ['PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED'])->default('PENDING');
    $table->timestamps();
});
```

## 2. Models & Relations

```php
// Reservation.php
public function client() {
    return $this->belongsTo(Client::class);
}

public function vehicle() {
    return $this->belongsTo(Vehicle::class);
}
```

## 3. Controller API (ReservationController)

```php
public function store(Request $request) {
    $validated = $request->validate([
        'client_id' => 'required|exists:clients,id',
        'vehicle_id' => 'required|exists:vehicles,id',
        'start_date' => 'required|date',
        'end_date' => 'required|date|after:start_date',
    ]);

    $vehicle = Vehicle::findOrFail($request->vehicle_id);
    
    // Calcul automatique
    $days = Carbon::parse($request->start_date)->diffInDays(Carbon::parse($request->end_date));
    $total = $days * $vehicle->price_per_day;

    $reservation = Reservation::create(array_merge($validated, ['total_price' => $total]));

    // Update vehicle status
    $vehicle->update(['status' => 'RENTED']);

    return response()->json($reservation, 201);
}
```

## 4. Routes (routes/api.php)

```php
Route::group(['middleware' => 'auth:api'], function () {
    Route::apiResource('clients', ClientController::class);
    Route::apiResource('vehicles', VehicleController::class);
    Route::apiResource('reservations', ReservationController::class);
    Route::get('dashboard/stats', [DashboardController::class, 'getStats']);
});
```

## 5. Authentification JWT (config/auth.php)
Utilisez `tymon/jwt-auth` pour gérer les tokens. Les rôles peuvent être gérés via un Middleware custom `RoleMiddleware`.
