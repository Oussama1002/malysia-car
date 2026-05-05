<?php

namespace App\Http\Requests\Api\V1\Users;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $id = $this->route('user');

        return [
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($id)],
            'password' => ['sometimes', 'nullable', 'string', 'min:8', 'max:72'],
            'first_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'role' => ['sometimes', 'nullable', 'string', 'max:50'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
            'branch_ids' => ['sometimes', 'array'],
            'branch_ids.*' => ['uuid', 'exists:branches,id'],
            'primary_branch_id' => ['sometimes', 'nullable', 'uuid', 'exists:branches,id'],
            'locale' => ['sometimes', 'string', 'in:fr,en,ar'],
            'status' => ['sometimes', 'string', 'in:active,inactive,suspended'],
            'avatar' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
