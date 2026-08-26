import type { HomeAssistantState } from '../shared/types.js';

export function createMockStates(): HomeAssistantState[] {
  return [
    // room climate sensors (mock)
    { entity_id: 'sensor.hearth_temperature', state: '67.6', attributes: { friendly_name: 'Hearth Temperature', device_class: 'temperature', unit_of_measurement: '°F' } },
    { entity_id: 'sensor.hearth_humidity', state: '43', attributes: { friendly_name: 'Hearth Humidity', device_class: 'humidity', unit_of_measurement: '%' } },
    { entity_id: 'sensor.hearth_battery', state: '39', attributes: { friendly_name: 'Hearth Sensor Battery', device_class: 'battery', unit_of_measurement: '%' } },
    // kitchen's own sensors are a water-leak detector — must NOT be used (alias: kitchen -> hearth)
    { entity_id: 'sensor.kitchen_battery', state: '50', attributes: { friendly_name: 'Kitchen Leak Detector Battery', device_class: 'battery', unit_of_measurement: '%' } },
    {
      entity_id: 'switch.kitchen_vent_1_vent_switch',
      state: 'on',
      attributes: { friendly_name: 'Kitchen Vent 1 Vent Switch' },
      last_updated: '2026-08-25T12:00:00Z',
    },
    { entity_id: 'sensor.study_room_temperature_and_humidity_sensor_temperature', state: '72.4', attributes: { friendly_name: 'Study Room Temperature And Humidity Sensor Temperature', device_class: 'temperature', unit_of_measurement: '°F' } },
    { entity_id: 'sensor.study_room_temperature_and_humidity_sensor_humidity', state: '41', attributes: { friendly_name: 'Study Room Temperature And Humidity Sensor Humidity', device_class: 'humidity', unit_of_measurement: '%' } },
    { entity_id: 'sensor.study_room_temperature_and_humidity_sensor_battery', state: '40', attributes: { friendly_name: 'Study Room Temperature And Humidity Sensor Battery', device_class: 'battery', unit_of_measurement: '%' } },
    { entity_id: 'sensor.study_room_vibration_sensor_battery', state: '100', attributes: { friendly_name: 'Study Room Vibration Sensor Battery', device_class: 'battery', unit_of_measurement: '%' } },
    { entity_id: 'sensor.master_bedroom_temperature', state: '21.7', attributes: { friendly_name: 'Master Bedroom Temperature', device_class: 'temperature', unit_of_measurement: '°C' } },
    { entity_id: 'sensor.master_bedroom_humidity', state: '44', attributes: { friendly_name: 'Master Bedroom Humidity', device_class: 'humidity', unit_of_measurement: '%' } },
    {
      entity_id: 'switch.study_room_vent_1_vent_switch',
      state: 'on',
      attributes: { friendly_name: 'Study Room Vent 1 Vent Switch' },
      last_updated: '2026-08-25T12:00:00Z',
    },
    {
      entity_id: 'number.study_room_vent_1_set_open_position',
      state: '-0.60',
      attributes: { friendly_name: 'Study Room Vent 1 Set Open Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'number.study_room_vent_1_set_closed_position',
      state: '-0.15',
      attributes: { friendly_name: 'Study Room Vent 1 Set Closed Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'switch.great_room_vent_1_vent_switch',
      state: 'off',
      attributes: { friendly_name: 'Great Room Vent 1 Vent Switch' },
      last_updated: '2026-08-25T12:00:00Z',
    },
    {
      entity_id: 'number.great_room_vent_1_set_open_position',
      state: '-0.50',
      attributes: { friendly_name: 'Great Room Vent 1 Set Open Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'number.great_room_vent_1_set_closed_position',
      state: '0.00',
      attributes: { friendly_name: 'Great Room Vent 1 Set Closed Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'switch.master_bedroom_vent_1_vent_switch',
      state: 'on',
      attributes: { friendly_name: 'Master Bedroom Vent 1 Vent Switch' },
      last_updated: '2026-08-25T12:00:00Z',
    },
    {
      entity_id: 'number.master_bedroom_vent_1_set_open_position',
      state: '-0.65',
      attributes: { friendly_name: 'Master Bedroom Vent 1 Set Open Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'number.master_bedroom_vent_1_set_closed_position',
      state: '-0.20',
      attributes: { friendly_name: 'Master Bedroom Vent 1 Set Closed Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'switch.office_room_vent_1_vent_switch',
      state: 'unavailable',
      attributes: { friendly_name: 'Office Room Vent 1 Vent Switch' },
      last_updated: '2026-08-25T12:00:00Z',
    },
    {
      entity_id: 'number.office_room_vent_1_set_open_position',
      state: 'unavailable',
      attributes: { friendly_name: 'Office Room Vent 1 Set Open Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'number.office_room_vent_1_set_closed_position',
      state: 'unavailable',
      attributes: { friendly_name: 'Office Room Vent 1 Set Closed Position', min: -1, max: 1, step: 0.01 },
    },
    {
      entity_id: 'switch.nursery_vent_1_vent_switch',
      state: 'unknown',
      attributes: { friendly_name: 'Nursery Vent 1 Vent Switch' },
      last_updated: '2026-08-25T12:00:00Z',
    },
  ];
}

export const mockStates: HomeAssistantState[] = createMockStates();
