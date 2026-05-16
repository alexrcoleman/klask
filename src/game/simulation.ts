import {
  BISCUIT_HOME,
  BOARD,
  DEFAULT_SETTINGS,
  MAGNETICS,
  PHYSICS,
  PIECES,
  goalZFor,
  opponentOf,
  startZFor,
  type GameSettings,
  type Side,
  type Vector2,
} from './constants';

const SIDES: Side[] = ['player', 'opponent'];
const BISCUIT_ATTACH_MARGIN = 0.052;
const BISCUIT_DETACH_MARGIN = 0.24;
const BISCUIT_AIR_GRAVITY = 5.2;
const BISCUIT_AIRBORNE_COLLISION_HEIGHT = 0.05;
const BISCUIT_LAUNCH_THRESHOLD = 0.7;
const BISCUIT_ATTACHED_RELEASE_SPEED = 5.8;
const BISCUIT_ATTACHED_RELEASE_IMPULSE = 4.4;
const BISCUIT_MAX_TILT = Math.PI - 0.12;
const BISCUIT_FREE_MAGNET_GAP = 0.26;
const BISCUIT_ATTACHED_MAGNET_GAP = BISCUIT_DETACH_MARGIN;
const BISCUIT_FREE_MAGNET_STRENGTH = 6.2;
const BISCUIT_ATTACHED_MAGNET_STRENGTH = 34;
const BISCUIT_MAGNET_DAMPING = 4.6;
const BISCUIT_ATTACHED_TANGENTIAL_DAMPING = 18;
const BISCUIT_FLAT_SETTLE_STIFFNESS = 7.5;
const BISCUIT_FLAT_SETTLE_DAMPING = 5.4;
const BISCUIT_MAGNET_ROLL_TORQUE = 32;
const SCORE_INTERSTITIAL_SECONDS = 4;
const SCORE_AFTERPLAY_SECONDS = 2.25;
const CONTROLLER_MIDLINE_CLEARANCE = PIECES.steererRadius;
const GOAL_DEPTH = PIECES.ballRadius * 1.5;
const MAGNETIC_SOFTENING = 0.22;
const CONTROLLER_PLANAR_SPRING = 12.5;
const CONTROLLER_PLANAR_DAMPING = 1.35;
const CONTROLLER_PLANAR_REACH = 0.32;
const STRIKER_TILT_MAX = 1.42;
const STRIKER_FALLEN_TILT = 1.05;
const STRIKER_UPRIGHT_STIFFNESS = 22;
const STRIKER_UPRIGHT_DAMPING = 7.4;
const STRIKER_FALLEN_STIFFNESS = 4.2;
const STRIKER_FALLEN_DAMPING = 1.7;
const BODY_VERTICAL_GRAVITY = 5.6;
const BALL_VERTICAL_RESTITUTION = 0.34;
const CONTROLLER_LOWERED_MIN_STRENGTH = 0.006;
const BODY_MAX_AIR_HEIGHT = 0.42;
const BODY_MAX_UPWARD_SPEED = 1.8;
const BODY_MAX_DOWNWARD_SPEED = 2.8;
const AI_SECOND_BISCUIT_DANGER_RADIUS = 0.72;
const AI_CONTROLLER_LEASH = 0.34;

