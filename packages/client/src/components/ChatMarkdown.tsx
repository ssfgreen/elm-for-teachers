/**
 * Assistant replies rendered as Markdown (headings, lists, emphasis, code, tables).
 * react-markdown builds React elements and never injects raw HTML, so model output
 * cannot add markup; images are dropped and links open in a new tab. Citations of the pedagogy
 * library's claims become "i" markers (components/pedagogy/ClaimInfo.tsx). Where the screen
 * provides them (components/mentions/), a class's pupils show their row on hover and curriculum
 * codes show the outcome from the app's own curriculum; a link the model put on a code (to a PDF
 * elsewhere) gives way to that.
 */
import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { ClaimInfo } from './pedagogy/ClaimInfo';
import { useMentions } from './mentions/context';
import { CurriculumMention } from './mentions/CurriculumMention';
import { codesInLinkText, parseMentionHref, remarkMentions } from './mentions/mentions';
import { PupilMention } from './mentions/PupilMention';

const CLAIM_LINK = '#claim:';

/** A link's text, when it is only text. */
function plain(children: unknown): string | null {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.every((c) => typeof c === 'string')) return children.join('');
  return null;
}

function components(withMentions: boolean): Components {
  return {
    a: ({ href, children }) => {
      if (href?.startsWith(CLAIM_LINK)) return <ClaimInfo id={href.slice(CLAIM_LINK.length)} />;
      const mention = withMentions ? parseMentionHref(href) : null;
      if (mention?.kind === 'pupil') return <PupilMention label={mention.value} text={plain(children) ?? mention.value} />;
      if (mention?.kind === 'curriculum') return <CurriculumMention code={mention.value} text={plain(children) ?? undefined} />;
      const codes = withMentions ? codesInLinkText(plain(children) ?? '') : null;
      if (codes) return <>{codes.map((c, i) => [i > 0 && ' / ', <CurriculumMention key={c} code={c} />])}</>;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  };
}
const PLAIN = components(false);
const WITH_MENTIONS = components(true);

/** A pedagogy library citation, `[[clm-…]]`, as a link the renderer turns into an "i" marker. */
export const withClaimLinks = (text: string) => text.replace(/ ?\[\[(clm-[A-Za-z0-9-]+)\]\]/g, (_, id: string) => `[i](${CLAIM_LINK}${id})`);

export function ChatMarkdown({ text }: { text: string }) {
  const mentions = useMentions();
  const labels = mentions?.labels;
  const plugins = useMemo(() => (labels ? [remarkGfm, [remarkMentions, { labels }] as const] : [remarkGfm]), [labels]);
  return (
    // `chat-md` is a hook: the Markdown's own elements are styled in components/chat.css.
    <div className={cn('chat-md', 'leading-normal text-foreground')}>
      <Markdown remarkPlugins={plugins as never} components={mentions ? WITH_MENTIONS : PLAIN} disallowedElements={['img']} unwrapDisallowed skipHtml>
        {withClaimLinks(text)}
      </Markdown>
    </div>
  );
}
