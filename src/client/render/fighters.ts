import type { AccessoryId, EmoteId, EyeStyle, HatId, Loadout, OutfitId, VictoryId } from '../../meta/cosmetics';
import { CHARACTERS, characterById, presetLoadout } from '../../meta/cosmetics';

// Everything the renderer needs to draw one fighter, derived from a Loadout.

export type HatKind = HatId;

export interface FighterLook {
  id: string;
  name: string;
  body: number;
  pants: number;
  shoes: number;
  hat: HatId;
  hatColor: number;
  hatAccent: number;
  eyes: EyeStyle;
  /** Voice pitch multiplier for grunts. */
  voice: number;
  outfit: OutfitId;
  accessory: AccessoryId;
  emote: EmoteId;
  victory: VictoryId;
}

export function lookFrom(l: Loadout, name?: string): FighterLook {
  const c = characterById(l.character);
  return {
    id: c.id,
    name: name ?? c.name,
    body: l.body,
    pants: l.pants,
    shoes: c.shoes,
    hat: l.hat,
    hatColor: l.hatColor,
    hatAccent: c.hatAccent,
    eyes: c.eyes,
    voice: c.voice,
    outfit: l.outfit,
    accessory: l.accessory,
    emote: l.emote,
    victory: l.victory,
  };
}

/** Preset characters (local guests, bots). */
export const FIGHTERS: FighterLook[] = CHARACTERS.map((_, i) => lookFrom(presetLoadout(i)));
