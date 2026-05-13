import { memo, type ChangeEvent } from 'react';
import {
  SETTING_RANGES,
  type GameSettings,
  type NumericSettingRange,
} from '../../game/constants';

export type NumericSetting = keyof typeof SETTING_RANGES;

interface SettingSliderProps {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  range: NumericSettingRange;
  value: number;
}

const SettingSlider = memo(function SettingSlider({
  label,
  onChange,
  range,
  value,
}: SettingSliderProps) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input
        min={range.min}
        max={range.max}
        step={range.step}
        type="range"
        value={value}
        onChange={onChange}
      />
    </label>
  );
});

interface SettingsControlsProps {
  onAiDebugChange: (checked: boolean) => void;
  onMagneticDebugChange: (checked: boolean) => void;
  onSettingChange: (key: NumericSetting, value: string) => void;
  settings: GameSettings;
}

const SettingsControls = memo(function SettingsControls({
  onAiDebugChange,
  onMagneticDebugChange,
  onSettingChange,
  settings,
}: SettingsControlsProps) {
  const makeSettingHandler = (key: NumericSetting) => (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onSettingChange(key, event.target.value);
  };

  return (
    <>
      <label className="toggle">
        <span>AI controls both sides</span>
        <input
          checked={Boolean(settings.aiControlsPlayer)}
          type="checkbox"
          onChange={(event) => onAiDebugChange(event.target.checked)}
        />
      </label>

      <label className="toggle">
        <span>Show magnetic charges</span>
        <input
          checked={Boolean(settings.debugMagnetics)}
          type="checkbox"
          onChange={(event) => onMagneticDebugChange(event.target.checked)}
        />
      </label>

      <SettingSlider
        label="Magnet pull"
        range={SETTING_RANGES.magneticCoupling}
        value={settings.magneticCoupling}
        onChange={makeSettingHandler('magneticCoupling')}
      />

      <SettingSlider
        label="Striker friction"
        range={SETTING_RANGES.strikerFriction}
        value={settings.strikerFriction}
        onChange={makeSettingHandler('strikerFriction')}
      />

      <SettingSlider
        label="Biscuit pull"
        range={SETTING_RANGES.biscuitMagnetism}
        value={settings.biscuitMagnetism}
        onChange={makeSettingHandler('biscuitMagnetism')}
      />

      <SettingSlider
        label="AI speed"
        range={SETTING_RANGES.aiSpeed}
        value={settings.aiSpeed}
        onChange={makeSettingHandler('aiSpeed')}
      />
    </>
  );
});

export default SettingsControls;
