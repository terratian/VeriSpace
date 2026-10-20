/** "9f3a…c71e": enough of a SHA-256 to recognise, short enough to fit a row. */
export function shortHash(hash: string, edge = 4): string {
  return hash.length <= edge * 2 + 1 ? hash : `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}
