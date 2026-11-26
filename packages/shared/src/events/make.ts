/** Event payloads for the make kit's board and its design calls. */
import { z } from "zod";
import { Timestamp } from "../blocks.js";
import { MakeAction } from "../make.js";

/** Something the teacher did on the make kit's board (/make/:token), logged when the board is saved. */
export const MakeActionPayload = z.object({ action: MakeAction, client_ts: Timestamp });

/** The make kit's call to the model to design a teacher's feature, logged whether or not it worked. */
export const MakeDesignPayload = z.object({
  text: z.string(),
  feedback: z.string().nullable(),
  /** The options the teacher was shown, or null if the call failed. */
  result: z.unknown().nullable(),
  model: z.string(),
  system_prompt_hash: z.string(),
  latency_ms: z.number().int().nonnegative(),
  at: Timestamp,
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  provider_request_id: z.string().nullable(),
  request: z.unknown().optional(),
  error: z.string().nullable(),
});
