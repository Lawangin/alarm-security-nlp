import type { HealthzData, NlResponse, ApiError } from '../types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok || json.success === false) {
    const err = json as ApiError;
    throw new Error(err.error?.message ?? `Request failed: ${res.status}`);
  }
  return json as T;
}

export async function executeCommand(text: string): Promise<NlResponse> {
  return request<NlResponse>('/nl/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export async function fetchHealth(): Promise<HealthzData> {
  const json = await request<{ success: true; data: HealthzData }>('/healthz');
  return json.data;
}
