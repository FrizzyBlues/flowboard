import { describe, expect, it } from 'vitest';
import { discoverVentDashboard, discoverVents } from './ventDiscovery.js';
import { mockStates } from './mockData.js';

describe('discoverVents', () => {
  it('groups ESPHome vent switches with calibration numbers', () => {
    const vents = discoverVents(mockStates);
    const study = vents.find((vent) => vent.id === 'study_room_vent_1');
    expect(study).toMatchObject({ roomName: 'Study Room', ventName: 'Vent 1', state: 'open', openPosition: -0.6, closedPosition: -0.15 });
  });

  it('marks unavailable vents safely', () => {
    const vents = discoverVents(mockStates);
    const office = vents.find((vent) => vent.id === 'office_room_vent_1');
    expect(office?.available).toBe(false);
    expect(office?.state).toBe('unavailable');
  });

  it('kitchen can borrow hearth sensors through injected room sensor sources', () => {
    const dashboard = discoverVentDashboard(mockStates, { mode: 'mock', roomSensorSources: { kitchen: 'hearth' } });
    const kitchen = dashboard.vents.find((vent) => vent.id === 'kitchen_vent_1');
    expect(kitchen?.sensors).toMatchObject({
      temperature: 67.6,
      temperatureEntityId: 'sensor.hearth_temperature',
      humidity: 43,
      humidityEntityId: 'sensor.hearth_humidity',
    });
  });

  it('uses injected room sensor sources instead of hardcoded aliases', () => {
    const dashboard = discoverVentDashboard(mockStates, {
      mode: 'mock',
      roomSensorSources: { kitchen: 'study_room' },
    });
    const kitchen = dashboard.vents.find((vent) => vent.id === 'kitchen_vent_1');
    expect(kitchen?.sensors).toMatchObject({
      temperature: 72.4,
      temperatureEntityId: 'sensor.study_room_temperature_and_humidity_sensor_temperature',
      humidity: 41,
      humidityEntityId: 'sensor.study_room_temperature_and_humidity_sensor_humidity',
    });
  });

  it('joins room climate sensors to vents and shares them across a room', () => {
    const vents = discoverVents(mockStates);
    // study room has temp/hum/battery sensors
    const study = vents.find((vent) => vent.id === 'study_room_vent_1');
    expect(study?.sensors).toMatchObject({
      temperature: 72.4,
      temperatureUnit: '°F',
      temperatureEntityId: 'sensor.study_room_temperature_and_humidity_sensor_temperature',
      humidity: 41,
      humidityEntityId: 'sensor.study_room_temperature_and_humidity_sensor_humidity',
      battery: 40,
      batteryEntityId: 'sensor.study_room_temperature_and_humidity_sensor_battery',
    });
    // master bedroom has temp+hum but no battery -> battery null, sensors still present
    const master = vents.find((vent) => vent.id === 'master_bedroom_vent_1');
    expect(master?.sensors).toMatchObject({ temperature: 21.7, humidity: 44, battery: null });
    // room without sensors -> undefined, no sensors key
    const great = vents.find((vent) => vent.id === 'great_room_vent_1');
    expect(great?.sensors).toBeUndefined();
  });
});
