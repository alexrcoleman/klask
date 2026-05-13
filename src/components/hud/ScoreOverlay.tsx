import { memo } from 'react';
import type { GameSnapshot } from '../../game/simulation';
import { formatScoreValue, playerLabel, reasonLabels } from './hudText';

interface ScoreOverlayProps {
  scoring: GameSnapshot['scoring'];
}

const ScoreOverlay = memo(function ScoreOverlay({ scoring }: ScoreOverlayProps) {
  if (!scoring) {
    return null;
  }

  const progress = Math.min(1, scoring.elapsed / scoring.duration);
  const overlayScore = progress < 0.2 ? scoring.previousScore : scoring.nextScore;

  return (
    <div className="scoreOverlay" role="status" aria-live="polite">
      <div className="scoreOverlayPanel">
        <p className="eyebrow">{playerLabel(scoring.scorer)} scores</p>
        <div className={`scoreOverlayScore${progress >= 0.2 ? ' scoreOverlayScoreTicked' : ''}`}>
          {formatScoreValue(overlayScore)}
        </div>
        <div className="scoreOverlayReason">
          {scoring.type === 'match' ? `${playerLabel(scoring.scorer)} wins` : reasonLabels[scoring.reason]}
        </div>
      </div>
    </div>
  );
});

export default ScoreOverlay;
