// Avatar letters (table/render.ts avatar(), used by the table, the winner card, the crews screens, the shell and
// Profile): the letters an avatar shows belong to the name next to it, in each theme's own lettering (design
// gen/classic.py, minimal.py, velvet.py): classic `ini` "RI", noir `mono` "Ri", ivory `emb` and velvet `cam` "R".
// The other five themes draw a face and show no letters at all.

/**
 * In the page: every element matching `rows` holds one avatar (.av) and the name it belongs to, read from the
 * attribute `attr` or, without one, from the text of `nameSel` (" wins …" and " (you)" dropped). Returns what is
 * wrong, and how many avatars were read.
 */
export function avatarLetters(a: { rows: string; attr?: string; nameSel?: string }): { bad: string[]; read: number } {
  const bad: string[] = [];
  let read = 0;
  for (const row of Array.from(document.querySelectorAll<HTMLElement>(a.rows))) {
    const raw = a.attr ? row.getAttribute(a.attr) : row.querySelector(a.nameSel ?? 'b')?.textContent;
    const name = (raw ?? '').replace(/\s+wins\b.*$/, '').replace(/\s*\(you\)$/, '').trim();
    const art = row.querySelector('.av')?.firstElementChild as HTMLElement | null;
    if (!name || !art) { bad.push(`no name or avatar in ${row.className}`); continue; }
    read++;
    const words = name.split(/\s+/);
    const two = (words.length > 1 ? [...words[0]!][0]! + [...words[1]!][0]! : [...words[0]!].slice(0, 2).join('')).toUpperCase();
    const style = art.classList[0] ?? '';
    const want = style === 'ini' ? two : style === 'mono' ? [...two][0]! + [...two].slice(1).join('').toLowerCase() : style === 'emb' || style === 'cam' ? [...two][0]! : '';
    const got = (art.textContent ?? '').trim();
    if (got !== want) bad.push(`${name}: "${got}" (${style}), want "${want}"`);
  }
  return { bad, read };
}
