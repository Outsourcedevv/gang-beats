// Cosmetics catalogue + loadouts. Purely visual: no item changes how a fighter
// plays. Shared by the client (rendering, shop) and server (validation).

export type HatId =
  | 'none'
  | 'beanie'
  | 'tophat'
  | 'cone'
  | 'headphones'
  | 'cap'
  | 'crown'
  | 'chef'
  | 'viking'
  | 'party'
  | 'propeller'
  | 'flower'
  | 'bucket';
export type OutfitId = 'plain' | 'overalls' | 'tuxedo' | 'stripes' | 'cape' | 'hoodie' | 'luchador';
export type AccessoryId = 'none' | 'glasses' | 'shades' | 'moustache' | 'bowtie' | 'scarf' | 'eyepatch' | 'monocle';
export type EmoteId = 'wave' | 'cheer' | 'flex' | 'dance' | 'facepalm' | 'shrug';
export type VictoryId = 'cheer' | 'spin' | 'flex' | 'bounce' | 'backflip';
export type EyeStyle = 'round' | 'sleepy' | 'wide';

export interface CharacterDef {
  id: string;
  name: string;
  body: number;
  pants: number;
  shoes: number;
  hat: HatId;
  hatColor: number;
  hatAccent: number;
  eyes: EyeStyle;
  voice: number;
}

/** How a fighter looks. */
export interface Loadout {
  character: string;
  body: number;
  pants: number;
  hat: HatId;
  hatColor: number;
  outfit: OutfitId;
  accessory: AccessoryId;
  emote: EmoteId;
  victory: VictoryId;
}

export type ItemKind = 'character' | 'color' | 'hat' | 'outfit' | 'accessory' | 'emote' | 'victory';

export interface Item {
  id: string; // unique, e.g. 'hat:crown'
  kind: ItemKind;
  value: string | number;
  name: string;
  /** Unlocked automatically at this level... */
  level?: number;
  /** ...or bought with coins. Neither = free. */
  price?: number;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'mallow', name: 'Mallow', body: 0xff8fb1, pants: 0x5a4bd1, shoes: 0x2b2440, hat: 'beanie', hatColor: 0x2fc3a5, hatAccent: 0xffffff, eyes: 'round', voice: 1.25 },
  { id: 'gumbo', name: 'Gumbo', body: 0x46c9e8, pants: 0xffb02e, shoes: 0x33261c, hat: 'tophat', hatColor: 0x2a2a35, hatAccent: 0xe8473f, eyes: 'sleepy', voice: 0.8 },
  { id: 'pudding', name: 'Pudding', body: 0xffd84a, pants: 0x3c8f4e, shoes: 0x3a2a1a, hat: 'cone', hatColor: 0xff6a1a, hatAccent: 0xffffff, eyes: 'wide', voice: 1.05 },
  { id: 'jamjar', name: 'Jamjar', body: 0xa07bf0, pants: 0x2d2f3a, shoes: 0xf2f2f2, hat: 'headphones', hatColor: 0xff4f6d, hatAccent: 0x2d2f3a, eyes: 'round', voice: 0.95 },
  { id: 'pickle', name: 'Pickle', body: 0x8fdc5a, pants: 0x8a4fff, shoes: 0x222222, hat: 'none', hatColor: 0, hatAccent: 0, eyes: 'wide', voice: 1.15 },
  { id: 'brick', name: 'Brick', body: 0xe86a4a, pants: 0x3a5ba8, shoes: 0x1e1e24, hat: 'beanie', hatColor: 0xf2c94c, hatAccent: 0xe86a4a, eyes: 'sleepy', voice: 0.7 },
  { id: 'sprout', name: 'Sprout', body: 0xb8f07a, pants: 0x6b4a2a, shoes: 0x3a2a1a, hat: 'flower', hatColor: 0xff7eb6, hatAccent: 0xffe14a, eyes: 'wide', voice: 1.35 },
  { id: 'duchess', name: 'Duchess', body: 0xd9b3ff, pants: 0x4a1f6a, shoes: 0x1a1020, hat: 'crown', hatColor: 0xffc23d, hatAccent: 0xff4f6d, eyes: 'sleepy', voice: 1.1 },
  { id: 'tank', name: 'Tank', body: 0x7d8a95, pants: 0x3d4a2a, shoes: 0x1e1e1e, hat: 'viking', hatColor: 0xb0b8c0, hatAccent: 0xf2e6c8, eyes: 'round', voice: 0.6 },
  { id: 'fizz', name: 'Fizz', body: 0x4fffd8, pants: 0xff4fd8, shoes: 0xffffff, hat: 'propeller', hatColor: 0xff4f5e, hatAccent: 0x3d8bff, eyes: 'wide', voice: 1.45 },
];

