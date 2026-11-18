import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

let ready: Promise<void> | null = null;

/** Initialise the Rapier WASM module once (works in browser and Node). */
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

// Collision group layout (16 membership bits):
//   bits 0..11  -> one bit per character (so a character never collides with itself)
//   bit 12      -> static environment
//   bit 13      -> dynamic props
export const MAX_CHARACTERS = 12;
export const ENV_BIT = 1 << 12;
export const PROP_BIT = 1 << 13;
const ALL = 0xffff;

const groups = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);

export const characterGroups = (index: number): number => groups(1 << index, ALL & ~(1 << index));
export const envGroups = (): number => groups(ENV_BIT, ALL);
export const propGroups = (): number => groups(PROP_BIT, ALL);
