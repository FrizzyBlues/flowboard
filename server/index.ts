import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVentCatalog, isNumberInRange } from './ventDiscovery.js';
import { loadFlowboardConfig } from './config.js';
import { HomeAssistantClient } from './homeAssistant.js';
import { createMockStates } from './mockData.js';
import type { CalibrationRequest, HomeAssistantState, VentActionRequest, VentsResponse } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const port = Number(process.env.PORT ?? 8788);
const mockMode = ['1', 'true', 'yes', 'mock'].includes(String(process.env.MOCK_HASS ?? process.env.MOCK_HA ?? process.env.APP_MODE ?? '').toLowerCase());
const hassUrl = process.env.HASS_URL ?? process.env.HA_URL ?? process.env.HOME_ASSISTANT_URL;
const hassToken = process.env.HASS_TOKEN ?? process.env.HA_TOKEN ?? process.env.HOME_ASSISTANT_TOKEN;
const flowboardConfig = loadFlowboardConfig();
let mockStateStore = createMockStates();

function getClient(): HomeAssistantClient | null {
  if (mockMode) return null;
  if (!hassUrl || !hassToken) return null;
  return new HomeAssistantClient(hassUrl, hassToken);
}

function modeFor(client: HomeAssistantClient | null): 'live' | 'mock' {
  return client ? 'live' : 'mock';
}

function validateEntity(entityId: string, domain: 'switch' | 'number') {
  if (typeof entityId !== 'string' || !entityId.startsWith(`${domain}.`) || !entityId.includes('_vent_')) {
    throw new Error(`Invalid ${domain} vent entity.`);
  }
}

function requireMutableSwitch(dashboard: VentsResponse, entityId: string) {
  const vent = dashboard.vents.find((item) => item.switchEntityId === entityId);
  if (!vent) throw new Error('Switch vent entity was not discovered in the current dashboard.');
  if (!vent.available) throw new Error('Switch vent entity is unavailable and cannot be mutated.');
  return vent;
}

function requireMutableCalibration(dashboard: VentsResponse, states: HomeAssistantState[], entityId: string) {
  const vent = dashboard.vents.find((item) => item.openPositionEntityId === entityId || item.closedPositionEntityId === entityId);
  if (!vent) throw new Error('Calibration entity is not attached to a discovered vent.');
  if (!vent.available) throw new Error('Calibration entity is attached to an unavailable vent.');

  const state = states.find((item) => item.entity_id === entityId);
  if (!state || state.state === 'unavailable' || state.state === 'unknown' || !Number.isFinite(Number(state.state))) {
    throw new Error('Calibration entity state is unavailable.');
  }

  const min = state.attributes?.min;
  const max = state.attributes?.max;
  if (typeof min !== 'number' || !Number.isFinite(min) || typeof max !== 'number' || !Number.isFinite(max)) {
    throw new Error('Calibration entity bounds are unavailable.');
  }

  return { vent, bounds: { min, max } };
}

async function readDashboard(client = getClient()): Promise<VentsResponse> {
  const states = client ? await client.listStates() : mockStateStore;
  return buildVentCatalog(states, {
    mode: modeFor(client),
    connected: Boolean(client) || mockMode,
    roomSensorSources: flowboardConfig.roomSensorSources,
  });
}

function updateMockSwitch(entityId: string, action: 'open' | 'close') {
  mockStateStore = mockStateStore.map((state) =>
    state.entity_id === entityId
      ? { ...state, state: action === 'open' ? 'on' : 'off', last_updated: new Date().toISOString() }
      : state,
  );
}

function updateMockNumber(entityId: string, value: number) {
  mockStateStore = mockStateStore.map((state) =>
    state.entity_id === entityId ? { ...state, state: value.toFixed(2), last_updated: new Date().toISOString() } : state,
  );
}

app.get('/api/health', (_req, res) => {
  const client = getClient();
  res.json({ ok: true, mode: modeFor(client), hassConfigured: Boolean(hassUrl && hassToken), mockMode });
});

app.get('/api/vents', async (_req, res, next) => {
  try {
    res.json(await readDashboard());
  } catch (error) {
    next(error);
  }
});

app.post('/api/vents/action', async (req, res, next) => {
  try {
    const body = req.body as VentActionRequest;
    validateEntity(body.entityId, 'switch');
    if (body.action !== 'open' && body.action !== 'close') throw new Error('action must be open or close');

    const client = getClient();
    const dashboard = await readDashboard(client);
    requireMutableSwitch(dashboard, body.entityId);
    if (client) {
      await client.callSwitch(body.entityId, body.action);
    } else {
      updateMockSwitch(body.entityId, body.action);
    }

    res.json({ ok: true, ...(await readDashboard(client)) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/vents/calibration', async (req, res, next) => {
  try {
    const body = req.body as CalibrationRequest;
    validateEntity(body.entityId, 'number');
    if (!Number.isFinite(body.value)) throw new Error('value must be numeric');

    const client = getClient();
    const states = client ? await client.listStates() : mockStateStore;
    const dashboard = buildVentCatalog(states, {
      mode: modeFor(client),
      connected: Boolean(client) || mockMode,
      roomSensorSources: flowboardConfig.roomSensorSources,
    });
    const { bounds } = requireMutableCalibration(dashboard, states, body.entityId);
    if (!isNumberInRange(body.value, bounds.min, bounds.max)) {
      throw new Error(`value must be between ${bounds.min} and ${bounds.max}`);
    }

    if (client) {
      await client.setNumber(body.entityId, body.value);
    } else {
      updateMockNumber(body.entityId, body.value);
    }

    res.json({ ok: true, ...(await readDashboard(client)) });
  } catch (error) {
    next(error);
  }
});

const staticDir = path.resolve(__dirname, '../../dist');
app.use(express.static(staticDir));
app.use((_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  console.error(error.message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]'));
  res.status(400).json({ error: error.message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]') });
});

app.listen(port, '0.0.0.0', () => {
  const client = getClient();
  console.log(`AC Vent UI server listening on ${port} (${modeFor(client)} mode)`);
});
