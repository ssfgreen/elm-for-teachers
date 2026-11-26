/**
 * Projects (P.2), laid out as Claude's and ChatGPT's projects are: a New project form with two
 * questions and "Add context", and a project page with its chats in the main column and the
 * Instructions and Context cards beside them. Skills (P.3) get a card here later.
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Download, FileText, Plus, Trash2, X } from 'lucide-react';
import { PROJECT_DESCRIPTION_MAX, PROJECT_INSTRUCTIONS_MAX, PROJECT_NAME_MAX, type Project, type ReferenceFile, type ReferenceLimits, type Thread } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';
import { EditableTitle } from '../components/EditableTitle';
import { autoGrow } from '../components/autoGrow';
import { fileError, fileKind, formatBytes } from '../components/files';
import { REFERENCE_ACCEPT } from '../import/reference';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { FileTile, fileTilesClass } from '../components/ui/file-tile';
import { cn } from '../lib/utils';
import { SavedText } from '../components/SavedText';
import { ProjectMenu } from './ProjectMenu';

/** A hidden file picker for the types we can read, opened by a button. */
function useFilePicker(onFiles: (files: File[]) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      hidden
      multiple
      accept={REFERENCE_ACCEPT}
      aria-label="Files to add"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) onFiles(files);
      }}
    />
  );
  return { open: () => ref.current?.click(), input };
}

/** The scrolling pane each project screen fills. */
const screenClass = 'min-w-0 flex-1 overflow-y-auto bg-background';
/** A grey note under a heading. */
const hintClass = 'm-0 text-sm text-foreground-2';
/** A line saying there is nothing yet (no chats, no files). */
const emptyClass = (compact = false) => cn('m-0 text-md text-muted-foreground', compact && 'text-xs');

/**
 * The Instructions and Context cards. `compact` is the smaller card in the sidebar, inside a
 * project (WorkspaceScreen): a tighter frame, no shadow, smaller text and no hints.
 */
export const projectCardClass = (compact = false) =>
  cn('flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4 shadow-card', compact && 'rounded-md p-2.75 shadow-none');
export const projectCardTitleClass = 'm-0 text-base font-semibold';
/** The Instructions box. */
export const instructionsClass = (compact = false) =>
  cn('w-full resize-none rounded-md border border-border-strong bg-card px-2.5 py-2.25 text-md', compact && 'text-sm');
/** Cancel and the main action, on the right. */
const actionsClass = 'flex items-center justify-end gap-4';
/** Link buttons take their parent's text size, not a button's 0.9rem. */
const linkClass = '';
/** A file's type, pages and size. */
const metaClass = 'text-xs text-muted-foreground';

/* ------------------------------------------------------------------ new project */

export interface NewProjectFormProps {
  /** Makes the project and adds the files; throws with nothing made if the project can't be. */
  onCreate: (fields: { name: string; description: string | null }, files: File[]) => Promise<void>;
  onCancel: () => void;
}

export function NewProjectForm({ onCreate, onCancel }: NewProjectFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<{ key: number; file: File }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const picker = useFilePicker((list) => setFiles((fs) => [...fs, ...list.map((file) => ({ key: (nextKey.current += 1), file }))]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: n, description: description.trim() || null }, files.map((f) => f.file));
    } catch {
      setError('The project could not be made. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className={screenClass}>
      <form className="mx-auto flex max-w-160 flex-col gap-5.5 px-6 py-12" onSubmit={(e) => void submit(e)} aria-label="New project">
        <h1 className={headingClass}>New project</h1>
        <label className={fieldClass}>
          <span className="font-medium">What are you working on?</span>
          <Input ref={nameRef} className={projectInputClass} placeholder="Name your project" value={name} maxLength={PROJECT_NAME_MAX} disabled={busy} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={fieldClass}>
          <span className="font-medium">What are you trying to achieve?</span>
          <Textarea
            className={projectInputClass}
            rows={4}
            placeholder="Describe your project, goals, subject, etc..."
            value={description}
            maxLength={PROJECT_DESCRIPTION_MAX}
            disabled={busy}
            onChange={(e) => {
              setDescription(e.target.value);
              autoGrow(e.target, 320);
            }}
          />
        </label>
        <div className={fieldClass}>
          <Button className="gap-1.5 self-start" disabled={busy} onClick={picker.open}>
            <Plus size={15} aria-hidden="true" /> Add context
          </Button>
          {picker.input}
          <p className={hintClass}>PDF, Word, PowerPoint or text files the assistant can read in this project’s chats.</p>
          {files.length > 0 && (
            <ul className={cn(fileTilesClass, 'pt-3 pr-2 pb-1')} aria-label="Files to add">
              {files.map(({ key, file }) => (
                <FileTile
                  key={key}
                  name={file.name}
                  title={file.name}
                  badge={fileKind(file.name)}
                  removeDisabled={busy}
                  onRemove={() => setFiles((fs) => fs.filter((f) => f.key !== key))}
                />
              ))}
            </ul>
          )}
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className={actionsClass}>
          <Button variant="link" className={linkClass} disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? (files.length ? 'Adding files…' : 'Creating…') : 'Create project'}
          </Button>
        </div>
      </form>
    </div>
  );
}

