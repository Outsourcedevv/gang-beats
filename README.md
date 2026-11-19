# Wobble Weights

A wobbly, physics-driven party brawler for the browser. Squishy jelly-bean
fighters punch, grab, hoist and hurl each other off rooftops, into grinders,
onto the motorway and into the sea. Last one standing wins the round; first to
three rounds wins the match.

> The repository is called `gang-beats`; the game itself is **Wobble Weights**,
> with its own characters and art. The name lives in `GAME_TITLE`
> (`src/client/ui/title.ts`), the `<title>` and the loading screen in `index.html`.

## Running it

Requires Node.js 20+.

```bash
npm install
```

Development (game server on :8787 + Vite client on :5173 with hot reload):

```bash
npm run dev
```

Open http://localhost:5173. Local play works with just the client; the
**Online** tab needs the server (which `npm run dev` starts).

Production (one process serves the built client and the WebSocket on :8787,
or `PORT`):

```bash
npm run build
```

```bash
npm start
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Game server (auto-rebuild/restart) + Vite client |
| `npm run dev:client` | Client only (local play) |
| `npm run build` | Type-check, build the client (`dist/`) and the server (`dist-server/`) |
| `npm run build:web` | Local-play-only static build in `dist-web/` (no server needed; the Online tab says it's unavailable) |
| `npm start` | Run the production server (`/health` reports rooms/players) |
| `npm test` | Headless simulation, map, codec and multiplayer-server tests (Vitest) |
| `npm run test:e2e` | Three real browser clients playing online together (needs Playwright, see the file header) |

To play with friends over the internet, run `npm run build && npm start` on a
machine they can reach (or put it behind any HTTPS reverse proxy — the client
uses `wss://` automatically on HTTPS pages) and share the room's invite link.

## Online play

- **Quick play** drops you into a public room (auto-starts when 2+ players are ready).
- **Private room** gives you a 5-letter code and an invite link (`?room=CODE`).
- **Friends:** everyone has a 6-letter friend code. Add friends' codes to see when they're online and which room they're in, and invite them from your room — they get a pop-up with a Join button.
- **Lobby:** player list with fighter previews, ready flags, map voting, and host controls (bots, "new map each round", kick, start with 2+ fighters). If the host leaves, the next player takes over.
- **In a match:** the server simulates everything (positions, physics, hits, knockouts, eliminations, rounds); clients send inputs and render interpolated snapshots ~120 ms behind. Knocked out of the round? Your screen goes grey and you spectate. Leave mid-match and a bot takes over your fighter; players who join mid-match watch until the next one. After the match winner is crowned everyone returns to the lobby.
- Your online identity, name, fighter and friends list are stored in this browser only.

## Menus, customisation and progression

The game opens on the **main menu**: Play (local / online), How to play,
Customise, Settings, Statistics and Friends. The first time you press Play the
**How to play** guide appears (moves shown with your current keys, every mode
and map); after that it stays available from the menu.

- **Customise:** 10 characters, 16 colours (body, trousers, hat), 13 hats,
  7 outfits, 8 extras, 6 emotes and 5 victory animations, previewed live on a
  wobbling physics fighter. Items are free, unlocked by level, or bought with
  coins. Everything is cosmetic. Your look is P1's locally and yours online.
- **Progression:** every match earns XP and coins (playing, rounds won,
  knockouts, ring-outs, winning; a small online bonus). Levels 1–50 with rank
  titles (Jelly Rookie → Wobble Weight Champion) unlock items automatically;
  level-ups pay bonus coins. A results screen shows the breakdown.
- **Statistics:** matches/rounds won, knockouts, ring-outs, falls, punches,
  kicks, headbutts, dives, throws, climbs, time played, wins per mode,
  favourite map.
- **Settings:** master / effects / music volume, hold-to-punch, mouse
  controls, camera shake, graphics quality (auto/high/medium/low — auto drops
  a level if the frame rate stays low), key remapping, progress reset.
- Switching to another tab pauses a local match and mutes the audio; online
  matches keep running on the server.
- Profile and settings are saved in this browser only (not synced between
  devices); `src/client/profile.ts` has a `ProfileStore` interface where a
  cloud save can plug in.

## Game modes

Every mode is played in rounds; the first player (or team) to win three rounds
takes the match.

| Mode | How a round is won |
| --- | --- |
| **Free-for-all** | Last fighter standing |
| **Team battle** | Last team with anyone standing (2–4 teams, e.g. 2v2, 3v3, 4v4) |
| **Last player standing** | Three lives each, respawning in between; last one with lives left (teams optional) |
| **King of the hill** | Hold the glowing zone on your own (or with only your team) for 20 s; the hill moves every 25 s (teams optional) |
| **Grab the Goods** (team objective) | Carry or throw the golden trophy into your team's goal three times |
| **Hot Potato** (party mode) | Someone holds a ticking bomb — hit someone to pass it. Whoever holds it when it goes off is out |

