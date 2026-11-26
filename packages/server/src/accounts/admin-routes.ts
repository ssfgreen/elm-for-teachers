/**
 * For the admin (auth.ts `requireAdmin`: an admin's sign-in cookie, or the password off Vercel or on a Vercel preview).
 *
 * Invites:
 *   POST   /api/admin/invites {label, email?, days?} -> 201 { invite, code }; the code is shown only here
 *   GET    /api/admin/invites                       -> { invites }, newest first, each with its status
 *   DELETE /api/admin/invites/:inviteId             -> 204; 409 when it was claimed, 404 when unknown
 * An invite's id is the hash of its code.
 *
 * Admins (issue #30):
 *   GET    /api/admin/me                            -> { via: 'password' } | { via: 'account', account: { id, name, email, provider } }
 *   GET    /api/admin/accounts                      -> { accounts: [{ id, name, email, provider, admin, workspace: { session_id, label } }] }
 *   PUT    /api/admin/accounts/:id/admin {admin}    -> 204; 404 unknown; 409 (code last_admin) when it would leave no admin
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { conflict, notFound } from '../http-error.js';
import { parseOr400 } from '../http/request.js';
import { createAdminStore } from './admins.js';
import { createAccountStore, MAX_INVITE_DAYS, type AccountStore } from './store.js';

const InviteBody = z.object({
  label: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254).nullable().optional(),
  days: z.number().int().min(1).max(MAX_INVITE_DAYS).optional(),
});
const AdminBody = z.object({ admin: z.boolean() });

export function registerInviteRoutes(app: FastifyInstance, deps: AppDeps): void {
  const accounts: AccountStore = deps.accounts ?? createAccountStore(deps.db, deps.sessions);
  const admins = createAdminStore(deps.db);

  void app.register(
    async (admin) => {
      admin.addHook('preHandler', requireAdmin(deps));
      admin.addHook('onSend', async (_req, reply) => {
        reply.header('cache-control', 'no-store');
      });

      admin.post('/invites', async (req, reply) => {
        const { label, email, days } = parseOr400(InviteBody, req.body);
        const { code, invite } = await accounts.createInvite({ label, email: email ?? null, ...(days ? { days } : {}) });
        return reply.code(201).send({ invite, code });
      });

      admin.get('/invites', async () => ({ invites: await accounts.listInvites() }));

      admin.delete<{ Params: { inviteId: string } }>('/invites/:inviteId', async (req, reply) => {
        const result = await accounts.withdrawInvite(req.params.inviteId);
        if (result === 'unknown') throw notFound('invite');
        if (result === 'used') throw conflict('invite already used', 'invite_used');
        return reply.code(204).send();
      });

      admin.get('/me', async (req) => req.admin);

      admin.get('/accounts', async () => ({ accounts: await admins.listAccounts() }));

      admin.put<{ Params: { accountId: string } }>('/accounts/:accountId/admin', async (req, reply) => {
        const { admin: flag } = parseOr400(AdminBody, req.body);
        const result = await admins.setAdmin(req.params.accountId, flag);
        if (result === 'unknown') throw notFound('account');
        if (result === 'last_admin') throw conflict('the last admin cannot be removed', 'last_admin');
        // Who changed whose flag: account ids only, never an email or a name.
        const by = req.admin?.via === 'account' ? req.admin.account.id : 'password';
        req.log.info({ by, account_id: req.params.accountId, admin: flag }, flag ? 'admin granted' : 'admin removed');
        return reply.code(204).send();
      });
    },
    { prefix: '/api/admin' },
  );
}
