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

/** One Vent as returned by the Vent Catalog. */
export interface VentDevice {
  /** Catalog key shared by the switch and its calibration numbers (`study_room_vent_1`). */
  id: string;
  displayName: string;
  /** Room id; also the key used in Room Sensor Source mappings. */
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
  /** Optional silent companion switch; the board does not use it. */
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
  /**
   * Climate for this Vent's Room after Room Sensor Source remapping.
   * Omitted when no sensors match; present with null channels when some match.
   */
  sensors?: RoomSensors;
}

export interface VentRoom {
  /** Same id as {@link VentDevice.roomId}. */
  id: string;
  name: string;
  vents: VentDevice[];
}

export interface VentDiagnostics {
  discoveredSwitches: number;
  discoveredVents: number;
  missingCalibrationEntities: Array<{ ventId: string; missing: Array<'openPosition' | 'closedPosition'> }>;
  /** Reserved; the Vent Catalog currently always returns an empty list. */
  ambiguousEntities: string[];
  /** Calibration numbers that did not pair with a discovered Vent. */
  ungroupedEntities: string[];
}

/** Dashboard payload produced by the Vent Catalog. */
export interface VentsResponse {
  mode: 'live' | 'mock';
  connected: boolean;
  /** Same timestamp as {@link VentsResponse.updatedAt}. */
  generatedAt: string;
  updatedAt: string;
  /** The same Vent devices as {@link VentsResponse.vents}, grouped by Room. */
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

/** Climate readings for a Room (possibly a Room Sensor Source). */
export interface RoomSensors {
  temperature: number | null;
  temperatureUnit?: string;
  temperatureEntityId?: string;
  humidity: number | null;
  humidityEntityId?: string;
  battery: number | null;
  batteryEntityId?: string;
}
