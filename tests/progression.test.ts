import { describe, expect, it } from 'vitest';
import { ITEMS, defaultLoadout, itemById, sanitizeLoadout } from '../src/meta/cosmetics';
import { applyReport, buy, isUnlocked, levelInfo, loadoutAllowed, newProfile, rankFor, rewardFor, sanitizeProfile, xpForLevel } from '../src/meta/progression';
import type { MatchReport } from '../src/meta/progression';

const report = (o: Partial<MatchReport> = {}): MatchReport => ({
  mode: 'ffa',
  maps: ['tar-top'],
  rounds: 4,
  roundWins: 3,
  won: true,
  kos: 2,
  ringOuts: 1,
  falls: 1,
  punches: 20,
  kicks: 3,
  headbutts: 1,
  dives: 1,
  throws: 2,
  climbs: 0,
  seconds: 180,
  online: false,
  ...o,
});

describe('progression', () => {
  it('levels follow the XP curve and ranks follow levels', () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(100 + xpForLevel(2)).level).toBe(3);
    expect(rankFor(1)).toBe('Jelly Rookie');
    expect(rankFor(12)).toBe('Brawler');
    expect(levelInfo(1e9).level).toBe(50);
  });

  it('rewards scale with what you did', () => {
    const win = rewardFor(report());
    const lose = rewardFor(report({ won: false, roundWins: 0, kos: 0, ringOuts: 0 }));
    expect(win.xp).toBeGreaterThan(lose.xp);
    expect(lose.xp).toBe(50);
    expect(win.lines.some((l) => l.label.includes('winner'))).toBe(true);
  });

  it('applying a match updates XP, coins, stats and reports unlocks', () => {
    const p = newProfile();
    const r = applyReport(p, report());
    expect(p.stats.matches).toBe(1);
    expect(p.stats.matchWins).toBe(1);
    expect(p.stats.modeWins.ffa).toBe(1);
    expect(p.stats.mapPlays['tar-top']).toBe(1);
    expect(r.levelAfter).toBeGreaterThan(r.levelBefore);
    expect(p.coins).toBeGreaterThan(100);
    expect(r.unlocked.length).toBeGreaterThan(0); // level 2 items
    expect(r.unlocked.every((i) => isUnlocked(p, i))).toBe(true);
  });

  it('shop: buying with coins, refusing when broke or level-locked', () => {
    const p = newProfile();
    const cap = itemById('hat:cap')!;
    const crown = itemById('hat:crown')!;
    expect(isUnlocked(p, cap)).toBe(false);
    expect(buy(p, cap)).toBeNull();
    expect(isUnlocked(p, cap)).toBe(true);
    expect(p.coins).toBe(0);
    expect(buy(p, itemById('hat:chef')!)).toMatch(/Not enough/);
    expect(buy(p, crown)).toMatch(/level/);
  });

  it('loadouts: sanitising and ownership', () => {
    const p = newProfile();
    expect(loadoutAllowed(p, defaultLoadout())).toBe(true);
    expect(loadoutAllowed(p, { ...defaultLoadout(), hat: 'crown' })).toBe(false);
    const evil = sanitizeLoadout({ character: 'nope', hat: '<script>', body: -5, emote: 'dance' });
    expect(evil.character).toBe('mallow');
    expect(evil.hat).toBe('beanie');
    expect(evil.body).toBe(defaultLoadout().body);
    expect(evil.emote).toBe('dance');
    expect(sanitizeProfile({ version: 1, xp: -5, coins: 'lots', owned: ['hat:cap', 'bogus'] })).toMatchObject({ xp: 0, coins: 0, owned: ['hat:cap'] });
    expect(sanitizeProfile({ version: 9 }).xp).toBe(0);
  });

  it('every catalogue item is reachable', () => {
    for (const i of ITEMS) expect(i.price !== undefined || i.level !== undefined || isUnlocked(newProfile(), i)).toBe(true);
  });
});
