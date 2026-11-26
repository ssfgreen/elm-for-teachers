import { Link } from 'react-router-dom';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { WHO_TEACHER, WHO_TITLE } from './content';
import { linkClass } from './styles';
import { TeacherIcon } from './WhoIcons';

export type WhoMode = 'signup' | 'login';

/** Teacher-only sign-up and log-in destinations (pupil access lives in ELM for Students). */
export const WHO_TARGETS: Record<WhoMode, { teacher: string }> = {
  signup: { teacher: '/start' },
  login: { teacher: '/signin' },
};

const choiceClass =
  'flex flex-1 items-center gap-5 rounded-2xl border border-border bg-card p-5 text-left text-xl text-foreground no-underline shadow-soft outline-none transition hover:border-border-strong hover:bg-hover active:scale-99 focus-visible:ring-3 focus-visible:ring-ring sm:flex-col sm:p-8 sm:text-center';

export function WhoScreen({ mode }: { mode: WhoMode }) {
  const to = WHO_TARGETS[mode];
  return (
    <div className="min-h-screen bg-landing-page text-foreground-2">
      <header className="mx-auto flex h-18 w-full max-w-300 items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" className="whitespace-nowrap font-display text-lg text-foreground no-underline">
          ELM for teachers
        </Link>
        <ThemeSwitch />
      </header>
      <main className="mx-4 mt-12 mb-20 sm:mx-auto sm:max-w-176 max-md:mt-8">
        <h1 className="mb-0 font-display text-title font-normal text-foreground">{WHO_TITLE[mode]}</h1>
        <ul className="m-0 mt-8 flex list-none flex-col gap-4 p-0 sm:flex-row">
          <li className="flex flex-1">
            <Link to={to.teacher} className={choiceClass}>
              <TeacherIcon />
              {WHO_TEACHER}
            </Link>
          </li>
        </ul>
        <p className="mt-8 text-md">
          <Link className={linkClass} to="/">
            Back to the front page
          </Link>
        </p>
      </main>
    </div>
  );
}
