export type VentState = 'open' | 'closed' | 'unknown' | 'unavailable';

export interface HomeAssistantState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown> & {
    friendly_name?: string;
    unit_of_measurement?: string;
    min?: number;
    max?: number;
    step?: number;
    mode?: string;
  };
  last_changed?: string;
  last_updated?: string;
}

export interface EntityRef {
  entityId: string;
  state: string;
  friendlyName?: string;
  lastChanged?: string;
  lastUpdated?: string;
}

export interface NumberEntityRef extends EntityRef {
  value: number | null;
  min: number | null;
  max: number | null;
  step: number | null;
  unit?: string;
}

export interface VentDevice {
  id: string;
  displayName: string;
  roomId: string;
  roomName: string;
  ventName: string;
  switchEntityId: string;
  state: VentState;
  rawState: string;
  available: boolean;
  openPosition: number | null;
  closedPosition: number | null;
  openPositionEntityId?: string;
  closedPositionEntityId?: string;
  silentSwitchEntityId?: string;
  minPosition: number;
  maxPosition: number;
  step: number;
  entities: {
    switch: EntityRef;
    openPosition?: NumberEntityRef;
    closedPosition?: NumberEntityRef;
  };
  warnings: string[];
  lastUpdated?: string;
  /** Room-level climate sensors (shared across all vents in the room). */
  sensors?: RoomSensors;
}

export interface VentRoom {
  id: string;
  name: string;
  vents: VentDevice[];
}

export interface VentDiagnostics {
  discoveredSwitches: number;
  discoveredVents: number;
  missingCalibrationEntities: Array<{ ventId: string; missing: Array<'openPosition' | 'closedPosition'> }>;
  ambiguousEntities: string[];
  ungroupedEntities: string[];
}

export interface VentsResponse {
  mode: 'live' | 'mock';
  connected: boolean;
  generatedAt: string;
  updatedAt: string;
  rooms: VentRoom[];
  vents: VentDevice[];
  unavailableCount: number;
  diagnostics: VentDiagnostics;
}

export interface VentActionRequest {
  entityId: string;
  action: 'open' | 'close';
}

export interface CalibrationRequest {
  entityId: string;
  value: number;
}

export interface ApiMutationResponse {
  ok: true;
  mode: 'live' | 'mock';
  updatedAt: string;
  rooms: VentRoom[];
  vents: VentDevice[];
  diagnostics: VentDiagnostics;
}

export interface RoomSensors {
  temperature: number | null;
  temperatureUnit?: string;
  temperatureEntityId?: string;
  humidity: number | null;
  humidityEntityId?: string;
  battery: number | null;
  batteryEntityId?: string;
}
