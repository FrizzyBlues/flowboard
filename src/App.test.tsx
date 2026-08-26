import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { VentDevice, VentsResponse } from '../shared/types.js';

const studyVent: VentDevice = {
  id: 'study_room_vent_1', displayName: 'Study Room Vent 1', roomId: 'study_room', roomName: 'Study Room',
  ventName: 'Vent 1', switchEntityId: 'switch.study_room_vent_1_vent_switch', state: 'open', rawState: 'on',
  available: true, openPosition: -0.6, closedPosition: -0.15,
  openPositionEntityId: 'number.study_room_vent_1_set_open_position',
  closedPositionEntityId: 'number.study_room_vent_1_set_closed_position',
  minPosition: -1, maxPosition: 1, step: 0.01,
  entities: { switch: { entityId: 'switch.study_room_vent_1_vent_switch', state: 'on' } },
  warnings: [],
};
const officeVent: VentDevice = {
  id: 'office_room_vent_1', displayName: 'Office Room Vent 1', roomId: 'office_room', roomName: 'Office Room',
  ventName: 'Vent 1', switchEntityId: 'switch.office_room_vent_1_vent_switch', state: 'unavailable',
  rawState: 'unavailable', available: false, openPosition: null, closedPosition: null,
  minPosition: -1, maxPosition: 1, step: 0.01,
  entities: { switch: { entityId: 'switch.office_room_vent_1_vent_switch', state: 'unavailable' } },
  warnings: ['Home Assistant reports this vent as unavailable.'],
};
const greatRoomVent: VentDevice = {
  ...studyVent,
  id: 'great_room_vent_1', displayName: 'Great Room Vent 1', roomId: 'great_room', roomName: 'Great Room',
  switchEntityId: 'switch.great_room_vent_1_vent_switch', state: 'closed', rawState: 'off',
  openPositionEntityId: 'number.great_room_vent_1_set_open_position',
  closedPositionEntityId: 'number.great_room_vent_1_set_closed_position',
};

const dashboard: VentsResponse = {
  mode: 'mock', connected: true,
  generatedAt: '2026-08-25T12:00:00Z', updatedAt: '2026-08-25T12:00:00Z',
  unavailableCount: 1,
  diagnostics: { discoveredSwitches: 3, discoveredVents: 3, missingCalibrationEntities: [], ambiguousEntities: [], ungroupedEntities: [] },
  vents: [studyVent, officeVent, greatRoomVent],
  rooms: [
    { id: 'study_room', name: 'Study Room', vents: [studyVent] },
    { id: 'office_room', name: 'Office Room', vents: [officeVent] },
    { id: 'great_room', name: 'Great Room', vents: [greatRoomVent] },
  ],
};

function mockFetch(dashboardOverrides: Partial<VentsResponse> = {}) {
  const body = { ...dashboard, ...dashboardOverrides };
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/vents') return Response.json(body);
    if (String(input).startsWith('/api/vents/') && init?.method === 'POST') return Response.json({ ok: true, ...body });
    throw new Error(`unexpected fetch ${String(input)}`);
  });
}

// The room name renders on BOTH card faces (controls + calibration), so scope
// heading queries to the visible controls face.
const cardHeading = async (room: string) => {
  await screen.findAllByRole('heading', { name: new RegExp(room, 'i') });
  return screen.getAllByRole('heading', { name: new RegExp(room, 'i') })[0];
};
const cardHeadingQ = (room: string) => {
  const headings = screen.queryAllByRole('heading', { name: new RegExp(room, 'i') });
  return headings.length > 0 ? headings[0] : null;
};

