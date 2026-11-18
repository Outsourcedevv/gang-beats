# Development checklist

Status key: ✅ done and tested · 🟡 partial / basic version · ⬜ not started

How things were verified: `npm test` runs the real simulation headlessly
(63 tests, including multiplayer-server tests with real WebSocket clients); the browser build was driven with headless Chromium via Playwright
(setup → match → punching, grabbing, lifting, throwing, pause, rebinding,
settings persistence) with no console errors; `tests/e2e/online.e2e.cjs` runs
three separate browser clients against the real server and passes. Feel/tuning still needs
hands-on playtesting on real hardware — the container only has a software
renderer, so frame rates measured here (3–11 fps) say nothing about real GPUs.

## Stage 1 — Playable prototype ✅

| Feature | Status | Notes |
| --- | --- | --- |
| 3D environment | ✅ | Sunset rooftop arena "Tar Top", sky, lit city backdrop, shadows |
| Two (up to four) playable characters | ✅ | 6 original fighters; local slots: keyboard A/B, gamepads 1–4, bot |
| Movement / jumping | ✅ | Active-ragdoll locomotion with procedural walk cycle, sprint |
| Punching | ✅ | Alternating fists, physical collision hits, strength from impact speed, knockback, stagger; optional hold-to-punch |
| Grabbing | ✅ | Both hands reach; each hand sticks with a real Rapier joint to fighters, props or scenery (railings); grips break if over-stretched |
| Basic ragdoll physics | ✅ | 11 bodies / 10 spherical joints, PD muscles + gravity compensation, topples when off-balance |
| Lifting & throwing | ✅ | Hold Lift to hoist overhead (easy on KO'd fighters, hard on conscious ones), release Grab to throw in the facing direction |
| Struggle free | ✅ | Held fighters mash buttons / pull away to escape |
| Knockout system | ✅ | Progressive daze + sudden KO on hard head hits; limp ragdoll, recovery, button-mash to wake faster |
| Elimination & spectating | 🟡 | Falling off removes you for the round; card greys out "OUT — spectating". Per-player grey screen comes with online play (Stage 4), since local players share one screen |
| Rounds, first to 3 | ✅ | Countdown, last-standing detection with draw grace period, round/match banners, auto-restart. Practice mode with one fighter |
| Shared camera | ✅ | Frames all fighters still on the roof, zooms with spread, tiny shake only on big hits |
| Bots | ✅ | Hunt, punch, grab KO'd targets, carry to the edge and throw, mash to escape/wake |
| Audio | 🟡 | Procedural SFX (punches, bonks, grunts per fighter voice, thuds, KO, falls, bells, cheer) + rooftop ambience. No music yet |
| Controls remapping | ✅ | Per-key rebinding for both keyboard schemes, saved locally |
| Settings persistence | ✅ | localStorage (this browser only): volume, hold-to-punch, mouse, bindings, fighter slots |

Tuning notes from automated bot-vs-bot runs: rounds last ~12–105 s (1v1) and
~20–90 s (4 players) with very aggressive bots; human rounds should be longer.
Physics costs ~0.8 ms per step for 8 fighters.

## Stage 2 — Complete combat ✅

| Feature | Status | Notes |
| --- | --- | --- |
| Kicking | ✅ | Alternating legs, wind-up → snap → recover; strongest shove, kicker wobbles a bit |
| Headbutts | ✅ | Lean back then lunge; biggest daze on head hits, small self-daze |
| Running tackles | ✅ | Dive from a sprint keeps your run speed; victim is knocked flat, diver sprawls and must get up |
| Jumping tackles | ✅ | Dive out of a jump (once per jump) |
| Stamina bar | ✅ | Sprint, specials, climbing, hanging, lifting and struggling cost stamina; exhaustion = slower, weaker punches, no specials, grip fails; faster refill when standing still. Bars on cards and name tags |
| Climbing | ✅ | Grab a ledge/railing/crate and press Jump: rise up the wall, then over the top. Also vaults railings and AC units |
| Ledge hanging | ✅ | Hands reach up while airborne to catch edges; hanging drains stamina until you drop |
| Object interactions | ✅ | Strikes knock props around; thrown/kicked props hurt whoever they hit (credited to the thrower); new bouncy ball |
| Improved recovery | ✅ | Get-up phase: hands plant and push, knees tuck, chest heave scaled by regained balance (back on feet < 2.5 s) |
| Improved physics | ✅ | Movement and hover are relative to whatever you're standing on (ready for moving platforms/vehicles in Stage 3); all strikes resolved through one generic system |
| Bots | ✅ | Use kicks, headbutts, flying tackles, sprint by stamina, catch ledges and climb back when knocked off |
| Controls | ✅ | New actions remappable; older saved bindings are migrated without key clashes |

Bot-vs-bot tuning runs after Stage 2: rounds ~16–118 s (1v1) and ~17–110 s
(4 players); bots climbed back from the edge several times per run.

## Stage 3 — Maps ✅

| Feature | Status | Notes |
| --- | --- | --- |
| 4 maps with distinct identities | ✅ | Tar Top (sunset rooftop), Grinder Works (factory), Rush Hour (truck on a motorway), Wobbleland (night funfair pier); each has its own sky, fog, lights, backdrop and ambient sound |
| Moving platforms | ✅ | Window-cleaner cradle, crane grab bar, neighbouring truck, carousel, wheel gondolas. Fighters ride them (movement is relative to the surface) |
| Moving machinery | ✅ | Hydraulic press (knocks out anyone under it), grinder rollers, conveyor belt |
| Falling objects | ✅ | Crane drops crates (target ring on the floor); thrown/dropped props hurt |
| Destructible structures | ✅ | Shattering skylight, breakable plank barricade |
| Collapsing floors | ✅ | Catwalk tiles and rotten pier planks give way when stood on; factory floor panels and the remaining planks collapse late in the round |
| Environmental hazards | ✅ | Kill zones (grinder, molten vat, road, sea, building interior), headwind, swerves, gusts, low bridges, bounce pads |
| Pick-up objects | ✅ | Crates, barrels, cones, balls on every map |
| Different destruction levels | ✅ | Low (Tar Top) → medium (Rush Hour, Wobbleland) → high (Grinder Works) |
| Escalation & time limit | ✅ | Each map intensifies after ~90–150 s; rounds end in a draw at 240 s |
| Map choice | ✅ | Setup screen: any map, Random, or Rotation (new map every round, score carried over) |
| Bots on every map | ✅ | Avoid kill zones, presses, belts and edges/holes (floor raycast), carry victims to hazards, dive under low bridges |

Bot-vs-bot runs (4 bots, aggressive): Tar Top rounds ~25–110 s, Grinder Works
~20–200 s, Rush Hour ~15–30 s (narrow deck, very chaotic), Wobbleland ~13–90 s.
Physics ≈ 0.7–1.2 ms per step with 8 fighters.

## Stage 4 — Online multiplayer ✅

| Feature | Status | Notes |
| --- | --- | --- |
| Backend | ✅ | Node + `ws` WebSocket server (`server/`), also serves the built client; `/health` endpoint |
| Server-authoritative simulation | ✅ | The server runs `GameSim` at 60 Hz: positions, physics, combat, KOs, eliminations, rounds, map switches |
| Real-time networking | ✅ | Binary inputs (with tap latching so quick presses aren't lost) → server; binary snapshots (≈1.6 KB for 8 fighters on the busiest map, 30 Hz ≈ 50 KB/s per client) + JSON event batches → clients |
| Latency handling | ✅ | Client interpolates ~117 ms behind a smoothed server-clock estimate; events released in sync with the interpolated view; slow clients skip snapshots instead of lagging. No client-side prediction (inputs feel RTT/2 + ~17 ms late) |
| Public matchmaking | ✅ | Quick play joins the fullest public lobby or opens one; public rooms auto-start 5 s after 2+ players are all ready |
| Private rooms + room codes | ✅ | 5-letter codes (no ambiguous characters), invite links `?room=CODE` |
| Friend invitations | ✅ | Friend codes, live presence (online / which room), invite pop-ups with Join |
| Map voting | ✅ | Most votes wins (ties random); optional "new map each round" rotation |
| Lobby player list + previews | ✅ | Names, fighter previews, ready flags, host crown, bots listed |
| Ready indicators | ✅ | |
| Host controls | ✅ | Start (with just two fighters), bot count, map rotation, kick; host migrates if the host leaves |
| Bots | ✅ | Run on the server; fill slots by host choice; take over leavers |
| 4–8 players | ✅ | Up to 8 fighters per room |
| Eliminated players spectate | ✅ | Grey screen + "spectating" banner; stay in the room; late joiners watch until the next match |
| Stay in the lobby between matches | ✅ | Rounds continue within a match; afterwards everyone returns to the lobby |
| Verified with separate browser clients | ✅ | 3 Playwright browser contexts: join by code, friend invite, votes, start, movement seen identically by the others, a punch registering on the victim's client, spectator mode, leaver → bot |
| Team selection / random teams | ✅ | Added in Stage 5: per-player team badge in the lobby, host Random teams, bots balance teams |

Server cost: ~1 ms of physics per tick for an 8-fighter room, so one server
process can host roughly 10 busy rooms.

## Stage 5 — Game modes ✅ (current)

| Mode | Status | Notes |
| --- | --- | --- |
| Free-for-all | ✅ | Last fighter standing |
| Last player standing | ✅ | 3 lives, 2.5 s respawn at the safest spawn point; teams optional |
| Team battles | ✅ | 2–4 teams (2v2, 3v3, 4v4…), team rings under fighters, team-coloured cards/scoreboard, friendly fire on |
| King of the hill | ✅ | Per-map hill zones (moves every 25 s), solo/one-team control scores, contested scores nothing, first to 20; teams optional |
| Team objectives | ✅ | Grab the Goods: golden trophy, per-map goals, first to 3 goals |
| Additional party modes | ✅ | Hot Potato. Modes are data + rules hooks (`src/sim/modes.ts`, `rules.ts`), so new ones slot in easily |
| Team selection + random teams | ✅ | Local setup (per-slot team button, team count, Random teams) and online lobby |
| First to three round wins | ✅ | Scores per side; round/match banners name the team or fighter; time limit decides point modes |
| Bots understand every mode | ✅ | Don't target teammates, take the hill, fetch/carry/chase the trophy, pass or flee the bomb |
| Works online | ✅ | Mode, teams, lives, points, hill and bomb state are in the protocol and snapshots |

## Stage 6 — Menus & progression
⬜ Main menu (Play / Customise / Settings / Statistics / Friends), XP, levels, ranks, coins, unlockable outfits/characters/emotes/victory animations (local storage first, structured for cloud saves).

## Stage 7 — Polish
⬜ Music per map, more FX, LOD/perf passes, accessibility, UX polish.

## Known issues / limitations
- Online play has no client-side prediction: on high-latency connections your own fighter responds RTT/2 + ~120 ms (interpolation) late.
- Online identity/friends are browser-local (no accounts yet).
- Keyboard scheme B shares the keyboard with scheme A; for two players a gamepad is more comfortable.
- Fighters hanging off the far (back) edge can be partly hidden behind the roof from the shared camera; their name tag and card still show them.
- Physics feel has been tuned with automated tests and screenshots only; real playtesting will need follow-up tuning (see `src/sim/config.ts`).
