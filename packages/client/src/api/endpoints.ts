/** Every server path the client uses, in one place. Paths are relative to `/api` (the `api()` wrapper in ./http.ts adds the prefix). */
const e = encodeURIComponent;

export const endpoints = {
  /* participant, Authorization: Bearer <participant token> */
  /** Resolves the participant token to `{ session_id }` and records the open. */
  participant: () => `/participant`,
  session: (sessionId: string) => `/sessions/${e(sessionId)}`,
  threads: (sessionId: string) => `/sessions/${e(sessionId)}/threads`,
  renameThread: (sessionId: string, threadId: string) => `/sessions/${e(sessionId)}/threads/${e(threadId)}/rename`,
  /** POST: the wand, the model names the chat (409 chat_empty with no messages yet); `auto` after a turn. */
  nameThread: (sessionId: string, threadId: string) => `/sessions/${e(sessionId)}/threads/${e(threadId)}/name`,
  canvas: (sessionId: string) => `/sessions/${e(sessionId)}/canvas`,
  blocks: (sessionId: string, command: string) => `/sessions/${e(sessionId)}/blocks/${e(command)}`,
  choosePicture: (sessionId: string) => `/sessions/${e(sessionId)}/pictures/choose`,
  chat: (sessionId: string, threadId: string) => `/sessions/${e(sessionId)}/threads/${e(threadId)}/chat`,
  /** The same turn as `chat`, answered as NDJSON while the model writes. */
  chatStream: (sessionId: string, threadId: string) => `/sessions/${e(sessionId)}/threads/${e(threadId)}/chat/stream`,
  /** GET: the chat's tokens so far and their cost (the counter under the chat box). */
  chatUsage: (sessionId: string, threadId: string) => `/sessions/${e(sessionId)}/threads/${e(threadId)}/chat/usage`,
  /** The teacher's Stop for a streamed turn. */
  chatStop: (sessionId: string, threadId: string) => `/sessions/${e(sessionId)}/threads/${e(threadId)}/chat/stop`,
  assets: (sessionId: string) => `/sessions/${e(sessionId)}/assets`,
  comments: (sessionId: string) => `/sessions/${e(sessionId)}/comments`,
  docComments: (sessionId: string, docId: string) => `/sessions/${e(sessionId)}/docs/${e(docId)}/comments`,
  docContentPacks: (sessionId: string, docId: string) => `/sessions/${e(sessionId)}/docs/${e(docId)}/content-packs`,
  contentPacks: (sessionId: string) => `/sessions/${e(sessionId)}/content-packs`,
  contentPack: (sessionId: string, packId: string) => `/sessions/${e(sessionId)}/content-packs/${e(packId)}`,
  comment: (sessionId: string, commentId: string) => `/sessions/${e(sessionId)}/comments/${e(commentId)}`,
  commentEdit: (sessionId: string, commentId: string) => `/sessions/${e(sessionId)}/comments/${e(commentId)}/edit`,
  commentResolve: (sessionId: string, commentId: string) => `/sessions/${e(sessionId)}/comments/${e(commentId)}/resolve`,
  /** With a bucket: a signed URL to put an image to, then the call that says it is there. */
  assetUpload: (sessionId: string) => `/sessions/${e(sessionId)}/assets/uploads`,
  assetComplete: (sessionId: string, assetId: string) => `/sessions/${e(sessionId)}/assets/${e(assetId)}/complete`,
  /** Absolute, with the participant token in the query, so an <img> can load it. */
  assetUrl: (sessionId: string, assetId: string, token: string) => `/api/sessions/${e(sessionId)}/assets/${e(assetId)}?token=${e(token)}`,
  projects: (sessionId: string) => `/sessions/${e(sessionId)}/projects`,
  plugins: (sessionId: string, threadId?: string | null) => `/sessions/${e(sessionId)}/plugins${threadId ? `?thread_id=${e(threadId)}` : ''}`,
  preferences: (sessionId: string) => `/sessions/${e(sessionId)}/preferences`,
  /** GET: spend by day for the range, and in all against the budget. */
  usage: (sessionId: string, range: string) => `/sessions/${e(sessionId)}/usage?range=${e(range)}`,
  /** The workspace's spend and budget (with its top-ups), for "£N left" in the chat. */
  budget: (sessionId: string) => `/sessions/${e(sessionId)}/budget`,
  plugin: (sessionId: string, pluginId: string, action: 'trust' | 'allow') => `/sessions/${e(sessionId)}/plugins/${e(pluginId)}/${action}`,
  /** GET lists the workspace's studio drafts, POST {address} adds one; with an id, DELETE removes it. */
  pluginDrafts: (sessionId: string, draftId?: string) => `/sessions/${e(sessionId)}/plugin-drafts${draftId ? `/${e(draftId)}` : ''}`,
  /** Needs groups: GET lists them, POST creates one. */
  needsGroups: (sessionId: string) => `/sessions/${e(sessionId)}/needs-groups`,
  needsGroupAction: (sessionId: string, groupId: string, action: 'update' | 'archive') => `/sessions/${e(sessionId)}/needs-groups/${e(groupId)}/${action}`,
  needsGroupClasses: (sessionId: string, groupId: string) => `/sessions/${e(sessionId)}/needs-groups/${e(groupId)}/classes`,
  needsGroupClass: (sessionId: string, groupId: string, classId: string) => `/sessions/${e(sessionId)}/needs-groups/${e(groupId)}/classes/${e(classId)}`,
  needsGroupAdaptations: (sessionId: string, groupId: string) => `/sessions/${e(sessionId)}/needs-groups/${e(groupId)}/adaptations`,
  needsGroupAdaptationAction: (sessionId: string, groupId: string, adaptationId: string, action: 'update' | 'remove') =>
    `/sessions/${e(sessionId)}/needs-groups/${e(groupId)}/adaptations/${e(adaptationId)}/${action}`,
  /** POST {name} renames, POST /archive archives. */
  project: (sessionId: string, projectId: string, action: 'rename' | 'update' | 'archive' | 'delete') => `/sessions/${e(sessionId)}/projects/${e(projectId)}/${action}`,
  /** GET lists a project's reference files (with the limits); POST adds one (its text). */
  projectReferences: (sessionId: string, projectId: string) => `/sessions/${e(sessionId)}/projects/${e(projectId)}/references`,
  /** The same for a chat's own files ("+" under the chat box). */
  threadReferences: (sessionId: string, threadId: string) => `/sessions/${e(sessionId)}/threads/${e(threadId)}/references`,
  /** DELETE removes a reference file; POST .../complete after its original is in the bucket. */
  reference: (sessionId: string, referenceId: string) => `/sessions/${e(sessionId)}/references/${e(referenceId)}`,
  /** GET a file's pages and whether its original can be downloaded (the preview). */
  referencePages: (sessionId: string, referenceId: string) => `/sessions/${e(sessionId)}/references/${e(referenceId)}/pages`,
  /** Absolute, with the token in the query, so a link can open it: redirects to the original in the bucket. */
  referenceOriginal: (sessionId: string, referenceId: string, token: string) => `/api/sessions/${e(sessionId)}/references/${e(referenceId)}/original?token=${e(token)}`,
  referenceComplete: (sessionId: string, referenceId: string) => `/sessions/${e(sessionId)}/references/${e(referenceId)}/complete`,
  /** Used by events/logger.ts (which builds the same path itself). */
  events: (sessionId: string) => `/sessions/${e(sessionId)}/events`,

  /* front door (no token): sign-in providers, typed codes, the signed-in account (cookie) */
  /** GET: `{ providers: [{ id, label, kind }] }`, only those set up. */
  authProviders: () => `/auth/providers`,
  /** Absolute, for a link: starts a sign-in with the provider, with an invite code to claim; `then: 'admin'` lands an admin back on /admin. */
  authStart: (providerId: string, invite?: string, then?: 'admin') => {
    const q = [invite ? `invite=${e(invite)}` : '', then ? `then=${then}` : ''].filter(Boolean).join('&');
    return `/api/auth/${e(providerId)}/start${q ? `?${q}` : ''}`;
  },
  /** POST `{ code }`: `{ session_id, token }`; 404 code_unknown, 429 too_many_codes. */
  access: () => `/access`,
  /** GET with the sign-in cookie: `{ session_id, token, account }`; 401 when signed out. */
  accountWorkspace: () => `/account/workspace`,
  /** POST {version}: the "Before you start" notice was ticked. */
  accountNotice: () => `/account/notice`,
  signOut: () => `/auth/sign-out`,

  /* admin: the sign-in cookie of an admin, or Authorization: Bearer <admin password> outside production */
  adminSessions: () => `/admin/sessions`,
  /** PATCH {label} renames the session; DELETE removes it and all its data. */
  adminSession: (sessionId: string) => `/admin/sessions/${e(sessionId)}`,
  adminInteractions: (sessionId: string) => `/admin/sessions/${e(sessionId)}/interactions`,
  /** PUT {features}: the workspace's feature switches; those left out keep their value. `{ session }`. */
  adminFeatures: (sessionId: string) => `/admin/sessions/${e(sessionId)}/features`,
  /** The session bundle as a zip (Content-Disposition names it after the label). */
  adminExport: (sessionId: string) => `/admin/sessions/${e(sessionId)}/export`,
  /** POST: a new access code for a link workspace (an older one stops working). */
  adminAccessCode: (sessionId: string) => `/admin/sessions/${e(sessionId)}/access-code`,
  /** POST `replace`: a new link and code, the old ones stop working; `close`: both stop, none issued. `{ session }`. */
  adminLink: (sessionId: string, action: 'replace' | 'close') => `/admin/sessions/${e(sessionId)}/link/${action}`,
  /** Every workspace's spend and budget. */
  adminBudgets: () => `/admin/budgets`,
  /** POST: adds £10 to the workspace's budget (no undo). `{ budget }`. */
  adminTopUp: (sessionId: string) => `/admin/sessions/${e(sessionId)}/budget/topup`,
  /** Who is signed in as admin: `{ via: 'password' }` or `{ via: 'account', account }`; a 401 says whether the password is taken. */
  adminMe: () => `/admin/me`,
  adminInvites: () => `/admin/invites`,
  adminInvite: (inviteId: string) => `/admin/invites/${e(inviteId)}`,
  adminAccounts: () => `/admin/accounts`,
  /** PUT {admin} gives or takes away admin; 409 last_admin. */
  adminAccountAdmin: (accountId: string) => `/admin/accounts/${e(accountId)}/admin`,
} as const;