const headingClass = 'm-0 text-3xl leading-tight font-semibold';
const fieldClass = 'flex flex-col gap-1.75';
/** The New project form's fields: roomier than the shared field look. */
const projectInputClass = 'w-full resize-none rounded-md px-3.25 py-2.5 text-base';

/* ------------------------------------------------------------------ project page */

export interface ProjectPageProps {
  project: Project;
  /** The project's chats (any order). */
  chats: Thread[];
  api: Pick<SessionApi, 'listReferences' | 'addReference' | 'deleteReference' | 'getReferencePages' | 'referenceOriginalUrl'>;
  getEnvelope: () => Envelope;
  onRename: (name: string) => void;
  /** Saves the description or instructions; throws if it wasn't saved. */
  onUpdate: (fields: { description?: string | null; instructions?: string | null }) => Promise<void>;
  onArchive: () => Promise<void>;
  /** Deletes the project and its chats, once the teacher has typed DELETE; with none given, not offered. */
  onDelete?: () => Promise<void>;
  onOpenChat: (threadId: string) => void;
  /** "Start a chat in this project": the same chat box as in a chat (files, model). */
  composer: ReactNode;
  /** Files that could not be added when the project was made. */
  notices?: string[];
  /** A file's preview was opened (for the log). */
  onPreviewFile?: (referenceId: string) => void;
}

