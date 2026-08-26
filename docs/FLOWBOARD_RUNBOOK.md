# Flowboard Runbook

Docker-packaged React/TypeScript dashboard for ESPHome AC vents exposed through Home Assistant.

## Current status

- The browser never receives the Home Assistant token. It calls local `/api/*` endpoints served by the Express process.
- Live mode reads Home Assistant configuration from runtime environment variables only.
- Mock mode is safe for development, demos, tests, and Docker image validation; it uses in-memory fixture states and does not contact Home Assistant.
- Listing vents is read-only. Opening, closing, and calibration writes are explicit user actions in the UI/API.

## Runtime environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `HASS_URL` | Live mode | Home Assistant base URL, for example `http://homeassistant.local:8123` or another reachable HA URL. |
| `HASS_TOKEN` | Live mode | Home Assistant long-lived access token. Keep this out of Git and image layers. |
| `PORT` | No | HTTP port for the app server. Defaults to `8788`. |
| `MOCK_HASS=true` | No | Force safe mock mode. |
| `MOCK_HA=true` | No | Alias for `MOCK_HASS=true`. |
| `APP_MODE=mock` | No | Alternate way to force mock mode. |
| `HA_URL`, `HOME_ASSISTANT_URL` | No | Aliases for `HASS_URL`. |
| `HA_TOKEN`, `HOME_ASSISTANT_TOKEN` | No | Aliases for `HASS_TOKEN`. |

If no live Home Assistant URL/token is configured, the server falls back to mock mode. Confirm the active mode with `GET /api/health`.

## Local development

```bash
npm install
npm run dev:full
```

Open the Vite URL shown in the terminal. The Vite dev server proxies `/api` to the Express server, which defaults to port `8788`.

Useful verification commands:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Docker build and run

Build the image without secrets:

```bash
docker build -t flowboard:local .
```

Run in live mode with runtime-only Home Assistant configuration:

```bash
docker run --rm -p 8788:8788 \
  -e HASS_URL=http://homeassistant.local:8123 \
  -e HASS_TOKEN="$HASS_TOKEN" \
  flowboard:local
```

Run in safe mock mode:

```bash
docker run --rm -p 8788:8788 -e MOCK_HASS=true flowboard:local
```

Check health:

```bash
curl http://localhost:8788/api/health
```

Expected shape:

```json
{"ok":true,"mode":"mock","hassConfigured":false,"mockMode":true}
```

In live mode, `mode` should be `live` and `hassConfigured` should be `true`. The token is never returned.

## Docker Compose

Start from the example file:

```bash
cp docker-compose.example.yml docker-compose.yml
```

Recommended secret handling for a local deployment:

1. Keep `docker-compose.yml` uncommitted if it contains real values.
2. Prefer a local `.env` or compose override for `HASS_TOKEN`.
3. Do not bake `HASS_TOKEN` into the Dockerfile or image build args.

Example compose environment:

```yaml
environment:
  PORT: "8788"
  HASS_URL: "http://homeassistant.local:8123"
  HASS_TOKEN: "${HASS_TOKEN}"
```

Start the service:

```bash
docker compose up --build
```

## Home Assistant entity assumptions

The discovery logic reads `/api/states` and looks for ESPHome vent entities by entity ID pattern.

| Entity kind | Pattern | Example |
| --- | --- | --- |
| Vent switch | `switch.<base>_vent_switch` | `switch.study_room_vent_1_vent_switch` |
| Optional silent switch | `switch.<base>_vent_switch_silent` | `switch.study_room_vent_1_vent_switch_silent` |
| Open calibration number | `number.<base>_set_open_position` | `number.study_room_vent_1_set_open_position` |
| Closed calibration number | `number.<base>_set_closed_position` | `number.study_room_vent_1_set_closed_position` |

The `<base>` key ties the switch and calibration numbers together. For `study_room_vent_1`, the UI displays room `Study Room` and vent `Vent 1`.

Discovery details:

- Switch states map as `on` → `open`, `off` → `closed`, `unknown` → `unknown`, and `unavailable` → `unavailable`.
- Calibration values are parsed from Home Assistant number entity states.
- Number entity `min`, `max`, and `step` attributes are used when present; defaults are `-1`, `1`, and `0.01`.
- Missing calibration numbers are reported in diagnostics and displayed as vent warnings.
- Unmatched calibration numbers are reported in `diagnostics.ungroupedEntities`.

## Safe operation

- Use `MOCK_HASS=true` for UI previews, screenshots, and tests.
- `GET /api/vents` is read-only and only lists current HA states.
- `POST /api/vents/action` calls `switch.turn_on` for `open` and `switch.turn_off` for `close` in live mode.
- `POST /api/vents/calibration` calls `number.set_value` in live mode after validating the requested value against the number entity bounds.
- Open/close buttons are disabled for unavailable vents.
- Whole-home open/close buttons require arming first to reduce accidental bulk changes.

Do not test live open/close or calibration writes against occupied rooms unless you explicitly ask for that real-world action.

## Troubleshooting

### App starts in mock mode unexpectedly

Check `/api/health` first. Live mode requires both `HASS_URL` and `HASS_TOKEN`, unless one of the mock flags is set.

Common causes:

- Compose file still has `MOCK_HA` or `MOCK_HASS` set to `true`.
- `HASS_TOKEN` is missing from the shell or `.env` used by Docker Compose.
- Variable names are misspelled.

### Home Assistant returns 401/403

- Create a fresh long-lived access token in Home Assistant.
- Confirm the container received the token with `docker compose config` without printing the full token into logs or commits.
- Ensure the token is not surrounded by accidental quotes in the environment source.

### Home Assistant is unreachable from Docker

- Confirm `HASS_URL` is reachable from the Docker host.
- If `homeassistant.local` does not resolve inside Docker, use the LAN IP or a resolvable DNS name.
- Check firewall/VLAN rules between the Docker host and Home Assistant.

### Vents are missing

- Confirm entities exist in Home Assistant Developer Tools → States.
- Verify the switch entity ID ends exactly with `_vent_switch`.
- Verify calibration entity IDs share the same `<base>` and end with `_set_open_position` / `_set_closed_position`.
- Check `GET /api/vents` diagnostics for `missingCalibrationEntities` and `ungroupedEntities`.

### Vents show unavailable or unknown

- `unavailable` means Home Assistant currently reports the entity unavailable, often due to an offline ESPHome node, Wi-Fi issue, or integration reconnect.
- `unknown` means Home Assistant has the entity but does not currently know the physical state.
- Open/close controls remain disabled for unavailable vents; restore the ESPHome device/integration first.

### Calibration save fails

- Confirm the calibration number entity exists and is not unavailable.
- Confirm the value is within the HA-provided min/max range, usually `-1` to `1`.
- Check Home Assistant logs for ESPHome/API errors if HA accepts the request but the device does not move.

## API reference

- `GET /api/health` returns server health, mode, and HA configuration status without exposing secrets.
- `GET /api/vents` returns rooms, normalized vent devices, unavailable count, and discovery diagnostics.
- `POST /api/vents/action` accepts `{ "entityId": "switch...", "action": "open" | "close" }`.
- `POST /api/vents/calibration` accepts `{ "entityId": "number...", "value": -0.6 }`.

Mutating endpoints return a refreshed dashboard response after the service call.
