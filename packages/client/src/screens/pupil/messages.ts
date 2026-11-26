/**
 * The words for each way a pupil sign-in, a teacher's login or joining a class can fail
 * (server/src/pupils/routes.ts PupilSignInError, server/src/pupils/login-routes.ts LOGIN_STATUS).
 */
const FAILED = 'Signing in did not work. Please try again.';
const PUPIL_ERRORS: Record<string, string> = {
  cancelled: 'Signing in was cancelled. You can try again.',
  provider_error: 'Google or Microsoft did not answer. Please try again in a minute.',
  failed: FAILED,
  teacher_account: 'This account is a teacher’s. Teachers sign in on the teacher page.',
  pupils_off: 'Pupil sign-in is switched off here.',
  feature_off: 'Your class is not ready for pupils yet. Please ask your teacher.',
  code_needed: 'The first time, type your class code before you sign in.',
  code_unknown: 'That class code does not work. Check it with your teacher and try again.',
  too_many_codes: 'Too many wrong codes. Wait a minute and try again.',
  class_archived: 'That class is closed. Please ask your teacher.',
  login_wrong: 'That username and password do not match. Check your slip and try again.',
  login_locked: 'Too many wrong passwords. Ask your teacher for a new password.',
  code_other_class: 'That code is for a different class. Check it with your teacher.',
  login_taken: 'That login is already in use. Ask your teacher.',
  test_pupil: 'A test pupil stays in its own class. Go back to the teacher page to view another class.',
};

/** The message for `?error=`, or null with none. A reason we do not know reads as `failed`. */
export function pupilErrorMessage(reason: string | null): string | null {
  if (!reason) return null;
  return PUPIL_ERRORS[reason] ?? FAILED;
}
