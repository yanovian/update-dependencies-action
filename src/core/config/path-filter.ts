/** A directory is ignored if it equals, or sits inside, one of the configured prefixes. */
export function isPathIgnored(directory: string, ignorePaths: readonly string[]): boolean {
  const normalized = directory === '.' ? '' : directory;
  return ignorePaths.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}
