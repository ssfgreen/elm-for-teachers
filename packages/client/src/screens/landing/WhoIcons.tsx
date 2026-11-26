/**
 * The two small pictures on the who screen (#224): a teacher at a board and a pupil with a bag
 * and a worksheet. Drawn with the landing colours (theme.css `--landing-*` and the theme's own
 * tokens), so both follow the light and dark themes. Decorative: the choice's text is its name.
 */


const svgProps = {
  viewBox: '0 0 96 96',
  width: 96,
  height: 96,
  'aria-hidden': true,
  focusable: false,
  className: 'size-20 shrink-0 sm:size-24',
} as const;
const line = {
  fill: 'none',
  stroke: 'var(--foreground)',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function TeacherIcon() {
  return (
    <svg {...svgProps} data-testid="teacher-icon">
      <circle cx="48" cy="48" r="46" fill="var(--landing-glow-warm)" />
      {/* The board, with a worksheet's lines and a tick. */}
      <rect {...line} x="44" y="18" width="38" height="28" rx="4" fill="var(--card)" />
      <path {...line} d="M51 27h16M51 34h22" stroke="var(--border-strong)" />
      <path {...line} d="M70 26l3 3 6-6" stroke="var(--suggest)" />
      {/* The teacher, pointing at the board. */}
      <circle {...line} cx="31" cy="34" r="9" fill="var(--landing-face)" />
      <path {...line} d="M23 31c2-7 14-9 17-1" />
      <path {...line} d="M15 80c0-16 7-26 16-26s16 10 16 26" fill="var(--primary)" />
      <path {...line} d="M41 60l9-11" />
    </svg>
  );
}

export function PupilIcon() {
  return (
    <svg {...svgProps} data-testid="pupil-icon">
      <circle cx="48" cy="48" r="46" fill="var(--landing-glow-cool)" />
      {/* The pupil, a little smaller, with a school bag behind. */}
      <rect {...line} x="22" y="50" width="16" height="22" rx="4" fill="var(--landing-glow-warm)" />
      <circle {...line} cx="42" cy="38" r="9" fill="var(--landing-face)" />
      <path {...line} d="M33 37c0-7 6-10 10-10s9 3 9 9" />
      <path {...line} d="M28 80c0-14 6-22 14-22s14 8 14 22" fill="var(--suggest)" />
      {/* The worksheet held out, with a pencil. */}
      <rect {...line} x="54" y="44" width="24" height="30" rx="3" fill="var(--card)" />
      <path {...line} d="M59 52h14M59 58h14M59 64h9" stroke="var(--border-strong)" />
      <path {...line} d="M80 40l-12 14" stroke="var(--primary)" strokeWidth={3.5} />
    </svg>
  );
}
