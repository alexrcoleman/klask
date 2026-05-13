import { useCallback, useRef, useState } from 'react';
import KlaskScene, { type CameraPreset, type KlaskSceneHandle } from '../components/KlaskScene';
import GameHud from '../components/hud/GameHud';
import MobileControls from '../components/hud/MobileControls';
import ScoreOverlay from '../components/hud/ScoreOverlay';
import type { NumericSetting } from '../components/hud/SettingsControls';
import {
  DEFAULT_SETTINGS,
  type GameSettings,
} from '../game/constants';
import type { GameSnapshot } from '../game/simulation';

function nextCameraPreset(current: CameraPreset): CameraPreset {
  if (current === 'broadcast') return 'table';
  if (current === 'table') return 'orthographic';
  if (current === 'orthographic') return 'low';
  return 'broadcast';
}

export default function GameRoute() {
  const sceneRef = useRef<KlaskSceneHandle | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('broadcast');
  const [controlsOpen, setControlsOpen] = useState(false);

  const resetMatch = useCallback(() => {
    sceneRef.current?.resetMatch();
  }, []);

  const cycleCamera = useCallback(() => {
    setCameraPreset(nextCameraPreset);
  }, []);

  const toggleControls = useCallback(() => {
    setControlsOpen((open) => !open);
  }, []);

  const closeControls = useCallback(() => {
    setControlsOpen(false);
  }, []);

  const updateSetting = useCallback((key: NumericSetting, value: string) => {
    setSettings((current) => ({ ...current, [key]: Number(value) }));
  }, []);

  const toggleAiDebug = useCallback((checked: boolean) => {
    setSettings((current) => ({
      ...current,
      aiControlsPlayer: checked,
    }));
  }, []);

  const toggleMagneticDebug = useCallback((checked: boolean) => {
    setSettings((current) => ({
      ...current,
      debugMagnetics: checked,
    }));
  }, []);

  return (
    <main className="appShell">
      <section className="tableStage" aria-label="Klask table">
        <KlaskScene
          ref={sceneRef}
          cameraPreset={cameraPreset}
          onSnapshot={setSnapshot}
          settings={settings}
        />
      </section>

      <MobileControls
        controlsOpen={controlsOpen}
        onClose={closeControls}
        onToggle={toggleControls}
      />

      <GameHud
        cameraPreset={cameraPreset}
        controlsOpen={controlsOpen}
        settings={settings}
        snapshot={snapshot}
        onAiDebugChange={toggleAiDebug}
        onCameraCycle={cycleCamera}
        onMagneticDebugChange={toggleMagneticDebug}
        onResetMatch={resetMatch}
        onSettingChange={updateSetting}
      />

      <ScoreOverlay scoring={snapshot?.scoring ?? null} />
    </main>
  );
}
