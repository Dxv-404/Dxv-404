// Table drama: the characters and sets, found from their folders (nothing to register by hand, so helpers
// adding characters in parallel never edit the same file). Each loads only when a table needs it.
//   characters/<avatar-id>/index.ts   export default CharacterDef  (the folder name is the avatar id)
//   sets/<theme>/index.ts             export default SetDef        (the folder name is the theme key)
import type { CharacterDef, SetDef } from './types';

type Loader<T> = () => Promise<{ default: T }>;
const CHARS = import.meta.glob<{ default: CharacterDef }>('./characters/*/index.ts');
const SETS = import.meta.glob<{ default: SetDef }>('./sets/*/index.ts');

const idOf = (path: string): string => path.split('/').slice(-2, -1)[0]!;
const index = <T>(g: Record<string, Loader<T>>): Map<string, Loader<T>> => new Map(Object.entries(g).map(([p, f]) => [idOf(p), f]));
const charLoaders = index(CHARS);
const setLoaders = index(SETS);

/** Avatar ids that have a drawn character ('initials' is the silhouette everyone else uses). */
export const characterIds = (): string[] => [...charLoaders.keys()].filter((k) => k !== 'initials').sort();
/** Themes whose room is built (others use the neutral stage). */
export const setIds = (): string[] => [...setLoaders.keys()].filter((k) => k !== 'neutral').sort();
export const hasCharacter = (avatar: string | null | undefined): boolean => !!avatar && charLoaders.has(avatar) && avatar !== 'initials';
export const hasSet = (theme: string): boolean => setLoaders.has(theme) && theme !== 'neutral';

const cache = new Map<string, Promise<unknown>>();
function load<T>(m: Map<string, Loader<T>>, key: string, kind: string): Promise<T> {
  const k = `${kind}:${key}`;
  let p = cache.get(k) as Promise<T> | undefined;
  if (!p) {
    const f = m.get(key);
    if (!f) return Promise.reject(new Error(`no ${kind} ${key}`));
    p = f().then((x) => x.default);
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}
/** The character for an avatar, or the Initials silhouette when that avatar has no character yet. */
export const loadCharacter = (avatar: string | null | undefined): Promise<CharacterDef> =>
  load(charLoaders, hasCharacter(avatar) ? avatar! : 'initials', 'character');
/** The room for a theme, or the neutral stage while that theme's room is not built. */
export const loadSet = (theme: string): Promise<SetDef> => load(setLoaders, hasSet(theme) ? theme : 'neutral', 'set');
