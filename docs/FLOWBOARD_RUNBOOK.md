# Flowboard Runbook

Docker-packaged React/TypeScript dashboard for ESPHome AC vents exposed through Home Assistant.

Operator setup (env, Docker, `config/flowboard.json`, entity patterns) lives in the [README](../README.md). This runbook is failure modes, discovery details, and mutation routes.

## Current status

- The browser never receives the Home Assistant token. It calls local `/api/*` endpoints served by the Express process.
- Live mode reads Home Assistant configuration from runtime environment variables only.
- Mock mode is safe for development, demos, tests, and Docker image validation; it uses in-memory fixture states and does not contact Home Assistant.
- Listing vents is read-only. Opening, closing, and calibration writes are explicit user actions in the UI/API.

## Health

Confirm mode without exposing secrets:

```bash
curl http://localhost:8788/api/health
```

Expected shape:

```json
{"ok":true,"mode":"mock","hassConfigured":false,"mockMode":true}
```

In live mode, `mode` should be `live` and `hassConfigured` should be `true`. The token is never returned.

## Docker Compose secrets

Start from the example file (it bind-mounts `./config` — see the [README](../README.md#configuration)):

```bash
cp docker-compose.example.yml docker-compose.yml
```

Recommended secret handling for a local deployment:

1. Keep `docker-compose.yml` uncommitted if it contains real values.
2. Prefer a local `.env` or compose override for `HASS_TOKEN`.
3. Do not bake `HASS_TOKEN` into the Dockerfile or image build args.

```yaml
environment:
  PORT: "8788"
  HASS_URL: "http://homeassistant.local:8123"
  HASS_TOKEN: "${HASS_TOKEN}"
```

```bash
docker compose up --build
```

## Home Assistant discovery details

Entity ID patterns live in the [README](../README.md#how-it-works). The `<base>` key (for example `study_room_vent_1`) ties the switch and calibration numbers together; the board displays room `Study Room` and vent `Vent 1`.

- Switch states map as `on` → `open`, `off` → `closed`, `unknown` → `unknown`, and `unavailable` → `unavailable`.
- Calibration values are parsed from Home Assistant number entity states.
- Number entity `min`, `max`, and `step` attributes are used when present; defaults are `-1`, `1`, and `0.01`.
- Missing calibration numbers are reported in diagnostics and displayed as vent warnings.
- Unmatched calibration numbers are reported in `diagnostics.ungroupedEntities`.

## Safe operation

- Use `MOCK_HA=true` (or `MOCK_HASS=true`) for UI previews, screenshots, and tests.
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

### Wrong climate sensors on a Room

- Confirm `config/flowboard.json` Room Sensor Source keys are Room ids, not display names.
- Invalid JSON is ignored (empty map). Look for `Flowboard config ignored` in the server log.
- Confirm the container is using the bind-mounted `config/` directory, not only the copy baked into the image.

## API reference

- `GET /api/health` returns server health, mode, and HA configuration status without exposing secrets.
- `GET /api/vents` returns rooms, normalized vent devices, unavailable count, and discovery diagnostics.
- `POST /api/vents/action` accepts `{ "entityId": "switch...", "action": "open" | "close" }`.
- `POST /api/vents/calibration` accepts `{ "entityId": "number...", "value": -0.6 }`.

Mutating endpoints return a refreshed dashboard response after the service call.
