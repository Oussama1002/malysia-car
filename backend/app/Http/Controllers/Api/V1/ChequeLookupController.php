<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Support\ChequeRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Is this cheque number already on record? Called while the operator types,
 * so the warning shows before the form is submitted — and whether the number
 * came from the scan or from the keyboard.
 */
class ChequeLookupController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'number' => ['required', 'string', 'max:60'],
            'bank' => ['nullable', 'string', 'max:160'],
        ]);

        $dup = ChequeRegistry::findDuplicate($data['number'], $data['bank'] ?? null);

        return ApiResponse::success([
            'duplicate' => $dup !== null,
            'message' => ChequeRegistry::duplicateMessage($data['number'], $data['bank'] ?? null),
            'label' => $dup['label'] ?? null,
            'reference' => $dup['reference'] ?? null,
        ]);
    }
}
