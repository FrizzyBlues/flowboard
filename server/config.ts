import fs from 'node:fs';
import path from 'node:path';

export interface FlowboardConfig {
  roomSensorSources: Record<string, string>;
}

const DEFAULT_CONFIG: FlowboardConfig = {
  roomSensorSources: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''),
  );
}

export function loadFlowboardConfig(configPath = path.join(process.cwd(), 'config', 'flowboard.json')): FlowboardConfig {
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!isRecord(parsed)) return DEFAULT_CONFIG;
    return {
      roomSensorSources: readStringMap(parsed.roomSensorSources),
    };
  } catch (error) {
    console.warn(`Flowboard config ignored: ${error instanceof Error ? error.message : 'unknown error'}`);
    return DEFAULT_CONFIG;
  }
}
