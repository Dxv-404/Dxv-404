// The card's portrait. Characters with an animated poster (tools/posters builds the pages under
// /tp/posters/) show it in a frame of their own; everyone else stands, or leaves an empty chair, under the
// theme's spotlight. Plain strings, so it is unit tested.

/** The characters drawn so far: the ones players have picked. */
export const POSTERS: readonly string[] = ['ink-sensei', 'classic-gambler', 'pixel-knight', 'velvet-peacock-plume', 'ink-ink-tiger', 'velvet-high-roller'];
export const hasPoster = (id: string | null | undefined): boolean => !!id && POSTERS.includes(id);
/** The poster's page at a motion level (full: every move; calm: a soft entrance and a highlight; off: still). */
export const posterUrl = (id: string, level: 'full' | 'calm' | 'off'): string => `/tp/posters/${id}.html${level === 'calm' ? '#calm' : level === 'off' ? '#still' : ''}`;

/**
 * The stage for a card without a poster: a spotlight falling on the floor, in the theme's own colours
 * (currentColor is the accent). `chair`: nobody has been chosen yet, so an empty chair waits in the light.
 */
export function stageSvg(chair: boolean): string {
  const seat = chair
    ? '<g class="pf-chair" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M118 196V118q0-14 14-14h36q14 0 14 14v78"/><path d="M118 132h64M118 160h64" stroke-width="3" opacity=".6"/>'
      + '<path d="M106 198h88q8 0 8 8v10H98v-10q0-8 8-8z" fill="currentColor" fill-opacity=".22"/>'
      + '<path d="M108 216l-8 74M192 216l8 74M128 216l-3 58M172 216l3 58"/></g>'
    : '';
  return '<svg class="pf-stage" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
    + '<defs><linearGradient id="pf-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".5"/><stop offset="1" stop-color="currentColor" stop-opacity=".04"/></linearGradient>'
    + '<radialGradient id="pf-pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="currentColor" stop-opacity=".45"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>'
    + '<path class="pf-beam" d="M132 -10h36l96 310H36z" fill="url(#pf-beam)"/>'
    + '<ellipse cx="150" cy="300" rx="118" ry="26" fill="url(#pf-pool)"/>'
    + '<path d="M0 300h300" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/>'
    + '<path d="M120 -4h60l-6 14h-48z" fill="currentColor" fill-opacity=".8"/>'
    + seat + '</svg>';
}
