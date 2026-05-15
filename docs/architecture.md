# Architecture

Klask Lab is split into three layers:

- React page/HUD state in `src/routes`.
- Imperative Three.js rendering and input projection in `src/components/KlaskScene.tsx`.
- A dependency-free deterministic simulation in `src/game/simulation.ts`.

The current app is a static single-page Vite build for easy GitHub Pages hosting. It intentionally avoids putting the simulation in React state. React receives periodic snapshots for the HUD while the scene loop owns high-frequency stepping and mesh synchronization.

## Runtime Flow

1. `src/main.tsx` renders `GameRoute` directly as the single static page.
2. `GameRoute` renders the HUD and `KlaskScene`.
3. `KlaskScene` creates a `GameState` with `createInitialState()`.
4. Pointer input is projected from screen space onto the board plane.
5. The projected pointer updates the player under-board controller magnet through `setPlayerSteerer()`.
6. The animation loop advances `stepSimulation()` at `PHYSICS.fixedTimeStep` using an accumulator.
7. `syncMeshes()` copies simulation state onto Three.js meshes.
8. `getSnapshot()` is sent back to React roughly every 120 ms for score, status, and overlay UI.

This gives the renderer smooth motion without forcing React to re-render on every physics tick.

## State Model

`GameState` contains:

- `ball`: position, velocity, radius, mass, vertical offset, and goal sink progress.
- `strikers`: player and opponent striker bodies with coupling state, tilt, yaw, and lost-control timing.
- `steerers`: under-board controller magnet positions.
- `biscuits`: physical magnetic cylinders with lift, tilt, spin, and attachment ownership.
- `score`, `servingSide`, `roundActive`, `winner`, `message`, and `scoring` interstitial data.

`GameSnapshot` is deliberately smaller. It exposes only what the UI needs: score, serving state, scoring overlay details, attached biscuit counts, and ball telemetry.

## Coordinates

The board uses `x` across the width and `z` along the length. Vertical height is represented separately as `y`.

- The board surface is around `y = 0` in simulation.
- The player side is positive `z`.
- The opponent side is negative `z`.
- Goals are centered on the long axis at `goalZFor(side)`.
- Controller magnets live below the board, using shared geometry from `MAGNETICS`.

## Rendering Layer

`KlaskScene` is responsible for:

- Creating the Three.js renderer, scene, lights, cameras, and resize handling.
- Creating board geometry, rails, goal wells, service arcs, board text, score chips, and piece meshes.
- Loading the Gaegu board font for canvas text textures.
- Maintaining camera presets: broadcast, table, orthographic, and low.
- Handling desktop middle-mouse orbit for debugging.
- Handling pointer projection for player magnet control and ball serving.
- Rendering magnetic charge debug meshes.

Rendering should be a projection of simulation state. If a behavior changes, change the simulation first, then update mesh syncing only when visuals need to match new state fields or dimensions.

## Simulation Loop

`stepSimulation(state, dt, settings)` has three broad modes:

- Pre-serve: striker magnets move, AI can serve when appropriate, and the parked ball waits for a strike/click.
- Active round: AI, magnetic coupling, body integration, collision resolution, goal wells, attachment checks, and scoring checks run.
- Scoring interstitial: the overlay advances while physics continues briefly for `SCORE_AFTERPLAY_SECONDS`; additional scoring is locked out, then the round resets after `SCORE_INTERSTITIAL_SECONDS`.

The active round logic is factored through `advanceActiveRoundPhysics()` so normal play and scoring afterplay can share the same physics path while selectively disabling AI and scoring.

## Magnet Model

Magnetic objects are modeled as finite dipoles:

- Strikers have two pole charges in the base.
- Controller magnets have two pole charges below the board.
- Biscuits have two pole charges across their height, with polarity opposite an upright striker.

The simulation computes pole-pair forces and torques. This is not a full electromagnetic solver, but it is important that forces are 3D and that torque is applied from the force at each pole, because biscuit flipping and striker tilt depend on it.

Important details:

- `dipoleInteraction()` returns net force on the source body plus torque on both source and target.
- A regularized distance term avoids singular forces at very small separations.
- Controller coupling also uses a planar spring/damping term to approximate two magnets constrained by the board and felt contact.
- Biscuit attachment is a scoring/ownership state, not a visual snap. The biscuit remains a physical body.
- Attached biscuits use extra tangential damping to model contact friction and prevent rapid orbiting around the striker.

## Collisions And Vertical Motion

Bodies have planar position/velocity plus vertical `y`/`yVel` or biscuit `lift`/`liftVel`.

- Ball and striker bodies can gain vertical velocity from ramps/tilts and settle back onto the board.
- Biscuits can be launched and can tilt/roll while grounded or airborne.
- Ball-biscuit collisions include a vertical-overlap guard so airborne balls do not collide with biscuits underneath.
- Collision radii are adjusted for striker and biscuit tilt so fallen pieces occupy more horizontal space.

The system is still a custom approximation, not a general rigid-body engine. Keep tests targeted around behavior that matters to gameplay.

## Goals And Scoring

Goals are modeled as wells rather than instant trigger circles.

- `updateGoalWellBody()` applies rim deflection, inward pull, sink acceleration, and wall constraints.
- A goal or KLASK is awarded only when the body reaches the bottom of the well.
- A ball glancing across the rim should bounce/deflect instead of scoring.
- Score events create a `ScoreInterstitial` with previous and next scores for the overlay tick animation.
- During scoring, physics continues briefly so the player can see the aftermath, but `checkScoring()` is disabled to avoid duplicate points.

Scoring reasons are:

- `Goal`: ball reaches the bottom of the opponent goal.
- `KLASK`: a striker reaches the bottom of its own goal.
- `Biscuits`: two biscuits are attached to one striker.
- `Lost control`: a striker crosses to the opponent side and couples to the opponent controller.

## AI

The AI controls under-board steerers, not strikers directly. It has two paths:

- Serving: move behind the parked ball, then drive through it toward the opponent.
- Rally: defend when the ball is away and attempt a shot when reachable.

`aiControlsPlayer` is a debug mode that lets AI control both sides for self-play tuning. The simulation checks use this to catch stuck rallies.

## Tests And Verification

`scripts/check-simulation.ts` is a behavioral smoke suite. It does not prove the physics is perfect, but it protects against known regressions:

- Pointer and physical serving.
- Controller midline wall.
- Magnetic controller coupling and jitter.
- Striker friction after disconnect.
- Biscuit polarity, flipping, attachment, retention, and anti-orbit damping.
- Ball-biscuit collisions with vertical separation.
- Biscuit launch and no-contact stability.
- Goal sink and rim bounce behavior.
- Scoring overlay/afterplay/reset behavior.
- AI serving, striking, and self-play movement.

For rendering changes, also run `npm run check:viewports` when viewport framing or responsive layout changes.

## Known Tradeoffs

- AmmoJS is present as a future boundary, but the current gameplay uses the custom TypeScript simulation.
- The custom simulation prioritizes readable, tunable gameplay behavior over complete rigid-body realism.
- Magnetic constants are tuned by feel and regression tests, not measured real-world calibration.
- The build currently emits a large chunk warning because Three.js and the app are bundled together.
