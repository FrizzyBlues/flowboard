import type { CalibrationRequest, VentActionRequest, VentsResponse } from '../shared/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchVents() {
  return request<VentsResponse>('/api/vents');
}

export function setVentAction(payload: VentActionRequest) {
  return request<VentsResponse>('/api/vents/action', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setCalibration(payload: CalibrationRequest) {
  return request<VentsResponse>('/api/vents/calibration', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
