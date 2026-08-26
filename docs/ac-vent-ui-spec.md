# AC Vent UI entity model and UX requirements

## Goal

Build a Docker-packaged web UI that lets you manage ESPHome-powered AC vents exposed through Home Assistant, without requiring Home Assistant secrets at build time and without making unsafe real-world changes during development or tests.

The app must use `HASS_URL` and `HASS_TOKEN` only at server runtime. The browser must talk to the app server, not directly to Home Assistant.

Implementation/runbook note: this file records the entity model and UX requirements that drove implementation. For operator setup, Docker commands, current endpoint shapes, safety notes, and troubleshooting, see [`AC_VENT_UI_RUNBOOK.md`](AC_VENT_UI_RUNBOOK.md).

## Source assumptions

Observed project sample: `docs/sample-ac-vent.yaml`.

Known Home Assistant entity shape from the task:

- Vent control switch: `switch.study_room_vent_1_vent_switch`
- Open calibration number: `number.study_room_vent_1_set_open_position`
- Closed calibration number: `number.study_room_vent_1_set_closed_position`

The ESPHome sample defines:

- One `template` switch named `Vent Switch`.
- Two `template` numbers named `Set Open Position` and `Set Closed Position`.
- Number range `-1.0` to `1.0`, step `0.01`.
- Switch `on` writes the configured open servo position.
- Switch `off` writes the configured closed servo position.

Home Assistant discovery was attempted during spec work, but the current runtime could not reach `homeassistant.local:8123` (`No route to host`). Therefore this spec relies on the verified entity pattern supplied in the task and the checked-in ESPHome sample, not on a fresh live entity inventory.

## Entity discovery model

### Primary entity types

Each vent is represented as a logical group with up to these Home Assistant entities:

| Role | Required | Domain | Example |
|---|---:|---|---|
| `switch` | yes | `switch` | `switch.study_room_vent_1_vent_switch` |
| `openPosition` | no, but expected | `number` | `number.study_room_vent_1_set_open_position` |
| `closedPosition` | no, but expected | `number` | `number.study_room_vent_1_set_closed_position` |

A vent with only a switch is still discoverable and controllable, but calibration UI must be disabled with a clear missing-entity warning.

### Matching rules

Use entity IDs as the stable source of truth. Friendly names are helpful labels only and must not be required for grouping.

1. Fetch all Home Assistant states from `GET /api/states` server-side.
2. Consider candidate switch entities where:
   - domain is `switch`, and
   - object ID ends with `_vent_switch`.
3. Derive the vent base key by removing the suffix `_vent_switch` from the switch object ID.
   - `switch.study_room_vent_1_vent_switch` -> base key `study_room_vent_1`.
4. Attach calibration numbers by exact derived IDs:
   - open: `number.${baseKey}_set_open_position`
   - closed: `number.${baseKey}_set_closed_position`
5. Also allow a conservative fallback for future naming drift only when there is an unambiguous match:
   - number object ID starts with `${baseKey}_`, and
   - ends with `_set_open_position` or `_set_closed_position`, and
   - no exact-match entity already exists.
6. Do not group entities by substring alone if multiple possible bases match. Mark ambiguous entities as ungrouped diagnostics instead of guessing.

### Logical vent object

The server should normalize Home Assistant states into this app-level shape:

```ts
type VentState = 'open' | 'closed' | 'unavailable' | 'unknown';

type Vent = {
  id: string;                    // base key, e.g. "study_room_vent_1"
  displayName: string;           // friendly label, e.g. "Study Room Vent 1"
  roomId: string;                // normalized room key, e.g. "study_room"
  roomName: string;              // display room, e.g. "Study Room"
  indexLabel?: string;           // e.g. "Vent 1"
  state: VentState;
  available: boolean;
  entities: {
    switch: EntityRef;
    openPosition?: NumberEntityRef;
    closedPosition?: NumberEntityRef;
  };
  warnings: string[];
};

type EntityRef = {
  entityId: string;
  state: string;
  friendlyName?: string;
  lastChanged?: string;
  lastUpdated?: string;
};

type NumberEntityRef = EntityRef & {
  value: number | null;
  min: number | null;
  max: number | null;
  step: number | null;
  unit?: string;
};
```

### State normalization

Switch states map as follows:

