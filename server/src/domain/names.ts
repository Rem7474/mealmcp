/** A name reduced to what identifies it: no case, accents or plural marks ("Tomates" and "tomate" match). */
export function fold(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
    .join(' ');
}

/** Drops trailing slashes without a backtracking regex. */
export function trimSlashes(s: string) {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}
