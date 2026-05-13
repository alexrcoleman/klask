# Agent Guide

This repo has accumulated a lot of physics tuning knowledge. Preserve that knowledge when making changes.

## Commands

- Prefer `npm.cmd` on Windows if `npm` is blocked by PowerShell execution policy.
- Run `npm.cmd run check:sim` after any simulation, scoring, AI, or input change.
- Run `npm.cmd run check:types` after TypeScript changes.
- Run `npm.cmd run build` before final handoff when practical. In this Codex sandbox, Vite builds may need an escalated retry because the sandbox can block config reads.

## Architecture Boundaries

- Keep React out of the frame loop. `GameRoute` owns UI state and passes settings into `KlaskScene`.
- Keep Three.js rendering out of simulation logic. `KlaskScene` reads `GameState` and syncs meshes; it should not decide game rules.
- Keep gameplay behavior in `src/game/simulation.ts` and shared dimensions/tuning in `src/game/constants.ts`.
- Keep targeted physics regressions in `scripts/check-simulation.ts`. Add a probe when fixing a subtle bug.

## Physics Guidance

- Prefer improving the physical model over adding visual or state-machine patches.
- The pointer controls an under-board magnet, not the striker itself.
- Strikers should feel strongly coupled to the controller magnet but still detach when moved too rapidly or across the midline.
- Strikers have felt on the bottom, so high surface friction is intentional.
- Magnets are finite dipoles. Use pole-pair forces and torques rather than monopole shortcuts or hidden attraction hacks.
- Biscuit polarity is flipped relative to the upright striker. Upright biscuits should attract; flipped biscuits should initially repel at distance, then may roll/flip and attach when close.
- Attached biscuits remain physical bodies. They count toward scoring but should not be teleported to decorative slots.
- Attached biscuits need tangential contact damping; without it they can orbit around the striker.
- Ball and biscuit collisions should respect vertical separation. Avoid planar collision checks that make airborne pieces hit things underneath.
- Goals and KLASK should score only once the body reaches the bottom of the goal well.
- Scoring overlays should not freeze physics immediately. A short afterplay window makes the result readable.

## Rendering Guidance

- The board should remain visually close to real KLASK: light wood rails, blue field, blue recessed goals, white service arcs, centerline biscuits, yellow ball, black segmented strikers, side score tracks, and Gaegu text for board markings.
- The magnetic debug view should match the simulation polarity and pole locations. If simulation charge placement changes, update `KlaskScene` debug charge placement too.
- For responsive changes, verify at small/tall phone dimensions as well as desktop. The board should stay visible before the controls.

## Common Pitfalls

- Do not reintroduce a Serve button; serving is by interacting with the ball.
- Do not snap biscuits onto strikers visually. Attachment should emerge from proximity, contact, and magnetic forces.
- Do not zero velocities immediately on scoring unless intentionally changing the afterplay behavior.
- Do not let the player controller magnet cross the under-board midline.
- Do not assume the top-down view is perspective-only; orthographic mode is an important debugging option.