| HA switch state | UI state | Meaning |
|---|---|---|
| `on` | `open` | Vent should be at open calibration position |
| `off` | `closed` | Vent should be at closed calibration position |
| `unavailable` | `unavailable` | Device/entity not currently controllable |
| `unknown` or anything else | `unknown` | State cannot be trusted |

The UI must not present `unknown` as open or closed. It should show an explicit unknown badge and require a deliberate user action for open/close.

### Room grouping

Preferred room grouping order:

1. Use Home Assistant area metadata if available from a registry-backed API or future enhancement.
2. Otherwise infer from the entity base key.

For current naming, infer as:

- base key: `study_room_vent_1`
- split into tokens: `study`, `room`, `vent`, `1`
- find the last `vent` token and treat everything before it as the room key.
- room key `study_room` -> display name `Study Room`.
- tokens from `vent` onward become the vent label: `Vent 1`.

If the room cannot be inferred, group under `Ungrouped` and keep the raw base key visible.

Sort order:

1. Room name alphabetically, with `Ungrouped` last.
2. Within each room, natural-sort by vent label (`Vent 1`, `Vent 2`, `Vent 10`).
3. Fall back to display name/entity ID for deterministic ordering.

## Server API requirements

The app server is the only component that may know `HASS_URL` and `HASS_TOKEN`.

### Environment

Required in live mode:

- `HASS_URL` — Home Assistant base URL, e.g. `http://homeassistant.local:8123`.
- `HASS_TOKEN` — long-lived Home Assistant token.

Optional:

- `MOCK_HASS=true`, `MOCK_HA=true`, or `APP_MODE=mock` — use fixture data and do not contact Home Assistant.
- `HA_URL` / `HOME_ASSISTANT_URL` and `HA_TOKEN` / `HOME_ASSISTANT_TOKEN` — deployment aliases for the live HA URL/token.
- `PORT` — server port, default `8788`.

### Endpoints

Implemented app endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/vents` | Return grouped/normalized vent list plus diagnostics |
| `POST` | `/api/vents/action` | Open/close one vent by switch entity ID; body `{ "entityId": "switch...", "action": "open" | "close" }` |
| `POST` | `/api/vents/calibration` | Set a calibration number by entity ID; body `{ "entityId": "number...", "value": -0.6 }` |
| `GET` | `/api/health` | Report app mode and whether HA config is present; do not expose token |

`GET /api/vents` response should include:

```ts
type VentListResponse = {
  mode: 'live' | 'mock';
  rooms: Array<{
    id: string;
    name: string;
    vents: Vent[];
  }>;
  diagnostics: {
    discoveredSwitches: number;
    discoveredVents: number;
    missingCalibrationEntities: Array<{ ventId: string; missing: string[] }>;
    ambiguousEntities: string[];
    ungroupedEntities: string[];
  };
};
```

### Home Assistant calls

Use Home Assistant REST API from the server.

Discovery:

```http
GET {HASS_URL}/api/states
Authorization: Bearer {HASS_TOKEN}
Content-Type: application/json
```

Open vent:

```http
POST {HASS_URL}/api/services/switch/turn_on
Authorization: Bearer {HASS_TOKEN}
Content-Type: application/json

{"entity_id":"switch.study_room_vent_1_vent_switch"}
```

Close vent:

```http
POST {HASS_URL}/api/services/switch/turn_off
Authorization: Bearer {HASS_TOKEN}
Content-Type: application/json

{"entity_id":"switch.study_room_vent_1_vent_switch"}
```

Set calibration number:

```http
POST {HASS_URL}/api/services/number/set_value
Authorization: Bearer {HASS_TOKEN}
Content-Type: application/json

{"entity_id":"number.study_room_vent_1_set_open_position","value":-0.6}
```

and:

```http
POST {HASS_URL}/api/services/number/set_value
Authorization: Bearer {HASS_TOKEN}
Content-Type: application/json

