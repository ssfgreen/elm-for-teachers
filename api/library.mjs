// Vercel Function entry for the library server: every /library/* request (see vercel.json).
// Built by `pnpm build` into library/dist. The app reaches it over HTTP only, at LIBRARY_URL.
export { default } from '../library/dist/server/vercel.js';
