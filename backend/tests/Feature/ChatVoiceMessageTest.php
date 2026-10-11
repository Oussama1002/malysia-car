<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Un message vocal se lit dans la conversation : il doit revenir marqué comme
 * audio, avec sa durée, sinon il s'affiche comme une pièce jointe muette.
 */
class ChatVoiceMessageTest extends TestCase
{
    use RefreshDatabase;

    private string $companyId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->companyId = (string) Str::uuid();
        DB::table('companies')->insert([
            'id' => $this->companyId, 'legal_name' => 'DriveFlow Test',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
    }

    private function makeUser(string $name): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => $name,
            'email' => Str::slug($name).'.'.Str::random(5).'@test.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
            'company_id' => $this->companyId,
        ]);
    }

    public function test_a_voice_message_comes_back_as_audio_with_its_duration(): void
    {
        $me = $this->makeUser('Agent Un');
        $peer = $this->makeUser('Agent Deux');

        $res = $this->actingAs($me, 'sanctum')->post('/api/v1/chat/messages', [
            'recipient_id' => $peer->id,
            'file' => UploadedFile::fake()->create('message-vocal.webm', 40, 'audio/webm'),
            'duration' => 12,
        ]);

        $res->assertStatus(201);
        $this->assertTrue($res->json('data.attachment.is_audio'));
        $this->assertFalse($res->json('data.attachment.is_image'));
        $this->assertSame(12, $res->json('data.attachment.duration'));
    }

    public function test_a_document_is_not_mistaken_for_a_voice_message(): void
    {
        $me = $this->makeUser('Agent Trois');
        $peer = $this->makeUser('Agent Quatre');

        $res = $this->actingAs($me, 'sanctum')->post('/api/v1/chat/messages', [
            'recipient_id' => $peer->id,
            'file' => UploadedFile::fake()->create('contrat.pdf', 20, 'application/pdf'),
        ]);

        $res->assertStatus(201);
        $this->assertFalse($res->json('data.attachment.is_audio'));
        $this->assertNull($res->json('data.attachment.duration'));
    }

    public function test_an_absurd_duration_is_refused(): void
    {
        $me = $this->makeUser('Agent Cinq');
        $peer = $this->makeUser('Agent Six');

        $this->actingAs($me, 'sanctum')->postJson('/api/v1/chat/messages', [
            'recipient_id' => $peer->id,
            'body' => 'test',
            'duration' => 99999,
        ])->assertStatus(422);
    }
}
