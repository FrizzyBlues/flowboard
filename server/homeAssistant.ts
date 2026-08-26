import type { HomeAssistantState } from '../shared/types.js';

export class HomeAssistantClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Home Assistant ${response.status} ${response.statusText}: ${body.slice(0, 250)}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  listStates(): Promise<HomeAssistantState[]> {
    return this.request<HomeAssistantState[]>('/api/states');
  }

  getState(entityId: string): Promise<HomeAssistantState> {
    return this.request<HomeAssistantState>(`/api/states/${encodeURIComponent(entityId)}`);
  }

  callSwitch(entityId: string, action: 'open' | 'close') {
    const service = action === 'open' ? 'turn_on' : 'turn_off';
    return this.request<HomeAssistantState[]>(`/api/services/switch/${service}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    });
  }

  setNumber(entityId: string, value: number) {
    return this.request<HomeAssistantState[]>('/api/services/number/set_value', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, value }),
    });
  }
}
