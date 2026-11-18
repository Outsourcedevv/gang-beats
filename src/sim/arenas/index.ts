import type { ArenaDef } from '../arena';
import { TAR_TOP } from './tarTop';
import { FACTORY } from './factory';
import { HIGHWAY } from './highway';
import { FUNFAIR } from './funfair';

export { TAR_TOP, FACTORY, HIGHWAY, FUNFAIR };

/** All playable maps, in menu order. */
export const ARENAS: ArenaDef[] = [TAR_TOP, FACTORY, HIGHWAY, FUNFAIR];

export function arenaById(id: string): ArenaDef | undefined {
  return ARENAS.find((a) => a.id === id);
}
