# AC Vent Dashboard UI Design

## Product goal

Build a responsive, Docker-packaged web dashboard for managing ESPHome AC vents exposed through Home Assistant. The UI should make day-to-day open/close control fast, keep calibration safe and deliberate, and clearly show when a vent or Home Assistant is unavailable.

Do not require Home Assistant secrets at build time. Runtime server code should read `HASS_URL` and `HASS_TOKEN` from environment variables and proxy Home Assistant calls from the server side.

## Entity assumptions

Known ESPHome/Home Assistant entity pattern from `docs/sample-ac-vent.yaml` and task context:

- Vent state/control switch: `switch.<room>_vent_<n>_vent_switch`
- Open calibration number: `number.<room>_vent_<n>_set_open_position`
- Closed calibration number: `number.<room>_vent_<n>_set_closed_position`
- Calibration range: `-1.0` to `1.0`, step `0.01`
- Switch state: `on` means open, `off` means closed, `unavailable`/`unknown` means not controllable

Discovery/grouping should not hard-code one room. Parse candidates by entity ID and confirm with friendly names/related number entities. A room can have multiple vents, e.g. `Study Room` with `Vent 1`, `Vent 2`.

## Information architecture

### App shell

- Header
  - App title: `AC Vents`
  - Connection badge: `Home Assistant Connected`, `Mock Mode`, or `Offline`
  - Last refresh text: `Updated 2:14 PM`
  - Small refresh button
- Main dashboard
  - Overview/action bar
  - Room card grid
- Optional right-side or modal calibration panel on desktop
- Bottom/sheet calibration panel on mobile
- Toast/status region for action feedback

### Component hierarchy

```text
App
  HomeAssistantProvider / QueryClientProvider
  AppShell
    Header
      ConnectionStatusBadge
      RefreshButton
    DashboardPage
      OverviewBar
        SummaryStats
        GuardedBulkActions
      RoomGrid
        RoomCard[]
          RoomCardHeader
            RoomName
            RoomStatusSummary
          VentList
            VentRow[]
              VentIdentity
              VentStatePill
              OpenCloseSegmentedControl
              CalibrationButton
          RoomFooter
            RoomBulkActions
      CalibrationPanel / CalibrationSheet
        SelectedVentSummary
        PositionFields
          OpenPositionSlider
          ClosedPositionSlider
          NumericInputs
        CalibrationWarnings
        ApplyCalibrationButton
        RevertButton
      EmptyState / ErrorState
```

## Dashboard layout

### Desktop/tablet

Use a responsive card grid:

- `>= 1200px`: 3 room cards per row if space allows.
- `768px - 1199px`: 2 cards per row.
- `< 768px`: single-column cards.

Cards should be height-flexible, not fixed-height. The calibration panel can be a right-side drawer on desktop so the dashboard stays visible while editing one vent.

### Mobile

- Header compresses to title + connection badge + refresh icon.
- Overview stats stack into compact chips.
- Each room card becomes a full-width section.
- Vent controls use large touch targets, minimum 44px height.
- Calibration opens as a bottom sheet with sliders plus exact numeric fields.
- Guarded bulk actions require a confirmation sheet, not a tiny inline confirm.

## Visual direction

Tone: polished utility dashboard, not flashy smart-home toy.

- Background: warm off-white/light gray (`#F6F7F9`) with dark text.
- Cards: white or near-white, rounded corners, subtle border/shadow.
- Accent color: cool blue for open/active actions.
- Closed state: neutral slate/gray, not red.
- Warning/unavailable: amber for degraded, red only for failed action/error.
- Typography: system sans; dense enough for engineering use but with clear hierarchy.
- Icons: simple airflow/vent glyphs if available; do not depend on icon-only controls.

Suggested semantic tokens:

| Token | Use |
|---|---|
| `surface.page` | App background |
| `surface.card` | Room cards and sheets |
| `border.default` | Card/input borders |
| `text.primary` | Main copy |
| `text.muted` | Metadata/last updated |
| `state.open` | Open/on pills and buttons |
| `state.closed` | Closed/off pills |
| `state.unavailable` | Unknown/unavailable indicators |
| `action.danger` | Confirmed bulk close/open warning only if needed |

## Core UI behavior

### Overview bar

Show aggregate state across discovered vents:

- `12 vents discovered`
- `8 open`
- `3 closed`
- `1 unavailable`

Guarded bulk actions:

- `Open all vents`
- `Close all vents`
- `Open room` / `Close room` inside each room card

Bulk actions must show confirmation copy before calling Home Assistant:

- Title: `Open all vents?`
- Body: `This will send an open command to 12 vents. Unavailable vents will be skipped.`
- Primary button: `Open 12 vents`
- Secondary button: `Cancel`

### Room card

Room card header:

- Room name, e.g. `Study Room`
- Summary, e.g. `2 open · 1 closed`
- Degraded status if any vent unavailable, e.g. `1 unavailable`

Vent row:

- Vent label: `Vent 1`
- Entity subtitle in small muted text or inspector tooltip: `switch.study_room_vent_1_vent_switch`
- State pill:
  - `Open`
  - `Closed`
  - `Unavailable`
  - `Unknown`
  - `Updating…`
- Segmented control:
  - `Open`
  - `Closed`
- `Calibrate` button

Control behavior:

