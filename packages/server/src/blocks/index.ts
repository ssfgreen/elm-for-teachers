/**
 * Block service and routes (task 1.4). Public surface used by app.ts:
 *   createCanvasService(db, events) -> CanvasService (also registers its event hook)
 *   registerBlockRoutes(app, deps)   -> GET  /api/sessions/:id/canvas
 *                                       POST /api/sessions/:id/blocks/:command
 * Implementation lives in service.ts and routes.ts.
 */
export { createCanvasService } from "./service.js";
export type { CanvasServiceImpl } from "./service.js";
export { registerBlockRoutes } from "./routes.js";
