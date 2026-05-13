# Klask Lab

A TypeScript, React Router, Vite, and Three.js recreation of KLASK in the browser. The current build is a single-player/simulation-first prototype with a mouse-driven under-board controller magnet, magnetic striker coupling, an AI opponent, biscuits, goal wells, scoring overlays, and a renderer that keeps React separate from the high-frequency simulation loop.

## Setup

Use Node 20 or newer.

```sh
npm install
npm run dev
```

The app runs at `http://127.0.0.1:5173`.

On Windows shells where PowerShell script execution blocks `npm`, use `npm.cmd` instead:

```sh
npm.cmd run dev
```

## Checks

Run these before handing off physics or rendering changes:

```sh
npm run check:sim
npm run check:types
npm run build
```

`check:sim` is the most important safety net for game behavior. It covers serving, AI play, goals, scoring aftermath, magnetic coupling, biscuit attachment, ball-biscuit collisions, flipped biscuits, and several prior bug regressions.

## Project Shape

- `src/router.tsx` defines the React Router route tree.
- `src/routes/GameRoute.tsx` owns HUD state, settings sliders, camera controls, and score overlays.
- `src/components/KlaskScene.tsx` owns the imperative Three.js scene, pointer projection, cameras, visual meshes, and the fixed-timestep animation loop.
- `src/game/constants.ts` keeps board dimensions, piece sizes, default settings, and shared magnetic geometry.
- `src/game/simulation.ts` contains the dependency-free game simulation and scoring model.
- `scripts/check-simulation.ts` contains targeted simulation regression checks.
- `docs/research.md` records early physical/rules research.
- `docs/architecture.md` explains the current technical design in more detail.

## Important Simulation Notes

- The user does not directly drag a striker. The pointer controls a tall under-board magnet, and the striker is pulled through the board.
- Magnetism is modeled as finite dipoles: each magnetic object has two pole charges, and forces/torques are summed across pole pairs.
- Biscuits have opposite polarity from upright strikers. If a biscuit is flipped, it should initially repel, then potentially roll/flip and attach when close.
- Attached biscuits should remain physical bodies. They are counted for scoring, but they are not teleported into fixed slots.
- Felt friction matters. Strikers should not glide freely after the controller magnet is yanked away.
- Attached biscuits need tangential contact damping, otherwise they can orbit rapidly around the striker.
- Goal and KLASK scoring should happen only after the body reaches the bottom of a goal well. Scoring overlays should not freeze the board immediately; physics continues briefly so the aftermath is visible.

## Useful Controls

- Move the mouse over the board to control the player magnet.
- Click/strike the parked ball to serve; there is no serve button.
- Cycle cameras from the HUD. Desktop middle-mouse drag rotates the board for debugging.
- Enable "AI controls both sides" to watch self-play.
- Enable "Show magnetic charges" to inspect the dipole placements.

## Next Good Steps

- Tune the constants against real KLASK piece weights, video, and board measurements.
- Replace narrow collision approximations with a robust 3D rigid body backend if the custom simulation stops scaling.
- Add audio for goals, KLASK drops, biscuit attachment, and striker disconnects.
- Explore second-player input and low-latency networking after the physical feel is stable.
