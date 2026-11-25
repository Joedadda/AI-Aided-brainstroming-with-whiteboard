import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardKind, Profile, StickyColor } from '../../shared/types.ts';

// The temporary profile (Build PRD 4). The token is the identity: clearing browser data
// removes it, and the next visit makes a new one.
/**
 * One browser is one person: every tab shares the profile, so a name change shows in all of them.
 * To try the board with two people on one computer, "Open this board as another person" (profile
 * menu) opens a new tab with `?profile=<slot>`. That tab keeps its own profile (the slot is kept in
 * sessionStorage, so it survives reloads in that tab). Since 25 Nov this works in every build, not
 * only in development (user report: two tabs were the same person).
 */
const slot = new URLSearchParams(location.search).get('profile');
if (slot) sessionStorage.setItem('profile-slot', slot);
const activeSlot = slot ?? sessionStorage.getItem('profile-slot');
const PROFILE_SLOT = activeSlot ? `-${activeSlot}` : '';

/** Open the current page in a new tab as a new person, with a profile of its own. */
export function openAsAnotherPerson() {
  const id = Math.random().toString(36).slice(2, 7);
  window.open(`${location.pathname}?profile=${id}`, '_blank', 'noopener');
}

interface ProfileState {
  profile: Profile | null;
  /** The note colour this person picked in the profile menu. Null: the one assigned to them. */
  noteColor: StickyColor | null;
  setNoteColor: (c: StickyColor | null) => void;
  /** Boards this browser has opened, newest first, for the start screen. */
  recent: { id: string; title: string; at: number; kind?: BoardKind }[];
  /** Report ids this person has opened, for the "New" label. */
  read: string[];
  setProfile: (p: Profile | null) => void;
  patch: (p: Partial<Pick<Profile, 'name' | 'color'>>) => void;
  remember: (id: string, title: string, kind?: BoardKind) => void;
  forget: (id: string) => void;
  markRead: (reportId: string) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      noteColor: null,
      setNoteColor: (noteColor) => set({ noteColor }),
      recent: [],
      read: [],
      setProfile: (profile) => set({ profile }),
      patch: (p) => set((s) => (s.profile ? { profile: { ...s.profile, ...p } } : s)),
      remember: (id, title, kind) =>
        set((s) => ({ recent: [{ id, title, at: Date.now(), kind }, ...s.recent.filter((r) => r.id !== id)].slice(0, 8) })),
      forget: (id) => set((s) => ({ recent: s.recent.filter((r) => r.id !== id) })),
      markRead: (reportId) => set((s) => (s.read.includes(reportId) ? s : { read: [...s.read, reportId] })),
    }),
    { name: `sem-profile-v1${PROFILE_SLOT}` },
  ),
);

export const getProfile = () => useProfile.getState().profile;

/*
  Note colour per person (user request, 25 Nov): each person gets one of the four note colours by
  default, picked from their profile id, so the same person always gets the same colour and two
  people usually differ. They can choose another in the profile menu; that choice wins.
*/
export const NOTE_COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green'];

export function assignedNoteColor(userId: string): StickyColor {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return NOTE_COLORS[Math.abs(h) % NOTE_COLORS.length];
}

/** The colour a new note from this person gets. */
export function noteColorOf(s: Pick<ProfileState, 'profile' | 'noteColor'>): StickyColor {
  return s.noteColor ?? (s.profile ? assignedNoteColor(s.profile.userId) : 'yellow');
}
export const myNoteColor = () => noteColorOf(useProfile.getState());

export const USER_COLORS = ['#2f5bd3', '#b4442c', '#1e7a4c', '#7b45b8', '#a65a12', '#0f7380', '#b03a78', '#4a5a14'];

const ADJ = ['Curious', 'Quiet', 'Bright', 'Steady', 'Swift', 'Gentle', 'Bold', 'Clever', 'Calm', 'Keen'];
const ANIMAL = ['Otter', 'Heron', 'Fox', 'Lynx', 'Owl', 'Panda', 'Wren', 'Badger', 'Seal', 'Robin'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const friendlyName = () => `${pick(ADJ)} ${pick(ANIMAL)}`;