- Optimistically show `Updating…` while request is in flight.
- Disable both buttons for unavailable/unknown vents, but keep calibration readable if numbers are present.
- Do not hide entity IDs entirely; expose them in a details/tooltip area for debugging.
- On request failure, revert state and show a toast with the HA error message if safe.

### Calibration panel

Calibration is a deliberate advanced control, not always expanded.

Panel contents:

- Heading: `Calibrate Study Room · Vent 1`
- Explanation: `Adjust the servo positions Home Assistant uses for fully open and fully closed.`
- Current values:
  - `Open position` slider + numeric input, `-1.00` to `1.00`, step `0.01`
  - `Closed position` slider + numeric input, `-1.00` to `1.00`, step `0.01`
- Current switch state and entity IDs
- Buttons:
  - `Apply calibration`
  - `Revert changes`
  - `Close`

Validation:

- Clamp to min/max from HA number entity metadata when available; fallback to `-1.0`/`1.0`.
- Preserve 0.01 step.
- Warn if open and closed values are very close: `Open and closed positions are nearly identical; the vent may not visibly move.`
- Warn before changing calibration on multiple vents; default scope is one vent only.

## Copy deck

Use clear, low-drama smart-home copy:

- Empty state: `No AC vents found`
- Empty state body: `The server could not find Home Assistant switch entities matching the ESPHome vent pattern.`
- Offline state: `Home Assistant is unreachable`
- Offline body: `Check HASS_URL, HASS_TOKEN, and network access from the container.`
- Mock badge: `Mock Mode`
- Mock body: `Using sample vents. No Home Assistant commands will be sent.`
- Unavailable row help: `Home Assistant reports this vent as unavailable. Commands are disabled until it comes back online.`
- Updating toast: `Sending command to Study Room Vent 1…`
- Success toast: `Study Room Vent 1 opened.` / `Study Room Vent 1 closed.`
- Failure toast: `Could not update Study Room Vent 1.`
- Calibration success: `Calibration saved for Study Room Vent 1.`

## Edge states

### No entities discovered

Show empty state with troubleshooting checklist:

1. Confirm ESPHome devices are connected to Home Assistant.
2. Confirm entity IDs match the supported pattern.
3. Use mock mode to preview the UI without HA.

### Partial entity group

If the switch exists but one or both calibration numbers are missing:

- Show the vent row normally for open/close.
- Disable or degrade calibration button with label `Calibration unavailable`.
- Details text: `Missing number.<room>_vent_<n>_set_open_position or set_closed_position.`

If calibration numbers exist but switch is missing:

- Do not render as a controllable vent by default.
- Show in a diagnostics area only if an advanced/debug mode exists.

### Unavailable/unknown entity

- Keep vent visible in its room.
- State pill: amber `Unavailable` or `Unknown`.
- Disable open/close buttons.
- Room header counts it separately.
- Bulk actions skip it and mention the skip in confirmation.

### In-flight state

- Disable repeated clicks on the same vent while the request is pending.
- Allow independent vents to update concurrently.
- Show per-row spinner/`Updating…`, not full-page blocking.

### Home Assistant offline/auth failure

- Keep cached/mock data if available, clearly marked stale.
- Disable real actions.
- Surface actionable server-side config copy without printing secrets.

### Narrow screens and many vents

- Preserve room grouping; do not collapse all vents into one long undifferentiated list.
- Use sticky header only if it does not steal too much vertical space.
- Long entity IDs wrap or hide behind `Details`, never overflow horizontally.

## API/data model guidance for implementation

Recommended server response shape:

```ts
type VentState = 'open' | 'closed' | 'unavailable' | 'unknown';

type Vent = {
  id: string;                // stable derived key, e.g. study_room:1
  roomId: string;            // study_room
  roomName: string;          // Study Room
  ventName: string;          // Vent 1
  switchEntityId: string;
  openPositionEntityId?: string;
  closedPositionEntityId?: string;
  state: VentState;
  openPosition?: number;
  closedPosition?: number;
  minPosition: number;
  maxPosition: number;
  step: number;
  available: boolean;
  lastChanged?: string;
};

type VentDashboard = {
  mode: 'live' | 'mock';
  connected: boolean;
  updatedAt: string;
  rooms: Array<{
    id: string;
    name: string;
    vents: Vent[];
  }>;
};
```

Recommended client routes/components:

- Single route `/` for the dashboard.
- API endpoints:
  - `GET /api/vents`
  - `POST /api/vents/action` with `{ "entityId": "switch...", "action": "open" | "close" }`
  - `POST /api/vents/calibration` with `{ "entityId": "number...", "value": -0.6 }`
  - Bulk actions are implemented client-side by calling the per-vent action endpoint for explicitly selected available vents after the controls are armed.

## Accessibility requirements

- Open/Closed segmented controls must be real buttons with visible labels.
- State is not color-only; use text pills.
- Calibration sliders need associated numeric inputs for precision.
- Confirmation modals/sheets trap focus and close on Escape.
- Toasts/errors should use an ARIA live region.

## Implementation priorities

1. Robust entity discovery/grouping and mock data.
2. Room card dashboard with per-vent open/close controls.
3. Unavailable/offline/empty states.
4. Calibration drawer/sheet.
5. Guarded bulk actions.
6. Visual polish/responsive pass.
