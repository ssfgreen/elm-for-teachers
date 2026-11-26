/**
 * Budget routes: a workspace's spend and budget (config `limits.budget_gbp` plus its top-ups).
 * Admin (auth.ts requireAdmin), under /api/admin:
 *   GET  /budgets                          -> { budgets: [{ session_id, spent_gbp, budget_gbp }] }; every workspace, for the /admin list
 *   POST /sessions/:sessionId/budget/topup -> { budget: { session_id, spent_gbp, budget_gbp } }; adds £10 (TOP_UP_GBP),
 *        logs one `budget_update` (naming the admin's account when signed in with one); 404 for an unknown workspace. There is no undo.
 * Participant (participant token):
 *   GET  /api/sessions/:sessionId/budget   -> { spent_gbp, budget_gbp }; for "£N left" in the chat. Reads only, not logged.
 */
import type { FastifyInstance } from 'fastify';
import { requireAdmin, requireParticipant } from '../auth.js';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http-error.js';
import { addTopUp, allBudgets, budgetOf } from './store.js';

export function registerBudgetRoutes(app: FastifyInstance, deps: AppDeps): void {
  const limits = () => deps.loaded.config.limits;

  void app.register(
    async (admin) => {
      admin.addHook('preHandler', requireAdmin(deps));

      admin.get('/budgets', async () => ({
        budgets: [...(await allBudgets(deps.db, limits())).entries()].map(([session_id, b]) => ({ session_id, ...b })),
      }));

      admin.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/budget/topup', async (req) => {
        const by = req.admin;
        const budget = await addTopUp(deps.db, deps.events, limits(), req.params.sessionId, by?.via ?? 'password', by?.via === 'account' ? by.account.id : undefined);
        if (!budget) throw notFound('session');
        return { budget: { session_id: req.params.sessionId, ...budget } };
      });
    },
    { prefix: '/api/admin' },
  );

  app.get('/api/sessions/:sessionId/budget', { preHandler: requireParticipant(deps) }, async (req) => budgetOf(deps.db, limits(), req.session!.session_id));
}