Teams are picked per fighter on the local setup screen or in the online lobby
(click your team badge), or shuffled with **Random teams**. Friendly fire is on.
Rounds that hit the 4-minute limit go to whoever leads on points (hill/trophy
modes) or end in a draw.

## Maps

| Map | Setting | Hazards |
| --- | --- | --- |
| **Tar Top** | Sunset city rooftop | Gaps in the railings, a skylight that shatters if you land on it, a window-cleaner's cradle riding the front of the building, gusts of wind |
| **Grinder Works** | Factory over a molten vat | Conveyor into a grinder, hydraulic press, crane that drops crates, collapsing catwalk, breakable barricade, floor panels that fall away late in the round |
| **Rush Hour** | Back of a speeding truck | Headwind, swerves, low bridges you must dive under, a second truck drifting alongside, the road |
| **Wobbleland** | Night-time funfair pier | Spinning carousel (goes haywire later), rotten planks, bounce pads, a little wheel over the sea, the sea |

Pick a map on the setup screen, or choose **Rotation** (a new map every round)
or **Random**. Rounds that drag on get harder as each map escalates, and end
in a draw at 4 minutes.

## Controls (defaults, remappable in **Controls**)

| Action | WASD player | Arrows player | Gamepad |
| --- | --- | --- | --- |
| Move | W A S D | ← ↑ ↓ → | Left stick / D-pad |
| Jump (climb when hanging) | Space | Num 0 / R-Shift | A |
| Punch | J / F / left mouse | Num 1 / `.` | X |
| Kick | I / E | Num 4 / `,` | B |
| Headbutt | O / Q | Num 5 / M | Y |
| Grab (hold) | K / G / right mouse | Num 2 / `/` | RT |
| Lift (hold) | L / R / middle mouse | Num 3 / `'` | LT |
| Dive / tackle | U / C | Num 6 / N | RB |
| Sprint | L-Shift | Num . / R-Ctrl | LB / L3 |
| Emote | T | Num 7 / `\\` | Back / Select |
| Pause | Esc | Esc | Start |

**Throwing:** hold Grab until your hands stick to someone, hold Lift to hoist
them overhead, then release Grab. Knocked-out fighters are easy to lift;
conscious ones are heavy and can wriggle free by mashing buttons.

**Tackles:** Dive launches you head-first; sprint first for a running tackle,
or dive out of a jump for a flying one. You end up sprawled on the floor, so
don't miss.

**Climbing:** grab a ledge, railing or crate and press Jump to haul yourself up
and over. Hanging costs stamina — run out and you let go.

**Stamina:** sprinting, kicks, headbutts, dives, climbing, hanging and lifting
all cost stamina (green bar on your card and under your name tag). Empty it and
you're exhausted: slower, weaker punches, no specials, and your grip fails.
Stand still to recover faster.

## Architecture

```
src/
  sim/      Headless game simulation (no three.js) — runs in browser and Node
    physics.ts    Rapier init + collision-group layout
    ragdoll.ts    11-part ragdoll definition, bodies and spherical joints
    character.ts  Active-ragdoll controller: balance, locomotion, punches, kicks,
                  headbutts, dive tackles, grabbing (physical joints), lifting,
                  throwing, climbing, stamina, daze/KO, struggling, getting up
    game.ts       GameSim: world, props, strike + prop-impact resolution, events, snapshots
    arena.ts      Arena data types (pieces, movers, breakables, hazards, events)
    arenas/       The four maps as plain data
    arenaRuntime.ts  Moving machinery, breakables, hazard zones, timed events
    modes.ts      Mode definitions, teams/sides helpers
    (meta/)       Cosmetics catalogue, loadouts, XP/levels/ranks/coins/unlocks/stats (src/meta)
    rules.ts      Round rules for every mode (sides, lives, hill, trophy, potato), first to 3, time limit, map rotation
    bot.ts        AI that produces the same inputs a player would
    config.ts     All tuning numbers
  net/      Wire protocol + binary input/snapshot codecs (shared by client and server)
  client/   Browser front end
    game.ts       Fixed-timestep loop, interpolation, event → sound/FX
    render/       three.js scene, per-map themes, arena meshes, character views, camera, FX
    input/        Keyboard / mouse / gamepad → PlayerInput, rebinding
    audio/        Procedural Web Audio sound effects
    net/          WebSocket client, snapshot interpolation (NetWorld/NetMatch)
    ui/           Setup screen, online menus + lobby, controls, pause menu, HUD
server/     Node game server: rooms, matchmaking, friends/invites, match runner
tests/      Vitest suite driving the real simulation headlessly
```

The simulation is deliberately independent of rendering and fed only by
`PlayerInput` objects, so the multiplayer server runs the exact same code
authoritatively. Renderer and HUD draw a `WorldView`, implemented both by the
local `GameSim` and by the online client's snapshot-fed `NetWorld`.

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
