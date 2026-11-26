/** How the Pedagogy screen names the library's types, evidence ratings and facet values. Pure. */
export const TYPE_LABELS: Record<string, string> = {
  principle: 'Principles',
  activity_type: 'Activities',
  signature_pedagogy: 'Subject pedagogies',
  adaptation: 'Adaptations',
  format_rule: 'Format rules',
  exemplar: 'Exemplars',
  curriculum_ref: 'Curriculum',
  caution: 'Cautions',
};

/**
 * What each type is, simply put, shown under the type buttons when one is picked (teachers asked
 * what a "principle" is). Drawn from the library's handoff (library/pedagogy-sample/HANDOFF.md).
 */
export const TYPE_DESCRIPTIONS: Record<string, string> = {
  principle:
    'A principle is a general finding about how people learn, such as spacing practice out over time or not overloading working memory. It says why an approach works, whatever the subject.',
  activity_type:
    'An activity is a reusable move a teacher makes, such as a card sort, a mystery task or a letter to a historical figure. Each one names the principle it relies on, which says when it works. The test: what will pupils have to think hard about?',
  signature_pedagogy:
    'A subject pedagogy is a way of teaching that belongs to one subject, such as source analysis in history, PRIMM in computing or reciprocal reading in English.',
  adaptation:
    'An adaptation is a change to help a pupil past a barrier, such as decoding or working memory. Most keep the learning goal the same (access); a few change the goal (a modification), and only you can choose one of those.',
  format_rule:
    'A format rule is about how a worksheet looks, not what pupils do: bold not italics, left aligned, a readable font, white space, one task per block, plain language.',
  exemplar: 'An exemplar is a worked example of a resource that puts these entries into practice, to show what good looks like.',
  curriculum_ref: 'A curriculum entry is an outcome or benchmark from the curriculum, such as a Curriculum for Excellence experience and outcome, that other entries can align to.',
  caution:
    'A caution is something to avoid or handle with care, such as role play that asks pupils to identify with victims of the Holocaust. The assistant applies cautions when it writes.',
};

/** One of a type, for a badge. */
export const TYPE_SINGULAR: Record<string, string> = {
  principle: 'Principle',
  activity_type: 'Activity',
  signature_pedagogy: 'Subject pedagogy',
  adaptation: 'Adaptation',
  format_rule: 'Format rule',
  exemplar: 'Exemplar',
  curriculum_ref: 'Curriculum',
  caution: 'Caution',
};

export type BadgeTone = 'success' | 'primary' | 'default' | 'warning' | 'destructive';

export const EVIDENCE: Record<string, { label: string; tone: BadgeTone }> = {
  strong: { label: 'Strong evidence', tone: 'success' },
  moderate: { label: 'Moderate evidence', tone: 'primary' },
  emerging: { label: 'Emerging evidence', tone: 'default' },
  practitioner_wisdom: { label: 'Practitioner wisdom', tone: 'default' },
  contested: { label: 'Contested', tone: 'warning' },
  not_recommended: { label: 'Not recommended', tone: 'destructive' },
};

/** A facet value as a teacher reads it: `working_memory` is "working memory", `p7` is "P7". */
export function facetLabel(value: string): string {
  if (/^[ps]\d$/.test(value)) return value.toUpperCase();
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Facet values in use, most used first, then by name. */
export function facetOptions(counts: Record<string, number> | undefined): { value: string; count: number }[] {
  return Object.entries(counts ?? {})
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
