import { z } from "zod";

/**
 * An admin replaced or closed a link workspace's link (server only). `replace`: a new link and
 * access code were issued and the old ones stopped working; `close`: both stopped working and
 * none was issued. `via`: signed in as an admin account or by the admin password. Neither the
 * link nor the code is ever written here.
 */
export const WorkspaceLinkPayload = z.object({
  action: z.enum(["replace", "close"]),
  via: z.enum(["account", "password"]),
});
