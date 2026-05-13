import type { CameraPreset } from '../KlaskScene';
import type { GameSnapshot } from '../../game/simulation';

export const cameraLabels: Record<CameraPreset, string> = {
  broadcast: 'Broadcast',
  table: 'Table',
  orthographic: 'Overhead',
  low: 'Low',
};

export const reasonLabels: Record<NonNullable<GameSnapshot['scoring']>['reason'], string> = {
  Goal: 'Goal',
  KLASK: 'KLASK',
  Biscuits: 'Two biscuits attached',
  'Lost control': 'Lost control',
};

export function formatScore(snapshot: GameSnapshot | null): string {
  if (!snapshot?.score) {
    return '0 - 0';
  }

  return `${snapshot.score.player} - ${snapshot.score.opponent}`;
}

export function formatScoreValue(score: GameSnapshot['score']): string {
  return `${score.player} - ${score.opponent}`;
}

export function playerLabel(side: 'player' | 'opponent'): string {
  return side === 'player' ? 'Player' : 'Opponent';
}

export function statusTextFor(snapshot: GameSnapshot | null): string {
  if (!snapshot) {
    return 'Loading table';
  }

  if (snapshot.scoring) {
    return snapshot.scoring.type === 'match'
      ? `${playerLabel(snapshot.scoring.scorer)} wins`
      : `${playerLabel(snapshot.scoring.scorer)} scores: ${reasonLabels[snapshot.scoring.reason]}`;
  }

  if (snapshot.winner) {
    return `${playerLabel(snapshot.winner)} wins`;
  }

  if (snapshot.roundActive) {
    return snapshot.message || 'In play';
  }

  return snapshot.message || `${snapshot.servingSide === 'player' ? 'Player' : 'Opponent'} serve`;
}
