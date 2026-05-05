/**
 * Adapter contract for real REST calls via `apiClient`.
 * Map DTOs in a dedicated mapper layer per module when backend lands.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
