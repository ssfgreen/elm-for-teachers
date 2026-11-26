import { useEffect, useState } from 'react';
import { createAdminApi, readPasswordFlag } from '../../api/admin';
import { ApiError } from '../../api/http';

/**
 * Whether the server takes the admin password here (outside production: locally and on a
 * Vercel preview), learnt as AdminGate does: GET /api/admin/me with no password, and the 401's
 * `password` flag. False while asking, on any other answer, and for an admin already signed in.
 */
export function usePasswordTaken(): boolean {
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    let live = true;
    createAdminApi()
      .me()
      .then(
        () => undefined,
        (e: unknown) => {
          if (live && e instanceof ApiError && e.status === 401) setTaken(readPasswordFlag(e));
        },
      );
    return () => {
      live = false;
    };
  }, []);
  return taken;
}
