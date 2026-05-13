export type Side = 'player' | 'opponent';

export interface Vector2 {
  x: number;
  z: number;
}

export interface GameSettings {
  magneticCoupling: number;
  strikerFriction: number;
  biscuitMagnetism: number;
  aiSpeed: number;
  aiControlsPlayer: boolean;
  debugMagnetics: boolean;
}

export interface NumericSettingRange {
  max: number;
  min: number;
  step: number;
}

export const BOARD = {
  width: 3.3,
  length: 4.3,
  wallThickness: 0.13,
  wallHeight: 0.34,
  baseHeight: 0.18,
  goalRadius: 0.16,
  goalInset: 0.36,
  cornerInset: 0.48,
  halfReach: 0.36,
} as const;

export const PIECES = {
  ballRadius: 0.075,
  biscuitRadius: 0.054,
  biscuitHeight: 0.084,
  strikerRadius: 0.08,
  strikerHeight: 0.57,
  steererRadius: 0.14,
  disconnectDistance: 0.52,
  reconnectDistance: 0.28,
} as const;

const CONTROLLER_MAGNET_HEIGHT = PIECES.strikerHeight * 0.95;

export const MAGNETICS = {
  controllerCenterY: -BOARD.baseHeight - CONTROLLER_MAGNET_HEIGHT * 0.5,
  controllerDropDistance: 0.42,
  controllerDropDownRate: 8.5,
  controllerDropUpRate: 13,
  controllerHeight: CONTROLLER_MAGNET_HEIGHT,
  controllerPoleSpread: CONTROLLER_MAGNET_HEIGHT * 0.38,
  strikerPoleBottomY: 0.028,
  strikerPoleTopY: 0.088,
} as const;

export const PHYSICS = {
  fixedTimeStep: 1 / 120,
  ballMass: 0.22,
  biscuitMass: 0.34,
  strikerMass: 1.8,
  restitution: 0.86,
  wallRestitution: 0.78,
  rollingDrag: 0.52,
  strikerDrag: 8.2,
  biscuitDrag: 1.2,
} as const;

export const DEFAULT_SETTINGS: GameSettings = {
  magneticCoupling: 72,
  strikerFriction: PHYSICS.strikerDrag,
  biscuitMagnetism: 1.15,
  aiSpeed: 0.92,
  aiControlsPlayer: false,
  debugMagnetics: false,
};

export const SETTING_RANGES = {
  magneticCoupling: { min: 4, max: 220, step: 1 },
  strikerFriction: { min: 0.5, max: 32, step: 0.1 },
  biscuitMagnetism: { min: 0.4, max: 2.2, step: 0.1 },
  aiSpeed: { min: 0.45, max: 1.35, step: 0.05 },
} satisfies Record<'magneticCoupling' | 'strikerFriction' | 'biscuitMagnetism' | 'aiSpeed', NumericSettingRange>;

export const BISCUIT_HOME: Vector2[] = [
  { x: -BOARD.width / 4, z: 0 },
  { x: 0, z: 0 },
  { x: BOARD.width / 4, z: 0 },
];

export function goalZFor(side: Side): number {
  return side === 'player'
    ? BOARD.length / 2 - BOARD.goalInset
    : -BOARD.length / 2 + BOARD.goalInset;
}

export function startZFor(side: Side): number {
  return side === 'player'
    ? BOARD.length / 2 - BOARD.cornerInset
    : -BOARD.length / 2 + BOARD.cornerInset;
}

export function opponentOf(side: Side): Side {
  return side === 'player' ? 'opponent' : 'player';
}
