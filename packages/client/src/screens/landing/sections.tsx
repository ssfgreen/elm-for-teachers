import type { ReactNode } from 'react';
import { BookOpenCheck, FileText, GraduationCap, KeyRound, ListChecks, Server, ShieldCheck, Telescope, UserRoundX, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FEATURES, FOR_SCHOOLS, QUESTIONS, STEPS, type Feature } from './content';

const ICONS: Record<string, typeof FileText> = {
  worksheets: FileText,
  adapt: Users,
  classes: GraduationCap,
  pedagogy: BookOpenCheck,
  spyglass: Telescope,
  curriculum: ListChecks,
  elm: Server,
  pupils: UserRoundX,
  workspace: KeyRound,
  research: ShieldCheck,
};

/** The page's width and side gutter, shared by every section. */
export const wrapClass = 'mx-auto w-full max-w-300 px-4 sm:px-8';

/** A title with its second half in italic serif: "A worksheet editor *with an assistant beside it*". */
export function Title({ id, title, accent, onInk = false }: { id: string; title: string; accent: string; onInk?: boolean }) {
  return (
    <h2 id={id} className={cn('landing-title mb-0 font-display text-title font-normal text-foreground', onInk && 'text-landing-ink-foreground')}>
      {title} <em>{accent}</em>
    </h2>
  );
}

/** A titled, centred section of the front page, with an anchor for the header's links. */
export function Section({ id, title, accent, intro, children, className }: { id: string; title: string; accent: string; intro?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-20 py-28 max-md:py-16', className)}>
      <div className={wrapClass}>
        <div className="mx-auto max-w-184 text-center">
          <Title id={`${id}-title`} title={title} accent={accent} />
          {intro && <p className="mx-auto mt-5 max-w-150 text-lead text-foreground-2">{intro}</p>}
        </div>
        <div className="mt-14 max-md:mt-10">{children}</div>
      </div>
    </section>
  );
}

function FeatureItem({ feature }: { feature: Feature }) {
  const Icon = ICONS[feature.id] ?? FileText;
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-card p-7 shadow-soft">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-landing-page shadow-dot">
        <Icon aria-hidden="true" className="size-5 text-foreground" />
      </span>
      <h3 className="m-0 font-display text-xl font-normal text-foreground">{feature.title}</h3>
      <p className="text-md text-foreground-2">{feature.body}</p>
    </li>
  );
}

export function WhatItDoes() {
  return (
    <Section id="what" title="A worksheet editor" accent="with an assistant beside it" intro="The chat and the document sit side by side. The assistant works in the document; you decide what stays.">
      <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <FeatureItem key={f.id} feature={f} />
        ))}
      </ul>
    </Section>
  );
}

/** How far down each step sits on a wide screen, so the dots make a gentle wave. */
const STEP_OFFSETS = ['lg:mt-0', 'lg:mt-16', 'lg:mt-8', 'lg:mt-22'];

export function HowItWorks() {
  return (
    <Section id="how" title="A turn, from request" accent="to decision">
      <div className="relative">
        {/* A dotted line through the step dots, on wide screens only. Decoration. */}
        <svg aria-hidden="true" viewBox="0 0 1000 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-0 h-40 w-full max-lg:hidden">
          <path
            d="M -40 34 C 90 10, 170 104, 283 90 S 440 50, 542 58 S 690 124, 801 114 S 960 60, 1040 46"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="0 11"
            vectorEffect="non-scaling-stroke"
            opacity="0.5"
          />
        </svg>
        <ol className="relative m-0 grid list-none gap-10 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className={cn('flex flex-col items-start gap-3', STEP_OFFSETS[i])}>
              {/* The number, so a reader can follow the order; a screen reader hears "Step 1:" in the title. */}
              <span aria-hidden="true" className="mb-1 flex size-13 items-center justify-center rounded-full bg-card font-display text-xl text-foreground shadow-dot">
                {i + 1}
              </span>
              <h3 className="m-0 font-display text-2xl font-normal text-foreground">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h3>
              <p className="text-md text-foreground-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/** Pupils' data and the study, on a dark band so it stands apart from the features. */
export function ForSchools() {
  return (
    <section id="schools" aria-labelledby="schools-title" className="scroll-mt-20 py-8">
      <div className="mx-auto w-full max-w-336 px-3 sm:px-4">
        <div className="grid gap-12 rounded-3xl bg-landing-ink px-6 py-16 text-landing-ink-foreground sm:px-12 lg:grid-cols-12 lg:px-16 lg:py-24">
          <div className="lg:col-span-5">
            <Title id="schools-title" title="Pupils' data and" accent="the research study" onInk />
            <p className="mt-5 text-lead text-landing-ink-muted">This tool is part of a research study with teachers. Here is what that means for you and your pupils.</p>
          </div>
          <ul className="m-0 grid list-none gap-x-10 gap-y-9 p-0 sm:grid-cols-2 lg:col-span-7">
            {FOR_SCHOOLS.map((f) => {
              const Icon = ICONS[f.id] ?? ShieldCheck;
              return (
                <li key={f.id} className="flex flex-col gap-3 border-t border-landing-ink-line pt-5">
                  <Icon aria-hidden="true" className="size-5 text-landing-ink-foreground" />
                  <h3 className="m-0 font-display text-xl font-normal text-landing-ink-foreground">{f.title}</h3>
                  <p className="text-md text-landing-ink-muted">{f.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Questions() {
  return (
    <Section id="questions" title="Questions" accent="teachers ask">
      <div className={cn('landing-faq', 'mx-auto flex max-w-200 flex-col gap-3')}>
        {QUESTIONS.map(({ q, a }) => (
          <details key={q} className="group rounded-2xl bg-card shadow-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 font-display text-lg text-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring">
              {q}
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-landing-page text-lg text-foreground-2 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="px-6 pb-6 text-md text-foreground-2">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
