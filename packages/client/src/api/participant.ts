import type { ChatUsage, Comment, CommentAnchor, Doc, EditMode, PluginDraft, PluginInfo, PluginTrust, Preferences, PreferencesUpdate, Project, ReferenceFile, ReferenceLimits, SuggestView, Thread, UsageRange, UsageReport } from '@edw/shared';
import { convertReference } from '../import/reference.js';
import type { CanvasChanges, CanvasSnapshot, StructuralCommand, StructuralResponse } from '../editor/types.js';
import { classesApi, type ClassesApi, type ThreadPlace } from './classes';
import { classCodeApi, type ClassCodeApi } from './classCode';
import { viewAsPupilApi, type ViewAsPupilApi } from './viewAsPupil';
import { classMembersApi, type ClassMembersApi } from './classMembers';
import { pupilLoginsApi, type PupilLoginsApi } from './pupilLogins';
import { pedagogyApi, type PedagogyApi } from './pedagogy';
import { readingsApi, type ReadingsApi } from './readings';
import { endpoints } from './endpoints';
import { api, apiLines } from './http';
import type { SpyglassResult } from '@edw/shared';
import type { AgentState, ChatReply, ChatTurn, Envelope, SessionInfo, TurnControl } from './types';

export async function resolveSessionId(token: string): Promise<string> {
  const r = await api<{ session_id: string }>('GET', endpoints.participant(), undefined, { token });
  return r.session_id;
}

export function fetchSession(token: string, sessionId: string): Promise<SessionInfo> {
  return api<SessionInfo>('GET', endpoints.session(sessionId), undefined, { token });
}

export type { PluginDraft } from '@edw/shared';