interface GoalWellOptions {
  captureRadius: number;
  gravity: number;
  horizontalDrag: number;
  minEntrySinkSpeed: number;
  pull: number;
  rimRadius: number;
  wallRadius: number;
  wallRestitution: number;
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface ChargePoint {
  point: Vector3;
  charge: number;
}

interface MagneticInteraction {
  forceOnSource: Vector3;
  torqueOnSource: Vector3;
  torqueOnTarget: Vector3;
}

interface ControllerMagneticEffect {
  force: Vector3;
  influence: number;
  side: Side;
  torque: Vector3;
}

interface RoundStepOptions {
  allowAi: boolean;
  allowMessageTimer: boolean;
  allowScoring: boolean;
}

export type PointReason = 'Goal' | 'KLASK' | 'Biscuits' | 'Lost control';
type ScoreEventType = 'point' | 'match';

export interface Body {
  pos: Vector2;
  vel: Vector2;
  radius: number;
  mass: number;
  sink: number;
  sinkVel: number;
  y: number;
  yVel: number;
}

export interface Steerer extends Vector2 {
  drop?: number;
  targetDrop?: number;
}

export interface Striker extends Body {
  side: Side;
  coupledTo: Side | null;
  lostTime: number;
  tiltX: number;
  tiltZ: number;
  tiltVelX: number;
  tiltVelZ: number;
  yaw: number;
  yawVel: number;
}

export interface Biscuit extends Body {
  id: string;
  attachedTo: Side | null;
  attachSlot: number;
  angle: number;
  lift: number;
  liftVel: number;
  spin: number;
  tiltX: number;
  tiltZ: number;
  tiltVelX: number;
  tiltVelZ: number;
}

export interface Score {
  player: number;
  opponent: number;
}

export interface ScoreInterstitial {
  elapsed: number;
  duration: number;
  goalSide: Side | null;
  goalStart: Vector2 | null;
  nextScore: Score;
  previousScore: Score;
  reason: PointReason;
  scorer: Side;
  server: Side;
  type: ScoreEventType;
}

export interface GameState {
  score: Score;
  servingSide: Side;
  roundActive: boolean;
  roundIndex: number;
  elapsed: number;
  winner: Side | null;
  message: string;
  messageTimer: number;
  scoring: ScoreInterstitial | null;
  ball: Body;
  strikers: Record<Side, Striker>;
  steerers: Record<Side, Steerer>;
  biscuits: Biscuit[];
}

export interface GameSnapshot {
  score: Score;
  servingSide: Side;
  roundActive: boolean;
  winner: Side | null;
  message: string;
  scoring: Omit<ScoreInterstitial, 'goalSide' | 'goalStart' | 'server'> | null;
  attached: Score;
  ball: {
    x: number;
    y: number;
    z: number;
    speed: number;
    sink: number;
  };
}

export interface ScoreEvent {
  type: ScoreEventType;
  scorer: Side;
  reason: PointReason;
}

function vec(x = 0, z = 0): Vector2 {
  return { x, z };
}

function vec3(x = 0, y = 0, z = 0): Vector3 {
  return { x, y, z };
}

function cloneVec(value: Vector2): Vector2 {
  return vec(value.x, value.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeSteerer(x: number, z: number, source?: Steerer): Steerer {
  return {
    x,
    z,
    drop: clamp(source?.drop ?? 0, 0, MAGNETICS.controllerDropDistance),
    targetDrop: clamp(source?.targetDrop ?? 0, 0, MAGNETICS.controllerDropDistance),
  };
}

function steererDrop(steerer: Steerer): number {
  return clamp(steerer.drop ?? 0, 0, MAGNETICS.controllerDropDistance);
}

function steererTargetDrop(steerer: Steerer): number {
  return clamp(steerer.targetDrop ?? 0, 0, MAGNETICS.controllerDropDistance);
}

function steererCenterY(steerer: Steerer): number {
  return MAGNETICS.controllerCenterY - steererDrop(steerer);
}

function steererStrengthScale(steerer: Steerer): number {
  const amount = clamp(steererDrop(steerer) / MAGNETICS.controllerDropDistance, 0, 1);
  const eased = amount * amount * (3 - amount * 2);
  return CONTROLLER_LOWERED_MIN_STRENGTH + (1 - CONTROLLER_LOWERED_MIN_STRENGTH) * (1 - eased);
}

function length(x: number, z: number): number {
  return Math.hypot(x, z);
}

function length3(value: Vector3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize3(value: Vector3): Vector3 {
  const magnitude = length3(value);

  if (magnitude <= 0.000001) {
    return vec3(0, 1, 0);
  }

  return vec3(value.x / magnitude, value.y / magnitude, value.z / magnitude);
}

function add3(a: Vector3, b: Vector3): Vector3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function subtract3(a: Vector3, b: Vector3): Vector3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale3(value: Vector3, scale: number): Vector3 {
  return vec3(value.x * scale, value.y * scale, value.z * scale);
}

function cross3(a: Vector3, b: Vector3): Vector3 {
  return vec3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function clampMagnitude3(value: Vector3, maxMagnitude: number): Vector3 {
  const magnitude = length3(value);

  if (magnitude <= maxMagnitude || magnitude <= 0.000001) {
    return value;
  }

  return scale3(value, maxMagnitude / magnitude);
}

function controllerPlanarFalloff(distance: number): number {
  const reach = CONTROLLER_PLANAR_REACH;
  const ratio = distance / reach;
  const ratioSq = ratio * ratio;
  const ratioFourth = ratioSq * ratioSq;
  return 1 / (1 + ratioFourth * ratioFourth);
}

function controllerHalfFalloff(striker: Striker, controllerSide: Side): number {
  const sideSign = controllerSide === 'player' ? 1 : -1;
  const crossMidlineDepth = Math.max(0, -sideSign * striker.pos.z);
  const ratio = crossMidlineDepth / 0.42;
  const ratioSq = ratio * ratio;
  return 1 / (1 + ratioSq * ratioSq * ratioSq);
}

function dampVelocity(body: Body, drag: number, dt: number): void {
  const damping = Math.exp(-drag * dt);
  body.vel.x *= damping;
  body.vel.z *= damping;
  body.yVel *= damping;
}

function addScaledVelocity(body: Body, force: Vector2 | Vector3, invMass: number, dt: number): void {
  body.vel.x += force.x * invMass * dt;
  body.vel.z += force.z * invMass * dt;

  if ('y' in force) {
    body.yVel += force.y * invMass * dt;
  }
}

function integrate(body: Body, dt: number): void {
  body.pos.x += body.vel.x * dt;
  body.pos.z += body.vel.z * dt;
  body.y += body.yVel * dt;
}

function constrainBodyVerticalMotion(body: Body): void {
  body.yVel = clamp(body.yVel, -BODY_MAX_DOWNWARD_SPEED, BODY_MAX_UPWARD_SPEED);

  if (body.y > BODY_MAX_AIR_HEIGHT) {
    body.y = BODY_MAX_AIR_HEIGHT;
    body.yVel = Math.min(0, body.yVel);
  }
}

function advanceBodyOnBoard(body: Body, dt: number, drag: number, restitution: number): void {
  dampVelocity(body, drag, dt);
  applyBodyGravity(body, dt);
  integrate(body, dt);
  constrainBodyVerticalMotion(body);
  settleBodyOnBoard(body, restitution);
}

function advanceStrikerBody(striker: Striker, dt: number, restitution: number, drag: number): void {
  advanceBodyOnBoard(striker, dt, drag, restitution);
  updateStrikerTilt(striker, dt);
}

function biscuitDragFor(biscuit: Biscuit): number {
  if (isBiscuitAirborne(biscuit)) {
    return PHYSICS.biscuitDrag * 0.28;
  }

  return biscuit.attachedTo ? PHYSICS.biscuitDrag * 5.5 : PHYSICS.biscuitDrag;
}

function advanceBiscuitBody(biscuit: Biscuit, dt: number): void {
  updateBiscuitDipole(biscuit, dt);
  dampVelocity(biscuit, biscuitDragFor(biscuit), dt);
  integrate(biscuit, dt);
  updateBiscuitLift(biscuit, dt);
}

function makeBody(x: number, z: number, radius: number, mass: number): Body {
  return {
    pos: vec(x, z),
    vel: vec(),
    radius,
    mass,
    sink: 0,
    sinkVel: 0,
    y: 0,
    yVel: 0,
  };
}

function makeStriker(side: Side): Striker {
  const z = side === 'player' ? 1.18 : -1.18;

  return {
    ...makeBody(0, z, PIECES.strikerRadius, PHYSICS.strikerMass),
    side,
    coupledTo: side,
    lostTime: 0,
    tiltX: 0,
    tiltZ: 0,
    tiltVelX: 0,
    tiltVelZ: 0,
    yaw: 0,
    yawVel: 0,
  };
}

function makeBiscuit(index: number): Biscuit {
  const home = BISCUIT_HOME[index] ?? BISCUIT_HOME[0];

  return {
    ...makeBody(home.x, home.z, PIECES.biscuitRadius, PHYSICS.biscuitMass),
    id: `biscuit-${index}`,
    attachedTo: null,
    attachSlot: index,
    angle: (Math.PI * 2 * index) / 3,
    lift: 0,
    liftVel: 0,
    spin: 0,
    tiltX: 0,
    tiltZ: 0,
    tiltVelX: 0,
    tiltVelZ: 0,
  };
}

function axisFromTilt(tiltX: number, tiltZ: number): Vector3 {
  const cosX = Math.cos(tiltX);
  const cosZ = Math.cos(tiltZ);

  return normalize3(vec3(
    -Math.sin(tiltZ) * cosX,
    cosX * cosZ,
    Math.sin(tiltX),
  ));
}

function strikerAxis(striker: Striker): Vector3 {
  return axisFromTilt(striker.tiltX, striker.tiltZ);
}

function strikerBaseY(striker: Striker): number {
  return striker.y - striker.sink * GOAL_DEPTH;
}

function strikerTiltAmount(striker: Striker): number {
  return length(striker.tiltX, striker.tiltZ);
}

function strikerUprightness(striker: Striker): number {
  return clamp(1 - strikerTiltAmount(striker) / STRIKER_FALLEN_TILT, 0.24, 1);
}

function strikerCollisionRadius(striker: Striker): number {
  const fallen = clamp(strikerTiltAmount(striker) / STRIKER_FALLEN_TILT, 0, 1);
  return striker.radius + fallen * PIECES.strikerHeight * 0.34;
}

function biscuitAxis(biscuit: Biscuit): Vector3 {
  return axisFromTilt(biscuit.tiltX, biscuit.tiltZ);
}

function biscuitSupportHeight(biscuit: Biscuit): number {
  const axis = biscuitAxis(biscuit);
  const axisY = Math.abs(axis.y);
  const radialY = Math.sqrt(Math.max(0, 1 - axisY * axisY));
  return (PIECES.biscuitHeight * 0.5 * axisY) + (PIECES.biscuitRadius * radialY);
}

function biscuitCenterY(biscuit: Biscuit): number {
  return biscuit.lift + biscuitSupportHeight(biscuit);
}

function biscuitCollisionRadius(biscuit: Biscuit): number {
  const axisY = Math.abs(biscuitAxis(biscuit).y);
  return PIECES.biscuitRadius + (1 - axisY) * PIECES.biscuitHeight * 0.5;
}

function strikerCharges(striker: Striker): ChargePoint[] {
  const axis = strikerAxis(striker);
  const origin = vec3(striker.pos.x, strikerBaseY(striker), striker.pos.z);

  return [
    {
      charge: 1,
      point: add3(origin, scale3(axis, MAGNETICS.strikerPoleTopY)),
    },
    {
      charge: -1,
      point: add3(origin, scale3(axis, MAGNETICS.strikerPoleBottomY)),
    },
  ];
}

function steererCharges(steerer: Steerer): ChargePoint[] {
  const centerY = steererCenterY(steerer);

  return [
    {
      charge: 1,
      point: vec3(steerer.x, centerY + MAGNETICS.controllerPoleSpread, steerer.z),
    },
    {
      charge: -1,
      point: vec3(steerer.x, centerY - MAGNETICS.controllerPoleSpread, steerer.z),
    },
  ];
}

function biscuitCharges(biscuit: Biscuit): ChargePoint[] {
  const axis = biscuitAxis(biscuit);
  const center = vec3(biscuit.pos.x, biscuitCenterY(biscuit), biscuit.pos.z);
  const offset = PIECES.biscuitHeight * 0.5;

  return [
    {
      charge: -1,
      point: add3(center, scale3(axis, offset)),
    },
    {
      charge: 1,
      point: add3(center, scale3(axis, -offset)),
    },
  ];
}

function chargeForce(source: ChargePoint, target: ChargePoint, strength: number): Vector3 {
  const delta = subtract3(target.point, source.point);
  const distSq = delta.x * delta.x + delta.y * delta.y + delta.z * delta.z + MAGNETIC_SOFTENING * MAGNETIC_SOFTENING;
  const scale = (-source.charge * target.charge * strength) / (distSq * Math.sqrt(distSq));
  return scale3(delta, scale);
}

function dipoleForce(source: ChargePoint[], target: ChargePoint[], strength: number, maxForce: number): Vector3 {
  let force = vec3();

  for (const sourceCharge of source) {
    for (const targetCharge of target) {
      force = add3(force, chargeForce(sourceCharge, targetCharge, strength));
    }
  }

  return clampMagnitude3(force, maxForce);
}

function dipoleTorque(
  origin: Vector3,
  source: ChargePoint[],
  target: ChargePoint[],
  strength: number,
  maxTorque: number,
): Vector3 {
  let torque = vec3();

  for (const sourceCharge of source) {
    for (const targetCharge of target) {
      const force = chargeForce(sourceCharge, targetCharge, strength);
      torque = add3(torque, cross3(subtract3(sourceCharge.point, origin), force));
    }
  }

  return clampMagnitude3(torque, maxTorque);
}

function dipoleInteraction(
  source: ChargePoint[],
  target: ChargePoint[],
  sourceOrigin: Vector3,
  targetOrigin: Vector3,
  strength: number,
  maxForce: number,
  maxTorque: number,
): MagneticInteraction {
  let forceOnSource = vec3();
  let torqueOnSource = vec3();
  let torqueOnTarget = vec3();

  for (const sourceCharge of source) {
    for (const targetCharge of target) {
      const force = chargeForce(sourceCharge, targetCharge, strength);
      const reaction = scale3(force, -1);
      forceOnSource = add3(forceOnSource, force);
      torqueOnSource = add3(torqueOnSource, cross3(subtract3(sourceCharge.point, sourceOrigin), force));
      torqueOnTarget = add3(torqueOnTarget, cross3(subtract3(targetCharge.point, targetOrigin), reaction));
    }
  }

  return {
    forceOnSource: clampMagnitude3(forceOnSource, maxForce),
    torqueOnSource: clampMagnitude3(torqueOnSource, maxTorque),
    torqueOnTarget: clampMagnitude3(torqueOnTarget, maxTorque),
  };
}

function cornerForServe(side: Side, roundIndex: number): Vector2 {
  const xSign = roundIndex % 2 === 0 ? -1 : 1;

  return vec(xSign * (BOARD.width / 2 - BOARD.cornerInset), startZFor(side));
}

export function createInitialState(): GameState {
  const state: GameState = {
    score: { player: 0, opponent: 0 },
    servingSide: 'player',
    roundActive: false,
    roundIndex: 0,
    elapsed: 0,
    winner: null,
    message: 'Player serve',
    messageTimer: 0,
    scoring: null,
    ball: makeBody(0, startZFor('player'), PIECES.ballRadius, PHYSICS.ballMass),
    strikers: {
      player: makeStriker('player'),
      opponent: makeStriker('opponent'),
    },
    steerers: {
      player: makeSteerer(0, 1.18),
      opponent: makeSteerer(0, -1.18),
    },
    biscuits: BISCUIT_HOME.map((_, index) => makeBiscuit(index)),
  };

  resetRound(state, 'player', 'Player serve');
  return state;
}

export function resetMatch(state: GameState): void {
  state.score.player = 0;
  state.score.opponent = 0;
  state.roundIndex = 0;
  state.winner = null;
  state.scoring = null;
  resetRound(state, 'player', 'Player serve');
}

export function resetRound(
  state: GameState,
  servingSide: Side = state.servingSide,
  message = '',
): void {
  state.servingSide = servingSide;
  state.roundActive = false;
  state.scoring = null;
  state.roundIndex += 1;
  state.ball = makeBody(0, 0, PIECES.ballRadius, PHYSICS.ballMass);
  state.ball.pos = cornerForServe(servingSide, state.roundIndex);
  state.ball.vel.x = 0;
  state.ball.vel.z = 0;

  state.strikers.player = makeStriker('player');
  state.strikers.opponent = makeStriker('opponent');
  state.steerers.player = makeSteerer(state.strikers.player.pos.x, state.strikers.player.pos.z);
  state.steerers.opponent = makeSteerer(state.strikers.opponent.pos.x, state.strikers.opponent.pos.z);
  state.biscuits = BISCUIT_HOME.map((_, index) => makeBiscuit(index));
  state.message = message || `${servingSide === 'player' ? 'Player' : 'Opponent'} serve`;
  state.messageTimer = 2.2;
}

export function serveBall(state: GameState): void {
  if (state.winner) {
    resetMatch(state);
    return;
  }

  if (state.roundActive || state.scoring) {
    return;
  }

  const direction = state.servingSide === 'player' ? -1 : 1;
  const xDirection = state.ball.pos.x <= 0 ? 1 : -1;
  state.ball.vel.x = xDirection * 0.9;
  state.ball.vel.z = direction * 1.6;
  state.roundActive = true;
  state.message = '';
  state.messageTimer = 0;
}

export function tryServeFromPointer(state: GameState, x: number, z: number): boolean {
  if (state.winner || state.roundActive || state.scoring) {
    return false;
  }

  const dx = x - state.ball.pos.x;
  const dz = z - state.ball.pos.z;

  if (length(dx, dz) > state.ball.radius + 0.18) {
    return false;
  }

  serveBall(state);
  return true;
}

export function setPlayerSteerer(state: GameState, x: number, z: number): void {
  state.steerers.player = clampSteerer('player', x, z, state.steerers.player);
}

export function setPlayerSteererLowered(state: GameState, lowered: boolean): void {
  setSteererDropTarget(state, 'player', lowered);
}

export function getSnapshot(state: GameState): GameSnapshot {
  return {
    score: { ...state.score },
    servingSide: state.servingSide,
    roundActive: state.roundActive,
    winner: state.winner,
    message: state.message,
    scoring: state.scoring
      ? {
        elapsed: state.scoring.elapsed,
        duration: state.scoring.duration,
        nextScore: { ...state.scoring.nextScore },
        previousScore: { ...state.scoring.previousScore },
        reason: state.scoring.reason,
        scorer: state.scoring.scorer,
        type: state.scoring.type,
      }
      : null,
    attached: {
      player: attachedCount(state, 'player'),
      opponent: attachedCount(state, 'opponent'),
    },
    ball: {
      x: state.ball.pos.x,
      y: state.ball.y,
      z: state.ball.pos.z,
      speed: Math.hypot(state.ball.vel.x, state.ball.yVel, state.ball.vel.z),
      sink: state.ball.sink,
    },
  };
}

function updateScoringInterstitial(state: GameState, dt: number): void {
  const scoring = state.scoring;

  if (!scoring) {
    return;
  }

  scoring.elapsed = Math.min(scoring.duration, scoring.elapsed + dt);

  if (scoring.elapsed < scoring.duration) {
    return;
  }

  if (state.winner) {
    state.scoring = null;
    state.message = `${state.winner === 'player' ? 'Player' : 'Opponent'} wins`;
    state.messageTimer = 999;
    return;
  }

  resetRound(
    state,
    scoring.server,
    `${scoring.server === 'player' ? 'Player' : 'Opponent'} serve`,
  );
}

export function stepSimulation(
  state: GameState,
  dt: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): ScoreEvent | null {
  updateSteererElevations(state, dt);

  if (state.scoring) {
    updateScoringInterstitial(state, dt);

    if (state.scoring && state.scoring.elapsed < SCORE_AFTERPLAY_SECONDS) {
      advanceActiveRoundPhysics(state, dt, settings, {
        allowAi: false,
        allowMessageTimer: false,
        allowScoring: false,
      });
    }

    return null;
  }

  if (state.winner) {
    return null;
  }

  state.elapsed += dt;

  if (!state.roundActive) {
    if (state.servingSide === 'opponent' || settings.aiControlsPlayer) {
      updateServingAiSteerer(state, settings, dt, state.servingSide);
    }

    for (const side of SIDES) {
      applyMagneticCoupling(state, side, settings, dt);
      state.strikers[side].lostTime = 0;
      advanceStrikerBody(state.strikers[side], dt, BALL_VERTICAL_RESTITUTION, settings.strikerFriction);
      keepInsideField(state.strikers[side], PHYSICS.wallRestitution * 0.86, strikerCollisionRadius(state.strikers[side]));
    }

    maybeStartServeFromStrike(state);
    return null;
  }

  return advanceActiveRoundPhysics(state, dt, settings, {
    allowAi: true,
    allowMessageTimer: true,
    allowScoring: true,
  });
}

function advanceActiveRoundPhysics(
  state: GameState,
  dt: number,
  settings: GameSettings,
  options: RoundStepOptions,
): ScoreEvent | null {
  if (options.allowMessageTimer && state.messageTimer > 0) {
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    if (state.messageTimer === 0 && !state.winner) {
      state.message = '';
    }
  }

  if (options.allowAi && settings.aiControlsPlayer) {
    updateAiSteerer(state, settings, dt, 'player');
  }

  if (options.allowAi) {
    updateAiSteerer(state, settings, dt, 'opponent');
  }

  for (const side of SIDES) {
    applyMagneticCoupling(state, side, settings, dt);
  }

  for (const biscuit of state.biscuits) {
    applyBiscuitMagnetism(state, biscuit, settings, dt);
  }

  advanceBodyOnBoard(state.ball, dt, PHYSICS.rollingDrag, BALL_VERTICAL_RESTITUTION);

  for (const side of SIDES) {
    const striker = state.strikers[side];
    advanceStrikerBody(striker, dt, BALL_VERTICAL_RESTITUTION * 0.55, settings.strikerFriction);
  }

  for (const biscuit of state.biscuits) {
    advanceBiscuitBody(biscuit, dt);
  }

  resolvePieceCollisions(state);
  keepInsideField(state.ball, PHYSICS.wallRestitution);

  for (const side of SIDES) {
    keepInsideField(state.strikers[side], PHYSICS.wallRestitution * 0.86, strikerCollisionRadius(state.strikers[side]));
  }

  for (const biscuit of state.biscuits) {
    keepInsideField(biscuit, PHYSICS.wallRestitution * 0.58, biscuitCollisionRadius(biscuit));
  }

  updateGoalWells(state, dt);

  for (const biscuit of state.biscuits) {
    updateBiscuitAttachment(state, biscuit);
  }

  return options.allowScoring ? checkScoring(state) : null;
}

function setSteererDropTarget(state: GameState, side: Side, lowered: boolean): void {
  const current = state.steerers[side];
  state.steerers[side] = makeSteerer(current.x, current.z, {
    ...current,
    targetDrop: lowered ? MAGNETICS.controllerDropDistance : 0,
  });
}

function updateSteererElevations(state: GameState, dt: number): void {
  for (const side of SIDES) {
    const current = state.steerers[side];
    const drop = steererDrop(current);
    const targetDrop = steererTargetDrop(current);
    const rate = targetDrop > drop
      ? MAGNETICS.controllerDropDownRate
      : MAGNETICS.controllerDropUpRate;
    const nextDrop = drop + (targetDrop - drop) * (1 - Math.exp(-rate * dt));

    state.steerers[side] = makeSteerer(current.x, current.z, {
      ...current,
      drop: Math.abs(nextDrop - targetDrop) < 0.001 ? targetDrop : nextDrop,
      targetDrop,
    });
  }
}

function clampSteerer(side: Side, x: number, z: number, source?: Steerer): Steerer {
  const xLimit = BOARD.width / 2 - PIECES.steererRadius;
  const zMin = side === 'player'
    ? CONTROLLER_MIDLINE_CLEARANCE
    : -BOARD.length / 2 + PIECES.steererRadius;
  const zMax = side === 'player'
    ? BOARD.length / 2 - PIECES.steererRadius
    : -CONTROLLER_MIDLINE_CLEARANCE;

  return makeSteerer(clamp(x, -xLimit, xLimit), clamp(z, zMin, zMax), source);
}

function moveSteererToward(
  state: GameState,
  side: Side,
  target: Vector2,
  maxStep: number,
): void {
  const current = state.steerers[side];
  const clampedTarget = clampSteerer(side, target.x, target.z, current);
  const dx = clampedTarget.x - current.x;
  const dz = clampedTarget.z - current.z;
  const distance = length(dx, dz);

  if (distance <= maxStep || distance === 0) {
    state.steerers[side] = clampedTarget;
    return;
  }

  state.steerers[side] = clampSteerer(
    side,
    current.x + (dx / distance) * maxStep,
    current.z + (dz / distance) * maxStep,
    current,
  );
}

function shotDirectionFor(side: Side, ball: Body): Vector2 {
  const targetGoal = opponentOf(side);
  const dx = -ball.pos.x;
  const dz = goalZFor(targetGoal) - ball.pos.z;
  const distance = length(dx, dz) || 1;

  return vec(dx / distance, dz / distance);
}

function shotSteererTarget(
  state: GameState,
  side: Side,
  setupDistance: number,
  strikeDistance: number,
): Vector2 {
  const striker = state.strikers[side];
  const ball = state.ball;
  const direction = shotDirectionFor(side, ball);
  const strikerToBallX = striker.pos.x - ball.pos.x;
  const strikerToBallZ = striker.pos.z - ball.pos.z;
  const alongShot = strikerToBallX * direction.x + strikerToBallZ * direction.z;
  const lateral = Math.abs(strikerToBallX * -direction.z + strikerToBallZ * direction.x);
  const readyToStrike = alongShot < -setupDistance * 0.45 && lateral < 0.13;

  if (readyToStrike) {
    return vec(
      ball.pos.x + direction.x * strikeDistance,
      ball.pos.z + direction.z * strikeDistance,
    );
  }

  return vec(
    ball.pos.x - direction.x * setupDistance,
    ball.pos.z - direction.z * setupDistance,
  );
}

function isLooseGroundedBiscuit(biscuit: Biscuit): boolean {
  return biscuit.attachedTo === null && !isBiscuitAirborne(biscuit);
}

function hasLooseBiscuitNear(state: GameState, point: Vector2, radius: number): boolean {
  return nearestLooseBiscuitNear(state, point, radius) !== null;
}

function nearestLooseBiscuitNear(state: GameState, point: Vector2, radius: number): Biscuit | null {
  let best: Biscuit | null = null;
  let bestDistance = radius;

  for (const biscuit of state.biscuits) {
    if (!isLooseGroundedBiscuit(biscuit)) {
      continue;
    }

    const distance = length(biscuit.pos.x - point.x, biscuit.pos.z - point.z);

    if (distance < bestDistance) {
      best = biscuit;
      bestDistance = distance;
    }
  }

  return best;
}

function aiDefensiveTarget(state: GameState, side: Side): Vector2 {
  const sideSign = side === 'player' ? 1 : -1;
  const ownGoalZ = sideSign * 1.36;
  const nearestBiscuit = state.biscuits
    .filter(isLooseGroundedBiscuit)
    .reduce<Biscuit | null>((nearest, biscuit) => {
      if (!nearest) {
        return biscuit;
      }

      const currentDistance = length(state.ball.pos.x - biscuit.pos.x, state.ball.pos.z - biscuit.pos.z);
      const nearestDistance = length(state.ball.pos.x - nearest.pos.x, state.ball.pos.z - nearest.pos.z);
      return currentDistance < nearestDistance ? biscuit : nearest;
    }, null);
  const avoidX = nearestBiscuit && Math.abs(nearestBiscuit.pos.x) < 0.48
    ? -Math.sign(nearestBiscuit.pos.x || state.ball.pos.x || 1) * 0.34
    : state.ball.pos.x * 0.34;

  return vec(
    clamp(avoidX, -BOARD.width / 2 + 0.38, BOARD.width / 2 - 0.38),
    ownGoalZ,
  );
}

function nudgeAiTargetAwayFromLooseBiscuits(
  state: GameState,
  side: Side,
  target: Vector2,
): Vector2 {
  const attached = attachedCount(state, side);
  const sideSign = side === 'player' ? 1 : -1;
  const radius = attached > 0 ? 0.74 : 0.24;
  let adjusted = vec(target.x, target.z);

  for (const biscuit of state.biscuits) {
    if (!isLooseGroundedBiscuit(biscuit)) {
      continue;
    }

    const dx = adjusted.x - biscuit.pos.x;
    const dz = adjusted.z - biscuit.pos.z;
    const distance = length(dx, dz);

    if (distance >= radius) {
      continue;
    }

    const push = (radius - distance) * (attached > 0 ? 1.7 : 0.48);
    const nx = distance > 0.0001 ? dx / distance : Math.sign(adjusted.x || biscuit.pos.x || 1);
    const nz = distance > 0.0001 ? dz / distance : sideSign;
    adjusted = vec(adjusted.x + nx * push, adjusted.z + nz * push);
  }

  return clampSteerer(side, adjusted.x, adjusted.z, state.steerers[side]);
}

function leashAiTargetToStriker(striker: Striker, target: Vector2): Vector2 {
  const dx = target.x - striker.pos.x;
  const dz = target.z - striker.pos.z;
  const distance = length(dx, dz);

  if (distance <= AI_CONTROLLER_LEASH || distance === 0) {
    return target;
  }

  return vec(
    striker.pos.x + (dx / distance) * AI_CONTROLLER_LEASH,
    striker.pos.z + (dz / distance) * AI_CONTROLLER_LEASH,
  );
}

function updateAiSteerer(
  state: GameState,
  settings: GameSettings,
  dt: number,
  side: Side,
): void {
  setSteererDropTarget(state, side, false);

  const sideSign = side === 'player' ? 1 : -1;
  const defensiveZ = sideSign * 1.08;
  const centerSafetyZ = sideSign * 0.74;
  const ball = state.ball;
  const striker = state.strikers[side];
  const ballSpeed = length(ball.vel.x, ball.vel.z);
  const canReachBall = sideSign * ball.pos.z > -BOARD.halfReach + 0.08;
  const safetyMinZ = side === 'player' ? centerSafetyZ : -BOARD.length / 2 + 0.42;
  const safetyMaxZ = side === 'player' ? BOARD.length / 2 - 0.42 : centerSafetyZ;
  const attached = attachedCount(state, side);
  const shotTarget = shotSteererTarget(state, side, 0.28, 0.38);
  const immediateSecondBiscuitThreat = attached > 0
    ? nearestLooseBiscuitNear(state, striker.pos, 0.38)
    : null;
  const secondBiscuitRisk = attached > 0 && (
    hasLooseBiscuitNear(state, ball.pos, AI_SECOND_BISCUIT_DANGER_RADIUS)
    || hasLooseBiscuitNear(state, shotTarget, AI_SECOND_BISCUIT_DANGER_RADIUS)
    || hasLooseBiscuitNear(state, striker.pos, 0.28)
  );
  const stalledReachableBall = canReachBall && ballSpeed < 0.22;
  let target = vec(
    clamp(ball.pos.x * 0.82, -BOARD.width / 2 + 0.32, BOARD.width / 2 - 0.32),
    clamp(ball.pos.z + sideSign * 0.2, safetyMinZ, safetyMaxZ),
  );
  let speed = 2.8;

  if (immediateSecondBiscuitThreat) {
    const awayX = striker.pos.x - immediateSecondBiscuitThreat.pos.x;
    const awayZ = striker.pos.z - immediateSecondBiscuitThreat.pos.z;
    const awayDistance = length(awayX, awayZ) || 1;
    target = vec(
      striker.pos.x + (awayX / awayDistance) * 0.82,
      striker.pos.z + (awayZ / awayDistance) * 0.82,
    );
    speed = 7.2;
  } else if (secondBiscuitRisk && !stalledReachableBall) {
    target = aiDefensiveTarget(state, side);
    speed = 5.4;
  } else if (canReachBall) {
    target = shotTarget;
    speed = stalledReachableBall ? 4.9 : 4.2;

    if (secondBiscuitRisk && stalledReachableBall) {
      const threat = nearestLooseBiscuitNear(state, ball.pos, AI_SECOND_BISCUIT_DANGER_RADIUS)
        ?? nearestLooseBiscuitNear(state, shotTarget, AI_SECOND_BISCUIT_DANGER_RADIUS);

      if (threat) {
        const shotDirection = shotDirectionFor(side, ball);
        const lateral = vec(-shotDirection.z, shotDirection.x);
        const sideAwayFromBiscuit = Math.sign(
          (ball.pos.x - threat.pos.x) * lateral.x
          + (ball.pos.z - threat.pos.z) * lateral.z,
        ) || Math.sign(ball.pos.x || sideSign);
        target.x += lateral.x * sideAwayFromBiscuit * 0.86;
        target.z += lateral.z * sideAwayFromBiscuit * 0.86;
        speed = 6.8;
      }
    }
  } else if (sideSign * ball.pos.z < -0.22) {
    target.x *= 0.42;
    target.z = defensiveZ;
  }

  target = nudgeAiTargetAwayFromLooseBiscuits(state, side, target);
  const leashedTarget = leashAiTargetToStriker(striker, target);
  target = clampSteerer(
    side,
    leashedTarget.x,
    leashedTarget.z,
    state.steerers[side],
  );

  moveSteererToward(
    state,
    side,
    target,
    speed * settings.aiSpeed * dt,
  );
}

function updateServingAiSteerer(
  state: GameState,
  settings: GameSettings,
  dt: number,
  side: Side,
): void {
  setSteererDropTarget(state, side, false);

  moveSteererToward(
    state,
    side,
    shotSteererTarget(state, side, 0.31, 0.42),
    3.9 * settings.aiSpeed * dt,
  );
}

function maybeStartServeFromStrike(state: GameState): void {
  const striker = state.strikers[state.servingSide];
  const dx = state.ball.pos.x - striker.pos.x;
  const dz = state.ball.pos.z - striker.pos.z;
  const distance = length(dx, dz) || 0.0001;
  const steerer = state.steerers[state.servingSide];
  const steererDistance = length(steerer.x - state.ball.pos.x, steerer.z - state.ball.pos.z);
  const serveContactDistance = state.ball.radius + striker.radius + (steererDistance < 0.22 ? 0.12 : 0.012);

  if (distance > serveContactDistance) {
    return;
  }

  const nx = dx / distance;
  const nz = dz / distance;
  const strikeSpeed = striker.vel.x * nx + striker.vel.z * nz;

  if (strikeSpeed < 0.08 && length(striker.vel.x, striker.vel.z) < 0.18) {
    return;
  }

  state.roundActive = true;
  state.message = '';
  state.messageTimer = 0;
  resolveCircleCollision(striker, state.ball, PHYSICS.restitution, striker.mass, state.ball.mass);

  if (length(state.ball.vel.x, state.ball.vel.z) < 0.35) {
    state.ball.vel.x += nx * 0.42;
    state.ball.vel.z += nz * 0.42;
  }
}

function applyMagneticCoupling(
  state: GameState,
  side: Side,
  settings: GameSettings,
  dt: number,
): void {
  const striker = state.strikers[side];
  const effects = SIDES.map((controllerSide) => (
    controllerMagneticEffect(striker, state.steerers[controllerSide], controllerSide, settings)
  ));
  const dominant = effects.reduce((best, current) => (
    current.influence > best.influence ? current : best
  ));
  const own = effects.find((effect) => effect.side === side) ?? dominant;

  for (const effect of effects) {
    addScaledVelocity(striker, effect.force, 1 / striker.mass, dt);
    striker.tiltVelX += effect.torque.x * dt * 0.08;
    striker.tiltVelZ += effect.torque.z * dt * 0.08;
  }

  striker.coupledTo = dominant.side;

  if (
    dominant.side !== side
    && isOnOpponentHalf(striker, side)
    && dominant.influence > own.influence * 1.12
  ) {
    striker.lostTime += dt;
  } else {
    striker.lostTime = Math.max(0, striker.lostTime - dt * 3);
  }
}

function controllerMagneticEffect(
  striker: Striker,
  steerer: Steerer,
  controllerSide: Side,
  settings: GameSettings,
): ControllerMagneticEffect {
  const dx = steerer.x - striker.pos.x;
  const dz = steerer.z - striker.pos.z;
  const distance = length(dx, dz);
  const controllerScale = steererStrengthScale(steerer) * controllerHalfFalloff(striker, controllerSide);
  const springScale = strikerUprightness(striker)
    * controllerScale
    * controllerPlanarFalloff(distance);
  const source = strikerCharges(striker);
  const target = steererCharges(steerer);
  const magneticForce = dipoleForce(
    source,
    target,
    settings.magneticCoupling * 2.4 * controllerScale,
    settings.magneticCoupling * 9.4 * controllerScale,
  );
  const damping = settings.magneticCoupling * CONTROLLER_PLANAR_DAMPING * springScale;
  const planarSpring = settings.magneticCoupling * CONTROLLER_PLANAR_SPRING * springScale;
  const verticalMagneticForce = Math.min(0, magneticForce.y);
  const force = vec3(
    magneticForce.x * 0.35 + dx * planarSpring - striker.vel.x * damping,
    verticalMagneticForce * 0.1,
    magneticForce.z * 0.35 + dz * planarSpring - striker.vel.z * damping,
  );
  const torque = dipoleTorque(
    vec3(striker.pos.x, strikerBaseY(striker), striker.pos.z),
    source,
    target,
    settings.magneticCoupling * 0.42 * controllerScale,
    settings.magneticCoupling * 0.18 * controllerScale,
  );
  const influence = length3(magneticForce) * 0.35 + Math.abs(planarSpring) * distance;

  return {
    force,
    influence,
    side: controllerSide,
    torque,
  };
}

function isOnOpponentHalf(striker: Striker, side: Side): boolean {
  return side === 'player' ? striker.pos.z < -0.04 : striker.pos.z > 0.04;
}

function applyBiscuitMagnetism(
  state: GameState,
  biscuit: Biscuit,
  settings: GameSettings,
  dt: number,
): void {
  for (const side of SIDES) {
    const airScale = 1 - clamp(biscuit.lift / 0.16, 0, 0.72);
    const striker = state.strikers[side];
    const dx = striker.pos.x - biscuit.pos.x;
    const dz = striker.pos.z - biscuit.pos.z;
    const distance = length(dx, dz);
    const attachedToThisStriker = biscuit.attachedTo === side;
    const contactDistance = strikerCollisionRadius(striker) + biscuitCollisionRadius(biscuit);
    const gap = Math.max(0, distance - contactDistance);
    const range = attachedToThisStriker
      ? BISCUIT_ATTACHED_MAGNET_GAP
      : BISCUIT_FREE_MAGNET_GAP;

    if (distance === 0 || gap > range) {
      continue;
    }

    const nx = dx / distance;
    const nz = dz / distance;
    const relativeAlong = (biscuit.vel.x - striker.vel.x) * nx + (biscuit.vel.z - striker.vel.z) * nz;
    const tx = -nz;
    const tz = nx;
    const relativeTangent = (biscuit.vel.x - striker.vel.x) * tx + (biscuit.vel.z - striker.vel.z) * tz;
    const falloff = 1 - gap / range;
    const strengthScale = attachedToThisStriker
      ? BISCUIT_ATTACHED_MAGNET_STRENGTH
      : BISCUIT_FREE_MAGNET_STRENGTH;
    const dampingScale = attachedToThisStriker ? 2.8 : 1;
    const strikerReactionScale = attachedToThisStriker ? 0.35 : 1;
    const strikerTorqueScale = attachedToThisStriker ? 0.012 : 0.08;
    const contactPullScale = attachedToThisStriker
      ? clamp(gap / 0.022, 0, 1)
      : 1;
    const biscuitOrigin = vec3(biscuit.pos.x, biscuitCenterY(biscuit), biscuit.pos.z);
    const strikerOrigin = vec3(striker.pos.x, strikerBaseY(striker), striker.pos.z);
    const interaction = dipoleInteraction(
      biscuitCharges(biscuit),
      strikerCharges(striker),
      biscuitOrigin,
      strikerOrigin,
      settings.biscuitMagnetism * strengthScale * airScale,
      settings.biscuitMagnetism * strengthScale * 8.5 * airScale,
      settings.biscuitMagnetism * strengthScale * 2.6 * airScale,
    );
    const dampingForce = -relativeAlong
      * settings.biscuitMagnetism
      * BISCUIT_MAGNET_DAMPING
      * dampingScale
      * falloff;
    const tangentFriction = attachedToThisStriker
      ? -relativeTangent * settings.biscuitMagnetism * BISCUIT_ATTACHED_TANGENTIAL_DAMPING * falloff
      : 0;
    const force = vec3(
      interaction.forceOnSource.x * contactPullScale + nx * dampingForce + tx * tangentFriction,
      interaction.forceOnSource.y * 0.42,
      interaction.forceOnSource.z * contactPullScale + nz * dampingForce + tz * tangentFriction,
    );
    addScaledVelocity(biscuit, vec(force.x, force.z), 1 / biscuit.mass, dt);
    biscuit.liftVel += force.y * (1 / biscuit.mass) * dt;
    addScaledVelocity(
      striker,
      vec3(
        -force.x * strikerReactionScale,
        Math.min(0, -interaction.forceOnSource.y) * 0.08 * strikerReactionScale,
        -force.z * strikerReactionScale,
      ),
      1 / striker.mass,
      dt,
    );
    biscuit.tiltVelX += interaction.torqueOnSource.x * dt * 0.82;
    biscuit.tiltVelZ += interaction.torqueOnSource.z * dt * 0.82;
    biscuit.tiltVelX += force.z * dt * BISCUIT_MAGNET_ROLL_TORQUE;
    biscuit.tiltVelZ -= force.x * dt * BISCUIT_MAGNET_ROLL_TORQUE;
    striker.tiltVelX += interaction.torqueOnTarget.x * dt * strikerTorqueScale;
    striker.tiltVelZ += interaction.torqueOnTarget.z * dt * strikerTorqueScale;
  }
}

function updateBiscuitDipole(biscuit: Biscuit, dt: number): void {
  biscuit.angle += biscuit.spin * dt;
  biscuit.spin *= Math.exp(-4.2 * dt);
}

function applyBodyGravity(body: Body, dt: number): void {
  if (body.sink > 0.02) {
    body.yVel = 0;
    body.y = 0;
    return;
  }

  if (body.y > 0 || body.yVel > 0) {
    body.yVel -= BODY_VERTICAL_GRAVITY * dt;
  }
}

function settleBodyOnBoard(body: Body, restitution: number): void {
  if (body.y >= 0) {
    return;
  }

  body.y = 0;

  if (body.yVel < -0.22) {
    body.yVel = -body.yVel * restitution;
  } else {
    body.yVel = 0;
  }
}

function updateStrikerTilt(striker: Striker, dt: number): void {
  const tilt = strikerTiltAmount(striker);
  const coupled = striker.coupledTo !== null;
  const fallenBlend = clamp(tilt / STRIKER_FALLEN_TILT, 0, 1);
  const stiffness = coupled
    ? STRIKER_UPRIGHT_STIFFNESS * (1 - fallenBlend) + STRIKER_FALLEN_STIFFNESS * fallenBlend
    : STRIKER_FALLEN_STIFFNESS * 0.34;
  const damping = coupled
    ? STRIKER_UPRIGHT_DAMPING * (1 - fallenBlend) + STRIKER_FALLEN_DAMPING * fallenBlend
    : STRIKER_FALLEN_DAMPING;

  striker.tiltVelX += -striker.tiltX * stiffness * dt;
  striker.tiltVelZ += -striker.tiltZ * stiffness * dt;
  striker.tiltVelX *= Math.exp(-damping * dt);
  striker.tiltVelZ *= Math.exp(-damping * dt);
  striker.tiltVelX = clamp(striker.tiltVelX, -4.2, 4.2);
  striker.tiltVelZ = clamp(striker.tiltVelZ, -4.2, 4.2);

  if (tilt > STRIKER_FALLEN_TILT * 0.58) {
    const speed = length(striker.vel.x, striker.vel.z);
    striker.yawVel += speed * dt * 1.8;
    striker.vel.x *= Math.exp(-0.5 * dt);
    striker.vel.z *= Math.exp(-0.5 * dt);
  }

  striker.yaw += striker.yawVel * dt;
  striker.yawVel *= Math.exp(-2.6 * dt);
  striker.tiltX += striker.tiltVelX * dt;
  striker.tiltZ += striker.tiltVelZ * dt;

  if (coupled && striker.y <= 0.001 && striker.sink <= 0.001 && strikerTiltAmount(striker) < 0.025) {
    striker.tiltX *= Math.exp(-18 * dt);
    striker.tiltZ *= Math.exp(-18 * dt);
    striker.tiltVelX *= Math.exp(-18 * dt);
    striker.tiltVelZ *= Math.exp(-18 * dt);
  }

  const nextTilt = strikerTiltAmount(striker);
  if (nextTilt > STRIKER_TILT_MAX) {
    const scale = STRIKER_TILT_MAX / nextTilt;
    striker.tiltX *= scale;
    striker.tiltZ *= scale;
    striker.tiltVelX *= 0.45;
    striker.tiltVelZ *= 0.45;
  }
}

function applyStrikerImpactTilt(striker: Striker, normalX: number, normalZ: number, impactSpeed: number, scale = 1): void {
  if (impactSpeed < 0.35) {
    return;
  }

  const impulse = clamp((impactSpeed - 0.25) * scale, 0, 5.5);
  striker.tiltVelX += normalZ * impulse * 0.34;
  striker.tiltVelZ -= normalX * impulse * 0.34;

  if (impactSpeed > 2.2) {
    striker.yVel = Math.max(striker.yVel, (impactSpeed - 2.2) * 0.035);
  }
}

function kickBallVertical(ball: Body, impactSpeed: number, rampStrength: number): void {
  if (impactSpeed < 1.05 || rampStrength <= 0 || ball.y > 0.003 || Math.abs(ball.yVel) > 0.08) {
    return;
  }

  ball.yVel = Math.max(
    ball.yVel,
    clamp((impactSpeed - 0.8) * rampStrength, 0.05, 0.9),
  );
}

function isBiscuitAirborne(biscuit: Biscuit): boolean {
  return biscuit.lift > 0.002 || biscuit.liftVel > 0.002;
}

function isBiscuitCollisionActive(biscuit: Biscuit): boolean {
  return biscuit.lift < BISCUIT_AIRBORNE_COLLISION_HEIGHT && biscuit.liftVel < 0.24;
}

function isBallBiscuitCollisionActive(ball: Body, biscuit: Biscuit): boolean {
  if (!isBiscuitCollisionActive(biscuit)) {
    return false;
  }

  const ballCenterY = ball.y + ball.radius;
  const biscuitCenterHeight = biscuitCenterY(biscuit);
  const verticalReach = ball.radius + biscuitSupportHeight(biscuit);
  return Math.abs(ballCenterY - biscuitCenterHeight) <= verticalReach;
}

function isBallStrikerCollisionActive(ball: Body, striker: Striker): boolean {
  const fallenBlend = clamp(strikerTiltAmount(striker) / STRIKER_FALLEN_TILT, 0, 1);
  const contactTop = strikerBaseY(striker) + 0.18 + fallenBlend * 0.22;
  return ball.y <= contactTop + PIECES.ballRadius * 0.2;
}

function nearestFlatBiscuitTilt(angle: number): number {
  if (angle > Math.PI / 2) {
    return BISCUIT_MAX_TILT;
  }

  if (angle < -Math.PI / 2) {
    return -BISCUIT_MAX_TILT;
  }

  return 0;
}

function settleGroundedBiscuitTilt(biscuit: Biscuit, dt: number): void {
  const targetX = nearestFlatBiscuitTilt(biscuit.tiltX);
  const targetZ = nearestFlatBiscuitTilt(biscuit.tiltZ);

  biscuit.tiltVelX += (targetX - biscuit.tiltX) * BISCUIT_FLAT_SETTLE_STIFFNESS * dt;
  biscuit.tiltVelZ += (targetZ - biscuit.tiltZ) * BISCUIT_FLAT_SETTLE_STIFFNESS * dt;
  biscuit.tiltVelX *= Math.exp(-BISCUIT_FLAT_SETTLE_DAMPING * dt);
  biscuit.tiltVelZ *= Math.exp(-BISCUIT_FLAT_SETTLE_DAMPING * dt);
  biscuit.tiltX += biscuit.tiltVelX * dt;
  biscuit.tiltZ += biscuit.tiltVelZ * dt;
  biscuit.tiltX = clamp(biscuit.tiltX, -BISCUIT_MAX_TILT, BISCUIT_MAX_TILT);
  biscuit.tiltZ = clamp(biscuit.tiltZ, -BISCUIT_MAX_TILT, BISCUIT_MAX_TILT);
}

function updateBiscuitLift(biscuit: Biscuit, dt: number): void {
  if (biscuit.attachedTo) {
    biscuit.lift = 0;
    biscuit.liftVel = 0;
    biscuit.tiltX *= Math.exp(-10 * dt);
    biscuit.tiltZ *= Math.exp(-10 * dt);
    biscuit.tiltVelX = 0;
    biscuit.tiltVelZ = 0;
    return;
  }

  if (isBiscuitAirborne(biscuit)) {
    biscuit.lift += biscuit.liftVel * dt;
    biscuit.liftVel -= BISCUIT_AIR_GRAVITY * dt;
    biscuit.tiltX += biscuit.tiltVelX * dt;
    biscuit.tiltZ += biscuit.tiltVelZ * dt;
    biscuit.tiltX = clamp(biscuit.tiltX, -BISCUIT_MAX_TILT, BISCUIT_MAX_TILT);
    biscuit.tiltZ = clamp(biscuit.tiltZ, -BISCUIT_MAX_TILT, BISCUIT_MAX_TILT);
    biscuit.tiltVelX *= Math.exp(-1.6 * dt);
    biscuit.tiltVelZ *= Math.exp(-1.6 * dt);

    if (biscuit.lift <= 0) {
      biscuit.lift = 0;

      if (Math.abs(biscuit.liftVel) > 0.42) {
        biscuit.liftVel = -biscuit.liftVel * 0.24;
        dampVelocity(biscuit, PHYSICS.biscuitDrag * 0.34, dt);
      } else {
        biscuit.liftVel = 0;
        biscuit.tiltVelX *= 0.2;
        biscuit.tiltVelZ *= 0.2;
      }
    }

    return;
  }

  biscuit.lift = 0;
  biscuit.liftVel = 0;
  settleGroundedBiscuitTilt(biscuit, dt);
}

function canReleaseAttachedBiscuit(biscuit: Biscuit, impactSpeed: number, impulse: number): boolean {
  return Boolean(
    biscuit.attachedTo
    && impactSpeed > BISCUIT_ATTACHED_RELEASE_SPEED
    && impulse > BISCUIT_ATTACHED_RELEASE_IMPULSE,
  );
}

function launchBiscuit(
  biscuit: Biscuit,
  impactSpeed: number,
  tangentX: number,
  tangentZ: number,
  releaseAttached = false,
): void {
  if (impactSpeed < BISCUIT_LAUNCH_THRESHOLD) {
    return;
  }

  if (biscuit.attachedTo && !releaseAttached) {
    return;
  }

  biscuit.attachedTo = null;
  biscuit.liftVel = Math.max(
    biscuit.liftVel,
    clamp((impactSpeed - BISCUIT_LAUNCH_THRESHOLD) * 0.26 + 0.14, 0.12, 1.15),
  );
  biscuit.tiltVelX += clamp(tangentZ * 0.75, -7, 7);
  biscuit.tiltVelZ -= clamp(tangentX * 0.75, -7, 7);
  biscuit.spin += clamp((tangentX - tangentZ) * 0.45, -4, 4);
}

function resolvePieceCollisions(state: GameState): void {
  for (const side of SIDES) {
    const striker = state.strikers[side];
    if (!isBallStrikerCollisionActive(state.ball, striker)) {
      continue;
    }

    const dx = striker.pos.x - state.ball.pos.x;
    const dz = striker.pos.z - state.ball.pos.z;
    const distance = length(dx, dz) || 0.0001;
    const impactSpeed = approachSpeed(state.ball, striker);
    const impact = resolveCircleCollision(
      state.ball,
      striker,
      PHYSICS.restitution,
      state.ball.mass,
      striker.mass,
      state.ball.radius,
      strikerCollisionRadius(striker),
    );

    if (impact > 0) {
      const wallContacts = fieldWallContactCount(state.ball);
      const railPinchScale = wallContacts > 1
        ? 0.02
        : wallContacts > 0 ? 0.12 : 1;
      applyStrikerImpactTilt(striker, dx / distance, dz / distance, impactSpeed, 0.8 * railPinchScale);
      kickBallVertical(state.ball, impactSpeed, strikerTiltAmount(striker) * 0.16 * railPinchScale);
    }
  }

  for (const biscuit of state.biscuits) {
    if (!isBallBiscuitCollisionActive(state.ball, biscuit)) {
      continue;
    }

    const impactSpeed = approachSpeed(state.ball, biscuit);
    const impact = resolveCircleCollision(
      state.ball,
      biscuit,
      PHYSICS.restitution * 0.94,
      state.ball.mass,
      biscuit.mass,
      state.ball.radius,
      biscuitCollisionRadius(biscuit),
    );
    const releasesAttached = canReleaseAttachedBiscuit(biscuit, impactSpeed, impact);

    if (releasesAttached) {
      biscuit.attachedTo = null;
      biscuit.vel.x += state.ball.vel.x * 0.18;
      biscuit.vel.z += state.ball.vel.z * 0.18;
    }

    if (impact > 0) {
      launchBiscuit(
        biscuit,
        impactSpeed,
        state.ball.vel.x,
        state.ball.vel.z,
        releasesAttached,
      );
      kickBallVertical(
        state.ball,
        impactSpeed,
        (Math.abs(biscuit.tiltX) + Math.abs(biscuit.tiltZ) + biscuit.lift * 4) * 0.08,
      );
    }
  }

  for (const side of SIDES) {
    const striker = state.strikers[side];
    for (const biscuit of state.biscuits) {
      if (!isBiscuitCollisionActive(biscuit)) {
        continue;
      }

      const impactSpeed = approachSpeed(striker, biscuit);
      const attachedToThisStriker = biscuit.attachedTo === side;
      const strikerSpeed = length(striker.vel.x, striker.vel.z);
      const hardStrike = !attachedToThisStriker && impactSpeed > 0.45 && strikerSpeed > 1.35;
      const restitution = attachedToThisStriker ? 0.08 : hardStrike ? 0.74 : 0.24;
      const impact = resolveCircleCollision(
        striker,
        biscuit,
        restitution,
        striker.mass,
        biscuit.mass,
        strikerCollisionRadius(striker),
        biscuitCollisionRadius(biscuit),
      );
      const releasesAttached = canReleaseAttachedBiscuit(biscuit, impactSpeed, impact);

      if (releasesAttached) {
        biscuit.attachedTo = null;
        biscuit.vel.x += striker.vel.x * 0.42;
        biscuit.vel.z += striker.vel.z * 0.42;
      }

      if (impact > 0 && hardStrike) {
        launchBiscuit(
          biscuit,
          impactSpeed,
          striker.vel.x,
          striker.vel.z,
          releasesAttached,
        );
        const dx = biscuit.pos.x - striker.pos.x;
        const dz = biscuit.pos.z - striker.pos.z;
        const distance = length(dx, dz) || 0.0001;
        applyStrikerImpactTilt(striker, dx / distance, dz / distance, impactSpeed, 0.32);
      }
    }
  }

  resolveCircleCollision(
    state.strikers.player,
    state.strikers.opponent,
    0.5,
    state.strikers.player.mass,
    state.strikers.opponent.mass,
    strikerCollisionRadius(state.strikers.player),
    strikerCollisionRadius(state.strikers.opponent),
  );

  for (let i = 0; i < state.biscuits.length; i += 1) {
    for (let j = i + 1; j < state.biscuits.length; j += 1) {
      const current = state.biscuits[i];
      const next = state.biscuits[j];

      if (current && next && isBiscuitCollisionActive(current) && isBiscuitCollisionActive(next)) {
        resolveCircleCollision(
          current,
          next,
          0.55,
          PHYSICS.biscuitMass,
          PHYSICS.biscuitMass,
          biscuitCollisionRadius(current),
          biscuitCollisionRadius(next),
        );
      }
    }
  }
}

function approachSpeed(a: Body, b: Body): number {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const distance = length(dx, dz) || 0.0001;
  const nx = dx / distance;
  const nz = dz / distance;
  const rvx = b.vel.x - a.vel.x;
  const rvz = b.vel.z - a.vel.z;
  return Math.max(0, -(rvx * nx + rvz * nz));
}

function resolveCircleCollision(
  a: Body,
  b: Body,
  restitution: number,
  massA: number,
  massB: number,
  radiusA = a.radius,
  radiusB = b.radius,
): number {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const distance = length(dx, dz) || 0.0001;
  const minDistance = radiusA + radiusB;

  if (distance >= minDistance) {
    return 0;
  }

  const nx = dx / distance;
  const nz = dz / distance;
  const penetration = minDistance - distance;
  const invA = massA > 0 ? 1 / massA : 0;
  const invB = massB > 0 ? 1 / massB : 0;
  const invTotal = invA + invB || 1;

  a.pos.x -= nx * penetration * (invA / invTotal);
  a.pos.z -= nz * penetration * (invA / invTotal);
  b.pos.x += nx * penetration * (invB / invTotal);
  b.pos.z += nz * penetration * (invB / invTotal);

  const rvx = b.vel.x - a.vel.x;
  const rvz = b.vel.z - a.vel.z;
  const velocityAlongNormal = rvx * nx + rvz * nz;

  if (velocityAlongNormal > 0) {
    return 0;
  }

  const impulseMagnitude = (-(1 + restitution) * velocityAlongNormal) / invTotal;
  const ix = impulseMagnitude * nx;
  const iz = impulseMagnitude * nz;

  a.vel.x -= ix * invA;
  a.vel.z -= iz * invA;
  b.vel.x += ix * invB;
  b.vel.z += iz * invB;

  return Math.abs(impulseMagnitude);
}

function fieldWallContactCount(body: Body, radius = body.radius): number {
  const xLimit = BOARD.width / 2 - radius;
  const zLimit = BOARD.length / 2 - radius;
  let contacts = 0;

  if (body.pos.x <= -xLimit + 0.002 || body.pos.x >= xLimit - 0.002) {
    contacts += 1;
  }

  if (body.pos.z <= -zLimit + 0.002 || body.pos.z >= zLimit - 0.002) {
    contacts += 1;
  }

  return contacts;
}

function keepInsideField(body: Body, restitution: number, radius = body.radius): void {
  const xLimit = BOARD.width / 2 - radius;
  const zLimit = BOARD.length / 2 - radius;
  let wallHits = 0;

  if (body.pos.x < -xLimit) {
    body.pos.x = -xLimit;
    body.vel.x = Math.abs(body.vel.x) * restitution;
    wallHits += 1;
  }

  if (body.pos.x > xLimit) {
    body.pos.x = xLimit;
    body.vel.x = -Math.abs(body.vel.x) * restitution;
    wallHits += 1;
  }

  if (body.pos.z < -zLimit) {
    body.pos.z = -zLimit;
    body.vel.z = Math.abs(body.vel.z) * restitution;
    wallHits += 1;
  }

  if (body.pos.z > zLimit) {
    body.pos.z = zLimit;
    body.vel.z = -Math.abs(body.vel.z) * restitution;
    wallHits += 1;
  }

  if (wallHits > 0 && body.y < 0.06) {
    body.yVel *= wallHits > 1 ? 0.42 : 0.7;
    body.vel.x *= wallHits > 1 ? 0.86 : 0.94;
    body.vel.z *= wallHits > 1 ? 0.86 : 0.94;
  }
}

function updateBiscuitAttachment(state: GameState, biscuit: Biscuit): void {
  if (!isBiscuitCollisionActive(biscuit)) {
    biscuit.attachedTo = null;
    return;
  }

  if (biscuit.attachedTo) {
    const striker = state.strikers[biscuit.attachedTo];
    const distance = length(striker.pos.x - biscuit.pos.x, striker.pos.z - biscuit.pos.z);

    if (distance < strikerCollisionRadius(striker) + biscuitCollisionRadius(biscuit) + BISCUIT_DETACH_MARGIN) {
      return;
    }

    biscuit.attachedTo = null;
  }

  for (const side of SIDES) {
    const striker = state.strikers[side];
    const dx = striker.pos.x - biscuit.pos.x;
    const dz = striker.pos.z - biscuit.pos.z;
    const distance = length(dx, dz);

    if (distance < strikerCollisionRadius(striker) + biscuitCollisionRadius(biscuit) + BISCUIT_ATTACH_MARGIN) {
      attachBiscuit(state, biscuit, side);
      return;
    }
  }
}

function attachBiscuit(state: GameState, biscuit: Biscuit, side: Side): void {
  biscuit.attachedTo = side;
  biscuit.attachSlot = attachedCount(state, side);
}

function attachedCount(state: GameState, side: Side): number {
  return state.biscuits.filter((biscuit) => biscuit.attachedTo === side).length;
}

function updateGoalWells(state: GameState, dt: number): void {
  updateGoalWellBody(state.ball, dt, {
    captureRadius: BOARD.goalRadius + state.ball.radius * 0.15,
    gravity: 28,
    horizontalDrag: 0.72,
    minEntrySinkSpeed: 2.7,
    pull: 16,
    rimRadius: BOARD.goalRadius + state.ball.radius * 0.7,
    wallRadius: BOARD.goalRadius - state.ball.radius * 0.58,
    wallRestitution: 0.5,
  });

  for (const side of SIDES) {
    const striker = state.strikers[side];
    updateGoalWellBody(striker, dt, {
      captureRadius: BOARD.goalRadius - striker.radius * 0.12,
      gravity: 18,
      horizontalDrag: 1.35,
      minEntrySinkSpeed: 1.65,
      pull: 12,
      rimRadius: BOARD.goalRadius + striker.radius * 0.42,
      wallRadius: BOARD.goalRadius - striker.radius * 0.52,
      wallRestitution: 0.28,
    });
  }
}

function updateGoalWellBody(body: Body, dt: number, options: GoalWellOptions): void {
  let bestSide: Side | null = null;
  let bestDx = 0;
  let bestDz = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const side of SIDES) {
    const dx = body.pos.x;
    const dz = body.pos.z - goalZFor(side);
    const distance = length(dx, dz);

    if (distance < bestDistance && (distance <= options.rimRadius || body.sink > 0)) {
      bestSide = side;
      bestDx = dx;
      bestDz = dz;
      bestDistance = distance;
    }
  }

  if (!bestSide) {
    body.sink = Math.max(0, body.sink - dt * 7);
    body.sinkVel = 0;
    return;
  }

  const nx = bestDistance > 0.0001 ? bestDx / bestDistance : 1;
  const nz = bestDistance > 0.0001 ? bestDz / bestDistance : 0;
  const radialVelocity = body.vel.x * nx + body.vel.z * nz;
  const speed = length(body.vel.x, body.vel.z);
  const tangentialSpeed = Math.sqrt(Math.max(0, speed * speed - radialVelocity * radialVelocity));
  const isCenterCutoutEntry = Math.abs(bestDx) <= options.wallRadius
    && bestDistance <= options.rimRadius
    && radialVelocity < -0.25;
  const isCleanEntry = bestDistance <= options.rimRadius
    && radialVelocity < -0.45
    && tangentialSpeed < Math.abs(radialVelocity) * 0.42;
  const isOverCup = bestDistance <= options.captureRadius || isCenterCutoutEntry || isCleanEntry;
  const isFallingInCup = body.sink > 0.015;

  if (!isOverCup && !isFallingInCup) {
    body.sink = Math.max(0, body.sink - dt * 8);
    body.sinkVel = 0;
    return;
  }

  const captureStrength = clamp(1 - (bestDistance / Math.max(options.captureRadius, 0.0001)), 0, 1);
  const sinkAcceleration = options.gravity * (0.62 + captureStrength * 0.38);
  body.sinkVel += sinkAcceleration * dt;

  if (body.sink < 0.12) {
    body.sinkVel = Math.max(body.sinkVel, options.minEntrySinkSpeed * (0.72 + captureStrength * 0.28));
  }

  body.sink = clamp(body.sink + body.sinkVel * dt, 0, 1);

  if (body.sink >= 1) {
    body.sinkVel = 0;
  }

  const effectiveWallRadius = options.wallRadius
    + (options.captureRadius - options.wallRadius) * Math.max(0, 1 - body.sink * 2.2);

  if (bestDistance > effectiveWallRadius) {
    const push = bestDistance - effectiveWallRadius;
    body.pos.x -= nx * push;
    body.pos.z -= nz * push;

    if (radialVelocity > 0) {
      const bounce = -(1 + options.wallRestitution) * radialVelocity;
      body.vel.x += nx * bounce;
      body.vel.z += nz * bounce;
    } else {
      body.vel.x -= nx * radialVelocity * 0.35;
      body.vel.z -= nz * radialVelocity * 0.35;
    }
  }

  const inwardPull = options.pull * (0.3 + body.sink * 0.7) * dt;
  body.vel.x -= nx * inwardPull;
  body.vel.z -= nz * inwardPull;

  const horizontalDamping = Math.exp(-options.horizontalDrag * body.sink * dt);
  body.vel.x *= horizontalDamping;
  body.vel.z *= horizontalDamping;
}

function checkScoring(state: GameState): ScoreEvent | null {
  if (isAtGoalBottom(state.ball, 'opponent')) {
    return awardPoint(state, 'player', 'Goal');
  }

  if (isAtGoalBottom(state.ball, 'player')) {
    return awardPoint(state, 'opponent', 'Goal');
  }

  if (isAtGoalBottom(state.strikers.player, 'player')) {
    return awardPoint(state, 'opponent', 'KLASK');
  }

  if (isAtGoalBottom(state.strikers.opponent, 'opponent')) {
    return awardPoint(state, 'player', 'KLASK');
  }

  for (const side of SIDES) {
    if (attachedCount(state, side) >= 2) {
      return awardPoint(state, opponentOf(side), 'Biscuits');
    }

    if (state.strikers[side].lostTime > 0.45) {
      return awardPoint(state, opponentOf(side), 'Lost control');
    }
  }

  return null;
}

function isAtGoalBottom(body: Body, side: Side): boolean {
  const dx = body.pos.x;
  const dz = body.pos.z - goalZFor(side);
  return body.sink > 0.92 && length(dx, dz) < BOARD.goalRadius - body.radius * 0.45;
}

function awardPoint(state: GameState, scorer: Side, reason: PointReason): ScoreEvent {
  const previousScore = { ...state.score };
  state.score[scorer] += 1;
  const nextScore = { ...state.score };
  const type: ScoreEventType = state.score[scorer] >= 6 ? 'match' : 'point';
  const server = opponentOf(scorer);
  const goalSide = reason === 'Goal' ? opponentOf(scorer) : null;
  const scorerLabel = scorer === 'player' ? 'Player' : 'Opponent';

  state.roundActive = false;
  state.message = type === 'match'
    ? `${scorerLabel} wins`
    : `${scorerLabel} scores: ${reason}`;
  state.messageTimer = SCORE_INTERSTITIAL_SECONDS;

  if (type === 'match') {
    state.winner = scorer;
  }

  state.scoring = {
    elapsed: 0,
    duration: SCORE_INTERSTITIAL_SECONDS,
    goalSide,
    goalStart: goalSide ? cloneVec(state.ball.pos) : null,
    nextScore,
    previousScore,
    reason,
    scorer,
    server,
    type,
  };

  return { type, scorer, reason };
}
