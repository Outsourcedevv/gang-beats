import type { Item, Loadout } from './cosmetics';
import { CHARACTERS, ITEMS, characterById, defaultLoadout, loadoutItems, sanitizeLoadout } from './cosmetics';

// XP, levels, ranks, coins, unlocks and lifetime statistics.

export const MAX_LEVEL = 50;

export interface Stats {
  matches: number;
  matchWins: number;
  rounds: number;
  roundWins: number;
  kos: number;
  ringOuts: number;
  falls: number;
  punches: number;
  kicks: number;
  headbutts: number;
  dives: number;
  throws: number;
  climbs: number;
  seconds: number;
  modeWins: Record<string, number>;
  mapPlays: Record<string, number>;
}

export interface Profile {
  version: 1;
  xp: number;
  coins: number;
  /** Item ids bought with coins (level unlocks are derived from xp). */
  owned: string[];
  loadout: Loadout;
  stats: Stats;
}

export const emptyStats = (): Stats => ({
  matches: 0,
  matchWins: 0,
  rounds: 0,
  roundWins: 0,
  kos: 0,
  ringOuts: 0,
  falls: 0,
  punches: 0,
  kicks: 0,
  headbutts: 0,
  dives: 0,
  throws: 0,
  climbs: 0,
  seconds: 0,
  modeWins: {},
  mapPlays: {},
});

export const newProfile = (): Profile => ({ version: 1, xp: 0, coins: 100, owned: [], loadout: defaultLoadout(), stats: emptyStats() });

/** Clean up a stored profile (old versions, tampering, missing fields). */
export function sanitizeProfile(raw: unknown): Profile {
  const p = (raw ?? {}) as Partial<Profile>;
  if (p.version !== 1) return newProfile();
  const stats = { ...emptyStats(), ...(p.stats ?? {}) };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    version: 1,
    xp: num(p.xp),
    coins: num(p.coins),
    owned: Array.isArray(p.owned) ? p.owned.filter((id) => ITEMS.some((i) => i.id === id)) : [],
    loadout: sanitizeLoadout(p.loadout),
    stats,
  };
}

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level: number): number => 100 + 40 * (level - 1);

export function levelInfo(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = xp;
  while (level < MAX_LEVEL && rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  return { level, into: rest, need: level >= MAX_LEVEL ? 0 : xpForLevel(level) };
}

const RANKS: [number, string][] = [
  [1, 'Jelly Rookie'],
  [3, 'Wobbler'],
  [6, 'Scrapper'],
  [10, 'Brawler'],
  [15, 'Bruiser'],
  [20, 'Rumbler'],
  [30, 'Champion'],
  [40, 'Legend'],
  [50, 'Wobble Weight Champion'],
];

export function rankFor(level: number): string {
  let r = RANKS[0][1];
  for (const [l, name] of RANKS) if (level >= l) r = name;
  return r;
}

export function isUnlocked(p: Profile, item: Item): boolean {
  if (item.level === undefined && item.price === undefined) return true;
  if (item.level !== undefined && levelInfo(p.xp).level >= item.level) return true;
  if (p.owned.includes(item.id)) return true;
  // A character's own colours come with the character.
  if (item.kind === 'color') {
    for (const c of CHARACTERS) {
      const ci = ITEMS.find((i) => i.id === `character:${c.id}`)!;
      if ((c.body === item.value || c.pants === item.value) && isUnlocked(p, ci)) return true;
    }
  }
  return false;
}

export function unlockedIds(p: Profile): Set<string> {
  return new Set(ITEMS.filter((i) => isUnlocked(p, i)).map((i) => i.id));
}

/** Buy an item with coins. Returns an error message, or null on success. */
export function buy(p: Profile, item: Item): string | null {
  if (isUnlocked(p, item)) return 'You already have that.';
  if (item.price === undefined) return `Reach level ${item.level} to unlock this.`;
  if (p.coins < item.price) return `Not enough coins (${item.price} needed).`;
  p.coins -= item.price;
  p.owned.push(item.id);
  return null;
}

/** Can this loadout be worn (everything in it unlocked)? */
export function loadoutAllowed(p: Profile, l: Loadout): boolean {
  const have = unlockedIds(p);
  return loadoutItems(l).every((id) => have.has(id) || !ITEMS.some((i) => i.id === id));
}

/** Everything one player did in one match. */
export interface MatchReport {
  mode: string;
  maps: string[];
  rounds: number;
  roundWins: number;
  won: boolean;
  kos: number;
  ringOuts: number;
  falls: number;
  punches: number;
  kicks: number;
  headbutts: number;
  dives: number;
  throws: number;
  climbs: number;
  seconds: number;
  online: boolean;
}

export interface Reward {
  xp: number;
  coins: number;
  lines: { label: string; xp: number; coins: number }[];
}

export function rewardFor(r: MatchReport): Reward {
  const lines: Reward['lines'] = [];
  const add = (label: string, xp: number, coins: number) => {
    if (xp || coins) lines.push({ label, xp, coins });
  };
  add('Played a match', 50, 20);
  add(`Rounds won ×${r.roundWins}`, 40 * r.roundWins, 15 * r.roundWins);
  add(`Knockouts ×${r.kos}`, 10 * r.kos, 4 * r.kos);
  add(`Ring-outs ×${r.ringOuts}`, 15 * r.ringOuts, 6 * r.ringOuts);
  if (r.won) add('Match winner!', 100, 50);
  if (r.online) add('Online bonus', 25, 10);
  return { xp: lines.reduce((s, l) => s + l.xp, 0), coins: lines.reduce((s, l) => s + l.coins, 0), lines };
}

export interface ApplyResult {
  reward: Reward;
  levelBefore: number;
  levelAfter: number;
  /** Items newly unlocked by levelling up. */
  unlocked: Item[];
}

/** Add a finished match to the profile (XP, coins, stats, level-up bonuses). */
export function applyReport(p: Profile, r: MatchReport): ApplyResult {
  const before = levelInfo(p.xp).level;
  const had = unlockedIds(p);
  const reward = rewardFor(r);
  p.xp += reward.xp;
  p.coins += reward.coins;
  const after = levelInfo(p.xp).level;
  if (after > before) {
    const bonus = 50 * (after - before);
    p.coins += bonus;
    reward.lines.push({ label: `Level up bonus`, xp: 0, coins: bonus });
    reward.coins += bonus;
  }
  const s = p.stats;
  s.matches++;
  if (r.won) {
    s.matchWins++;
    s.modeWins[r.mode] = (s.modeWins[r.mode] ?? 0) + 1;
  }
  s.rounds += r.rounds;
  s.roundWins += r.roundWins;
  s.kos += r.kos;
  s.ringOuts += r.ringOuts;
  s.falls += r.falls;
  s.punches += r.punches;
  s.kicks += r.kicks;
  s.headbutts += r.headbutts;
  s.dives += r.dives;
  s.throws += r.throws;
  s.climbs += r.climbs;
  s.seconds += Math.round(r.seconds);
  for (const m of r.maps) s.mapPlays[m] = (s.mapPlays[m] ?? 0) + 1;
  const unlocked = ITEMS.filter((i) => !had.has(i.id) && isUnlocked(p, i));
  return { reward, levelBefore: before, levelAfter: after, unlocked };
}

export const characterName = (id: string) => characterById(id).name;
