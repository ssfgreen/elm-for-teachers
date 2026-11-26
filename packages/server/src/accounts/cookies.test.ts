import { describe, expect, it } from 'vitest';
import { cookie, cookieNames, openState, sealState, type SignInState } from './cookies.js';

const SECRET = 'k'.repeat(40);
const state: SignInState = { provider: 'test', state: 's', nonce: 'n', codeVerifier: 'v', invite: null, then: null, exp: Date.now() + 60_000 };

describe('cookie names', () => {
  it('on https: Secure, the __Host- prefix and Path=/', () => {
    const names = cookieNames('https://edw.example');
    expect(names).toMatchObject({ secure: true, signIn: '__Host-edw_sign_in', signInPath: '/', state: '__Host-edw_auth_state', statePath: '/' });
    expect(cookie(names.signIn, 'id', { path: names.signInPath, maxAge: 60, secure: names.secure })).toBe('__Host-edw_sign_in=id; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure');
  });

  it('on plain http (localhost): plain names on the /api paths, since browsers refuse __Host- there', () => {
    const names = cookieNames('http://localhost:3000');
    expect(names).toMatchObject({ secure: false, signIn: 'edw_sign_in', signInPath: '/api', state: 'edw_auth_state', statePath: '/api/auth' });
    expect(cookie(names.signIn, 'id', { path: names.signInPath, maxAge: 60, secure: names.secure })).not.toMatch(/Secure/);
  });
});

describe('the state cookie', () => {
  it('opens what it sealed, and refuses one edited, signed with another secret, or expired', () => {
    const sealed = sealState(state, SECRET);
    expect(openState(sealed, SECRET)).toEqual(state);
    const [body, sig] = sealed.split('.');
    const edited = Buffer.from(JSON.stringify({ ...state, invite: 'stolen' })).toString('base64url');
    expect(openState(`${edited}.${sig}`, SECRET)).toBeNull();
    expect(openState(`${body}.${sig}.x`, SECRET)).toBeNull();
    expect(openState(sealed, 'o'.repeat(40))).toBeNull();
    expect(openState(sealState({ ...state, exp: Date.now() - 1 }, SECRET), SECRET)).toBeNull();
    expect(openState(null, SECRET)).toBeNull();
  });

  it('carries where to land after: only "admin" or null, and a cookie without it reads as null', () => {
    expect(openState(sealState({ ...state, then: 'admin' }, SECRET), SECRET)?.then).toBe('admin');
    const older = { ...state } as Partial<SignInState>;
    delete older.then;
    expect(openState(sealState(older as SignInState, SECRET), SECRET)?.then).toBeNull();
    const bad = { ...state, then: 'https://evil.example' } as unknown as SignInState;
    expect(openState(sealState(bad, SECRET), SECRET)).toBeNull();
  });
});
