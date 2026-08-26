import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchVents, setCalibration, setVentAction } from './api';
import type { VentDevice, VentsResponse } from '../shared/types';

// ESPHome vents take a moment to report their new state back through HA after a
// command. We show an immediate pending state, then poll until HA confirms.
const VERIFY_DELAY_MS = 600;
const VERIFY_POLL_MS = 700;
const VERIFY_TIMEOUT_MS = 6000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function allVentsOf(data: VentsResponse | null): VentDevice[] {
  if (!data) return [];
  return data.vents.length ? data.vents : data.rooms.flatMap((room) => room.vents);
}

function findVent(data: VentsResponse | null, switchEntityId: string): VentDevice | undefined {
  return allVentsOf(data).find((vent) => vent.switchEntityId === switchEntityId);
}

export interface PendingAction {
  entityId: string;
  action: 'open' | 'close';
}

export function useVents() {
  const [data, setData] = useState<VentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyEntity, setBusyEntity] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setData(await fetchVents());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    if (data?.rooms?.length) return data.rooms.map((room) => ({ room: room.name, vents: room.vents }));
    const groups = new Map<string, VentDevice[]>();
    for (const vent of data?.vents ?? []) {
      groups.set(vent.roomName, [...(groups.get(vent.roomName) ?? []), vent]);
    }
    return [...groups.entries()].map(([room, vents]) => ({ room, vents }));
  }, [data]);

  const commandVent = useCallback(async (vent: VentDevice, action: 'open' | 'close') => {
    setBusyEntity(vent.switchEntityId);
    setPendingAction({ entityId: vent.switchEntityId, action });
    setError(null);
    try {
      await setVentAction({ entityId: vent.switchEntityId, action });
      // Poll until Home Assistant reports the commanded state (ESPHome lag),
      // the vent goes away, or we time out and just show whatever HA has.
      const target = action === 'open' ? 'open' : 'closed';
      const deadline = Date.now() + VERIFY_TIMEOUT_MS;
      await sleep(VERIFY_DELAY_MS);
      while (Date.now() < deadline) {
        const fresh = await fetchVents();
        setData(fresh);
        const current = findVent(fresh, vent.switchEntityId);
        if (!current || !current.available || current.state === target) break;
        await sleep(VERIFY_POLL_MS);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
      try {
        setData(await fetchVents());
      } catch {
        // keep last known state
      }
    } finally {
      setPendingAction(null);
      setBusyEntity(null);
    }
  }, []);

  const updateCalibration = useCallback(async (entityId: string, value: number) => {
    setBusyEntity(entityId);
    setError(null);
    try {
      await setCalibration({ entityId, value });
      // number entities settle quickly, but give HA one refreshed read anyway
      await sleep(VERIFY_DELAY_MS);
      setData(await fetchVents());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calibration failed');
    } finally {
      setBusyEntity(null);
    }
  }, []);

  return { data, grouped, loading, error, busyEntity, pendingAction, refresh, commandVent, updateCalibration };
}
