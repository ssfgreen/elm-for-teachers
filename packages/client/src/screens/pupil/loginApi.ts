/** A pupil logs in with the username and password their teacher gave them (server/src/pupils/login-routes.ts). */
import { api, errorCode } from '../../api/http';

/** The class code goes only the first time, from the join screen; the login screen sends none. */
export interface PupilLoginBody {
  username: string;
  password: string;
  code?: string;
}

/** 204 sets the pupil sign-in cookie; a refusal gives the server's reason code (`failed` with none). */
export async function pupilLogin(body: PupilLoginBody): Promise<{ ok: true } | { refused: string }> {
  try {
    await api<void>('POST', '/pupil/login', body);
    return { ok: true };
  } catch (err) {
    return { refused: errorCode(err) ?? 'failed' };
  }
}
