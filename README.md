# Wobbleweights

A wobbly, physics-driven party brawler for the browser. Squishy jelly-bean
fighters punch, grab, hoist and hurl each other off a city rooftop. Last one
standing wins the round; first to three rounds wins the match.

> Working title. The repository is called `gang-beats`; the game uses its own
> name, characters and art so it doesn't copy any existing game's branding.
> Rename it via `GAME_TITLE` in `src/client/ui/ui.ts` and the `<title>` in `index.html`.

## Running it

Requires Node.js 20+.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the headless physics/gameplay test suite (Vitest) |
| `npm run typecheck` | TypeScript only |

## Current status: Stage 1 (playable local prototype)

Stage 1 is **local multiplayer only** (shared keyboard / gamepads / bots on one
screen). Online play is Stage 4 and is not implemented yet. See
[`docs/CHECKLIST.md`](docs/CHECKLIST.md) for what works and what's next.

## Controls (defaults, remappable in **Controls**)

| Action | WASD player | Arrows player | Gamepad |
| --- | --- | --- | --- |
| Move | W A S D | ← ↑ ↓ → | Left stick / D-pad |
| Jump | Space | Num 0 / R-Shift | A |
| Punch | J / F / left mouse | Num 1 / `.` | X |
| Grab (hold) | K / G / right mouse | Num 2 / `/` | RT / RB |
| Lift (hold) | L / R / middle mouse | Num 3 / `'` | LT / LB |
| Sprint | L-Shift | Num . / R-Ctrl | L3 / B |
| Pause | Esc | Esc | Start |

**Throwing:** hold Grab until your hands stick to someone, hold Lift to hoist
them overhead, then release Grab. Knocked-out fighters are easy to lift;
conscious ones are heavy and can wriggle free by mashing buttons.

## Architecture

```
src/
  sim/      Headless game simulation (no three.js) — runs in browser and Node
    physics.ts    Rapier init + collision-group layout
    ragdoll.ts    11-part ragdoll definition, bodies and spherical joints
    character.ts  Active-ragdoll controller: balance, locomotion, punching,
                  grabbing (physical joints), lifting, throwing, daze/KO, struggle
    game.ts       GameSim: world, props, hit resolution, events, snapshots
    rules.ts      Last-player-standing rounds, first to 3
    bot.ts        AI that produces the same inputs a player would
    arena.ts      Data-only arena description (shared by physics + renderer)
    config.ts     All tuning numbers
  client/   Browser front end
    game.ts       Fixed-timestep loop, interpolation, event → sound/FX
    render/       three.js scene, arena meshes, character views, camera, FX
    input/        Keyboard / mouse / gamepad → PlayerInput, rebinding
    audio/        Procedural Web Audio sound effects
    ui/           Setup screen, controls, pause menu, HUD
tests/      Vitest suite driving the real simulation headlessly
```

The simulation is deliberately independent of rendering and fed only by
`PlayerInput` objects, so the Stage 4 multiplayer server can run the exact same
code authoritatively.

### How the characters move

Each fighter is a real ragdoll (pelvis, torso, head, two-segment arms and legs)
joined by spherical joints. Nothing is animated: a controller applies forces
and torques every physics step —

- a spring under the pelvis (ray-cast to the ground) holds them up,
- PD torques keep the pelvis/torso/head upright and facing the move direction,
- PD torques point each limb at a target direction (walk cycle, guard, reach,
  punch, overhead lift), with gravity compensation so muscles only handle motion.

Hits reduce balance (stagger) and add daze; at the threshold, or on a lucky
hard head shot, the fighter is knocked out and every controller switches off
except a little muscle tone, so they flop as a true ragdoll until they get up.
