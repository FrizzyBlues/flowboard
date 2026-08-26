import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SERVER_START_TIMEOUT_MS = 10_000;

let server: ChildProcessWithoutNullStreams | undefined;
let baseUrl = '';

async function waitForHealth(url: string) {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Server did not become healthy: ${String(lastError)}`);
}

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

beforeEach(async () => {
  const port = 19_000 + (process.pid % 1_000) + Math.floor(Math.random() * 1_000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn('node_modules/.bin/tsx', ['server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, MOCK_HASS: 'true', PORT: String(port), HASS_URL: '', HASS_TOKEN: '' },
  });
  await waitForHealth(baseUrl);
});

afterEach(async () => {
  if (!server) return;
  const child = server;
  server = undefined;
  if (child.exitCode === null && !child.killed) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
});

describe('AC vent mutation safety', () => {
  it('rejects a switch entity that was not discovered in the current dashboard', async () => {
    const { response, payload } = await post('/api/vents/action', {
      entityId: 'switch.not_discovered_vent_switch',
      action: 'open',
    });

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/not discovered/i);
  });

  it('rejects actions for unavailable discovered switches', async () => {
    const { response, payload } = await post('/api/vents/action', {
      entityId: 'switch.office_room_vent_1_vent_switch',
      action: 'open',
    });

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/unavailable/i);

    const vents = await fetch(`${baseUrl}/api/vents`).then((response) => response.json());
    expect(vents.unavailableCount).toBe(1);
    expect(vents.vents.find((vent: { id: string }) => vent.id === 'office_room_vent_1')).toMatchObject({
      available: false,
      state: 'unavailable',
    });
  });

  it('rejects calibration entities that are not attached to a current discovered vent', async () => {
    const { response, payload } = await post('/api/vents/calibration', {
      entityId: 'number.not_discovered_vent_1_set_open_position',
      value: 0,
    });

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/not discovered|not attached/i);
  });

  it('rejects calibration for unavailable vents instead of defaulting bounds', async () => {
    const { response, payload } = await post('/api/vents/calibration', {
      entityId: 'number.office_room_vent_1_set_open_position',
      value: 0,
    });

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/unavailable/i);
  });

  it('allows a discovered available mock vent action', async () => {
    const { response, payload } = await post('/api/vents/action', {
      entityId: 'switch.study_room_vent_1_vent_switch',
      action: 'close',
    });

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.vents.find((vent: { id: string }) => vent.id === 'study_room_vent_1')).toMatchObject({
      state: 'closed',
      available: true,
    });
  });
});
