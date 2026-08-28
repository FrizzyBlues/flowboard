import { AlertTriangle, BatteryFull, BatteryLow, Droplets, Fan, Gauge, RefreshCcw, ShieldCheck, Thermometer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useVents } from './useVents';
import type { PendingAction } from './useVents';
import type { RoomSensors, VentDevice } from '../shared/types';

type Theme = 'light' | 'dark' | 'system';
const THEME_KEY = 'acv-theme';

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => { root.dataset.theme = resolveTheme('system'); };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, setTheme };
}

function CalibrationField({ label, entityId, value, min, max, step, disabled, busy, onSave }: {
  label: string;
  entityId: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  busy: boolean;
  onSave: (entityId: string, value: number) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [savedFlash, setSavedFlash] = useState(false);
  const numeric = Number(draft);
  const valid = draft !== '' && Number.isFinite(numeric) && numeric >= min && numeric <= max;
  return (
    <div className="cal-row">
      <span className="cal-label">{label}</span>
      <input
        aria-label={`${label} position for ${entityId}`}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled || busy}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        disabled={disabled || busy || !valid}
        onClick={() => {
          onSave(entityId, numeric);
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 900);
        }}
      >
        {savedFlash ? 'SAVED!' : 'SAVE'}
      </button>
    </div>
  );
}

/* The No.4 DAMPER REGISTER — the vent graphic IS the toggle control.
   Click the register: slats animate open/closed, cloud puffs drift when open.
   Carries the vent-number ribbon and the fixed-size status ribbon. */
function DamperRegister({ state, pending, disabled, onToggle, label, ventTag }: {
  state: 'open' | 'closed' | 'unknown' | 'unavailable';
  pending: 'open' | 'close' | null;
  disabled: boolean;
  onToggle: () => void;
  label: string;
  ventTag: string;
}) {
  const isOpen = state === 'open';
  const actionLabel = isOpen ? `Close ${label}` : `Open ${label}`;
  const pillLabel = pending ? `${pending === 'open' ? 'OPENING' : 'CLOSING'}…` : state.toUpperCase();
  // fixed-size tile: longer words get proportionally smaller type
  const pillFont = pillLabel.length <= 7 ? '.68rem' : pillLabel.length <= 9 ? '.56rem' : '.44rem';
  const pillClass = pending ? 'pill-state-pending' : `pill-state-${state}`;
  return (
    <button
      type="button"
      className={`register ${isOpen ? 'is-open' : ''} ${pending ? 'is-pending' : ''} ${disabled ? 'is-disabled' : ''}`}
      aria-label={actionLabel}
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="slats" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span>
      <span className="wind" aria-hidden="true">
        <i /><i /><i /><i />
      </span>
      <span className="ribbon ribbon-vent" aria-hidden="true">{ventTag}</span>
      <span className={`ribbon ribbon-state ${pillClass}${pending ? ' pill-pending' : ''}`}>
        <span className="ribbon-state-text" style={{ fontSize: pillFont }}>{pillLabel}</span>
      </span>
    </button>
  );
}

/* Room sensor chips — Variant C side column. Icons only, no labels. */
function SensorColumn({ sensors }: { sensors: RoomSensors }) {
  const chips: Array<{ key: string; icon: React.ReactNode; value: string; className: string; title: string }> = [];
  if (sensors.temperature !== null) {
    const unit = sensors.temperatureUnit === '°C' ? '°C' : sensors.temperatureUnit === '°F' ? '°F' : '°';
    chips.push({
      key: 'temp', icon: <Thermometer size={13} />,
      value: `${Math.round(sensors.temperature * 10) / 10}${unit}`,
      className: 'chip-temp', title: `Temperature — ${sensors.temperatureEntityId ?? ''}`,
    });
  }
  if (sensors.humidity !== null) {
    chips.push({
      key: 'hum', icon: <Droplets size={13} />,
      value: `${Math.round(sensors.humidity)}%`,
      className: 'chip-hum', title: `Humidity — ${sensors.humidityEntityId ?? ''}`,
    });
  }
  if (sensors.battery !== null) {
    const low = sensors.battery <= 20;
    chips.push({
      key: 'batt', icon: low ? <BatteryLow size={13} /> : <BatteryFull size={13} />,
      value: `${Math.round(sensors.battery)}%`,
      className: low ? 'chip-batt chip-low' : 'chip-batt', title: `Battery — ${sensors.batteryEntityId ?? ''}`,
    });
  }
  if (chips.length === 0) return null;
  return (
    <div className="sensor-col">
      {chips.map((chip) => (
        <span key={chip.key} className={`chip ${chip.className}`} title={chip.title}>
          {chip.icon} {chip.value}
        </span>
      ))}
    </div>
  );
}

