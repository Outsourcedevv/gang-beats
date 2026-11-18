// End-to-end online test: three separate browser clients (separate storage =
// separate players) against a real game server.
//
//   npm run build
//   node tests/e2e/online.e2e.cjs [screenshotDir]
//
// Needs Playwright with Chromium (not a project dependency):
//   npm i -D playwright && npx playwright install chromium
//
// Checks: private room + join by code, friend invite, map voting, start,
// all clients on the same map, input from one client moving its fighter as
// seen by the others, a punch landing (seen on the victim's client), the grey
// spectator screen when eliminated, and a bot taking over when a player leaves.
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || require('os').tmpdir();
const ROOT = path.resolve(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { startServer } = await import(path.join(ROOT, 'dist-server/index.js'));
  const srv = await startServer(8790, path.join(ROOT, 'dist'));
  const URL = 'http://localhost:8790/?quality=low';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  globalThis.__errs = errors;
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 450 } }); // separate storage = separate player
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${name}: ${m.text()}`); });
    await page.goto(URL, { waitUntil: 'networkidle' }); page.setDefaultTimeout(60000);
    await page.click('#tab-online');
    await page.waitForSelector('#quick-play', { timeout: 15000 });
    await page.fill('input[aria-label="Your name"]', name);
    await page.press('input[aria-label="Your name"]', 'Tab');
    return page;
  };
  const A = await mk('Alice');
  const B = await mk('Bob');
  const C = await mk('Cleo');

  // A makes a private room; B joins by typing the code.
  await A.click('#create-private');
  await A.waitForSelector('#room-code');
  const code = (await A.textContent('#room-code')).trim();
  await B.fill('input[aria-label="Room code"]', code);
  await B.click('#join-code');
  await B.waitForSelector('#room-code');

  // C is invited through the friends list: A adds C's friend code and invites.
  const cCode = (await C.textContent('#my-friend-code')).trim();
  await A.fill('input[aria-label="Friend code to add"]', cCode);
  await A.click('#add-friend');
  await A.waitForSelector('.friend-list li .dot.on', { timeout: 10000 });
  await A.click('.friend-list li button:has-text("Invite")');
  await C.waitForSelector('.toast:has-text("invited you")', { timeout: 10000 });
  await C.click('.toast button:has-text("Join")');
  await C.waitForSelector('#room-code');
  await A.waitForFunction(() => document.querySelectorAll('.members li:not(.bot)').length === 3);
  const memberNames = await A.$$eval('.members li .mname', (els) => els.map((e) => e.textContent));

  // Everyone votes Tar Top; A starts.
  for (const p of [A, B, C]) await p.click('.votes .map[data-map="tar-top"]');
  await A.waitForFunction(() => document.querySelector('.votes .map[data-map="tar-top"] .vote-count')?.textContent === '●●●');
  await A.screenshot({ path: OUT + '/o-lobby.png' });
  await A.click('#start-online');
  for (const p of [A, B, C]) await p.waitForFunction(() => window.__game?.net && window.__game.net.world.rules.phase === 'fight', null, { timeout: 20000 });
  const arenaIds = await Promise.all([A, B, C].map((p) => p.evaluate(() => window.__game.net.world.arena.id)));
  const you = await Promise.all([A, B, C].map((p) => p.evaluate(() => window.__game.net.you)));

  // A walks right; B and C should both see A's fighter move.
  const px = (p, i) => p.evaluate((i) => window.__game.net.world.characters[i].torsoPos.x, i);
  const b0 = await px(B, you[0]);
  const c0 = await px(C, you[0]);
  // Record hit events on Bob's client.
  await B.evaluate(() => {
    window.__hits = 0;
    const g = window.__game;
    const orig = g.listener.onEvent;
    g.listener.onEvent = (ev, game) => { if (ev.type === 'hit') window.__hits++; orig(ev, game); };
  });
  // Alice walks towards Bob (holding D) until she's next to him, then jabs (J).
  // Keys are dispatched inside the page so the steering reacts in real time.
  const steer = await A.evaluate(async ([a, b]) => {
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    const w = () => window.__game.net.world;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = performance.now();
    key('keydown', 'KeyD');
    while (performance.now() - t0 < 8000 && w().characters[b].torsoPos.x - w().characters[a].torsoPos.x > 1.0) await sleep(10);
    key('keyup', 'KeyD');
    const walked = performance.now() - t0;
    let jabs = 0;
    while (jabs < 20 && w().characters[b].daze <= 0) {
      key('keydown', 'KeyJ');
      await sleep(40);
      key('keyup', 'KeyJ');
      await sleep(180);
      jabs++;
    }
    return { walked: Math.round(walked), jabs, bobDazeSeenByAlice: w().characters[b].daze };
  }, [you[0], you[1]]);
  await sleep(600);
  const b1 = await px(B, you[0]);
  const c1 = await px(C, you[0]);
  const hitsSeenByB = await B.evaluate(() => window.__hits ?? null);
  const bobDaze = await B.evaluate((i) => window.__game.net.world.characters[i].daze, you[1]);
  const serverHits = srv.hub.rooms.get(code).match.sim.characters.map((c) => +c.daze.toFixed(1));
  await A.screenshot({ path: OUT + '/o-alice.png' });
  await B.screenshot({ path: OUT + '/o-bob.png' });

  // Spectating: knock Cleo out of the round on the server; her screen goes grey.
  const sim = srv.hub.rooms.get(code).match.sim;
  sim.characters[you[2]].eliminate(sim, 'fall');
  await C.waitForFunction(() => window.__game.spectating === true, null, { timeout: 5000 });
  await sleep(500);
  const cFilter = await C.evaluate(() => document.querySelector('#app canvas').style.filter);
  const cBanner = await C.evaluate(() => !document.querySelector('.spectate').classList.contains('hidden'));
  await C.screenshot({ path: OUT + '/o-cleo-spectating.png' });

  // Cleo leaves via the menu; Alice sees a bot take over.
  await C.keyboard.press('Escape');
  await C.click('#leave-match');
  await C.waitForSelector('#quick-play', { timeout: 10000 });
  await A.waitForFunction(() => document.querySelector('.warning')?.textContent?.includes('bot takes over'), null, { timeout: 8000 });

  console.log(JSON.stringify({ steer, hitsSeenByB, code, memberNames, arenaIds, you, aliceSeenByBob: [b0, b1], aliceSeenByCleo: [c0, c1], bobDaze, serverHits, cFilter, cBanner }));
  const ok = hitsSeenByB > 0 && Math.abs(b1 - c1) < 0.5 && b1 - b0 > 1 && cFilter.includes('grayscale') && cBanner && new Set(arenaIds).size === 1;
  console.log(ok ? 'E2E PASSED' : 'E2E FAILED');
  if (!ok) process.exitCode = 1;
  const real = errors.filter((e) => !e.includes('ReadPixels')); console.log('ERRORS:', real.length ? real.join(' || ') : 'none');
  await browser.close();
  await srv.close();
})().catch((e) => { console.error('E2E FAILED', e.message.split('\n')[0]); console.error('PAGE ERRORS:', JSON.stringify(globalThis.__errs ?? [])); process.exit(1); });
