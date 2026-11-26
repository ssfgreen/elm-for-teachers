import { Link } from 'react-router-dom';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import { usePupilsOn } from '../pupil/usePupilsOn';
import { WHO_LEAD, WHO_PUPIL, WHO_TEACHER, WHO_TITLE } from './content';
import { linkClass } from './styles';
import { PupilIcon, TeacherIcon } from './WhoIcons';

export type WhoMode = 'signup' | 'login';

/** Where each choice goes: a pupil signs up with a class code on /r/join, or logs in on /r/login (#245). */
export const WHO_TARGETS: Record<WhoMode, { teacher: string; pupil: string }> = {
  signup: { teacher: '/start', pupil: '/r/join' },
  login: { teacher: '/signin', pupil: '/r/login' },
};

const choiceClass =
  'flex flex-1 items-center gap-5 rounded-2xl border border-border bg-card p-5 text-left text-xl text-foreground no-underline shadow-soft outline-none transition hover:border-border-strong hover:bg-hover active:scale-99 focus-visible:ring-3 focus-visible:ring-ring sm:flex-col sm:p-8 sm:text-center';

/**
 * `/signup` and `/login` (#224): behind the front page's Sign up and Log in, one question,
 * teacher or pupil, as two large links with a small picture each. Logs nothing of its own.
 * "I am a pupil" shows only where the server has pupil sign-in on, as the old nav link did; with
 * it off (and while that is loading) only the teacher's choice shows, with no question above it.
 */
export function WhoScreen({ mode }: { mode: WhoMode }) {
  const to = WHO_TARGETS[mode];
  const pupilsOn = usePupilsOn();
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
        {pupilsOn && <p className="mt-3 text-lead">{WHO_LEAD}</p>}
        <ul className="m-0 mt-8 flex list-none flex-col gap-4 p-0 sm:flex-row">
          <li className="flex flex-1">
            <Link to={to.teacher} className={choiceClass}>
              <TeacherIcon />
              {WHO_TEACHER}
            </Link>
          </li>
          {pupilsOn && (
            <li className="flex flex-1">
              <Link to={to.pupil} className={choiceClass}>
                <PupilIcon />
                {WHO_PUPIL}
              </Link>
            </li>
          )}
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
