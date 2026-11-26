/**
 * A reading's frozen copy drawn for the pupil (#213), read-only and without the editor: headings,
 * paragraphs, lists, quotes, code, tables and pictures; anything else as plain text. Each block
 * carries `data-block-id` and `data-len`, and each piece of text `data-at`, so a selection reads
 * back as a highlight's range (selection.ts). The pupil's highlights are drawn as coloured marks
 * that a click or Enter picks.
 */
import { Fragment, type KeyboardEvent, type ReactNode } from 'react';
import { readerBlock, type Highlight, type ReaderBlock, type ReadingBlock, type TextRun } from '@edw/shared';
import { endpoints } from '../api/endpoints';
import { categoryClass, categoryLabel, cutRun, type Piece } from './marks';

interface Props {
  readingId: string;
  blocks: ReadingBlock[];
  highlights: Highlight[];
  onPick: (h: Highlight) => void;
}

/** An SVG as an <img> source: drawn as a picture, so nothing in it runs. */
const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function marked(p: Piece): ReactNode {
  let n: ReactNode = p.text;
  if (p.code) n = <code className="rounded bg-muted px-1 font-mono text-[0.9em]">{n}</code>;
  if (p.underline) n = <u>{n}</u>;
  if (p.italic) n = <em>{n}</em>;
  if (p.bold) n = <strong>{n}</strong>;
  if (p.href)
    n = (
      <a className="text-primary underline" href={p.href} target="_blank" rel="noopener noreferrer">
        {n}
      </a>
    );
  return n;
}

function Text({ run, highlights, onPick }: { run: TextRun; highlights: Highlight[]; onPick: (h: Highlight) => void }) {
  return (
    <>
      {cutRun(run, highlights).map((p) => {
        const h = p.highlight;
        if (!h)
          return (
            <span key={p.at} data-at={p.at}>
              {marked(p)}
            </span>
          );
        const pick = () => onPick(h);
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        };
        return (
          <mark key={p.at} data-at={p.at} data-highlight={h.id} data-category={h.category ?? 'none'} className={`${categoryClass(h.category)} cursor-pointer rounded-sm text-inherit`} title={categoryLabel(h.category)} role="button" tabIndex={0} aria-label={`${categoryLabel(h.category)}: ${p.text}`} onClick={pick} onKeyDown={onKeyDown}>
            {marked(p)}
          </mark>
        );
      })}
    </>
  );
}

const LIST_CLASS = { bullet: 'list-disc', numbered: 'list-decimal', check: 'list-none' } as const;

function Block({ rb, readingId, highlights, onPick }: { rb: ReaderBlock; readingId: string; highlights: Highlight[]; onPick: (h: Highlight) => void }) {
  const mine = highlights.filter((h) => h.block_id === rb.id);
  const text = (run: TextRun) => <Text run={run} highlights={mine} onPick={onPick} />;
  const attrs = { 'data-block-id': rb.id, 'data-len': rb.text.length };
  const v = rb.view;
  switch (v.kind) {
    case 'heading': {
      const H = (['h2', 'h3', 'h4'] as const)[v.level - 1]!;
      const size = ['text-2xl', 'text-xl', 'text-lg'][v.level - 1];
      return (
        <H {...attrs} className={`${size} mt-6 mb-2 font-semibold text-foreground`}>
          {text(v.run)}
        </H>
      );
    }
    case 'quote':
      return (
        <blockquote {...attrs} className="my-3 border-l-4 border-border pl-4 italic">
          {v.lines.map((l, i) => (
            <p key={i}>{text(l)}</p>
          ))}
        </blockquote>
      );
    case 'code':
      return (
        <pre {...attrs} className="my-3 overflow-x-auto rounded bg-muted p-3 text-sm whitespace-pre-wrap">
          {text(v.run)}
        </pre>
      );
    case 'list':
      return (
        <ol {...attrs} start={v.start} className={`my-3 pl-6 ${LIST_CLASS[v.list]}`}>
          {v.items.map((it, i) => (
            <li key={i} className="whitespace-pre-wrap">
              {v.list === 'check' && (it.checked ? '☑ ' : '☐ ')}
              {text(it.run)}
            </li>
          ))}
        </ol>
      );
    case 'item':
      return (
        <li {...attrs} className="whitespace-pre-wrap">
          {v.list === 'check' && (v.checked ? '☑ ' : '☐ ')}
          {text(v.run)}
        </li>
      );
    case 'table':
      return (
        <div className="my-3 overflow-x-auto">
          <table {...attrs} className="border-collapse text-sm">
            <tbody>
              {v.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => {
                    const Cell = i === 0 && v.header ? 'th' : 'td';
                    return (
                      <Cell key={j} className="border border-border px-2 py-1 text-left align-top">
                        {text(cell)}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'picture': {
      const src = v.asset_id ? endpoints.pupilReadingAsset(readingId, v.asset_id) : v.svg ? svgSrc(v.svg) : null;
      return <figure className="my-4">{src ? <img src={src} alt={v.alt} className="max-w-full" /> : <figcaption className="italic">{v.alt || 'A picture'}</figcaption>}</figure>;
    }
    case 'rule':
      return <hr className="my-6 border-border" />;
    case 'none':
      return null;
    default:
      return (
        <p {...attrs} className="my-3 whitespace-pre-wrap">
          {text(v.run)}
        </p>
      );
  }
}

/** Runs of list items drawn as one list each; other blocks one by one. */
export function ReadingBlocks({ readingId, blocks, highlights, onPick }: Props) {
  const read = blocks.map(readerBlock);
  const out: ReactNode[] = [];
  for (let i = 0; i < read.length; i++) {
    const v = read[i]!.view;
    if (v.kind !== 'item') {
      out.push(<Block key={read[i]!.id} rb={read[i]!} readingId={readingId} highlights={highlights} onPick={onPick} />);
      continue;
    }
    const run: ReaderBlock[] = [];
    while (i < read.length && read[i]!.view.kind === 'item' && (read[i]!.view as { list: string }).list === v.list) run.push(read[i++]!);
    i -= 1;
    const List = v.list === 'numbered' ? 'ol' : 'ul';
    out.push(
      <List key={run[0]!.id} start={v.list === 'numbered' ? v.number : undefined} className={`my-3 pl-6 ${LIST_CLASS[v.list]}`}>
        {run.map((rb) => (
          <Block key={rb.id} rb={rb} readingId={readingId} highlights={highlights} onPick={onPick} />
        ))}
      </List>,
    );
  }
  return <Fragment>{out}</Fragment>;
}
