import type {
  EntityRef,
  HomeAssistantState,
  NumberEntityRef,
  RoomSensors,
  VentDevice,
  VentDiagnostics,
  VentRoom,
  VentsResponse,
  VentState,
} from '../shared/types.js';

const SWITCH_RE = /^switch\.(.+)_vent_switch$/;
const SILENT_SWITCH_RE = /^switch\.(.+)_vent_switch_silent$/;
const OPEN_RE = /^number\.(.+)_set_open_position$/;
const CLOSED_RE = /^number\.(.+)_set_closed_position$/;
const DEFAULT_MIN = -1;
const DEFAULT_MAX = 1;
const DEFAULT_STEP = 0.01;

export interface VentCatalogOptions {
  mode: 'live' | 'mock';
  updatedAt?: string;
  connected?: boolean;
  roomSensorSources?: Record<string, string>;
}

function titleCase(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function splitBaseKey(key: string): { roomId: string; roomName: string; ventName: string; displayName: string } {
  const tokens = key.split('_').filter(Boolean);
  const lastVentIndex = tokens.lastIndexOf('vent');
  if (lastVentIndex > 0) {
    const roomId = tokens.slice(0, lastVentIndex).join('_');
    const ventName = titleCase(tokens.slice(lastVentIndex).join('_'));
    const roomName = titleCase(roomId);
    return { roomId, roomName, ventName, displayName: `${roomName} ${ventName}` };
  }

  return { roomId: 'ungrouped', roomName: 'Ungrouped', ventName: titleCase(key), displayName: titleCase(key) };
}

function parseNumber(state: HomeAssistantState | undefined): number | null {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return null;
  const value = Number(state.state);
  return Number.isFinite(value) ? value : null;
}

function readNumberAttribute(state: HomeAssistantState | undefined, name: 'min' | 'max' | 'step'): number | null {
  const value = state?.attributes?.[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function friendlyName(state: HomeAssistantState | undefined): string | undefined {
  return state?.attributes?.friendly_name;
}

function entityRef(state: HomeAssistantState): EntityRef {
  return {
    entityId: state.entity_id,
    state: state.state,
    friendlyName: friendlyName(state),
    lastChanged: state.last_changed,
    lastUpdated: state.last_updated,
  };
}

function numberRef(state: HomeAssistantState): NumberEntityRef {
  return {
    ...entityRef(state),
    value: parseNumber(state),
    min: readNumberAttribute(state, 'min') ?? DEFAULT_MIN,
    max: readNumberAttribute(state, 'max') ?? DEFAULT_MAX,
    step: readNumberAttribute(state, 'step') ?? DEFAULT_STEP,
    unit: state.attributes?.unit_of_measurement,
  };
}

function deriveVentState(raw: string): VentState {
  if (raw === 'unavailable') return 'unavailable';
  if (raw === 'unknown') return 'unknown';
  if (raw === 'on') return 'open';
  if (raw === 'off') return 'closed';
  return 'unknown';
}

function fallbackNumber(key: string, states: HomeAssistantState[], kind: 'open' | 'closed'): HomeAssistantState | undefined {
  const suffix = kind === 'open' ? '_set_open_position' : '_set_closed_position';
  const candidates = states.filter((state) => {
    const objectId = state.entity_id.startsWith('number.') ? state.entity_id.slice('number.'.length) : '';
    return objectId.startsWith(`${key}_`) && objectId.endsWith(suffix);
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

/* ===== Room climate sensors =====
   Matches sensor.<room-slug>_temperature / _humidity / _battery (exact, unambiguous),
   then falls back to friendly-name matching ("Study Room Temperature").
   One sensor per room is shared across every vent card in that room. */
function slugToNameVariants(roomId: string): string[] {
  const spaced = roomId.replace(/_/g, ' ');
  return [spaced, spaced.replace(/\b\w/g, (c) => c.toUpperCase())];
}

function discoverRoomSensors(states: HomeAssistantState[], roomId: string): RoomSensors | undefined {
  const variants = slugToNameVariants(roomId);
  const sensors = states.filter((s) => s.entity_id.startsWith('sensor.'));

  const findOne = (patterns: Array<(s: HomeAssistantState) => boolean>): HomeAssistantState | undefined => {
    for (const predicate of patterns) {
      const matches = sensors.filter(predicate);
      if (matches.length === 1) return matches[0];
    }
    return undefined;
  };

  const temp = findOne([
    (s) => s.entity_id === `sensor.${roomId}_temperature`,
    (s) => s.entity_id.endsWith(`_${roomId}_temperature`) || s.entity_id.includes(`${roomId}_temperature`),
    (s) => {
      const fn = String(s.attributes?.friendly_name ?? '').toLowerCase();
      return s.attributes?.device_class === 'temperature' && variants.some((v) => fn.includes(v.toLowerCase()));
    },
  ]);
  const hum = findOne([
    (s) => s.entity_id === `sensor.${roomId}_humidity`,
    (s) => s.entity_id.endsWith(`_${roomId}_humidity`) || s.entity_id.includes(`${roomId}_humidity`),
    (s) => {
      const fn = String(s.attributes?.friendly_name ?? '').toLowerCase();
      return s.attributes?.device_class === 'humidity' && variants.some((v) => fn.includes(v.toLowerCase()));
    },
  ]);
  const batt = findOne([
    (s) => s.entity_id === `sensor.${roomId}_battery`,
    (s) => s.entity_id.endsWith(`_${roomId}_battery`) || s.entity_id.includes(`${roomId}_battery`),
    // same-device preference: if temp/hum came from <prefix>_temperature / _humidity,
    // look for <prefix>_battery (e.g. study_room_temperature_and_humidity_sensor_battery)
    ...(temp || hum
      ? [(s: HomeAssistantState) => {
          const src = temp?.entity_id ?? hum!.entity_id;
          const prefix = src.replace(/_(temperature|humidity)$/, '');
          return s.entity_id === `${prefix}_battery`;
        }]
      : []),
    (s) => {
      const fn = String(s.attributes?.friendly_name ?? '').toLowerCase();
      return s.attributes?.device_class === 'battery' && variants.some((v) => fn.includes(v.toLowerCase()));
    },
  ]);

  const result: RoomSensors = {
    temperature: temp ? parseNumber(temp) : null,
    temperatureUnit: temp?.attributes?.unit_of_measurement,
    temperatureEntityId: temp?.entity_id,
    humidity: hum ? parseNumber(hum) : null,
    humidityEntityId: hum?.entity_id,
    battery: batt ? parseNumber(batt) : null,
    batteryEntityId: batt?.entity_id,
  };
  const hasAny = result.temperature !== null || result.humidity !== null || result.battery !== null;
  return hasAny ? result : undefined;
}

export function discoverVents(states: HomeAssistantState[]): VentDevice[] {
  return buildVentCatalog(states, { mode: 'mock' }).vents;
}

export function discoverVentDashboard(states: HomeAssistantState[], options: VentCatalogOptions): VentsResponse {
  return buildVentCatalog(states, options);
}

export function buildVentCatalog(states: HomeAssistantState[], options: VentCatalogOptions): VentsResponse {
  const byEntity = new Map(states.map((state) => [state.entity_id, state]));
  const switchKeys = new Map<string, HomeAssistantState>();
  const silentSwitches = new Map<string, HomeAssistantState>();
  const numberEntityIds = new Set<string>();

  for (const state of states) {
    const switchMatch = state.entity_id.match(SWITCH_RE);
    if (switchMatch) switchKeys.set(switchMatch[1], state);

    const silentMatch = state.entity_id.match(SILENT_SWITCH_RE);
    if (silentMatch) silentSwitches.set(silentMatch[1], state);

    if (state.entity_id.match(OPEN_RE) || state.entity_id.match(CLOSED_RE)) {
      numberEntityIds.add(state.entity_id);
    }
  }

  const missingCalibrationEntities: VentDiagnostics['missingCalibrationEntities'] = [];
  const groupedNumberEntities = new Set<string>();
  const roomSensorsById = new Map<string, RoomSensors | undefined>();

  const vents = [...switchKeys.entries()]
    .map(([key, switchState]) => {
      const exactOpenId = `number.${key}_set_open_position`;
      const exactClosedId = `number.${key}_set_closed_position`;
      const openState = byEntity.get(exactOpenId) ?? fallbackNumber(key, states, 'open');
      const closedState = byEntity.get(exactClosedId) ?? fallbackNumber(key, states, 'closed');
      if (openState) groupedNumberEntities.add(openState.entity_id);
      if (closedState) groupedNumberEntities.add(closedState.entity_id);

      const rawState = switchState.state;
      const state = deriveVentState(rawState);
      const labels = splitBaseKey(key);
      const missing: Array<'openPosition' | 'closedPosition'> = [];
      const warnings: string[] = [];
      if (!openState) missing.push('openPosition');
      if (!closedState) missing.push('closedPosition');
      if (missing.length > 0) {
        missingCalibrationEntities.push({ ventId: key, missing });
        warnings.push(`Missing calibration: ${missing.join(', ')}`);
      }
      if (state === 'unavailable') warnings.push('Home Assistant reports this vent as unavailable.');
      if (state === 'unknown') warnings.push('Current physical position is unknown.');

      const openRef = openState ? numberRef(openState) : undefined;
      const closedRef = closedState ? numberRef(closedState) : undefined;
      const minPosition = openRef?.min ?? closedRef?.min ?? DEFAULT_MIN;
      const maxPosition = openRef?.max ?? closedRef?.max ?? DEFAULT_MAX;
      const step = openRef?.step ?? closedRef?.step ?? DEFAULT_STEP;
      // Room sensors: discover once per sensor source room, share across all vents mapped to it.
      // Aliased rooms (e.g. kitchen -> hearth) resolve against their configured source room,
      // ignoring their own sensors entirely.
      const sensorSourceRoom = options.roomSensorSources?.[labels.roomId] ?? labels.roomId;
      if (!roomSensorsById.has(sensorSourceRoom)) {
        roomSensorsById.set(sensorSourceRoom, discoverRoomSensors(states, sensorSourceRoom));
      }
      const sensors = roomSensorsById.get(sensorSourceRoom);

      return {
        id: key,
        displayName: labels.displayName,
        roomId: labels.roomId,
        roomName: labels.roomName,
        ventName: labels.ventName,
        switchEntityId: switchState.entity_id,
        state,
        rawState,
        available: state !== 'unavailable',
        openPosition: openRef?.value ?? null,
        closedPosition: closedRef?.value ?? null,
        openPositionEntityId: openRef?.entityId,
        closedPositionEntityId: closedRef?.entityId,
        silentSwitchEntityId: silentSwitches.has(key) ? `switch.${key}_vent_switch_silent` : undefined,
        minPosition,
        maxPosition,
        step,
        entities: {
          switch: entityRef(switchState),
          ...(openRef ? { openPosition: openRef } : {}),
          ...(closedRef ? { closedPosition: closedRef } : {}),
        },
        warnings,
        lastUpdated: switchState.last_updated,
        ...(sensors ? { sensors } : {}),
      } satisfies VentDevice;
    })
    .sort((a, b) => compareNatural(a.roomName, b.roomName) || compareNatural(a.ventName, b.ventName));

  const roomsById = new Map<string, VentRoom>();
  for (const vent of vents) {
    const room = roomsById.get(vent.roomId) ?? { id: vent.roomId, name: vent.roomName, vents: [] };
    room.vents.push(vent);
    roomsById.set(room.id, room);
  }

  const rooms = [...roomsById.values()].sort((a, b) => {
    if (a.id === 'ungrouped') return 1;
    if (b.id === 'ungrouped') return -1;
    return compareNatural(a.name, b.name);
  });

  const ungroupedEntities = [...numberEntityIds].filter((entityId) => !groupedNumberEntities.has(entityId)).sort(compareNatural);
  const updatedAt = options.updatedAt ?? new Date().toISOString();

  return {
    mode: options.mode,
    connected: options.connected ?? options.mode === 'live',
    generatedAt: updatedAt,
    updatedAt,
    rooms,
    vents,
    unavailableCount: vents.filter((vent) => !vent.available).length,
    diagnostics: {
      discoveredSwitches: switchKeys.size,
      discoveredVents: vents.length,
      missingCalibrationEntities,
      ambiguousEntities: [],
      ungroupedEntities,
    },
  };
}

export function isNumberInRange(value: number, min = DEFAULT_MIN, max = DEFAULT_MAX): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}