/** Calls the workspace makes; an interface so tests can supply a mock. Classes are optional (the make kit has none). */
export interface SessionApi extends Partial<ClassesApi>, Partial<PedagogyApi>, Partial<ReadingsApi>, Partial<ClassCodeApi>, Partial<ClassMembersApi>, Partial<PupilLoginsApi>, Partial<ViewAsPupilApi> {
  readonly sessionId: string;
  getCanvas(): Promise<CanvasSnapshot>;
  structural(cmd: StructuralCommand, envelope: Envelope): Promise<StructuralResponse>;
  /** Puts another of the pictures a turn offered (ARASAAC's id) in its image block, which accepts it. */
  choosePicture?(turnId: string, blockId: string, picture: number, envelope: Envelope): Promise<{ changes: CanvasChanges; asset_id: string }>;
  listThreads(): Promise<Thread[]>;
  /** A new chat, which starts with one blank doc; with a project id (or a project, class or year group), in it. */
  createThread(envelope: Envelope, place?: string | ThreadPlace | null): Promise<{ thread: Thread; doc: Doc }>;
  /** Projects (archived ones too, marked). Optional until the projects UI (P.2) uses them. */
  listProjects?(): Promise<Project[]>;
  /** `description`: "What are you trying to achieve?" */
  createProject?(fields: { name: string; description?: string | null }, envelope: Envelope): Promise<Project>;
  /** Changes the description and/or instructions (empty text clears one). */
  updateProject?(projectId: string, fields: { description?: string | null; instructions?: string | null }, envelope: Envelope): Promise<Project>;
  renameProject?(projectId: string, name: string, envelope: Envelope): Promise<Project>;
  archiveProject?(projectId: string, envelope: Envelope): Promise<Project>;
  /** Deletes the project and its chats (hidden from the teacher; the teacher typed DELETE). */
  deleteProject?(projectId: string, envelope: Envelope): Promise<{ project: Project; thread_ids: string[] }>;
  /** The plugins the teacher can choose from, with the workspace's trust levels; with a chat, Ask first in it too. */
  listPlugins?(threadId?: string | null): Promise<PluginInfo[]>;
  setPluginTrust?(pluginId: string, trust: PluginTrust, envelope: Envelope): Promise<PluginInfo>;
  /** The teacher's preferences: a note about themselves for the assistant, and the font new docs start in. */
  getPreferences?(): Promise<Preferences>;
  /** Sets the fields given; blank text clears the note. */
  setPreferences?(update: PreferencesUpdate, envelope: Envelope): Promise<Preferences>;
  /** The workspace's spend by UK day for a range, and in all against its budget (Preferences, Usage). */
  getUsage?(range: UsageRange): Promise<UsageReport>;
  /** The workspace's spend and budget (config plus top-ups), for "£N left" in the chat. */
  getBudget?(): Promise<{ spent_gbp: number; budget_gbp: number }>;
  /** Allows an Ask first plugin in one chat. */
  allowPlugin?(pluginId: string, threadId: string, envelope: Envelope): Promise<PluginInfo>;
  /** The workspace's plugin studio drafts (never their addresses). Off (404 `drafts_off`) without PLUGIN_STUDIO_URL. */
  listPluginDrafts?(): Promise<PluginDraft[]>;
  /** Adds a draft by its studio address; the server reads its name. */
  addPluginDraft?(address: string, envelope: Envelope): Promise<PluginDraft>;
  removePluginDraft?(draftId: string, envelope: Envelope): Promise<void>;
  /** A project's reference files and the limits they are held to. */
  listReferences?(projectId: string): Promise<{ references: ReferenceFile[]; limits: ReferenceLimits }>;
  /** Converts the file in the browser, sends its text, and (with a bucket) the original. Throws with a message for the teacher. */
  addReference?(projectId: string, file: File, envelope: Envelope): Promise<ReferenceFile>;
  /** The same for a file added to a chat with "+" (context for the model in that chat). */
  addChatFile?(threadId: string, file: File, envelope: Envelope): Promise<ReferenceFile>;
  deleteReference?(referenceId: string, envelope: Envelope): Promise<void>;
  /** A file's text a page at a time, as the model reads it; `original` says if it can be downloaded. */
  getReferencePages?(referenceId: string): Promise<{ reference: ReferenceFile; pages: { page: number; text: string }[]; original: boolean }>;
  /** A link to the original file (opens a PDF in the browser; other types download). */
  referenceOriginalUrl?(referenceId: string): string;
  /** Name a chat (a new chat is "Untitled" until the teacher names it). */
  renameThread(threadId: string, title: string, envelope: Envelope): Promise<Thread>;
  /**
   * The wand next to the chat's title: the model names the chat from what is in it. With `auto`
   * (after a turn), only an Untitled chat with three prompts is named; otherwise it comes back as it is.
   */
  nameThread?(threadId: string, envelope: Envelope, opts?: { auto?: boolean }): Promise<Thread>;
  /** A doc's comments (not deleted), oldest first. */
  listComments(docId: string): Promise<Comment[]>;
  /** A new thread (`block_id`, optionally `quote`) or a reply (`root_id`), by the teacher. */
  createComment(c: NewComment, envelope: Envelope): Promise<Comment>;
  /** Deletes a comment; a thread's first comment takes the thread with it. */
  deleteComment(id: string, envelope: Envelope): Promise<void>;
  /** Changes one of the teacher's comments (the assistant's can't be edited). */
  editComment(id: string, body: string, envelope: Envelope): Promise<Comment>;
  /** Resolves (or reopens) a thread, by its first comment. */
  resolveComment(id: string, resolved: boolean, envelope: Envelope): Promise<Comment>;
  /**
   * Asks the assistant to answer a teacher's @model comment, in its thread (the doc's chat
   * thread runs the turn). The reply's `comment` is the assistant's reply in the thread.
   */
  answerComment(threadId: string, comment: Comment, envelope: Pick<Envelope, 'client_ts' | 'focus_pane'>, onState?: (state: AgentState) => void): Promise<ChatReply>;
  getChat(threadId: string): Promise<ChatTurn[]>;
  /** The chat's tokens so far, in and out, and their cost in pounds where the models are priced. */
  getChatUsage?(threadId: string): Promise<ChatUsage>;
  /** The model (and effort) every following turn runs on, from the picker under the chat box. */
  setTurnModel?(choice: { model: string; effort: 'low' | 'medium' | 'high' } | null): void;
  /**
   * Whether the assistant's changes in every following turn are suggestions (the default) or go
   * straight in, and how suggestions look (sent with a Suggesting turn, for the research log).
   */
  setEditMode?(mode: EditMode, view?: SuggestView): void;
  /** Whether Spyglass is on for every following turn (the toggle under the chat box). */
  setSpyglass?(on: boolean): void;
  /** One turn in a thread, about the open doc; `anchor` marks an @model comment on a passage. */
  sendChat(
    threadId: string,
    docId: string,
    text: string,
    envelope: Pick<Envelope, 'client_ts' | 'focus_pane'>,
    anchor?: CommentAnchor,
    attachments?: string[],
    copyChoice?: TurnControl['copy_choice'],
  ): Promise<ChatReply>;
  /** The same turn, streamed: `onText` gets each piece of the model's raw reply as it arrives. */
  sendChatStream?(
    threadId: string,
    docId: string,
    text: string,
    envelope: Pick<Envelope, 'client_ts' | 'focus_pane'>,
    anchor: CommentAnchor | undefined,
    onText: (delta: string) => void,
    /** Agent mode: the reply so far, whole, each time it changes. */
    onState?: (state: AgentState) => void,
    control?: TurnControl,
  ): Promise<ChatReply>;
  /** The teacher pressed Stop on a streamed turn; `shownText` is the reply as far as they saw it. */
  stopChat?(threadId: string, turnId: string, shownText: string, envelope: Envelope): Promise<void>;
  /** Stores an image with the session; the block refers to it as `asset:<asset_id>`. */
  uploadAsset(file: File, envelope: Envelope): Promise<{ asset_id: string }>;
  /** Turns `asset:<id>` into a URL the browser can load; other sources pass through. */
  assetUrl(src: string): string;
}

