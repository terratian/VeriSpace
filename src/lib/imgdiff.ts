/**
 * Coarse photo comparison for rescans. Each photo is reduced to a small grid of brightness values,
 * each grid is rescaled to remove overall exposure differences, and cells that still differ a lot are
 * flagged. It points a person at places worth a look: it can't tell damage from moved furniture or a
 * changed light.
 */

export const GRID = 16;

/** Brightness grid (GRID x GRID, row by row) from a raw one-channel image of that size. */
export function normalizeGrid(values: ArrayLike<number>): number[] {
  const n = values.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (values[i] - mean) ** 2;
  const sd = Math.sqrt(varSum / n) || 1;
  return Array.from({ length: n }, (_, i) => (values[i] - mean) / sd);
}

export interface GridComparison {
  /** Cells (x, y) that differ clearly, in grid units. */
  cells: { x: number; y: number }[];
  /** Share of the picture that differs, 0 to 1. */
  share: number;
  /** True when enough of the picture differs to be worth a person looking. */
  changed: boolean;
}

export function compareGrids(a: ArrayLike<number>, b: ArrayLike<number>, opts: { cellThreshold?: number; minShare?: number } = {}): GridComparison {
  const { cellThreshold = 1.1, minShare = 0.03 } = opts;
  if (a.length !== b.length || a.length === 0) throw new Error("grids must be the same size");
  const na = normalizeGrid(a);
  const nb = normalizeGrid(b);
  const side = Math.round(Math.sqrt(a.length));
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < na.length; i++) if (Math.abs(na[i] - nb[i]) > cellThreshold) cells.push({ x: i % side, y: Math.floor(i / side) });
  const share = cells.length / na.length;
  return { cells, share, changed: share >= minShare };
}
