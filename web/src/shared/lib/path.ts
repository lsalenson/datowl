// Paths come from the OS: Windows ones use backslashes and a drive letter.

const SEPARATOR = /[\\/]+/;

export const isAbsolutePath = (path: string) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path);

export const pathSegments = (path: string) => path.split(SEPARATOR).filter(Boolean);

export const baseName = (path: string) => pathSegments(path).at(-1) ?? path;

/** Segments of `path` below `root`, or null when it lies elsewhere. */
export function relativeSegments(path: string, root: string): string[] | null {
  const base = pathSegments(root);
  const segments = pathSegments(path);
  const inside = segments.length > base.length && base.every((s, i) => s === segments[i]);
  return inside ? segments.slice(base.length) : null;
}
