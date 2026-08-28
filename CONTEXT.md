# Flowboard Context

Flowboard is a dashboard and control surface for ESPHome servo AC vents exposed through Home Assistant.

## Glossary

### Vent

A physical servo-controlled AC register exposed as a Home Assistant switch plus optional calibration number entities.

### Room

A display grouping for one or more vents. Rooms may also have climate sensors used by the board.

### Room Sensor Source

The room whose climate sensors should be displayed for another room. Use this when a room's own matched sensors belong to the wrong physical device, such as a leak detector. Flowboard configures these in `config/flowboard.json` under `roomSensorSources`.

### Vent Catalog

The module that turns raw Home Assistant states into a `VentsResponse`. Callers pass states plus Room Sensor Source mappings; Home Assistant naming conventions belong in its implementation.
