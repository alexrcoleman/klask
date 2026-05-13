import { memo } from 'react';

interface MobileControlsProps {
  controlsOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

const MobileControls = memo(function MobileControls({
  controlsOpen,
  onClose,
  onToggle,
}: MobileControlsProps) {
  return (
    <>
      <button
        type="button"
        className="menuButton"
        aria-controls="game-controls"
        aria-expanded={controlsOpen}
        aria-label={controlsOpen ? 'Close controls' : 'Open controls'}
        onClick={onToggle}
      >
        <span />
        <span />
        <span />
      </button>

      {controlsOpen ? (
        <button
          type="button"
          className="hudBackdrop"
          aria-label="Close controls"
          onClick={onClose}
        />
      ) : null}
    </>
  );
});

export default MobileControls;