export function ProjectPage({ project, chats, api, getEnvelope, onRename, onUpdate, onArchive, onDelete, onOpenChat, composer, notices = [], onPreviewFile }: ProjectPageProps) {
  const newest = [...chats].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return (
    <div className={screenClass}>
      <div className="mx-auto flex max-w-270 items-start gap-8 px-6 py-10 max-lg:flex-col max-lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex items-start justify-between gap-4">
            <EditableTitle
              itemKey={project.id}
              value={project.name}
              onRename={onRename}
              as="h1"
              className={headingClass}
              inputClassName="w-full rounded-sm border border-border-strong focus-visible:border-primary px-1.25 py-0.5 text-3xl font-semibold"
              inputLabel="Project name"
              maxLength={PROJECT_NAME_MAX}
            />
            <ProjectMenu onArchive={onArchive} onDelete={onDelete} />
          </header>
          <SavedText
            key={`d-${project.id}`}
            label="What are you trying to achieve?"
            className="-ml-1.5 w-full resize-none rounded-sm border border-transparent bg-transparent px-1.5 py-1.25 text-foreground-2 hover:border-border focus:border-border-strong focus:bg-card"
            placeholder="Describe your project, goals, subject, etc..."
            value={project.description}
            maxLength={PROJECT_DESCRIPTION_MAX}
            onSave={(description) => onUpdate({ description })}
          />
          {notices.map((n) => (
            <p key={n} className="error-text" role="alert">
              {n}
            </p>
          ))}
          {composer}
          <section className="project-chats" aria-label="Chats in this project">
            <h2 className="mx-0 mt-4 mb-0 text-base font-semibold">Chats</h2>
            {newest.length === 0 ? (
              <p className={emptyClass()}>No chats yet. Start one above; it will use this project’s instructions and context.</p>
            ) : (
              <ul className="m-0 list-none border-t border-border p-0">
                {newest.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="flex w-full items-baseline justify-between gap-4 rounded-none border-0 border-b border-border bg-transparent px-1.5 py-3 text-left hover:enabled:bg-hover"
                      onClick={() => onOpenChat(t.id)}
                    >
                      <span className="min-w-0 truncate">{t.title}</span>
                      <span className="flex-none text-sm text-muted-foreground">{shortDate(t.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="flex w-80 flex-none flex-col gap-4 max-lg:w-full" aria-label="Project settings">
          <section className={projectCardClass()} aria-label="Instructions">
            <h2 className={projectCardTitleClass}>Instructions</h2>
            <p className={hintClass}>How the assistant should work in this project’s chats: your class, the tone, what to avoid.</p>
            <SavedText
              key={`i-${project.id}`}
              label="Instructions"
              className={instructionsClass()}
              placeholder="For example: My Year 8 class has mixed reading ages. Keep worksheets to one side of A4."
              value={project.instructions}
              maxLength={PROJECT_INSTRUCTIONS_MAX}
              onSave={(instructions) => onUpdate({ instructions })}
              boxed
            />
          </section>
          <ContextCard key={project.id} projectId={project.id} api={api} getEnvelope={getEnvelope} onPreview={onPreviewFile} />
        </aside>
      </div>
    </div>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** A file being read and sent, or one that was refused. */
interface Adding {
  key: number;
  name: string;
  error?: string;
}

/** The project's files: add, list (type, pages, size), remove, and how much of the limits is used. */
export function ContextCard({
  projectId,
  api,
  getEnvelope,
  onPreview,
  compact = false,
}: {
  projectId: string;
  api: ProjectPageProps['api'];
  getEnvelope: () => Envelope;
  onPreview?: (referenceId: string) => void;
  /** The smaller card in the sidebar (see projectCardClass). */
  compact?: boolean;
}) {
  const [preview, setPreview] = useState<ReferenceFile | null>(null);
  const [refs, setRefs] = useState<ReferenceFile[] | null>(null);
  const [limits, setLimits] = useState<ReferenceLimits | null>(null);
  const [adding, setAdding] = useState<Adding[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const nextKey = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api
      .listReferences?.(projectId)
      .then((r) => {
        if (cancelled) return;
        setRefs(r.references.filter((f) => !f.deleted_at));
        setLimits(r.limits);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, projectId]);

  const add = (files: File[]) => {
    if (!api.addReference) return;
    for (const file of files) {
      const key = (nextKey.current += 1);
      setAdding((a) => [...a, { key, name: file.name }]);
      api.addReference(projectId, file, getEnvelope()).then(
        (ref) => {
          setAdding((a) => a.filter((x) => x.key !== key));
          setRefs((rs) => [...(rs ?? []), ref]);
        },
        (err: unknown) => setAdding((a) => a.map((x) => (x.key === key ? { ...x, error: fileError(err, file.name) } : x))),
      );
    }
  };
  const picker = useFilePicker(add);

  const remove = async (f: ReferenceFile) => {
    setConfirm(null);
    setRefs((rs) => (rs ?? []).filter((x) => x.id !== f.id));
    try {
      await api.deleteReference?.(f.id, getEnvelope());
    } catch {
      setRefs((rs) => [...(rs ?? []), f]);
    }
  };

  const files = refs ?? [];
  const tokens = files.reduce((n, f) => n + f.est_tokens, 0);
  return (
    <section className={projectCardClass(compact)} aria-label="Context">
      <div className="flex items-center justify-between">
        <h2 className={projectCardTitleClass}>Context</h2>
        <Button variant="toolbar" size="icon" aria-label="Add context" title="Add a PDF, Word, PowerPoint or text file" disabled={!api.addReference} onClick={picker.open}>
          <Plus size={16} aria-hidden="true" />
        </Button>
        {picker.input}
      </div>
      {!compact && <p className={hintClass}>Files the assistant can read in this project’s chats.</p>}
      {loadFailed && <p className="error-text">The files could not be loaded. Please reload the page.</p>}
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Project files">
        {files.map((f) => (
          <li key={f.id} className={fileClass}>
            <FileText size={16} aria-hidden="true" className="flex-none text-foreground-2" />
            <div className="flex min-w-0 flex-1 flex-col">
              {api.getReferencePages ? (
                <button
                  type="button"
                  className={cn(nameClass, 'block max-w-full cursor-pointer border-0 bg-transparent p-0 text-left text-foreground hover:enabled:underline hover:enabled:underline-offset-2')}
                  title={`Open ${f.name}`}
                  onClick={() => {
                    setPreview(f);
                    onPreview?.(f.id);
                  }}
                >
                  {f.name}
                </button>
              ) : (
                <span className={nameClass} title={f.name}>
                  {f.name}
                </span>
              )}
              <span className={metaClass}>
                {fileKind(f.name)} · {f.pages} {f.pages === 1 ? 'page' : 'pages'} · {formatBytes(f.bytes)}
                {f.status === 'pending' ? ' · uploading' : ''}
              </span>
            </div>
            {confirm === f.id ? (
              <span className="flex flex-none gap-2.5 text-sm">
                <Button variant="link-danger" className={linkClass} onClick={() => void remove(f)}>
                  Remove
                </Button>
                <Button variant="link" className={linkClass} onClick={() => setConfirm(null)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button
                variant="toolbar"
                size="icon"
                className="flex-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100"
                aria-label={`Remove ${f.name}`}
                onClick={() => setConfirm(f.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
        {adding.map((a) => (
          <li key={`a${a.key}`} className={cn(fileClass, a.error && 'bg-destructive-soft hover:bg-destructive-soft')}>
            <FileText size={16} aria-hidden="true" className="flex-none text-foreground-2" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={nameClass}>{a.name}</span>
              {a.error ? (
                <span className={cn(metaClass, 'error-text')} role="alert">
                  {a.error}
                </span>
              ) : (
                <span className={cn(metaClass, 'italic')}>Reading…</span>
              )}
            </div>
            {a.error && (
              <Button variant="toolbar" size="icon" className="flex-none" aria-label={`Dismiss ${a.name}`} onClick={() => setAdding((x) => x.filter((y) => y.key !== a.key))}>
                <X size={14} aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {refs && refs.length === 0 && adding.length === 0 && <p className={emptyClass(compact)}>No files yet. A curriculum, a scheme of work or slides you use are good to add.</p>}
      {preview && <FilePreview file={preview} api={api} onClose={() => setPreview(null)} />}
      {limits && files.length > 0 && (
        <p className="m-0 text-xs text-muted-foreground">
          {files.length} of {limits.files_per_project} files · {Math.max(1, Math.round((tokens / limits.project_tokens) * 100))}% of the space for text
        </p>
      )}
    </section>
  );
}

/** A row in the file list; `group` shows its remove button on hover. */
const fileClass = 'group flex items-center gap-2.25 rounded-sm px-1.5 py-1.75 hover:bg-hover';
const nameClass = 'truncate text-md';

/** "Slide 3" for slides, else "Page 3" (a PDF's own pages, or about 4,000 characters of other files). */
const pageLabel = (f: ReferenceFile, n: number) => `${f.mime.includes('presentation') ? 'Slide' : 'Page'} ${n}`;

/**
 * A file's text, page by page, as the model reads it, with Download for the original when it
 * was kept (a PDF opens in a new tab; Word and PowerPoint download). Escape or the cross closes it.
 */
function FilePreview({ file, api, onClose }: { file: ReferenceFile; api: ProjectPageProps['api']; onClose: () => void }) {
  const [data, setData] = useState<{ pages: { page: number; text: string }[]; original: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let cancelled = false;
    closeRef.current?.focus();
    api
      .getReferencePages?.(file.id)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api, file.id]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const href = data?.original ? api.referenceOriginalUrl?.(file.id) : undefined;
  return (
    <div className="fixed inset-0 z-100 grid place-items-center bg-overlay p-4 sm:py-16" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-full w-full max-w-190 flex-col overflow-hidden rounded-lg bg-card shadow-float" role="dialog" aria-modal="true" aria-label={file.name}>
        <header className="flex items-center gap-3 pt-3.5 pr-3.5 pb-1.5 pl-5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="m-0 truncate text-lg font-semibold">{file.name}</h2>
            <span className={metaClass}>
              {fileKind(file.name)} · {file.pages} {file.pages === 1 ? 'page' : 'pages'} · {formatBytes(file.bytes)}
            </span>
          </div>
          {href && (
            <a className="inline-flex flex-none items-center gap-1.5 rounded-sm border border-border-strong px-3 py-1.5 text-md text-foreground no-underline hover:bg-panel hover:text-foreground" href={href} target="_blank" rel="noreferrer">
              <Download size={14} aria-hidden="true" /> Download
            </a>
          )}
          <Button ref={closeRef} variant="toolbar" size="icon" aria-label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </Button>
        </header>
        <p className="m-0 border-b border-border px-5 pb-2.5 text-sm text-muted-foreground">{data && !data.original ? 'The text the assistant reads. The original file was not kept here.' : 'The text the assistant reads.'}</p>
        <div className="overflow-y-auto px-5 pt-2 pb-6">
          {failed && <p className="error-text">The file could not be opened. Please try again.</p>}
          {!data && !failed && <p className={emptyClass()}>Loading…</p>}
          {data?.pages.map((p) => (
            <section key={p.page} aria-label={pageLabel(file, p.page)}>
              <h3 className="mx-0 mt-4 mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{pageLabel(file, p.page)}</h3>
              <div className="text-base leading-normal whitespace-pre-wrap wrap-anywhere">{p.text}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