export const PALETTE: number[] = [
  0xff8fb1, 0x46c9e8, 0xffd84a, 0xa07bf0, 0x8fdc5a, 0xe86a4a, 0xffffff, 0x2d2f3a,
  0xff4f5e, 0x3d8bff, 0xffb02e, 0x3c8f4e, 0x5a4bd1, 0x9b5de5, 0x4fffd8, 0xffc23d,
];

const pal = (i: number, price?: number, level?: number): Item => ({ id: `color:${PALETTE[i].toString(16)}`, kind: 'color', value: PALETTE[i], name: `Colour ${i + 1}`, price, level });

export const ITEMS: Item[] = [
  // Characters (presets).
  ...CHARACTERS.map((c, i): Item => ({
    id: `character:${c.id}`,
    kind: 'character',
    value: c.id,
    name: c.name,
    ...(i < 4 ? {} : i === 4 ? { level: 3 } : i === 5 ? { level: 6 } : i === 6 ? { price: 300 } : i === 7 ? { level: 10 } : i === 8 ? { price: 600 } : { level: 15 }),
  })),
  // Colours.
  ...PALETTE.map((_, i) => (i < 8 ? pal(i) : i < 12 ? pal(i, 80) : pal(i, undefined, 4 + (i - 12) * 3))),
  // Hats.
  { id: 'hat:none', kind: 'hat', value: 'none', name: 'No hat' },
  { id: 'hat:beanie', kind: 'hat', value: 'beanie', name: 'Beanie' },
  { id: 'hat:tophat', kind: 'hat', value: 'tophat', name: 'Top hat' },
  { id: 'hat:cone', kind: 'hat', value: 'cone', name: 'Traffic cone' },
  { id: 'hat:headphones', kind: 'hat', value: 'headphones', name: 'Headphones' },
  { id: 'hat:cap', kind: 'hat', value: 'cap', name: 'Baseball cap', price: 100 },
  { id: 'hat:party', kind: 'hat', value: 'party', name: 'Party hat', level: 2 },
  { id: 'hat:bucket', kind: 'hat', value: 'bucket', name: 'Bucket hat', price: 150 },
  { id: 'hat:chef', kind: 'hat', value: 'chef', name: 'Chef hat', price: 200 },
  { id: 'hat:flower', kind: 'hat', value: 'flower', name: 'Flower', level: 5 },
  { id: 'hat:propeller', kind: 'hat', value: 'propeller', name: 'Propeller beanie', price: 350 },
  { id: 'hat:viking', kind: 'hat', value: 'viking', name: 'Viking helmet', level: 8 },
  { id: 'hat:crown', kind: 'hat', value: 'crown', name: 'Crown', level: 12 },
  // Outfits.
  { id: 'outfit:plain', kind: 'outfit', value: 'plain', name: 'Plain' },
  { id: 'outfit:overalls', kind: 'outfit', value: 'overalls', name: 'Overalls', price: 120 },
  { id: 'outfit:stripes', kind: 'outfit', value: 'stripes', name: 'Stripy shirt', level: 2 },
  { id: 'outfit:hoodie', kind: 'outfit', value: 'hoodie', name: 'Hoodie', price: 180 },
  { id: 'outfit:tuxedo', kind: 'outfit', value: 'tuxedo', name: 'Tuxedo', level: 7 },
  { id: 'outfit:cape', kind: 'outfit', value: 'cape', name: 'Hero cape', price: 400 },
  { id: 'outfit:luchador', kind: 'outfit', value: 'luchador', name: 'Luchador mask', level: 14 },
  // Accessories.
  { id: 'accessory:none', kind: 'accessory', value: 'none', name: 'None' },
  { id: 'accessory:glasses', kind: 'accessory', value: 'glasses', name: 'Glasses' },
  { id: 'accessory:moustache', kind: 'accessory', value: 'moustache', name: 'Moustache', price: 60 },
  { id: 'accessory:bowtie', kind: 'accessory', value: 'bowtie', name: 'Bow tie', level: 3 },
  { id: 'accessory:shades', kind: 'accessory', value: 'shades', name: 'Shades', price: 150 },
  { id: 'accessory:scarf', kind: 'accessory', value: 'scarf', name: 'Scarf', level: 6 },
  { id: 'accessory:eyepatch', kind: 'accessory', value: 'eyepatch', name: 'Eyepatch', price: 220 },
  { id: 'accessory:monocle', kind: 'accessory', value: 'monocle', name: 'Monocle', level: 11 },
  // Emotes.
  { id: 'emote:wave', kind: 'emote', value: 'wave', name: 'Wave' },
  { id: 'emote:shrug', kind: 'emote', value: 'shrug', name: 'Shrug' },
  { id: 'emote:cheer', kind: 'emote', value: 'cheer', name: 'Cheer', level: 2 },
  { id: 'emote:flex', kind: 'emote', value: 'flex', name: 'Flex', price: 150 },
  { id: 'emote:facepalm', kind: 'emote', value: 'facepalm', name: 'Facepalm', level: 5 },
  { id: 'emote:dance', kind: 'emote', value: 'dance', name: 'Wobble dance', price: 300 },
  // Victory animations.
  { id: 'victory:cheer', kind: 'victory', value: 'cheer', name: 'Arms up' },
  { id: 'victory:bounce', kind: 'victory', value: 'bounce', name: 'Happy bounce', level: 3 },
  { id: 'victory:flex', kind: 'victory', value: 'flex', name: 'Muscles', price: 200 },
  { id: 'victory:spin', kind: 'victory', value: 'spin', name: 'Twirl', level: 9 },
  { id: 'victory:backflip', kind: 'victory', value: 'backflip', name: 'Backflip', price: 500 },
];