describe('App', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders vent cards with room rail and stats', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<App />);

    expect(await cardHeading('Study Room')).toBeInTheDocument();
    expect(cardHeadingQ('Great Room')).toBeInTheDocument();
    expect(cardHeadingQ('Office Room')).toBeInTheDocument();
    // room rail buttons
    expect(screen.getByRole('button', { name: /ALL ROOMS/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^STUDY ROOM/i })).toBeInTheDocument();
    // offline badge on the rail
    expect(screen.getByText('OFF')).toBeInTheDocument();
    // stats
    expect(screen.getByText(/2 ONLINE/i)).toBeInTheDocument();
    expect(screen.getByText(/1 OFFLINE/i)).toBeInTheDocument();
    expect(screen.getByText(/MOCK MODE/i)).toBeInTheDocument();
  });

  it('search filters cards by room name', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    await user.type(screen.getByLabelText(/filter vents/i), 'great');
    expect(cardHeadingQ('Study Room')).not.toBeInTheDocument();
    expect(cardHeadingQ('Great Room')).toBeInTheDocument();
  });

  it('room rail filters cards', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    await user.click(screen.getByRole('button', { name: /^STUDY ROOM/i }));
    expect(cardHeadingQ('Study Room')).toBeInTheDocument();
    expect(cardHeadingQ('Great Room')).not.toBeInTheDocument();
    expect(cardHeadingQ('Office Room')).not.toBeInTheDocument();
  });

  it('bulk controls stay disabled until armed', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    const openAll = screen.getByRole('button', { name: /OPEN ALL/i });
    expect(openAll).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /ARM BULK/i }));
    expect(openAll).toBeEnabled();
    expect(screen.getByRole('button', { name: /BULK ARMED!/i })).toBeInTheDocument();
  });

  it('calibration is collapsed by default and flips in place on toggle', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    // calibration toggle starts collapsed (aria-expanded=false)
    const firstToggle = screen.getAllByRole('button', { name: /CALIBRATE/i })[0];
    expect(firstToggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(firstToggle);
    const studyInput = screen.getByLabelText(/OPEN position for number\.study_room_vent_1/);
    // entity ID no longer displayed on the calibration side
    // flip back
    await user.click(screen.getByRole('button', { name: /BACK TO CONTROLS/i }));
    expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('posts close commands through the API proxy', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    // register toggle: Study Room open -> clicking issues close; verify register exists with aria-pressed
    const register = screen.getByRole('button', { name: /Close Study Room Vent 1/i });
    expect(register).toHaveAttribute('aria-pressed', 'true');
    await user.click(register);
    expect(fetchMock).toHaveBeenCalledWith('/api/vents/action', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      entityId: 'switch.study_room_vent_1_vent_switch',
      action: 'close',
    });
    // closed vent's register offers open
    const greatRegister = screen.getByRole('button', { name: /Open Great Room Vent 1/i });
    expect(greatRegister).toHaveAttribute('aria-pressed', 'false');
    // offline vent's register is disabled
    const officeRegister = screen.getByRole('button', { name: /(Open|Close) Office Room Vent 1/i });
    expect(officeRegister).toBeDisabled();
  });

  it('shows pending state during command and refreshes when HA confirms', async () => {
    // First GET: vent open. POST: command close. Poll GETs: still open, then closed.
    const seq: Array<Partial<VentsResponse>> = [
      dashboard, // initial load
      { ...dashboard, vents: dashboard.vents, rooms: dashboard.rooms }, // first poll: still open (ESPHome lag)
      (() => {
        const closedStudy = { ...studyVent, state: 'closed' as const, rawState: 'off' };
        return {
          ...dashboard,
          vents: [closedStudy, officeVent, greatRoomVent],
          rooms: [
            { id: 'study_room', name: 'Study Room', vents: [closedStudy] },
            { id: 'office_room', name: 'Office Room', vents: [officeVent] },
            { id: 'great_room', name: 'Great Room', vents: [greatRoomVent] },
          ],
        };
      })(), // second poll: HA now reports closed
    ];
    let getCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/vents') {
        const body = seq[Math.min(getCalls, seq.length - 1)];
        getCalls += 1;
        return Response.json(body);
      }
      if (String(input).startsWith('/api/vents/') && init?.method === 'POST') return Response.json({ ok: true, ...dashboard });
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    // register button toggles: Study Room is open, so its label is "Close ..."
    await user.click(screen.getByRole('button', { name: /Close Study Room Vent 1/i }));

    // optimistic: pending pill appears immediately (pill + hint text)
    expect((await screen.findAllByText(/CLOSING…/i)).length).toBeGreaterThan(0);
    // and resolves to CLOSED once the poll sees HA confirm (pill exists on both card faces)
    await waitFor(() => {
      expect(screen.getAllByText('CLOSED').length).toBeGreaterThan(0);
    }, { timeout: 3000 });
    // command POSTed exactly once
    const postCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(postCalls).toHaveLength(1);
  });

  it('rail ONLINE/OFFLINE buttons filter the vent grid; header stats stay informational', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    // header stats are plain info (not buttons)
    expect(screen.getByText(/2 ONLINE/i).tagName).toBe('B');
    expect(cardHeadingQ('Office Room')).toBeInTheDocument(); // offline vent visible by default

    // rail OFFLINE filter -> only offline vents shown
    await user.click(screen.getByRole('button', { name: /^OFFLINE/i }));
    expect(cardHeadingQ('Study Room')).not.toBeInTheDocument();
    expect(cardHeadingQ('Great Room')).not.toBeInTheDocument();
    expect(cardHeadingQ('Office Room')).toBeInTheDocument();

    // click OFFLINE again -> back to all
    await user.click(screen.getByRole('button', { name: /^OFFLINE/i }));
    expect(cardHeadingQ('Study Room')).toBeInTheDocument();

    // rail ONLINE filter -> only online vents shown
    await user.click(screen.getByRole('button', { name: /^ONLINE/i }));
    expect(cardHeadingQ('Study Room')).toBeInTheDocument();
    expect(cardHeadingQ('Office Room')).not.toBeInTheDocument();

    // switching filters is mutually exclusive
    await user.click(screen.getByRole('button', { name: /^OFFLINE/i }));
    expect(cardHeadingQ('Study Room')).not.toBeInTheDocument();
    expect(cardHeadingQ('Office Room')).toBeInTheDocument();
  });

  it('sensor chips render on cards with sensors and are absent without', async () => {
    const withSensors: VentDevice = {
      ...studyVent,
      sensors: {
        temperature: 72.4, temperatureUnit: '°F', temperatureEntityId: 'sensor.study_room_temperature',
        humidity: 41, humidityEntityId: 'sensor.study_room_humidity',
        battery: 87, batteryEntityId: 'sensor.study_room_battery',
      },
    };
    const body = {
      ...dashboard,
      vents: [withSensors, greatRoomVent],
      rooms: [
        { id: 'study_room', name: 'Study Room', vents: [withSensors] },
        { id: 'great_room', name: 'Great Room', vents: [greatRoomVent] },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => Response.json(body)));
    render(<App />);

    await cardHeading('Study Room');
    // chips with icons only + values; titles carry the entity ids
    expect(screen.getByTitle(/sensor\.study_room_temperature/)).toHaveTextContent('72.4°F');
    expect(screen.getByTitle(/sensor\.study_room_humidity/)).toHaveTextContent('41%');
    expect(screen.getByTitle(/sensor\.study_room_battery/)).toHaveTextContent('87%');
    // Great Room has no sensors -> no chip titles
    expect(screen.queryByTitle(/sensor\.great_room/)).not.toBeInTheDocument();
  });

  it('theme switcher cycles light/system/dark and persists', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    const group = screen.getByRole('group', { name: /theme/i });
    expect(group).toBeInTheDocument();
    // default: system
    expect(screen.getByTitle('System theme')).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe(
      window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    );

    // switch to light
    await user.click(screen.getByTitle('Light theme'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('acv-theme')).toBe('light');

    // switch to dark
    await user.click(screen.getByTitle('Dark theme'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('acv-theme')).toBe('dark');

    // back to system
    await user.click(screen.getByTitle('System theme'));
    expect(localStorage.getItem('acv-theme')).toBe('system');
  });

  it('saves calibration through the API proxy', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await cardHeading('Study Room');
    await user.click(screen.getAllByRole('button', { name: /CALIBRATE/i })[0]);
    const input = screen.getByLabelText(/OPEN position for number\.study_room_vent_1/);
    await user.clear(input);
    await user.type(input, '-0.55');
    await user.click(screen.getAllByRole('button', { name: /^SAVE$/i })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vents/calibration', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      entityId: 'number.study_room_vent_1_set_open_position',
      value: -0.55,
    });
  });
});
