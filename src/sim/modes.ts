// Game modes. Every mode plays in rounds; the first side (player or team) to
// win three rounds takes the match.

export type ModeId = 'ffa' | 'teams' | 'lives' | 'koth' | 'trophy' | 'potato';

export interface ModeDef {
  id: ModeId;
  name: string;
  blurb: string;
  /** Teams are required (true), forbidden (false) or optional ('optional'). */
  teams: boolean | 'optional';
  /** Fighters come back after being knocked off. */
  respawn: boolean;
}

export const MODES: ModeDef[] = [
  { id: 'ffa', name: 'Free-for-all', blurb: 'Every fighter for themselves. Last one standing wins the round.', teams: false, respawn: false },
  { id: 'teams', name: 'Team battle', blurb: 'Teams of two or more. Last team with anyone standing wins the round.', teams: true, respawn: false },
  { id: 'lives', name: 'Last player standing', blurb: 'Three lives each. Fall off and you come back — until your lives run out.', teams: 'optional', respawn: true },
  { id: 'koth', name: 'King of the hill', blurb: 'Hold the glowing zone on your own to score. First to 20 points wins the round. The hill moves!', teams: 'optional', respawn: true },
  { id: 'trophy', name: 'Grab the Goods', blurb: 'Team objective: carry or throw the golden trophy into your team’s goal. First to 3 goals wins the round.', teams: true, respawn: true },
  { id: 'potato', name: 'Hot Potato', blurb: 'Party mode: someone holds a ticking bomb. Punch, kick or headbutt someone to pass it on before it goes off!', teams: false, respawn: false },
];

export const modeDef = (id: ModeId): ModeDef => MODES.find((m) => m.id === id) ?? MODES[0];

export const TEAM_NAMES = ['Red', 'Blue', 'Green', 'Gold'];
export const TEAM_COLORS = [0xff4f5e, 0x3d8bff, 0x3ccf6e, 0xffc23d];
export const MAX_TEAMS = 4;

export const LIVES = 3;
export const RESPAWN_DELAY = 2.5;
export const KOTH_TARGET = 20;
export const KOTH_MOVE_EVERY = 25;
export const TROPHY_TARGET = 3;
export const POTATO_FUSE: [number, number] = [11, 17];

/**
 * Side (scoring unit) for each fighter. Without teams every fighter is their
 * own side; with teams the side is the team index.
 */
export function sidesFor(mode: ModeId, players: number, teams?: readonly number[]): number[] {
  const def = modeDef(mode);
  const useTeams = def.teams === true || (def.teams === 'optional' && !!teams && new Set(teams).size > 1);
  if (!useTeams) return Array.from({ length: players }, (_, i) => i);
  if (teams && teams.length >= players) return teams.slice(0, players).map((t) => Math.max(0, Math.min(MAX_TEAMS - 1, t)));
  // Default: alternate between two teams.
  return Array.from({ length: players }, (_, i) => i % 2);
}

export function usesTeams(mode: ModeId, players: number, teams?: readonly number[]): boolean {
  const s = sidesFor(mode, players, teams);
  return s.some((x, i) => x !== i) || modeDef(mode).teams === true;
}

/** Shuffle fighters into `count` balanced teams. */
export function randomTeams(players: number, count: number, rng = Math.random): number[] {
  const order = Array.from({ length: players }, (_, i) => i).sort(() => rng() - 0.5);
  const out = new Array<number>(players).fill(0);
  order.forEach((p, k) => (out[p] = k % Math.max(2, Math.min(MAX_TEAMS, count))));
  return out;
}
