/** UTC calendar date as YYYY-MM-DD, the unit this Action's dated branches and pull requests are
 * keyed on. Takes an optional date so tests don't depend on the real clock. */
export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