function VentCard({ vent, busy, pendingAction, onCommand, onCalibrate }: {
  vent: VentDevice;
  busy: boolean;
  pendingAction: PendingAction | null;
  onCommand: (vent: VentDevice, action: 'open' | 'close') => void;
  onCalibrate: (entityId: string, value: number) => void;
}) {
  const [showCal, setShowCal] = useState(false);
  const isPending = pendingAction?.entityId === vent.switchEntityId;
  // Optimistic display: while a command is verifying, show the target state.
  const shownState = isPending ? (pendingAction!.action === 'open' ? 'open' : 'closed') : vent.state;
  const disabled = !vent.available || busy;
  // "Vent 1" -> "V1" ribbon tag
  const ventTag = vent.ventName.replace(/^Vent\s+(\d+)$/i, 'V$1');

  return (
    <article className={`vent ${!vent.available ? 'is-offline' : ''} ${showCal ? 'show-cal' : ''} ${isPending ? 'is-pending' : ''}`}>
      <span className="pin" aria-hidden="true" />
      <div className="view-controls">
        <div className="row">
          <h2 className="vent-name">{vent.roomName}</h2>
        </div>
        <div className="vent-body">
          {vent.sensors && <SensorColumn sensors={vent.sensors} />}
          <DamperRegister
            state={shownState}
            pending={isPending ? pendingAction!.action : null}
            disabled={disabled}
            onToggle={() => onCommand(vent, shownState === 'open' ? 'close' : 'open')}
            label={vent.displayName}
            ventTag={ventTag}
          />
        </div>
      </div>
      <div className="view-cal">
        <div className="row">
          <h2 className="vent-name">{vent.roomName}</h2>
        </div>
        <div className="cal-body">
          {vent.openPositionEntityId ? (
            <CalibrationField label="OPEN" entityId={vent.openPositionEntityId} value={vent.openPosition}
              min={vent.minPosition} max={vent.maxPosition} step={vent.step}
              disabled={!vent.available} busy={busy} onSave={onCalibrate} />
          ) : null}
          {vent.closedPositionEntityId ? (
            <CalibrationField label="CLOSED" entityId={vent.closedPositionEntityId} value={vent.closedPosition}
              min={vent.minPosition} max={vent.maxPosition} step={vent.step}
              disabled={!vent.available} busy={busy} onSave={onCalibrate} />
          ) : null}
          {!vent.openPositionEntityId && !vent.closedPositionEntityId && (
            <div className="cal-empty">No calibration entities found.</div>
          )}
          {!vent.available && (
            <div className="cal-empty">OFFLINE — restore the ESPHome device to calibrate.</div>
          )}
        </div>
      </div>
      <div className="cal-toggle">
        <button aria-expanded={showCal} onClick={() => setShowCal(!showCal)}>
          {showCal ? '◂ BACK TO CONTROLS' : 'CALIBRATE'}
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const { data, loading, error, busyEntity, pendingAction, refresh, commandVent, updateCalibration } = useVents();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [activeRoom, setActiveRoom] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [armed, setArmed] = useState(false);

  const allVents = useMemo(
    () => (data?.vents.length ? data.vents : (data?.rooms.flatMap((room) => room.vents) ?? [])),
    [data],
  );

  const roomNames = useMemo(() => [...new Set(allVents.map((vent) => vent.roomName))].sort(), [allVents]);

  const visibleVents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allVents.filter((vent) => {
      const roomOk = activeRoom === 'ALL' || vent.roomName === activeRoom;
      const statusOk = statusFilter === 'all' || (statusFilter === 'online' ? vent.available : !vent.available);
      const hay = `${vent.roomName} ${vent.ventName} ${vent.displayName} ${vent.switchEntityId}`.toLowerCase();
      return roomOk && statusOk && (!needle || hay.includes(needle));
    });
  }, [allVents, activeRoom, statusFilter, query]);

  const available = allVents.filter((vent) => vent.available);
  const offlineCount = allVents.length - available.length;
  const openCount = available.filter((vent) => vent.state !== 'open').length;
  const closeCount = available.filter((vent) => vent.state !== 'closed').length;

  function toggleStatusFilter(next: 'online' | 'offline') {
    setStatusFilter((current) => (current === next ? 'all' : next));
  }

  async function bulk(action: 'open' | 'close') {
    const targets = available.filter((vent) => (action === 'open' ? vent.state !== 'open' : vent.state !== 'closed'));
    for (const vent of targets) await commandVent(vent, action);
  }

  return (
    <main className="shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow"><Fan size={16} /> AC VENT CONTROL — ESPHOME // HOME ASSISTANT</p>
          <h1>FLOWBOARD</h1>
          <p className="tagline">Every vent. One board. Total airflow control.</p>
        </div>
        <aside className="stats">
          <div className="theme-switch" role="group" aria-label="Theme">
            {(['light', 'system', 'dark'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={theme === option ? 'active' : ''}
                aria-pressed={theme === option}
                onClick={() => setTheme(option)}
                title={`${option[0].toUpperCase()}${option.slice(1)} theme`}
              >
                {option === 'light' ? '☀' : option === 'dark' ? '☾' : '◐'}
              </button>
            ))}
          </div>
          <b className="stat-online"><ShieldCheck size={14} /> {available.length} ONLINE</b>
          <b className="stat-off"><AlertTriangle size={14} /> {offlineCount} OFFLINE</b>
          <b className="stat-mode"><Gauge size={14} /> {data?.mode === 'live' ? 'LIVE' : data ? 'MOCK MODE' : '…'}</b>
        </aside>
      </header>

      <section className="toolbar">
        <input
          aria-label="Filter vents"
          placeholder="FILTER ROOM / ENTITY…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className={armed ? 'armed' : ''} onClick={() => setArmed(!armed)}>{armed ? 'BULK ARMED!' : 'ARM BULK'}</button>
        <button disabled={!armed || openCount === 0} onClick={() => bulk('open')}>OPEN ALL</button>
        <button disabled={!armed || closeCount === 0} onClick={() => bulk('close')}>CLOSE ALL</button>
        <button onClick={refresh} disabled={loading}><RefreshCcw size={16} /> REFRESH</button>
      </section>

      {error && <div className="error"><AlertTriangle size={18} /> {error}</div>}
      {loading && <div className="loading">Loading vent states…</div>}

      <section className="lanes">
        <nav className="rail">
          <button
            className={`room-btn ${statusFilter === 'online' ? 'active' : ''}`}
            aria-pressed={statusFilter === 'online'}
            onClick={() => toggleStatusFilter('online')}
          >
            ONLINE <span className="cnt">{available.length}</span>
          </button>
          <button
            className={`room-btn ${statusFilter === 'offline' ? 'active' : ''}`}
            aria-pressed={statusFilter === 'offline'}
            onClick={() => toggleStatusFilter('offline')}
          >
            OFFLINE <span className="cnt">{offlineCount}</span>
          </button>
          <div className="rail-sep" />
          <button className={activeRoom === 'ALL' ? 'active' : ''} onClick={() => setActiveRoom('ALL')}>
            ALL ROOMS <span className="cnt">{allVents.length}</span>
          </button>
          {roomNames.map((room) => {
            const roomVents = allVents.filter((vent) => vent.roomName === room);
            const offline = roomVents.some((vent) => !vent.available);
            return (
              <button key={room} className={activeRoom === room ? 'active' : ''} onClick={() => setActiveRoom(room)}>
                {room.toUpperCase()}
                {offline && <span className="off">OFF</span>}
                {!offline && <span className="cnt">{roomVents.length}</span>}
              </button>
            );
          })}
        </nav>

        <div className="cards">
          {visibleVents.map((vent) => (
            <VentCard key={vent.id} vent={vent} busy={busyEntity === vent.switchEntityId} pendingAction={pendingAction} onCommand={commandVent} onCalibrate={updateCalibration} />
          ))}
          {!loading && visibleVents.length === 0 && (
            <div className="empty">No vents match the current filter.</div>
          )}
        </div>
      </section>
    </main>
  );
}