export interface NewComment {
  doc_id: string;
  block_id?: string;
  root_id?: string;
  body: string;
  quote?: string | null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}

export interface SessionApiOptions {
  /** How images are stored (from the session info): straight into a bucket, or through the server. */
  uploads?: 'bucket' | 'inline';
  fetchImpl?: typeof fetch;
}

export function createSessionApi(token: string, sessionId: string, options: SessionApiOptions = {}): SessionApi {
  const opts = { token, fetchImpl: options.fetchImpl };
  /** Added to every turn's body: the picked model and effort. */
  let turnModel: { model: string; effort: 'low' | 'medium' | 'high' } | null = null;
  /** Sent only when it is Editing, so Suggesting turns send what they always did. */
  let editMode: EditMode = 'suggest';
  let suggestView: SuggestView | null = null;
  /** The Spyglass toggle, sent with every turn once the screen has set it. */
  let spyglass: boolean | null = null;
  const withModel = (body: Record<string, unknown>) => ({ ...body, ...(turnModel ?? {}), ...(editMode === 'edit' ? { edit_mode: editMode } : suggestView ? { suggest_view: suggestView } : {}), ...(spyglass !== null ? { spyglass } : {}) });
  /** One turn on the stream route: the reply's text or state as it comes, then its result. */
  // The turn ends at its result; the stream is read on for Spyglass's flags (control.onSpyglass).
  const streamTurn = (threadId: string, body: Record<string, unknown>, onText: (delta: string) => void, onState?: (state: AgentState) => void, control: TurnControl = {}): Promise<ChatReply> =>
    new Promise<ChatReply>((resolve, reject) => {
      let done = false;
      apiLines(
        endpoints.chatStream(sessionId, threadId),
        withModel(body),
        (line) => {
          const l = line as { type: 'start'; turn_id: string } | { type: 'text'; text: string } | ({ type: 'state' } & AgentState) | { type: 'result'; result: ChatReply } | { type: 'spyglass'; turn_id: string; spyglass: SpyglassResult } | { type: 'error'; message: string };
          if (l.type === 'start') control.onStart?.(l.turn_id);
          else if (l.type === 'text') onText(l.text);
          else if (l.type === 'state') onState?.({ text: l.text, operations: l.operations, status: l.status, steps: l.steps ?? [] });
          else if (l.type === 'result') {
            done = true;
            resolve(l.result);
          } else if (l.type === 'spyglass') control.onSpyglass?.(l.turn_id, l.spyglass);
          else if (l.type === 'error' && !done) throw new Error(l.message);
        },
        { ...opts, signal: control.signal },
      ).then(
        () => {
          if (!done) reject(new Error('the chat stream ended without a result'));
        },
        // After the result, a broken stream only loses the flags.
        (err: unknown) => {
          if (!done) reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  /** Converts the file in the browser, posts its text, then (with a bucket) puts the original there. */
  const addFile = async (path: string, file: File, envelope: Envelope): Promise<ReferenceFile> => {
    // A Word file's pictures are stored as "Upload .docx" stores them, so a doc opened from it has them.
    const { mime, pages, blocks } = await convertReference(file, { uploadImage: (img) => self.uploadAsset(img, envelope) });
    const { reference, upload } = await api<{ reference: ReferenceFile; upload: { method: string; url: string; headers: Record<string, string> } | null }>(
      'POST',
      path,
      { name: file.name, mime, bytes: file.size, pages, ...(blocks ? { blocks } : {}), envelope },
      opts,
    );
    if (!upload) return reference;
    // The original goes straight to the bucket; the server then checks it arrived.
    const f = options.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    const put = await f(upload.url, { method: upload.method, headers: upload.headers, body: file });
    if (!put.ok) throw new Error(`the file could not be stored (${put.status})`);
    return api<{ reference: ReferenceFile }>('POST', endpoints.referenceComplete(sessionId, reference.id), { envelope }, opts).then((r) => r.reference);
  };
  const self: SessionApi = {
    sessionId,
    getCanvas: () => api<CanvasSnapshot>('GET', endpoints.canvas(sessionId), undefined, opts),
    structural: (cmd, envelope) => {
      const { command, ...fields } = cmd;
      return api<StructuralResponse>('POST', endpoints.blocks(sessionId, command), { ...fields, envelope }, opts);
    },
    choosePicture: (turn_id, block_id, picture, envelope) =>
      api<{ changes: CanvasChanges; asset_id: string }>('POST', endpoints.choosePicture(sessionId), { turn_id, block_id, picture, envelope }, opts),
    listThreads: () => api<{ threads: Thread[] }>('GET', endpoints.threads(sessionId), undefined, opts).then((r) => r.threads),
    createThread: (envelope, place) =>
      api<{ thread: Thread; doc: Doc }>('POST', endpoints.threads(sessionId), { envelope, ...(typeof place === 'string' ? { project_id: place } : (place ?? {})) }, opts),
    ...classesApi(sessionId, opts),
    ...pedagogyApi(sessionId, opts),
    ...readingsApi(sessionId, opts),
    ...classCodeApi(sessionId, opts),
    ...classMembersApi(sessionId, opts),
    ...pupilLoginsApi(sessionId, opts),
    ...viewAsPupilApi(sessionId, opts),
    listProjects: () => api<{ projects: Project[] }>('GET', endpoints.projects(sessionId), undefined, opts).then((r) => r.projects),
    createProject: (fields, envelope) => api<{ project: Project }>('POST', endpoints.projects(sessionId), { ...fields, envelope }, opts).then((r) => r.project),
    updateProject: (projectId, fields, envelope) => api<{ project: Project }>('POST', endpoints.project(sessionId, projectId, 'update'), { ...fields, envelope }, opts).then((r) => r.project),
    renameProject: (projectId, name, envelope) => api<{ project: Project }>('POST', endpoints.project(sessionId, projectId, 'rename'), { name, envelope }, opts).then((r) => r.project),
    archiveProject: (projectId, envelope) => api<{ project: Project }>('POST', endpoints.project(sessionId, projectId, 'archive'), { envelope }, opts).then((r) => r.project),
    deleteProject: (projectId, envelope) => api<{ project: Project; thread_ids: string[] }>('POST', endpoints.project(sessionId, projectId, 'delete'), { confirm: 'DELETE', envelope }, opts),
    listPlugins: (threadId) => api<{ plugins: PluginInfo[] }>('GET', endpoints.plugins(sessionId, threadId), undefined, opts).then((r) => r.plugins),
    setPluginTrust: (pluginId, trust, envelope) => api<{ plugin: PluginInfo }>('POST', endpoints.plugin(sessionId, pluginId, 'trust'), { trust, envelope }, opts).then((r) => r.plugin),
    getPreferences: () => api<{ preferences: Preferences }>('GET', endpoints.preferences(sessionId), undefined, opts).then((r) => r.preferences),
    setPreferences: (update, envelope) => api<{ preferences: Preferences }>('POST', endpoints.preferences(sessionId), { ...update, envelope }, opts).then((r) => r.preferences),
    getUsage: (range) => api<UsageReport>('GET', endpoints.usage(sessionId, range), undefined, opts),
    getBudget: () => api<{ spent_gbp: number; budget_gbp: number }>('GET', endpoints.budget(sessionId), undefined, opts),
    allowPlugin: (pluginId, threadId, envelope) => api<{ plugin: PluginInfo }>('POST', endpoints.plugin(sessionId, pluginId, 'allow'), { thread_id: threadId, envelope }, opts).then((r) => r.plugin),
    listPluginDrafts: () => api<{ drafts: PluginDraft[] }>('GET', endpoints.pluginDrafts(sessionId), undefined, opts).then((r) => r.drafts),
    addPluginDraft: (address, envelope) => api<{ draft: PluginDraft }>('POST', endpoints.pluginDrafts(sessionId), { address, envelope }, opts).then((r) => r.draft),
    removePluginDraft: (draftId, envelope) => api<void>('DELETE', endpoints.pluginDrafts(sessionId, draftId), { envelope }, opts),
    listReferences: (projectId) => api<{ references: ReferenceFile[]; limits: ReferenceLimits }>('GET', endpoints.projectReferences(sessionId, projectId), undefined, opts),
    addReference: (projectId, file, envelope) => addFile(endpoints.projectReferences(sessionId, projectId), file, envelope),
    addChatFile: (threadId, file, envelope) => addFile(endpoints.threadReferences(sessionId, threadId), file, envelope),
    deleteReference: (referenceId, envelope) => api<void>('DELETE', endpoints.reference(sessionId, referenceId), { envelope }, opts),
    getReferencePages: (referenceId) => api<{ reference: ReferenceFile; pages: { page: number; text: string }[]; original: boolean }>('GET', endpoints.referencePages(sessionId, referenceId), undefined, opts),
    referenceOriginalUrl: (referenceId) => endpoints.referenceOriginal(sessionId, referenceId, token),
    renameThread: (threadId, title, envelope) =>
      api<{ thread: Thread }>('POST', endpoints.renameThread(sessionId, threadId), { title, envelope }, opts).then((r) => r.thread),
    nameThread: (threadId, envelope, o) =>
      api<{ thread: Thread }>('POST', endpoints.nameThread(sessionId, threadId), { envelope, ...(o?.auto ? { auto: true } : {}) }, opts).then((r) => r.thread),
    listComments: (docId) => api<{ comments: Comment[] }>('GET', endpoints.docComments(sessionId, docId), undefined, opts).then((r) => r.comments ?? []),
    createComment: (c, envelope) => api<{ comment: Comment }>('POST', endpoints.comments(sessionId), { ...c, envelope }, opts).then((r) => r.comment),
    deleteComment: (id, envelope) => api<void>('DELETE', endpoints.comment(sessionId, id), { envelope }, opts),
    editComment: (id, body, envelope) => api<{ comment: Comment }>('POST', endpoints.commentEdit(sessionId, id), { body, envelope }, opts).then((r) => r.comment),
    resolveComment: (id, resolved, envelope) => api<{ comment: Comment }>('POST', endpoints.commentResolve(sessionId, id), { resolved, envelope }, opts).then((r) => r.comment),
    getChat: (threadId) => api<{ turns: ChatTurn[] }>('GET', endpoints.chat(sessionId, threadId), undefined, opts).then((r) => r.turns ?? []),
    getChatUsage: (threadId) => api<ChatUsage>('GET', endpoints.chatUsage(sessionId, threadId), undefined, opts),
    setTurnModel: (choice) => {
      turnModel = choice;
    },
    setEditMode: (mode, view) => {
      editMode = mode;
      suggestView = view ?? null;
    },
    setSpyglass: (on) => {
      spyglass = on;
    },
    sendChat: (threadId, doc_id, text, envelope, anchor, attachments, copy_choice) =>
      api<ChatReply>('POST', endpoints.chat(sessionId, threadId), withModel({ text, doc_id, envelope, ...(anchor ? { anchor } : {}), ...(attachments?.length ? { attachments } : {}), ...(copy_choice ? { copy_choice } : {}) }), opts),
    sendChatStream: (threadId, doc_id, text, envelope, anchor, onText, onState, control) =>
      streamTurn(
        threadId,
        { text, doc_id, envelope, ...(anchor ? { anchor } : {}), ...(control?.attachments?.length ? { attachments: control.attachments } : {}), ...(control?.copy_choice ? { copy_choice: control.copy_choice } : {}) },
        onText,
        onState,
        control,
      ),
    stopChat: (threadId, turn_id, shown_text, envelope) => api<void>('POST', endpoints.chatStop(sessionId, threadId), { turn_id, shown_text, envelope }, opts),
    answerComment: (threadId, comment, envelope, onState) =>
      streamTurn(threadId, { text: comment.body, doc_id: comment.doc_id, envelope, comment_id: comment.id }, () => undefined, onState),
    uploadAsset: async (file, envelope) => {
      // An SVG is small, and the server cleans it, so it always comes to the server.
      if (options.uploads === 'bucket' && file.type !== 'image/svg+xml') {
        // The file goes straight to the bucket (a signed URL), so no request to the server carries it.
        const { asset_id, upload } = await api<{ asset_id: string; upload: { method: string; url: string; headers: Record<string, string> } }>(
          'POST',
          endpoints.assetUpload(sessionId),
          { filename: file.name || null, mime: file.type, bytes: file.size, envelope },
          opts,
        );
        const f = options.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
        const put = await f(upload.url, { method: upload.method, headers: upload.headers, body: file });
        if (!put.ok) throw new Error(`the image could not be stored (${put.status})`);
        return api<{ asset_id: string }>('POST', endpoints.assetComplete(sessionId, asset_id), { envelope }, opts);
      }
      const data_base64 = await fileToBase64(file);
      return api<{ asset_id: string }>('POST', endpoints.assets(sessionId), { filename: file.name || null, mime: file.type, data_base64, envelope }, opts);
    },
    assetUrl: (src) => (src.startsWith('asset:') ? endpoints.assetUrl(sessionId, src.slice('asset:'.length), token) : src),
  };
  return self;
}