{"entity_id":"number.study_room_vent_1_set_closed_position","value":-0.15}
```

After any mutating call, the server should refresh the affected entities from Home Assistant before returning the response, either by:

- calling `GET /api/states/{entity_id}` for affected entities, or
- re-running the normalized discovery if simple enough.

The server must never trust that a successful service call means the final device state changed; return the refreshed HA state and any warning if it remains unchanged, unavailable, or unknown.

## Calibration handling

### Number attributes

Read these Home Assistant number attributes when present:

- `min`
- `max`
- `step`
- `mode`
- `friendly_name`
- `unit_of_measurement`

Default fallback for this ESPHome sample if HA attributes are missing:

- min: `-1.0`
- max: `1.0`
- step: `0.01`

### UI constraints

For each calibration number:

- Show the current value.
- Use number input and slider if min/max are known.
- Clamp client-side display to min/max only for validation messaging; the server should also validate before calling HA.
- Reject non-numeric values.
- Reject values outside known min/max.
- Warn when `openPosition` and `closedPosition` are very close, because the vent may not visibly move.
- Label calibration as advanced controls, not as everyday operation.

### Safety copy

Calibration changes affect physical servo endpoints. The UI should say so plainly, for example:

`Calibration writes new servo endpoint values to Home Assistant. Small changes are recommended. Test one vent before copying settings.`

## UX requirements

### Default screen

Show a room-grouped dashboard:

- Header: app name, mode badge (`Live Home Assistant` or `Mock mode`), last refresh time.
- Room sections with vent cards.
- Each card shows:
  - display name (`Study Room Vent 1`)
  - current state badge (`Open`, `Closed`, `Unavailable`, `Unknown`)
  - entity ID in a details area
  - last updated/changed if available
  - warnings for missing calibration, unknown state, unavailable state

### Controls

For each available vent:

- Primary buttons: `Open` and `Close`.
- Disable the button for the current known state, e.g. disable `Open` if already open.
- Disable both buttons for `unavailable`.
- For `unknown`, keep buttons available but show a warning that current physical position is unknown.
- Show loading state on the card while a request is in flight.
- Prevent duplicate submits while in flight.
- Show success/error toast or inline message from the refreshed server response.

### Read-only safety defaults

The UI should be safe by default:

- `GET /api/vents` is read-only and can be used freely.
- Dev and test should default to mock mode unless live HA env vars are intentionally provided.
- The app must not auto-open, auto-close, or auto-calibrate on load.
- Bulk actions, schedules, or automation features are out of scope for the initial implementation unless explicitly added later.
- No real vent toggles in tests.

### Calibration UI

Calibration controls should be in a collapsed `Calibration` or `Advanced` section per vent.

When expanded:

- Display open and closed position controls separately.
- Show min/max/step.
- Provide `Save open position` and `Save closed position` buttons rather than saving on every slider move.
- Disable missing calibration controls individually.
- Show validation errors before sending to the server.
- After saving, refresh and show the new HA value.

### Error and unavailable states

The UI must handle:

- Home Assistant unreachable.
- Token missing or invalid.
- Empty discovery result.
- Vent switch exists but calibration numbers are missing.
- Calibration number exists but state is unavailable/unknown/non-numeric.
- Service call rejected by Home Assistant.
- Service call succeeds but refreshed state is still unavailable/unknown.

Display errors in human-actionable language. Do not show `HASS_TOKEN` or raw authorization headers in client errors, logs, or test snapshots.

## Mock/dev mode

Mock mode should provide deterministic fixture data that includes at least:

1. A normal room with one open vent and complete calibration.
2. A room with one closed vent and complete calibration.
3. A vent with missing calibration entities.
4. An unavailable vent.
5. An unknown-state vent.

Mock mutating endpoints should update in-memory fixture state for open/close and calibration so the UI can be exercised without Home Assistant.

## Docker and deployment requirements

- Production Docker image builds without `HASS_URL` or `HASS_TOKEN`.
- Runtime configuration is passed through environment variables.
- Provide a compose example with placeholders, not real secrets.
- Server should bind to `0.0.0.0` inside the container.
- Health endpoint should not require Home Assistant to be reachable; it should report config/mode separately.

## Acceptance criteria for implementation

The implementation task should be considered complete when:

1. `npm test` passes.
2. Production build succeeds.
3. Dockerfile exists and does not bake secrets into the image.
4. Compose example uses runtime env vars for `HASS_URL` and `HASS_TOKEN`.
5. `GET /api/vents` works in mock mode with grouped rooms.
6. Entity matching follows the rules in this spec.
7. Open/close APIs use `switch.turn_on` and `switch.turn_off` service calls.
8. Calibration APIs use `number.set_value` service calls and validate ranges.
9. UI handles unavailable/unknown/missing-calibration states visibly.
10. Tests do not call real Home Assistant or toggle physical vents.
