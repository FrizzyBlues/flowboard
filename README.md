# Flowboard

Docker-packaged React/TypeScript dashboard for managing ESPHome AC vents exposed through Home Assistant.

Full setup, Docker, Home Assistant entity assumptions, safety notes, and troubleshooting live in [docs/AC_VENT_UI_RUNBOOK.md](docs/AC_VENT_UI_RUNBOOK.md).

## What it does

- Discovers vent switches whose entity IDs end with `_vent_switch`.
- Groups vents by room from entity IDs like `switch.study_room_vent_1_vent_switch`.
- Proxies all Home Assistant traffic through the Node/Express server so `HASS_TOKEN` never reaches the browser.
- Shows open, closed, unknown, unavailable, and missing-calibration states visibly.
- Supports safe mock mode for development and tests; mock commands update in-memory fixture state only.
- Provides deliberate per-vent calibration controls for `number.*_set_open_position` and `number.*_set_closed_position`.

## Runtime configuration

Live Home Assistant mode uses environment variables at server runtime only:

| Variable | Purpose |
| --- | --- |
| `HASS_URL` | Home Assistant base URL, e.g. `http://homeassistant.local:8123` |
| `HASS_TOKEN` | Home Assistant long-lived access token |
| `PORT` | App server port, default `8788` |
| `MOCK_HASS=true` | Force mock mode; no Home Assistant calls are made |

Aliases are also supported for common deployment conventions: `HA_URL` / `HOME_ASSISTANT_URL`, `HA_TOKEN` / `HOME_ASSISTANT_TOKEN`, `MOCK_HA=true`, or `APP_MODE=mock`.

If `HASS_URL` or `HASS_TOKEN` is missing, or a mock flag is set, the server falls back to mock mode. Check `GET /api/health` to confirm whether the app is in `live` or `mock` mode; the token is never exposed in the response.

## Development

```bash
npm install
npm run dev:full
```

Vite serves the browser app and proxies `/api` to the Express server on port `8788`.

Useful commands:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run server
```

## Docker

Build and run without secrets at build time:

```bash
docker build -t flowboard:local .
docker run --rm -p 8788:8788 \
  -e HASS_URL=http://homeassistant.local:8123 \
  -e HASS_TOKEN=replace-with-token \
  flowboard:local
```

Or start from the compose example:

```bash
cp docker-compose.example.yml docker-compose.yml
# edit HASS_URL and HASS_TOKEN in docker-compose.yml
docker compose up --build
```

For safe preview mode:

```bash
docker run --rm -p 8788:8788 -e MOCK_HASS=true flowboard:local
```

Keep `HASS_TOKEN` in runtime environment, an uncommitted local `.env`, or a compose override. Do not bake it into the Docker image.

## Home Assistant entity matching

The server reads Home Assistant states and groups vents by entity ID suffix:

| Entity kind | Pattern | Example |
| --- | --- | --- |
| Vent switch | `switch.<base>_vent_switch` | `switch.study_room_vent_1_vent_switch` |
| Optional silent switch | `switch.<base>_vent_switch_silent` | `switch.study_room_vent_1_vent_switch_silent` |
| Open calibration number | `number.<base>_set_open_position` | `number.study_room_vent_1_set_open_position` |
| Closed calibration number | `number.<base>_set_closed_position` | `number.study_room_vent_1_set_closed_position` |

The shared `<base>` ties a vent switch to its calibration numbers. For example, `study_room_vent_1` displays as room `Study Room`, vent `Vent 1`.

State mapping is `on` → open, `off` → closed, `unknown` → unknown, and `unavailable` → unavailable. Missing calibration numbers and ungrouped number entities are returned in `/api/vents` diagnostics.

## Safe operation and troubleshooting

- Use `MOCK_HASS=true` for demos, screenshots, and development when you do not want Home Assistant calls.
- `GET /api/vents` is read-only.
- Opening/closing a vent in live mode calls Home Assistant `switch.turn_on` / `switch.turn_off`.
- Saving calibration in live mode calls `number.set_value` after server-side range validation.
- Open/close controls are disabled for unavailable vents.
- Bulk open/close controls require arming first.

If vents are missing, verify the Home Assistant entity IDs match the patterns above and inspect `/api/vents` diagnostics. If vents are unavailable, restore the ESPHome device or HA integration first; the app leaves unavailable vents visible but disables live controls for them.

## API

- `GET /api/health` reports mode and whether HA config is present. It never exposes the token.
- `GET /api/vents` returns room-grouped normalized vents plus diagnostics.
- `POST /api/vents/action` with `{ "entityId": "switch...", "action": "open" | "close" }` calls `switch.turn_on` or `switch.turn_off` in live mode.
- `POST /api/vents/calibration` with `{ "entityId": "number...", "value": -0.6 }` calls `number.set_value` after range validation.

Mutating endpoints return a refreshed dashboard response after the service call. Tests and mock mode never toggle real vents.
