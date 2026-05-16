import { BOARD, DEFAULT_SETTINGS, MAGNETICS, PHYSICS, PIECES, goalZFor, startZFor } from '../src/game/constants';
import {
  createInitialState,
  getSnapshot,
  resetMatch,
  setPlayerSteerer,
  setPlayerSteererLowered,
  stepSimulation,
  tryServeFromPointer,
  type GameState,
} from '../src/game/simulation';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function physicallyServe(state: GameState): void {
  const servingSide = state.servingSide;

  for (let frame = 0; frame < 900 && !state.roundActive; frame += 1) {
    const steerer = state.steerers[servingSide];
    const dx = state.ball.pos.x - steerer.x;
    const dz = state.ball.pos.z - steerer.z;
    const distance = Math.hypot(dx, dz);
    const maxStep = 0.028;

    if (distance <= maxStep) {
      state.steerers[servingSide] = { ...state.ball.pos };
    } else {
      state.steerers[servingSide] = {
        x: steerer.x + (dx / distance) * maxStep,
        z: steerer.z + (dz / distance) * maxStep,
      };
    }

    stepSimulation(state, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
  }
}

const state = createInitialState();
const initialSnapshot = getSnapshot(state);
const initialBall = { ...initialSnapshot.ball };

for (let frame = 0; frame < 360; frame += 1) {
  const t = frame / 360;
  setPlayerSteerer(state, Math.sin(t * Math.PI * 2) * 0.8, 0.9 + Math.cos(t * Math.PI * 2) * 0.28);
  stepSimulation(state, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

const idleSnapshot = getSnapshot(state);

assert(!idleSnapshot.roundActive, 'Round became active before serve.');
assert(idleSnapshot.score.player === 0 && idleSnapshot.score.opponent === 0, 'Idle serve changed the score.');
assert(idleSnapshot.ball.x === initialBall.x && idleSnapshot.ball.z === initialBall.z, 'Idle serve moved the ball.');
assert(idleSnapshot.ball.speed === 0, 'Idle serve gave the ball velocity.');

const pointerServeState = createInitialState();
assert(
  !tryServeFromPointer(pointerServeState, 0, 0),
  'Pointer serve activated when clicking away from the parked ball.',
);
assert(!pointerServeState.roundActive, 'Missed pointer serve still activated the round.');
assert(
  tryServeFromPointer(pointerServeState, pointerServeState.ball.pos.x, pointerServeState.ball.pos.z),
  'Pointer serve did not activate when clicking the parked ball.',
);
assert(pointerServeState.roundActive, 'Pointer serve left the round inactive.');
assert(getSnapshot(pointerServeState).ball.speed > 0.2, 'Pointer serve did not launch the ball.');

const midlineWallState = createInitialState();
setPlayerSteerer(midlineWallState, 0, -0.45);
assert(
  midlineWallState.steerers.player.z >= PIECES.steererRadius,
  'Player controller magnet crossed the under-board midline wall.',
);

const dipoleControlState = createInitialState();
setPlayerSteerer(dipoleControlState, 0.2, dipoleControlState.strikers.player.pos.z);

for (let frame = 0; frame < 24; frame += 1) {
  stepSimulation(dipoleControlState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  dipoleControlState.strikers.player.pos.x > 0.08,
  '3D controller dipole did not pull the striker laterally.',
);
assert(
  Number.isFinite(dipoleControlState.strikers.player.tiltZ),
  '3D controller dipole produced a non-finite striker tilt.',
);

const loweredMagnetState = createInitialState();
setPlayerSteererLowered(loweredMagnetState, true);
stepSimulation(loweredMagnetState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
const firstDrop = loweredMagnetState.steerers.player.drop ?? 0;
assert(firstDrop > 0 && firstDrop < MAGNETICS.controllerDropDistance, 'Controller magnet lowering did not ease on first frame.');

for (let frame = 0; frame < 120; frame += 1) {
  stepSimulation(loweredMagnetState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  (loweredMagnetState.steerers.player.drop ?? 0) > MAGNETICS.controllerDropDistance * 0.86,
  'Controller magnet did not approach the lowered position while held.',
);

setPlayerSteererLowered(loweredMagnetState, false);
stepSimulation(loweredMagnetState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
assert(
  (loweredMagnetState.steerers.player.drop ?? 0) < MAGNETICS.controllerDropDistance,
  'Controller magnet did not begin easing back upward after release.',
);

const normalSnapState = createInitialState();
setPlayerSteerer(normalSnapState, 0.32, normalSnapState.strikers.player.pos.z);

for (let frame = 0; frame < 28; frame += 1) {
  stepSimulation(normalSnapState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

const loweredSnapState = createInitialState();
setPlayerSteererLowered(loweredSnapState, true);

for (let frame = 0; frame < 120; frame += 1) {
  stepSimulation(loweredSnapState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

setPlayerSteerer(loweredSnapState, 0.32, loweredSnapState.strikers.player.pos.z);

for (let frame = 0; frame < 28; frame += 1) {
  stepSimulation(loweredSnapState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  loweredSnapState.strikers.player.pos.x < normalSnapState.strikers.player.pos.x * 0.55,
  'Lowering the controller magnet did not meaningfully weaken lateral control.',
);

const highPullJumpState = createInitialState();
setPlayerSteerer(highPullJumpState, 0.66, highPullJumpState.strikers.player.pos.z);

for (let frame = 0; frame < 28; frame += 1) {
  stepSimulation(highPullJumpState, PHYSICS.fixedTimeStep, {
    ...DEFAULT_SETTINGS,
    magneticCoupling: 220,
  });
}

assert(
  highPullJumpState.strikers.player.coupledTo === 'player',
  'High magnet pull lost dominant control after a fast controller jump.',
);
assert(
  highPullJumpState.strikers.player.pos.x > 0.18,
  'High magnet pull did not recover toward the jumped controller.',
);

const farMagnetRangeState = createInitialState();
setPlayerSteerer(farMagnetRangeState, 1.24, farMagnetRangeState.strikers.player.pos.z);

for (let frame = 0; frame < 36; frame += 1) {
  stepSimulation(farMagnetRangeState, PHYSICS.fixedTimeStep, {
    ...DEFAULT_SETTINGS,
    magneticCoupling: 220,
  });
}

const farMagnetDrift = Math.abs(farMagnetRangeState.strikers.player.pos.x);

const nearMagnetRangeState = createInitialState();
setPlayerSteerer(nearMagnetRangeState, 0.24, nearMagnetRangeState.strikers.player.pos.z);

for (let frame = 0; frame < 12; frame += 1) {
  stepSimulation(nearMagnetRangeState, PHYSICS.fixedTimeStep, {
    ...DEFAULT_SETTINGS,
    magneticCoupling: 220,
  });
}

const nearMagnetDrift = Math.abs(nearMagnetRangeState.strikers.player.pos.x);

assert(
  farMagnetDrift < nearMagnetDrift * 0.65,
  'Max magnet pull still had too much far-field lateral reach.',
);

const controllerStabilityState = createInitialState();
let maxControllerLift = 0;
let maxControllerAcceleration = 0;
let previousControllerVelocity = { ...controllerStabilityState.strikers.player.vel };

for (let frame = 0; frame < 600; frame += 1) {
  const t = frame * PHYSICS.fixedTimeStep;
  setPlayerSteerer(
    controllerStabilityState,
    0.16 * Math.sin(t * 11),
    1.18 + 0.045 * Math.sin(t * 7),
  );
  stepSimulation(controllerStabilityState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);

  const striker = controllerStabilityState.strikers.player;
  maxControllerLift = Math.max(maxControllerLift, striker.y);
  maxControllerAcceleration = Math.max(
    maxControllerAcceleration,
    Math.hypot(
      striker.vel.x - previousControllerVelocity.x,
      striker.vel.z - previousControllerVelocity.z,
    ) / PHYSICS.fixedTimeStep,
  );
  previousControllerVelocity = { ...striker.vel };
}

assert(maxControllerLift < 0.01, 'Controller magnet lifted the striker off the board.');
assert(maxControllerAcceleration < 650, 'Controller magnet produced unstable striker acceleration.');

const strikerFrictionState = createInitialState();
setPlayerSteererLowered(strikerFrictionState, true);
for (let frame = 0; frame < 120; frame += 1) {
  stepSimulation(strikerFrictionState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}
strikerFrictionState.steerers.player = {
  ...strikerFrictionState.steerers.player,
  x: 1.4,
  z: strikerFrictionState.strikers.player.pos.z,
};
strikerFrictionState.strikers.player.vel = { x: 3.5, z: 0 };
const frictionStart = { ...strikerFrictionState.strikers.player.pos };

for (let frame = 0; frame < 120; frame += 1) {
  stepSimulation(strikerFrictionState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  Math.hypot(
    strikerFrictionState.strikers.player.pos.x - frictionStart.x,
    strikerFrictionState.strikers.player.pos.z - frictionStart.z,
  ) < 0.5,
  'A striker coasted too far with the controller magnet lowered.',
);

const biscuitAttachmentState = createInitialState();
tryServeFromPointer(biscuitAttachmentState, biscuitAttachmentState.ball.pos.x, biscuitAttachmentState.ball.pos.z);
biscuitAttachmentState.ball.pos = { x: 0, z: 0 };
biscuitAttachmentState.ball.vel = { x: 0, z: 0 };
biscuitAttachmentState.strikers.player.pos = { x: 0, z: 0.76 };
biscuitAttachmentState.steerers.player = { ...biscuitAttachmentState.strikers.player.pos };
biscuitAttachmentState.strikers.player.vel = { x: 0, z: 0 };

const latchBiscuit = biscuitAttachmentState.biscuits[0];
assert(latchBiscuit !== undefined, 'Missing biscuit for attachment check.');
latchBiscuit.pos = {
  x: biscuitAttachmentState.strikers.player.radius + latchBiscuit.radius + 0.018,
  z: biscuitAttachmentState.strikers.player.pos.z,
};
latchBiscuit.vel = { x: 0, z: 0 };
const latchStart = { ...latchBiscuit.pos };

stepSimulation(biscuitAttachmentState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);

const latchMove = Math.hypot(latchBiscuit.pos.x - latchStart.x, latchBiscuit.pos.z - latchStart.z);
assert(latchBiscuit.attachedTo === 'player', 'Close biscuit did not count as attached.');
assert(latchMove < 0.055, 'Attached biscuit snapped to a fixed striker slot.');

const biscuitMagneticPullState = createInitialState();
tryServeFromPointer(biscuitMagneticPullState, biscuitMagneticPullState.ball.pos.x, biscuitMagneticPullState.ball.pos.z);
biscuitMagneticPullState.ball.pos = { x: -1.2, z: 1.2 };
biscuitMagneticPullState.ball.vel = { x: 0, z: 0 };
biscuitMagneticPullState.strikers.player.pos = { x: 0, z: 0 };
biscuitMagneticPullState.strikers.player.vel = { x: 0, z: 0 };
biscuitMagneticPullState.steerers.player = { ...biscuitMagneticPullState.strikers.player.pos };

const pulledBiscuit = biscuitMagneticPullState.biscuits[1];
assert(pulledBiscuit !== undefined, 'Missing biscuit for magnetic pull check.');
pulledBiscuit.pos = {
  x: biscuitMagneticPullState.strikers.player.radius + pulledBiscuit.radius + 0.075,
  z: 0,
};
pulledBiscuit.vel = { x: 0, z: 0 };
const pulledStartDistance = Math.hypot(
  pulledBiscuit.pos.x - biscuitMagneticPullState.strikers.player.pos.x,
  pulledBiscuit.pos.z - biscuitMagneticPullState.strikers.player.pos.z,
);

for (let frame = 0; frame < 90; frame += 1) {
  stepSimulation(biscuitMagneticPullState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(pulledBiscuit.attachedTo === 'player', 'Upright biscuit polarity did not attach to the striker.');
assert(
  Math.hypot(
    pulledBiscuit.pos.x - biscuitMagneticPullState.strikers.player.pos.x,
    pulledBiscuit.pos.z - biscuitMagneticPullState.strikers.player.pos.z,
  ) < pulledStartDistance - 0.035,
  'Upright biscuit polarity did not pull toward the striker.',
);

const flippedBiscuitState = createInitialState();
tryServeFromPointer(flippedBiscuitState, flippedBiscuitState.ball.pos.x, flippedBiscuitState.ball.pos.z);
flippedBiscuitState.ball.pos = { x: -1.2, z: 1.2 };
flippedBiscuitState.ball.vel = { x: 0, z: 0 };
flippedBiscuitState.strikers.player.pos = { x: 0, z: 0 };
flippedBiscuitState.strikers.player.vel = { x: 0, z: 0 };
flippedBiscuitState.steerers.player = { ...flippedBiscuitState.strikers.player.pos };

const flippedBiscuit = flippedBiscuitState.biscuits[1];
assert(flippedBiscuit !== undefined, 'Missing biscuit for flipped polarity check.');
flippedBiscuit.pos = {
  x: flippedBiscuitState.strikers.player.radius + flippedBiscuit.radius + 0.035,
  z: 0,
};
flippedBiscuit.vel = { x: 0, z: 0 };
flippedBiscuit.tiltX = Math.PI - 0.2;
const flippedStartDistance = Math.hypot(
  flippedBiscuit.pos.x - flippedBiscuitState.strikers.player.pos.x,
  flippedBiscuit.pos.z - flippedBiscuitState.strikers.player.pos.z,
);
let flippedMaxDistance = flippedStartDistance;

for (let frame = 0; frame < 300; frame += 1) {
  stepSimulation(flippedBiscuitState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
  flippedMaxDistance = Math.max(
    flippedMaxDistance,
    Math.hypot(
      flippedBiscuit.pos.x - flippedBiscuitState.strikers.player.pos.x,
      flippedBiscuit.pos.z - flippedBiscuitState.strikers.player.pos.z,
    ),
  );
}

assert(flippedMaxDistance > flippedStartDistance + 0.045, 'Flipped biscuit did not initially repel from the striker.');
assert(flippedBiscuit.attachedTo === 'player', 'Close flipped biscuit did not turn over and attach.');
assert(Math.abs(flippedBiscuit.tiltX) < 0.02, 'Close flipped biscuit did not settle upright after attaching.');

const attachedBiscuitFrictionState = createInitialState();
tryServeFromPointer(
  attachedBiscuitFrictionState,
  attachedBiscuitFrictionState.ball.pos.x,
  attachedBiscuitFrictionState.ball.pos.z,
);
attachedBiscuitFrictionState.ball.pos = { x: -1.1, z: 1.1 };
attachedBiscuitFrictionState.ball.vel = { x: 0, z: 0 };
attachedBiscuitFrictionState.strikers.player.pos = { x: 0, z: 0 };
attachedBiscuitFrictionState.strikers.player.vel = { x: 0, z: 0 };
attachedBiscuitFrictionState.steerers.player = { ...attachedBiscuitFrictionState.strikers.player.pos };

const frictionBiscuit = attachedBiscuitFrictionState.biscuits[1];
assert(frictionBiscuit !== undefined, 'Missing biscuit for attached friction check.');
frictionBiscuit.attachedTo = 'player';
frictionBiscuit.pos = {
  x: attachedBiscuitFrictionState.strikers.player.radius + frictionBiscuit.radius,
  z: 0,
};
frictionBiscuit.vel = { x: 0, z: 3.2 };

let maxAttachedOrbitAngle = 0;

for (let frame = 0; frame < 240; frame += 1) {
  stepSimulation(attachedBiscuitFrictionState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
  const dx = frictionBiscuit.pos.x - attachedBiscuitFrictionState.strikers.player.pos.x;
  const dz = frictionBiscuit.pos.z - attachedBiscuitFrictionState.strikers.player.pos.z;
  maxAttachedOrbitAngle = Math.max(maxAttachedOrbitAngle, Math.abs(Math.atan2(dz, dx)));
}

assert(frictionBiscuit.attachedTo === 'player', 'Attached biscuit friction test lost attachment.');
assert(maxAttachedOrbitAngle < 0.45, 'Attached biscuit swung rapidly around the striker.');
assert(
  Math.hypot(
    frictionBiscuit.vel.x - attachedBiscuitFrictionState.strikers.player.vel.x,
    frictionBiscuit.vel.z - attachedBiscuitFrictionState.strikers.player.vel.z,
  ) < 0.35,
  'Attached biscuit retained too much tangential speed.',
);

const attachedBiscuitDriftState = createInitialState();
tryServeFromPointer(
  attachedBiscuitDriftState,
  attachedBiscuitDriftState.ball.pos.x,
  attachedBiscuitDriftState.ball.pos.z,
);
attachedBiscuitDriftState.ball.pos = { x: -1.1, z: 1.1 };
attachedBiscuitDriftState.ball.vel = { x: 0, z: 0 };
attachedBiscuitDriftState.strikers.player.pos = { x: 0, z: 0.72 };
attachedBiscuitDriftState.strikers.player.vel = { x: 0, z: 0 };
attachedBiscuitDriftState.steerers.player = { ...attachedBiscuitDriftState.strikers.player.pos };
setPlayerSteererLowered(attachedBiscuitDriftState, true);

for (let frame = 0; frame < 160; frame += 1) {
  stepSimulation(attachedBiscuitDriftState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

const driftingBiscuit = attachedBiscuitDriftState.biscuits[0];
assert(driftingBiscuit !== undefined, 'Missing biscuit for attached drift check.');
driftingBiscuit.attachedTo = 'player';
driftingBiscuit.pos = {
  x: attachedBiscuitDriftState.strikers.player.pos.x
    + attachedBiscuitDriftState.strikers.player.radius
    + driftingBiscuit.radius
    - 0.004,
  z: attachedBiscuitDriftState.strikers.player.pos.z,
};
driftingBiscuit.vel = { x: 0, z: 0 };

const driftStart = { ...attachedBiscuitDriftState.strikers.player.pos };

for (let frame = 0; frame < 360; frame += 1) {
  stepSimulation(attachedBiscuitDriftState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(driftingBiscuit.attachedTo === 'player', 'Attached biscuit drift check lost attachment.');
assert(
  Math.hypot(
    attachedBiscuitDriftState.strikers.player.pos.x - driftStart.x,
    attachedBiscuitDriftState.strikers.player.pos.z - driftStart.z,
  ) < 0.08,
  'An attached biscuit slowly drove an uncontrolled striker across the board.',
);

const attachedBiscuitRetentionState = createInitialState();
tryServeFromPointer(
  attachedBiscuitRetentionState,
  attachedBiscuitRetentionState.ball.pos.x,
  attachedBiscuitRetentionState.ball.pos.z,
);
attachedBiscuitRetentionState.ball.pos = { x: -1.1, z: 1.1 };
attachedBiscuitRetentionState.ball.vel = { x: 0, z: 0 };
attachedBiscuitRetentionState.strikers.player.pos = { x: 0, z: 0 };
attachedBiscuitRetentionState.strikers.player.vel = { x: 3.2, z: 0 };
attachedBiscuitRetentionState.steerers.player = { x: 0.26, z: PIECES.steererRadius };

const retainedBiscuit = attachedBiscuitRetentionState.biscuits[1];
assert(retainedBiscuit !== undefined, 'Missing biscuit for attached retention check.');
retainedBiscuit.attachedTo = 'player';
retainedBiscuit.pos = {
  x: attachedBiscuitRetentionState.strikers.player.radius + retainedBiscuit.radius - 0.004,
  z: 0,
};
retainedBiscuit.vel = { x: 0, z: 0 };

for (let frame = 0; frame < 30; frame += 1) {
  stepSimulation(attachedBiscuitRetentionState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(retainedBiscuit.attachedTo === 'player', 'An ordinary striker movement knocked an attached biscuit loose.');

const biscuitLaunchState = createInitialState();
tryServeFromPointer(biscuitLaunchState, biscuitLaunchState.ball.pos.x, biscuitLaunchState.ball.pos.z);
biscuitLaunchState.ball.pos = { x: -1.2, z: 1.2 };
biscuitLaunchState.ball.vel = { x: 0, z: 0 };
biscuitLaunchState.strikers.player.pos = { x: 0, z: 0 };
biscuitLaunchState.strikers.player.vel = { x: 3.6, z: 0 };
biscuitLaunchState.steerers.player = { x: 0.2, z: PIECES.steererRadius };

const launchedBiscuit = biscuitLaunchState.biscuits[1];
assert(launchedBiscuit !== undefined, 'Missing biscuit for launch check.');
launchedBiscuit.pos = {
  x: biscuitLaunchState.strikers.player.radius + launchedBiscuit.radius - 0.004,
  z: 0,
};
launchedBiscuit.vel = { x: 0, z: 0 };

for (let frame = 0; frame < 8; frame += 1) {
  stepSimulation(biscuitLaunchState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  launchedBiscuit.lift > 0.004 || launchedBiscuit.liftVel > 0.08,
  'A quick striker hit did not launch the biscuit vertically.',
);

const tiltedStrikerBallState = createInitialState();
tryServeFromPointer(tiltedStrikerBallState, tiltedStrikerBallState.ball.pos.x, tiltedStrikerBallState.ball.pos.z);
tiltedStrikerBallState.ball.pos = { x: 0, z: 0 };
tiltedStrikerBallState.ball.vel = { x: 2.5, z: 0 };
tiltedStrikerBallState.strikers.player.pos = {
  x: tiltedStrikerBallState.ball.radius + tiltedStrikerBallState.strikers.player.radius - 0.02,
  z: 0,
};
tiltedStrikerBallState.strikers.player.vel = { x: 0, z: 0 };
tiltedStrikerBallState.strikers.player.tiltX = 0.75;
tiltedStrikerBallState.steerers.player = { ...tiltedStrikerBallState.strikers.player.pos };

stepSimulation(tiltedStrikerBallState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);

assert(
  tiltedStrikerBallState.ball.yVel > 0.05 || tiltedStrikerBallState.ball.y > 0.001,
  'A ball striking a tilted striker did not gain a vertical component.',
);
assert(
  Math.abs(tiltedStrikerBallState.strikers.player.tiltVelZ) > 0.05,
  'A hard ball impact did not add angular impulse to the striker.',
);

const airborneBallSettleState = createInitialState();
tryServeFromPointer(airborneBallSettleState, airborneBallSettleState.ball.pos.x, airborneBallSettleState.ball.pos.z);
airborneBallSettleState.ball.pos = { x: 0, z: 0 };
airborneBallSettleState.ball.vel = { x: 1.8, z: 0 };
airborneBallSettleState.ball.y = 0.25;
airborneBallSettleState.ball.yVel = 0.32;
airborneBallSettleState.strikers.player.pos = {
  x: airborneBallSettleState.ball.radius + airborneBallSettleState.strikers.player.radius - 0.02,
  z: 0,
};
airborneBallSettleState.strikers.player.vel = { x: 0, z: 0 };
airborneBallSettleState.strikers.player.tiltX = 0.9;
airborneBallSettleState.steerers.player = { ...airborneBallSettleState.strikers.player.pos };

let maxAirborneBallY = airborneBallSettleState.ball.y;
for (let frame = 0; frame < 300; frame += 1) {
  stepSimulation(airborneBallSettleState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
  maxAirborneBallY = Math.max(maxAirborneBallY, airborneBallSettleState.ball.y);
}

assert(maxAirborneBallY <= 0.43, 'An airborne ball escaped the vertical bounds.');
assert(airborneBallSettleState.ball.y < 0.025, 'An airborne ball did not settle back onto the board.');

const cornerBounceState = createInitialState();
tryServeFromPointer(cornerBounceState, cornerBounceState.ball.pos.x, cornerBounceState.ball.pos.z);
cornerBounceState.ball.pos = {
  x: BOARD.width / 2 - cornerBounceState.ball.radius - 0.018,
  z: -BOARD.length / 2 + cornerBounceState.ball.radius + 0.018,
};
cornerBounceState.ball.vel = { x: 0.18, z: -0.16 };
cornerBounceState.ball.y = 0.08;
cornerBounceState.ball.yVel = 0.72;
cornerBounceState.strikers.opponent.pos = {
  x: cornerBounceState.ball.pos.x - 0.08,
  z: cornerBounceState.ball.pos.z + 0.08,
};
cornerBounceState.strikers.opponent.vel = { x: 0, z: 0 };
cornerBounceState.strikers.opponent.tiltX = 0.8;
cornerBounceState.strikers.opponent.tiltZ = -0.42;
cornerBounceState.steerers.opponent = { ...cornerBounceState.strikers.opponent.pos };

let maxCornerBallY = cornerBounceState.ball.y;
let maxCornerStrikerTilt = 0;

for (let frame = 0; frame < 520; frame += 1) {
  stepSimulation(cornerBounceState, PHYSICS.fixedTimeStep, {
    ...DEFAULT_SETTINGS,
    aiSpeed: 0,
  });
  maxCornerBallY = Math.max(maxCornerBallY, cornerBounceState.ball.y);
  maxCornerStrikerTilt = Math.max(
    maxCornerStrikerTilt,
    Math.hypot(cornerBounceState.strikers.opponent.tiltX, cornerBounceState.strikers.opponent.tiltZ),
  );
}

assert(maxCornerBallY <= 0.43, 'A corner collision sent the ball outside the vertical bounds.');
assert(cornerBounceState.ball.y < 0.035, 'A corner collision left the ball bouncing vertically.');
assert(maxCornerStrikerTilt < 1.35, 'A corner collision made the striker rotation unstable.');

const ballBiscuitCollisionState = createInitialState();
tryServeFromPointer(ballBiscuitCollisionState, ballBiscuitCollisionState.ball.pos.x, ballBiscuitCollisionState.ball.pos.z);
ballBiscuitCollisionState.ball.pos = { x: -0.16, z: 0 };
ballBiscuitCollisionState.ball.vel = { x: 2.4, z: 0 };
ballBiscuitCollisionState.ball.y = 0;
ballBiscuitCollisionState.ball.yVel = 0;
ballBiscuitCollisionState.strikers.player.pos = { x: 0, z: 1.2 };
ballBiscuitCollisionState.strikers.player.vel = { x: 0, z: 0 };
ballBiscuitCollisionState.steerers.player = { ...ballBiscuitCollisionState.strikers.player.pos };
ballBiscuitCollisionState.strikers.opponent.pos = { x: 0, z: -1.2 };
ballBiscuitCollisionState.strikers.opponent.vel = { x: 0, z: 0 };
ballBiscuitCollisionState.steerers.opponent = { ...ballBiscuitCollisionState.strikers.opponent.pos };

const hitByBallBiscuit = ballBiscuitCollisionState.biscuits[1];
assert(hitByBallBiscuit !== undefined, 'Missing biscuit for ball-biscuit collision check.');
hitByBallBiscuit.pos = { x: 0, z: 0 };
hitByBallBiscuit.vel = { x: 0, z: 0 };
hitByBallBiscuit.lift = 0;
hitByBallBiscuit.liftVel = 0;

for (let frame = 0; frame < 5; frame += 1) {
  stepSimulation(ballBiscuitCollisionState, PHYSICS.fixedTimeStep, {
    ...DEFAULT_SETTINGS,
    biscuitMagnetism: 0,
  });
}

assert(hitByBallBiscuit.vel.x > 0.7, 'Ball collision did not transfer velocity into the biscuit.');
assert(ballBiscuitCollisionState.ball.vel.x < 1.2, 'Ball collision did not slow or deflect the ball.');
assert(hitByBallBiscuit.liftVel > 0.2 || hitByBallBiscuit.lift > 0.004, 'A hard ball-biscuit hit did not launch the biscuit.');

const airborneBallBiscuitState = createInitialState();
tryServeFromPointer(airborneBallBiscuitState, airborneBallBiscuitState.ball.pos.x, airborneBallBiscuitState.ball.pos.z);
airborneBallBiscuitState.ball.pos = { x: -0.12, z: 0 };
airborneBallBiscuitState.ball.vel = { x: 2.4, z: 0 };
airborneBallBiscuitState.ball.y = 0.24;
airborneBallBiscuitState.ball.yVel = 0;
airborneBallBiscuitState.strikers.player.pos = { x: 0, z: 1.2 };
airborneBallBiscuitState.strikers.player.vel = { x: 0, z: 0 };
airborneBallBiscuitState.steerers.player = { ...airborneBallBiscuitState.strikers.player.pos };
airborneBallBiscuitState.strikers.opponent.pos = { x: 0, z: -1.2 };
airborneBallBiscuitState.strikers.opponent.vel = { x: 0, z: 0 };
airborneBallBiscuitState.steerers.opponent = { ...airborneBallBiscuitState.strikers.opponent.pos };

const missedAirborneBiscuit = airborneBallBiscuitState.biscuits[1];
assert(missedAirborneBiscuit !== undefined, 'Missing biscuit for airborne ball miss check.');
missedAirborneBiscuit.pos = { x: 0, z: 0 };
missedAirborneBiscuit.vel = { x: 0, z: 0 };
missedAirborneBiscuit.lift = 0;
missedAirborneBiscuit.liftVel = 0;

stepSimulation(airborneBallBiscuitState, PHYSICS.fixedTimeStep, {
  ...DEFAULT_SETTINGS,
  biscuitMagnetism: 0,
});

assert(Math.abs(missedAirborneBiscuit.vel.x) < 0.001, 'An airborne ball collided with a biscuit below it.');
assert(missedAirborneBiscuit.liftVel === 0, 'An airborne ball launched a biscuit below it.');

for (let frame = 0; frame < 240; frame += 1) {
  stepSimulation(biscuitLaunchState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(launchedBiscuit.lift >= 0, 'Launched biscuit clipped below the board plane.');

const biscuitNoTwirlState = createInitialState();
tryServeFromPointer(biscuitNoTwirlState, biscuitNoTwirlState.ball.pos.x, biscuitNoTwirlState.ball.pos.z);
biscuitNoTwirlState.ball.pos = { x: -1.2, z: 1.2 };
biscuitNoTwirlState.ball.vel = { x: 0, z: 0 };
biscuitNoTwirlState.strikers.player.pos = { x: 0, z: 0.68 };
biscuitNoTwirlState.strikers.player.vel = { x: 0, z: 0 };
biscuitNoTwirlState.steerers.player = { ...biscuitNoTwirlState.strikers.player.pos };

const quietBiscuit = biscuitNoTwirlState.biscuits[0];
assert(quietBiscuit !== undefined, 'Missing biscuit for no-twirl check.');
quietBiscuit.pos = { x: 0.62, z: 0.68 };
quietBiscuit.vel = { x: 0, z: 0 };
quietBiscuit.angle = 0.31;
quietBiscuit.spin = 0;

for (let frame = 0; frame < 20; frame += 1) {
  stepSimulation(biscuitNoTwirlState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(Math.abs(quietBiscuit.spin) < 0.000001, 'Nearby striker magnet gave a grounded biscuit ambient spin.');
assert(Math.abs(quietBiscuit.angle - 0.31) < 0.000001, 'Grounded biscuit twirled without an impact.');

const noContactLaunchState = createInitialState();
tryServeFromPointer(noContactLaunchState, noContactLaunchState.ball.pos.x, noContactLaunchState.ball.pos.z);
noContactLaunchState.ball.pos = { x: -1.2, z: 1.2 };
noContactLaunchState.ball.vel = { x: 0, z: 0 };
noContactLaunchState.strikers.player.pos = { x: 0, z: 0.48 };
noContactLaunchState.strikers.player.vel = { x: 0, z: -4 };
noContactLaunchState.steerers.player = { ...noContactLaunchState.strikers.player.pos };

const noContactBiscuit = noContactLaunchState.biscuits[1];
assert(noContactBiscuit !== undefined, 'Missing biscuit for no-contact launch check.');
noContactBiscuit.pos = { x: 0, z: 0 };
noContactBiscuit.vel = { x: 0, z: 0 };

stepSimulation(noContactLaunchState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);

assert(noContactBiscuit.lift === 0, 'A striker launched a biscuit before physical contact.');
assert(noContactBiscuit.liftVel === 0, 'A striker gave vertical velocity to a biscuit before contact.');

const passiveMagnetState = createInitialState();
tryServeFromPointer(passiveMagnetState, passiveMagnetState.ball.pos.x, passiveMagnetState.ball.pos.z);
passiveMagnetState.ball.pos = { x: -1.2, z: 1.2 };
passiveMagnetState.ball.vel = { x: 0, z: 0 };
passiveMagnetState.strikers.player.pos = { x: 0, z: 0.55 };
passiveMagnetState.strikers.player.vel = { x: 0, z: 0 };
passiveMagnetState.steerers.player = { ...passiveMagnetState.strikers.player.pos };

const passiveBiscuit = passiveMagnetState.biscuits[1];
assert(passiveBiscuit !== undefined, 'Missing biscuit for passive magnet stability check.');
const passiveStart = { ...passiveBiscuit.pos };

for (let frame = 0; frame < 240; frame += 1) {
  stepSimulation(passiveMagnetState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  Math.hypot(passiveBiscuit.pos.x - passiveStart.x, passiveBiscuit.pos.z - passiveStart.z) < 0.025,
  'A non-contact striker magnet dragged a distant biscuit around the board.',
);
assert(passiveBiscuit.lift === 0 && passiveBiscuit.liftVel === 0, 'A distant striker magnet bounced a biscuit vertically.');

const highPullTiltState = createInitialState();
let maxHighPullTilt = 0;

for (let frame = 0; frame < 480; frame += 1) {
  const t = frame * PHYSICS.fixedTimeStep;
  setPlayerSteerer(
    highPullTiltState,
    0.72 * Math.sin(t * 5.8),
    1.1 + 0.18 * Math.cos(t * 4.4),
  );
  stepSimulation(highPullTiltState, PHYSICS.fixedTimeStep, {
    ...DEFAULT_SETTINGS,
    magneticCoupling: 220,
  });
  maxHighPullTilt = Math.max(
    maxHighPullTilt,
    Math.hypot(highPullTiltState.strikers.player.tiltX, highPullTiltState.strikers.player.tiltZ),
  );
}

assert(maxHighPullTilt < 0.72, 'High magnet pull caused runaway striker tilt.');
assert(highPullTiltState.strikers.player.y < 0.02, 'High magnet pull lifted the striker away from the board.');

const aiServeState = createInitialState();
aiServeState.servingSide = 'opponent';
aiServeState.roundActive = false;
aiServeState.ball.pos = {
  x: BOARD.width / 2 - BOARD.cornerInset,
  z: startZFor('opponent'),
};
aiServeState.ball.vel = { x: 0, z: 0 };
aiServeState.strikers.opponent.pos = { x: 0, z: -1.18 };
aiServeState.strikers.opponent.vel = { x: 0, z: 0 };
aiServeState.steerers.opponent = { ...aiServeState.strikers.opponent.pos };

for (let frame = 0; frame < 900 && !aiServeState.roundActive; frame += 1) {
  stepSimulation(aiServeState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(aiServeState.roundActive, 'AI did not complete its serve.');
assert(aiServeState.ball.vel.z > 0, 'AI served the ball toward its own goal.');

const aiStrikeState = createInitialState();
tryServeFromPointer(aiStrikeState, aiStrikeState.ball.pos.x, aiStrikeState.ball.pos.z);
aiStrikeState.ball.pos = { x: 0.34, z: -0.72 };
aiStrikeState.ball.vel = { x: 0, z: 0 };
aiStrikeState.strikers.opponent.pos = { x: 0.34, z: -1.03 };
aiStrikeState.strikers.opponent.vel = { x: 0, z: 0 };
aiStrikeState.steerers.opponent = { ...aiStrikeState.strikers.opponent.pos };
const aiStrikeStartZ = aiStrikeState.ball.pos.z;

for (let frame = 0; frame < 360; frame += 1) {
  stepSimulation(aiStrikeState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  aiStrikeState.ball.pos.z > aiStrikeStartZ + 0.16 || aiStrikeState.ball.vel.z > 0.28,
  'AI did not attempt to drive a reachable ball toward the player goal.',
);

const aiStalledLaneState = createInitialState();
tryServeFromPointer(aiStalledLaneState, aiStalledLaneState.ball.pos.x, aiStalledLaneState.ball.pos.z);
aiStalledLaneState.ball.pos = { x: -1.1, z: -0.25 };
aiStalledLaneState.ball.vel = { x: 0, z: 0 };
aiStalledLaneState.strikers.opponent.pos = { x: 0.8, z: -1.18 };
aiStalledLaneState.strikers.opponent.vel = { x: 0, z: 0 };
aiStalledLaneState.steerers.opponent = { ...aiStalledLaneState.strikers.opponent.pos };
aiStalledLaneState.biscuits[0]!.attachedTo = null;
aiStalledLaneState.biscuits[0]!.pos = { x: -1, z: -0.23 };
aiStalledLaneState.biscuits[0]!.vel = { x: 0, z: 0 };
aiStalledLaneState.biscuits[1]!.pos = { x: 0, z: 0 };
aiStalledLaneState.biscuits[1]!.vel = { x: 0, z: 0 };
aiStalledLaneState.biscuits[2]!.pos = { x: -0.7, z: 0 };
aiStalledLaneState.biscuits[2]!.vel = { x: 0, z: 0 };
const aiStalledLaneStartZ = aiStalledLaneState.ball.pos.z;
let aiStalledLaneMaxSpeed = 0;
let aiStalledLaneMaxZ = aiStalledLaneState.ball.pos.z;

for (let frame = 0; frame < 720; frame += 1) {
  stepSimulation(aiStalledLaneState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
  aiStalledLaneMaxSpeed = Math.max(
    aiStalledLaneMaxSpeed,
    Math.hypot(aiStalledLaneState.ball.vel.x, aiStalledLaneState.ball.vel.z),
  );
  aiStalledLaneMaxZ = Math.max(aiStalledLaneMaxZ, aiStalledLaneState.ball.pos.z);
}

assert(
  aiStalledLaneMaxSpeed > 0.6 && aiStalledLaneMaxZ > aiStalledLaneStartZ + 0.36,
  'AI stalled instead of eventually striking a reachable ball around a biscuit.',
);

const aiCornerRecoveryState = createInitialState();
aiCornerRecoveryState.roundActive = true;
aiCornerRecoveryState.message = '';
aiCornerRecoveryState.ball.pos = {
  x: BOARD.width / 2 - PIECES.ballRadius - 0.04,
  z: -BOARD.length / 2 + PIECES.ballRadius + 0.05,
};
aiCornerRecoveryState.ball.vel = { x: 0, z: 0 };
aiCornerRecoveryState.strikers.opponent.pos = { x: 0.96, z: -1.32 };
aiCornerRecoveryState.strikers.opponent.vel = { x: 0, z: 0 };
aiCornerRecoveryState.steerers.opponent = { ...aiCornerRecoveryState.strikers.opponent.pos };

let aiCornerRecoveryEscaped = false;

for (let frame = 0; frame < 900 && !aiCornerRecoveryEscaped; frame += 1) {
  stepSimulation(aiCornerRecoveryState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);

  const xEdgeDistance = BOARD.width / 2 - PIECES.ballRadius - Math.abs(aiCornerRecoveryState.ball.pos.x);
  const zEndDistance = BOARD.length / 2 - PIECES.ballRadius + aiCornerRecoveryState.ball.pos.z;
  aiCornerRecoveryEscaped = xEdgeDistance > 0.18 || zEndDistance > 0.28;
}

assert(aiCornerRecoveryEscaped, 'AI did not nudge a trapped corner ball back out of the corner.');
assert(
  aiCornerRecoveryState.score.player === 0 && aiCornerRecoveryState.score.opponent === 0,
  'AI corner recovery incorrectly awarded a point.',
);

const aiCornerForfeitState = createInitialState();
aiCornerForfeitState.roundActive = true;
aiCornerForfeitState.message = '';
aiCornerForfeitState.ball.pos = {
  x: -BOARD.width / 2 + PIECES.ballRadius + 0.04,
  z: -BOARD.length / 2 + PIECES.ballRadius + 0.05,
};
aiCornerForfeitState.ball.vel = { x: 0, z: 0 };

const forfeitBiscuitPositions = aiCornerForfeitState.biscuits.map((biscuit) => ({
  attachedTo: biscuit.attachedTo,
  x: biscuit.pos.x,
  z: biscuit.pos.z,
}));

for (let frame = 0; frame < 16 * 120; frame += 1) {
  stepSimulation(aiCornerForfeitState, PHYSICS.fixedTimeStep, {
    ...DEFAULT_SETTINGS,
    aiSpeed: 0,
  });
}

assert(!aiCornerForfeitState.roundActive, 'AI stuck-ball forfeit did not stop the active round.');
assert(aiCornerForfeitState.servingSide === 'player', 'AI stuck-ball forfeit did not give the other player serve.');
assert(
  aiCornerForfeitState.score.player === 0 && aiCornerForfeitState.score.opponent === 0,
  'AI stuck-ball forfeit incorrectly changed the score.',
);
assert(aiCornerForfeitState.ball.pos.z > 0, 'AI stuck-ball forfeit did not move only the ball to the next server.');
assert(
  aiCornerForfeitState.biscuits.every((biscuit, index) => {
    const previous = forfeitBiscuitPositions[index]!;
    return biscuit.attachedTo === previous.attachedTo
      && Math.abs(biscuit.pos.x - previous.x) < 0.0001
      && Math.abs(biscuit.pos.z - previous.z) < 0.0001;
  }),
  'AI stuck-ball forfeit moved or removed biscuits.',
);

const aiAvoidSecondBiscuitState = createInitialState();
tryServeFromPointer(aiAvoidSecondBiscuitState, aiAvoidSecondBiscuitState.ball.pos.x, aiAvoidSecondBiscuitState.ball.pos.z);
aiAvoidSecondBiscuitState.ball.pos = { x: 0, z: -0.52 };
aiAvoidSecondBiscuitState.ball.vel = { x: 0, z: 0 };
aiAvoidSecondBiscuitState.strikers.opponent.pos = { x: 0, z: -0.82 };
aiAvoidSecondBiscuitState.strikers.opponent.vel = { x: 0, z: 0 };
aiAvoidSecondBiscuitState.steerers.opponent = { ...aiAvoidSecondBiscuitState.strikers.opponent.pos };

aiAvoidSecondBiscuitState.biscuits[0]!.attachedTo = 'opponent';
aiAvoidSecondBiscuitState.biscuits[0]!.pos = {
  x: aiAvoidSecondBiscuitState.strikers.opponent.radius + aiAvoidSecondBiscuitState.biscuits[0]!.radius - 0.004,
  z: aiAvoidSecondBiscuitState.strikers.opponent.pos.z,
};
aiAvoidSecondBiscuitState.biscuits[0]!.vel = { x: 0, z: 0 };
aiAvoidSecondBiscuitState.biscuits[1]!.attachedTo = null;
aiAvoidSecondBiscuitState.biscuits[1]!.pos = { x: 0.04, z: -0.54 };
aiAvoidSecondBiscuitState.biscuits[1]!.vel = { x: 0, z: 0 };

for (let frame = 0; frame < 300; frame += 1) {
  stepSimulation(aiAvoidSecondBiscuitState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  aiAvoidSecondBiscuitState.biscuits.filter((biscuit) => biscuit.attachedTo === 'opponent').length < 2,
  'AI carrying one biscuit still collected a dangerous second biscuit.',
);

const directGoalState = createInitialState();
tryServeFromPointer(directGoalState, directGoalState.ball.pos.x, directGoalState.ball.pos.z);
directGoalState.ball.pos = { x: 0, z: goalZFor('opponent') + 0.35 };
directGoalState.ball.vel = { x: 0, z: -3.5 };

let directGoalEvent: ReturnType<typeof stepSimulation> = null;
let directGoalFrame = 0;
for (; directGoalFrame < 70 && !directGoalEvent; directGoalFrame += 1) {
  directGoalEvent = stepSimulation(directGoalState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(directGoalEvent?.reason === 'Goal', 'A clean center-bound ball did not fall into the goal.');
assert(directGoalFrame < 50, 'A clean center-bound ball took too long to fall into the goal.');
assert(directGoalState.ball.sink > 0.92, 'Clean goal scored before the ball reached the bottom.');

const fastCutoutGoalState = createInitialState();
tryServeFromPointer(fastCutoutGoalState, fastCutoutGoalState.ball.pos.x, fastCutoutGoalState.ball.pos.z);
fastCutoutGoalState.ball.pos = { x: 0.09, z: goalZFor('opponent') + 0.2 };
fastCutoutGoalState.ball.vel = { x: 0, z: -5.2 };

let fastCutoutEvent: ReturnType<typeof stepSimulation> = null;
let fastCutoutTopRimBounce = false;
for (let frame = 0; frame < 70 && !fastCutoutEvent; frame += 1) {
  fastCutoutEvent = stepSimulation(fastCutoutGoalState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
  fastCutoutTopRimBounce ||= fastCutoutGoalState.ball.sink < 0.08 && fastCutoutGoalState.ball.vel.z > 0.55;
}

assert(!fastCutoutTopRimBounce, 'A fast ball entering the goal cutout bounced backward off a fake top rim.');
assert(fastCutoutEvent?.reason === 'Goal', 'A fast ball through the goal cutout did not score.');
assert(fastCutoutGoalState.ball.sink > 0.92, 'Fast cutout goal scored before the ball reached the bottom.');

const rimBounceState = createInitialState();
tryServeFromPointer(rimBounceState, rimBounceState.ball.pos.x, rimBounceState.ball.pos.z);
rimBounceState.ball.pos = { x: 0.17, z: goalZFor('opponent') + 0.12 };
rimBounceState.ball.vel = { x: 0, z: -1.3 };

stepSimulation(rimBounceState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);

assert(rimBounceState.ball.sink === 0, 'A glancing rim hit incorrectly started falling into the goal.');
assert(rimBounceState.score.player === 0 && rimBounceState.score.opponent === 0, 'A rim deflection incorrectly scored.');

const scoringAfterplayState = createInitialState();
tryServeFromPointer(scoringAfterplayState, scoringAfterplayState.ball.pos.x, scoringAfterplayState.ball.pos.z);
scoringAfterplayState.ball.pos = { x: -0.62, z: 0.42 };
scoringAfterplayState.ball.vel = { x: 1.35, z: -0.72 };
scoringAfterplayState.strikers.player.pos = { x: 0, z: 0 };
scoringAfterplayState.strikers.player.vel = { x: 0, z: 0 };
scoringAfterplayState.steerers.player = { ...scoringAfterplayState.strikers.player.pos };
scoringAfterplayState.biscuits[0]!.attachedTo = 'player';
scoringAfterplayState.biscuits[0]!.pos = {
  x: scoringAfterplayState.strikers.player.radius + scoringAfterplayState.biscuits[0]!.radius - 0.002,
  z: 0,
};
scoringAfterplayState.biscuits[1]!.attachedTo = 'player';
scoringAfterplayState.biscuits[1]!.pos = {
  x: -scoringAfterplayState.strikers.player.radius - scoringAfterplayState.biscuits[1]!.radius + 0.002,
  z: 0,
};

const afterplayEvent = stepSimulation(scoringAfterplayState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
assert(afterplayEvent?.reason === 'Biscuits', 'Attached biscuits did not produce a scoring event.');

const afterplayBallStart = { ...scoringAfterplayState.ball.pos };

for (let frame = 0; frame < 36; frame += 1) {
  stepSimulation(scoringAfterplayState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(scoringAfterplayState.scoring?.reason === 'Biscuits', 'Scoring aftermath ended too early.');
assert(
  Math.hypot(
    scoringAfterplayState.ball.pos.x - afterplayBallStart.x,
    scoringAfterplayState.ball.pos.z - afterplayBallStart.z,
  ) > 0.06,
  'Scoring aftermath froze the board immediately.',
);

const goalSinkState = createInitialState();
tryServeFromPointer(goalSinkState, goalSinkState.ball.pos.x, goalSinkState.ball.pos.z);
goalSinkState.ball.pos = { x: 0.04, z: goalZFor('opponent') };
goalSinkState.ball.vel = { x: 0, z: 0 };

let goalEvent: ReturnType<typeof stepSimulation> = null;
for (let frame = 0; frame < 180 && !goalEvent; frame += 1) {
  goalEvent = stepSimulation(goalSinkState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}
assert(goalEvent?.reason === 'Goal', 'Goal entry did not produce a goal scoring event.');
assert(goalSinkState.scoring?.reason === 'Goal', 'Goal did not enter the scoring interstitial.');
assert(goalSinkState.score.player === 1, 'Goal did not advance the player score.');
assert(!goalSinkState.roundActive, 'Goal scoring left the round active.');
assert(goalSinkState.ball.sink > 0.92, 'Goal scored before the ball reached the bottom.');

for (let frame = 0; frame < 90; frame += 1) {
  stepSimulation(goalSinkState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

const sinkingSnapshot = getSnapshot(goalSinkState);
assert(sinkingSnapshot.ball.sink > 0.45, 'Ball did not sink into the goal during the scoring interstitial.');
assert(sinkingSnapshot.scoring?.previousScore.player === 0, 'Scoring interstitial lost the previous score.');
assert(sinkingSnapshot.scoring?.nextScore.player === 1, 'Scoring interstitial lost the next score.');

for (let frame = 0; frame < 420; frame += 1) {
  stepSimulation(goalSinkState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

const afterInterstitialSnapshot = getSnapshot(goalSinkState);
assert(!afterInterstitialSnapshot.scoring, 'Scoring interstitial did not clear after its duration.');
assert(!afterInterstitialSnapshot.roundActive, 'Scoring interstitial did not reset to the next service.');
assert(afterInterstitialSnapshot.servingSide === 'opponent', 'Scoring interstitial selected the wrong next server.');

physicallyServe(state);
const servedSnapshot = getSnapshot(state);

assert(servedSnapshot.roundActive, 'Physical striker contact did not activate the round.');
assert(servedSnapshot.ball.speed > 0.2, 'Physical striker contact did not launch the ball.');

for (let frame = 0; frame < 900; frame += 1) {
  stepSimulation(state, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

const rallySnapshot = getSnapshot(state);

assert(Number.isFinite(rallySnapshot.ball.x), 'Simulation produced a non-finite ball x position.');
assert(Number.isFinite(rallySnapshot.ball.z), 'Simulation produced a non-finite ball z position.');
assert(rallySnapshot.score.player >= 0 && rallySnapshot.score.opponent >= 0, 'Simulation produced an invalid score.');
assert(rallySnapshot.score.player === 0, 'AI collected biscuits and awarded the player a passive point.');

resetMatch(state);

const resetSnapshot = getSnapshot(state);

assert(resetSnapshot.score.player === 0 && resetSnapshot.score.opponent === 0, 'Reset did not clear the score.');
assert(!resetSnapshot.roundActive, 'Reset left the round active.');

const stretchedState = createInitialState();
physicallyServe(stretchedState);
stretchedState.ball.vel = { x: 0, z: 0 };
stretchedState.strikers.player.pos = { x: 0, z: 1.12 };
stretchedState.steerers.player = { x: 1.2, z: 1.12 };

for (let frame = 0; frame < 90; frame += 1) {
  stepSimulation(stretchedState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(
  stretchedState.score.opponent === 0,
  'Stretching the own magnet incorrectly counted as lost control.',
);

const lostState = createInitialState();
physicallyServe(lostState);
lostState.ball.vel = { x: 0, z: 0 };
lostState.ball.pos = { x: 0, z: 0.4 };
lostState.strikers.player.pos = { x: 0, z: -0.72 };
lostState.steerers.opponent = { x: 0, z: -0.72 };
lostState.strikers.player.coupledTo = 'opponent';

for (let frame = 0; frame < 80; frame += 1) {
  stepSimulation(lostState, PHYSICS.fixedTimeStep, DEFAULT_SETTINGS);
}

assert(lostState.score.opponent === 1, 'Opponent did not score after player lost control to the opposing magnet.');
assert(lostState.message.includes('Lost control'), 'Lost-control scoring did not report the correct reason.');

const selfPlayState = createInitialState();
const selfPlaySettings = {
  ...DEFAULT_SETTINGS,
  aiControlsPlayer: true,
  aiSpeed: 1.05,
};
let selfPlayEvents = 0;
let selfPlayMovingFrames = 0;
let selfPlayMaxSpeed = 0;
let selfPlayMidlineCrossings = 0;
let previousBallZ = selfPlayState.ball.pos.z;

for (let frame = 0; frame < 60 * 120; frame += 1) {
  const event = stepSimulation(selfPlayState, PHYSICS.fixedTimeStep, selfPlaySettings);
  const ballSpeed = Math.hypot(selfPlayState.ball.vel.x, selfPlayState.ball.vel.z);
  selfPlayMaxSpeed = Math.max(selfPlayMaxSpeed, ballSpeed);

  if (selfPlayState.roundActive && ballSpeed > 0.18) {
    selfPlayMovingFrames += 1;
  }

  if (
    selfPlayState.roundActive
    && previousBallZ * selfPlayState.ball.pos.z < 0
  ) {
    selfPlayMidlineCrossings += 1;
  }

  if (event) {
    selfPlayEvents += 1;
  }

  previousBallZ = selfPlayState.ball.pos.z;

  if (selfPlayState.winner) {
    resetMatch(selfPlayState);
  }
}

assert(selfPlayMaxSpeed > 0.45, 'AI-vs-AI debug mode never produced a meaningful strike.');
assert(selfPlayMovingFrames > 120, 'AI-vs-AI debug mode spent nearly all of its time stuck.');
assert(selfPlayMidlineCrossings > 0, 'AI-vs-AI debug mode never moved the ball across the midline.');

console.log('simulation ok', {
  ball: rallySnapshot.ball,
  score: rallySnapshot.score,
  selfPlay: {
    events: selfPlayEvents,
    maxSpeed: Number(selfPlayMaxSpeed.toFixed(2)),
    midlineCrossings: selfPlayMidlineCrossings,
  },
});
