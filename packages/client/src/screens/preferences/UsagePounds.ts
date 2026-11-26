/** Amounts on the Usage section. */

/** Whole pounds plain (the budget, a day of no use); pence to two places from 10p, three below it, so small days do not read as £0.00. */
export function poundsAndPence(gbp: number): string {
  if (Number.isInteger(gbp)) return `£${gbp}`;
  return `£${gbp < 0.1 ? gbp.toFixed(3) : gbp.toFixed(2)}`;
}
