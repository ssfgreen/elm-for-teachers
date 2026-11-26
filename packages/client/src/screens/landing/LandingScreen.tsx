import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { ThemeSwitch } from '../../components/ui/theme-switch';
import type { SignedInAccount } from '../../api/auth';
import { HERO_FACTS, HERO_LEAD, LOG_IN, SIGN_UP } from './content';
import { inkButtonClass, MainAction } from './MainAction';
import { ForSchools, HowItWorks, Questions, Title, WhatItDoes, wrapClass } from './sections';
import { useAccount } from './useAccount';
import { WorksheetSketch } from './WorksheetSketch';

export const STRAPLINE = 'An agentic harness designed specifically for teachers, with teachers.';

const NAV = [
  { href: '#what', label: 'What it does' },
  { href: '#schools', label: 'For schools' },
  { href: '#questions', label: 'Questions' },
];

/** A CSS variable for the entrance in landing.css: `--i` (a title word) or `--delay`. */
const cssVar = (name: string, value: string | number) => ({ [name]: value }) as CSSProperties;

/** The title, one word at a time for the entrance; "for teachers" in italic serif. */
const TITLE: { word: string; accent: boolean }[] = [
  { word: 'ELM', accent: false },
  { word: 'for', accent: true },
  { word: 'teachers', accent: true },
];

/**
 * `/`: what the tool is and how it treats pupils' data, with one action at the top and again at
 * the foot: "Sign up" (on to /signup, teacher or pupil), or the workspace when signed in. The nav
 * has Log in top right (on to /login, teacher or pupil; #224).
 */
export function LandingScreen() {
  const account = useAccount();
  return (
    <div className="min-h-screen bg-landing-page text-foreground-2">
      <header className="fixed inset-x-0 top-0 z-40 bg-landing-page/75 backdrop-blur-md">
        <div className={`${wrapClass} flex h-18 items-center justify-between gap-3`}>
          <span className="whitespace-nowrap font-display text-lg text-foreground">ELM for teachers</span>
          <nav aria-label="On this page" className="flex items-center gap-1 max-lg:hidden">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-md px-3 py-2 text-md text-foreground-2 underline decoration-transparent underline-offset-4 transition-colors hover:text-foreground hover:decoration-current">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeSwitch />
            <NavAccount account={account} />
          </div>
        </div>
      </header>
      <main>
        <section aria-labelledby="hero-title" className="pt-36 max-md:pt-28">
          <div className={`${wrapClass} flex flex-col items-center text-center`}>
            <p className="landing-rise rounded-full border border-border bg-card px-3.5 py-1 text-sm text-foreground-2" style={cssVar('--delay', '0s')}>
              A worksheet editor with an AI assistant
            </p>
            <h1 id="hero-title" className="landing-title mt-6 mb-0 font-display text-display font-normal text-foreground">
              {TITLE.map(({ word, accent }, i) => (
                <span key={word}>
                  {i > 0 && ' '}
                  <span className="landing-word" style={cssVar('--i', i)}>
                    <span>{accent ? <em>{word}</em> : word}</span>
                  </span>
                </span>
              ))}
            </h1>
            <p className="landing-rise mt-6 max-w-160 text-xl text-foreground" style={cssVar('--delay', '0.4s')}>
              {STRAPLINE}
            </p>
            <p className="landing-rise mt-3 max-w-150 text-lead" style={cssVar('--delay', '0.45s')}>
              {HERO_LEAD}
            </p>
            <ul className="landing-rise m-0 mt-6 flex list-none flex-wrap justify-center gap-x-6 gap-y-2 p-0 text-md max-md:text-sm" style={cssVar('--delay', '0.5s')}>
              {HERO_FACTS.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="landing-rise mt-9 max-md:w-full" style={cssVar('--delay', '0.6s')}>
              <MainAction account={account} />
            </div>
          </div>
          <div className="landing-rise mx-auto mt-16 w-full max-w-336 px-3 sm:px-4" style={cssVar('--delay', '0.75s')}>
            <div className="landing-stage rounded-3xl px-3 py-8 sm:px-10 sm:py-14 lg:px-20 lg:py-20">
              <div className="mx-auto max-w-240">
                <WorksheetSketch />
              </div>
            </div>
          </div>
        </section>
        <WhatItDoes />
        <HowItWorks />
        <ForSchools />
        <Questions />
        <Closing account={account} />
      </main>
      <footer className={`${wrapClass} mt-8 border-t border-border py-6 text-sm text-foreground-2`}>
        ELM for teachers, {new Date().getFullYear()}
      </footer>
    </div>
  );
}

/**
 * Top right of the nav: Log in (on to /login, where a teacher or a pupil chooses), or the
 * workspace when signed in. Nothing while the account loads, as MainAction.
 */
function NavAccount({ account }: { account: SignedInAccount | null | undefined }) {
  if (account === undefined) return null;
  return (
    <Link
      to={account ? '/w' : '/login'}
      className="inline-flex h-9 items-center rounded-md border border-border-strong bg-card px-3.5 text-md whitespace-nowrap text-foreground no-underline outline-none transition-colors hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring"
    >
      {account ? 'Your workspace' : LOG_IN}
    </Link>
  );
}

/** The last call: Sign up again, or straight to the workspace when signed in. */
function Closing({ account }: { account: SignedInAccount | null | undefined }) {
  // Nothing while the account loads, as MainAction, so it does not flip from Sign up.
  if (account === undefined) return null;
  return (
    <section aria-labelledby="closing-title" className="py-8">
      <div className="mx-auto w-full max-w-336 px-3 sm:px-4">
        <div className="landing-stage flex flex-col items-center rounded-3xl px-6 py-20 text-center sm:py-28">
          {account ? (
            <Title id="closing-title" title="Your workspace is" accent="where you left it" />
          ) : (
            <Title id="closing-title" title="Start with the code" accent="from the research team" />
          )}
          <p className="mt-5 max-w-150 text-lead text-foreground-2">
            {account ? 'Your chats, documents and classes are all there.' : 'Sign up with an invite code, open a workspace with an access code, or Log in.'}
          </p>
          <div className="mt-9 max-md:w-full">
            <Link to={account ? '/w' : '/signup'} className={inkButtonClass}>
              {account ? 'Go to your workspace' : SIGN_UP}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
