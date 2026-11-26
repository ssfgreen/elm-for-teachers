/** Event payloads for the session itself: the link opened, and errors. */
import { z } from "zod";

/** The participant's link was opened (logged server-side on every page load). */
export const ParticipantOpenPayload = z.object({
  /** True on the first open of the link. */
  first: z.boolean(),
});

export const ErrorPayload = z.object({
  source: z.enum(["provider", "client", "server"]),
  message: z.string(),
});
