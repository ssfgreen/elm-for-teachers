/**
 * The pupil table as the research record keeps it (option B, docs/classes.md): how many rows,
 * a count of each need and a hash of the contents, never the rows themselves. The library
 * adaptations chosen for pupils reveal needs too, so they count as part of the table: they are in
 * the hash, never in the record (a table with none hashes as it did before they existed).
 */
import { createHash } from 'node:crypto';
import { needsCounts, type Pupil, type PupilAdaptation, type PupilTableShape } from '@edw/shared';

/** `pupils`: the class's live rows, in order; `adaptations`: theirs that are not removed. */
export function tableShape(pupils: readonly Pupil[], adaptations: readonly PupilAdaptation[] = []): PupilTableShape {
  const canonical = JSON.stringify(
    pupils.map((p) => {
      const row: unknown[] = [p.label, p.needs, p.helps, p.working_at, p.note];
      const mine = adaptations.filter((a) => a.pupil_id === p.id);
      if (mine.length) row.push(mine.map((a) => [a.entry_id, a.status, a.overrides]));
      return row;
    }),
  );
  return { rows: pupils.length, needs_counts: needsCounts(pupils), hash: createHash('sha256').update(canonical).digest('hex') };
}

/** What a log keeps in place of the table's text. */
export function tablePlaceholder(classId: string, shape: PupilTableShape): string {
  return `[pupil table: class ${classId}, ${shape.rows} row${shape.rows === 1 ? '' : 's'}, sha256 ${shape.hash.slice(0, 16)}]`;
}
