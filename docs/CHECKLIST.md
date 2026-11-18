# Development checklist

Status key: ✅ done and tested · 🟡 partial / basic version · ⬜ not started

How things were verified: `npm test` runs the real simulation headlessly
(10 tests); the browser build was driven with headless Chromium via Playwright
(setup → match → punching, grabbing, lifting, throwing, pause, rebinding,
settings persistence) with no console errors. Feel/tuning still needs
hands-on playtesting on real hardware — the container only has a software
renderer, so frame rates measured here (3–11 fps) say nothing about real GPUs.

## Stage 1 — Playable prototype (current)

| Feature | Status | Notes |
| --- | --- | --- |
| 3D environment | ✅ | Sunset rooftop arena "Tar Top", sky, lit city backdrop, shadows |
| Two (up to four) playable characters | ✅ | 6 original fighters; local slots: keyboard A/B, gamepads 1–4, bot |
| Movement / jumping | ✅ | Active-ragdoll locomotion with procedural walk cycle; sprint (no stamina yet) |
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

## Stage 2 — Complete combat

| Feature | Status |
| --- | --- |
| Kicking | ⬜ |
| Headbutts | ⬜ |
| Running / jumping tackles (dive) | ⬜ |
| Stamina bar (sprint, actions, hanging) | ⬜ — sprint exists without a stamina cost |
| Climbing (pull up from ledge grabs) | 🟡 — ledge/railing grabbing and hanging works; no pull-up yet |
| More object interactions | 🟡 — crates/barrel/cone can be grabbed, carried, thrown |
| Improved recovery (get-up animations from front/back) | ⬜ |

## Stage 3 — Maps (3–5)
⬜ Factory, moving truck, amusement park, one more original hazard map. Moving platforms, collapsing floors, falling objects, machinery.

## Stage 4 — Online multiplayer
⬜ Node + WebSocket authoritative server running `src/sim`, interpolation/prediction, public matchmaking, private rooms + codes, friend invites, host controls, bots filling slots, per-player grey spectator screen.

## Stage 5 — Game modes
🟡 Last player standing / free-for-all exists. ⬜ Team battles (2v2, 3v3), king of the hill, team objectives, mode selection.

## Stage 6 — Menus & progression
⬜ Main menu (Play / Customise / Settings / Statistics / Friends), XP, levels, ranks, coins, unlockable outfits/characters/emotes/victory animations (local storage first, structured for cloud saves).

## Stage 7 — Polish
⬜ Music per map, more FX, LOD/perf passes, accessibility, UX polish.

## Known issues / limitations
- Online multiplayer is not implemented yet (Stage 4). Everything is local, on one screen.
- Only one map.
- Keyboard scheme B shares the keyboard with scheme A; for two players a gamepad is more comfortable.
- Physics feel has been tuned with automated tests and screenshots only; real playtesting will need follow-up tuning (see `src/sim/config.ts`).
