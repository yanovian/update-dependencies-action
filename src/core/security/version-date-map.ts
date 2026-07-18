/** Shared by every registry client whose API returns a flat list of version entries: maps each
 * entry to a `{version, date}` pair via the given extractors, skipping any entry missing either
 * field. Not every registry's response fits this shape (npm's is a version-keyed object, not a
 * list; PyPI's needs the earliest of several files per version), so those keep their own logic. */
export function collectVersionDates<T>(
  entries: readonly T[],
  getVersion: (entry: T) => string | undefined,
  getDate: (entry: T) => string | number | undefined,
): Map<string, Date> {
  const dates = new Map<string, Date>();
  for (const entry of entries) {
    const version = getVersion(entry);
    const date = getDate(entry);
    if (version && date !== undefined) {
      dates.set(version, new Date(date));
    }
  }
  return dates;
}
