// Original fighter presets (colours + hat). Stage 6 turns this into the full
// cosmetics / unlock system; for now these are the selectable characters.

export type HatKind = 'beanie' | 'tophat' | 'cone' | 'headphones' | 'none';
export type EyeStyle = 'round' | 'sleepy' | 'wide';

export interface FighterLook {
  id: string;
  name: string;
  body: number;
  pants: number;
  shoes: number;
  hat: HatKind;
  hatColor: number;
  hatAccent: number;
  eyes: EyeStyle;
  /** Voice pitch multiplier for grunts. */
  voice: number;
}

export const FIGHTERS: FighterLook[] = [
  { id: 'mallow', name: 'Mallow', body: 0xff8fb1, pants: 0x5a4bd1, shoes: 0x2b2440, hat: 'beanie', hatColor: 0x2fc3a5, hatAccent: 0xffffff, eyes: 'round', voice: 1.25 },
  { id: 'gumbo', name: 'Gumbo', body: 0x46c9e8, pants: 0xffb02e, shoes: 0x33261c, hat: 'tophat', hatColor: 0x2a2a35, hatAccent: 0xe8473f, eyes: 'sleepy', voice: 0.8 },
  { id: 'pudding', name: 'Pudding', body: 0xffd84a, pants: 0x3c8f4e, shoes: 0x3a2a1a, hat: 'cone', hatColor: 0xff6a1a, hatAccent: 0xffffff, eyes: 'wide', voice: 1.05 },
  { id: 'jamjar', name: 'Jamjar', body: 0xa07bf0, pants: 0x2d2f3a, shoes: 0xf2f2f2, hat: 'headphones', hatColor: 0xff4f6d, hatAccent: 0x2d2f3a, eyes: 'round', voice: 0.95 },
  { id: 'pickle', name: 'Pickle', body: 0x8fdc5a, pants: 0x8a4fff, shoes: 0x222222, hat: 'none', hatColor: 0, hatAccent: 0, eyes: 'wide', voice: 1.15 },
  { id: 'brick', name: 'Brick', body: 0xe86a4a, pants: 0x3a5ba8, shoes: 0x1e1e24, hat: 'beanie', hatColor: 0xf2c94c, hatAccent: 0xe86a4a, eyes: 'sleepy', voice: 0.7 },
];