export const itemById = (id: string): Item | undefined => ITEMS.find((i) => i.id === id);
export const characterById = (id: string): CharacterDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

export function defaultLoadout(character = 'mallow'): Loadout {
  const c = characterById(character);
  return { character: c.id, body: c.body, pants: c.pants, hat: c.hat, hatColor: c.hatColor, outfit: 'plain', accessory: 'none', emote: 'wave', victory: 'cheer' };
}

/** Loadout for a preset character (bots, local guests). */
export function presetLoadout(index: number): Loadout {
  return defaultLoadout(CHARACTERS[index % CHARACTERS.length].id);
}

const HATS = ITEMS.filter((i) => i.kind === 'hat').map((i) => i.value);
const OUTFITS = ITEMS.filter((i) => i.kind === 'outfit').map((i) => i.value);
const ACCS = ITEMS.filter((i) => i.kind === 'accessory').map((i) => i.value);
const EMOTES = ITEMS.filter((i) => i.kind === 'emote').map((i) => i.value);
const VICTORIES = ITEMS.filter((i) => i.kind === 'victory').map((i) => i.value);

/** Clamp an untrusted loadout to valid catalogue values. */
export function sanitizeLoadout(raw: unknown): Loadout {
  const r = (raw ?? {}) as Partial<Loadout>;
  const d = defaultLoadout(typeof r.character === 'string' ? r.character : 'mallow');
  const color = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : fallback);
  return {
    character: characterById(String(r.character)).id,
    body: color(r.body, d.body),
    pants: color(r.pants, d.pants),
    hat: (HATS.includes(r.hat as string) ? r.hat : d.hat) as HatId,
    hatColor: color(r.hatColor, d.hatColor),
    outfit: (OUTFITS.includes(r.outfit as string) ? r.outfit : 'plain') as OutfitId,
    accessory: (ACCS.includes(r.accessory as string) ? r.accessory : 'none') as AccessoryId,
    emote: (EMOTES.includes(r.emote as string) ? r.emote : 'wave') as EmoteId,
    victory: (VICTORIES.includes(r.victory as string) ? r.victory : 'cheer') as VictoryId,
  };
}

/** Item id that a loadout field corresponds to (for ownership checks). */
export function loadoutItems(l: Loadout): string[] {
  return [
    `character:${l.character}`,
    `color:${l.body.toString(16)}`,
    `color:${l.pants.toString(16)}`,
    `hat:${l.hat}`,
    `outfit:${l.outfit}`,
    `accessory:${l.accessory}`,
    `emote:${l.emote}`,
    `victory:${l.victory}`,
  ];
}
