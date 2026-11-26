/**
 * School years and moving up a year (docs/classes.md). A Scottish school year starts in August,
 * so from 1 August the current year is the next one. Pure, so client and server agree.
 */

/** "2026-27" for any date from 1 Aug 2026 to 31 Jul 2027 (local time). */
export function schoolYearOf(date: Date): string {
  const y = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** "2027-28" after "2026-27". */
export function nextSchoolYear(year: string): string {
  const y = Number(year.slice(0, 4)) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/**
 * The year group a class moves up to: P1 to P7 then S1, S1 to S6, and "Year 7" or "Y7" counts on.
 * Null when there is no next one (S6) or the name is not one of these (the teacher chooses).
 */
export function nextYearGroupName(name: string): string | null {
  const t = name.trim();
  const p = /^P([1-7])$/i.exec(t);
  if (p) return Number(p[1]) === 7 ? "S1" : `P${Number(p[1]) + 1}`;
  const s = /^S([1-6])$/i.exec(t);
  if (s) return Number(s[1]) === 6 ? null : `S${Number(s[1]) + 1}`;
  const y = /^(Year |Y)(\d{1,2})$/i.exec(t);
  if (y) return `${y[1]}${Number(y[2]) + 1}`;
  return null;
}

/** "P6A" in P6 becomes "P7A" in P7; a name that does not start with its year group stays as it is. */
export function nextClassName(name: string, fromYearGroup: string, toYearGroup: string): string {
  return name.toLowerCase().startsWith(fromYearGroup.toLowerCase()) ? toYearGroup + name.slice(fromYearGroup.length) : name;
}
