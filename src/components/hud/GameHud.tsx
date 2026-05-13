import { memo } from 'react';
import type { CameraPreset } from '../KlaskScene';
import type { GameSettings } from '../../game/constants';
import type { GameSnapshot } from '../../game/simulation';
import SettingsControls, { type NumericSetting } from './SettingsControls';
import { cameraLabels, formatScore, statusTextFor } from './hudText';

interface ScoreBlockProps {
  snapshot: GameSnapshot | null;
}

const ScoreBlock = memo(function ScoreBlock({ snapshot }: ScoreBlockProps) {
  return (
    <div className="scoreBlock">
      <p className="eyebrow">Klask Lab</p>
      <div className="score">{formatScore(snapshot)}</div>
      <div className="scoreLabels">
        <span>Player</span>
        <span>Opponent</span>
      </div>
    </div>
  );
});

interface ActionRowProps {
  cameraPreset: CameraPreset;
  onCameraCycle: () => void;
  onResetMatch: () => void;
}

const ActionRow = memo(function ActionRow({
  cameraPreset,
  onCameraCycle,
  onResetMatch,
}: ActionRowProps) {
  return (
    <div className="buttonRow">
      <button type="button" onClick={onResetMatch}>
        Reset
      </button>
      <button type="button" onClick={onCameraCycle}>
        {cameraLabels[cameraPreset]}
      </button>
    </div>
  );
});

interface MeterGridProps {
  aiSpeed: number;
  attachedBiscuits: number;
  magneticCoupling: number;
  strikerFriction: number;
}

const MeterGrid = memo(function MeterGrid({
  aiSpeed,
  attachedBiscuits,
  magneticCoupling,
  strikerFriction,
}: MeterGridProps) {
  return (
    <div className="meterGrid" aria-label="Piece status">
      <div>
        <span>Biscuits</span>
        <strong>{attachedBiscuits}</strong>
      </div>
      <div>
        <span>AI</span>
        <strong>{Math.round(aiSpeed * 100)}%</strong>
      </div>
      <div>
        <span>Magnet</span>
        <strong>{Math.round(magneticCoupling * 10)}</strong>
      </div>
      <div>
        <span>Friction</span>
        <strong>{strikerFriction.toFixed(1)}</strong>
      </div>
    </div>
  );
});

interface GameHudProps {
  cameraPreset: CameraPreset;
  controlsOpen: boolean;
  onAiDebugChange: (checked: boolean) => void;
  onCameraCycle: () => void;
  onMagneticDebugChange: (checked: boolean) => void;
  onResetMatch: () => void;
  onSettingChange: (key: NumericSetting, value: string) => void;
  settings: GameSettings;
  snapshot: GameSnapshot | null;
}

const GameHud = memo(function GameHud({
  cameraPreset,
  controlsOpen,
  onAiDebugChange,
  onCameraCycle,
  onMagneticDebugChange,
  onResetMatch,
  onSettingChange,
  settings,
  snapshot,
}: GameHudProps) {
  return (
    <aside
      id="game-controls"
      className={`hud${controlsOpen ? ' hudOpen' : ''}`}
      aria-label="Game controls"
    >
      <ScoreBlock snapshot={snapshot} />

      <div className="statusLine">{statusTextFor(snapshot)}</div>

      <ActionRow
        cameraPreset={cameraPreset}
        onCameraCycle={onCameraCycle}
        onResetMatch={onResetMatch}
      />

      <MeterGrid
        aiSpeed={settings.aiSpeed}
        attachedBiscuits={snapshot?.attached.player ?? 0}
        magneticCoupling={settings.magneticCoupling}
        strikerFriction={settings.strikerFriction}
      />

      <SettingsControls
        settings={settings}
        onAiDebugChange={onAiDebugChange}
        onMagneticDebugChange={onMagneticDebugChange}
        onSettingChange={onSettingChange}
      />
    </aside>
  );
});

export default GameHud;
