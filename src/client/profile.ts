import type { Profile } from '../meta/progression';
import { newProfile, sanitizeProfile } from '../meta/progression';

// Player progression storage. Today it lives in this browser (localStorage);
// the ProfileStore interface is where a cloud-save backend would plug in.

export interface ProfileStore {
  load(): Profile;
  save(p: Profile): void;
}

const KEY = 'wobbleweights.profile.v1';

export class LocalProfileStore implements ProfileStore {
  load(): Profile {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? sanitizeProfile(JSON.parse(raw)) : newProfile();
    } catch {
      return newProfile();
    }
  }

  save(p: Profile): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      // Storage unavailable (private mode): progress lasts for this session only.
    }
  }
}

/** The current player's profile plus change notifications. */
export class ProfileService {
  profile: Profile;
  private listeners = new Set<() => void>();

  constructor(private readonly store: ProfileStore = new LocalProfileStore()) {
    this.profile = store.load();
  }

  save(): void {
    this.store.save(this.profile);
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.profile = newProfile();
    this.save();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
