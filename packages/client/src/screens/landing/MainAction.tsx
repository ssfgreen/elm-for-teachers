import { Link } from 'react-router-dom';
import type { SignedInAccount } from '../../api/auth';
import { SIGN_UP } from './content';

/**
 * The front page's ink button: dark on the light page, light on the dark one (`--landing-button`).
 * Full width on a phone; it presses in when clicked. Written out here rather than as a `Button`
 * variant: these are links, and `Button`'s hover styles use `hover:enabled:`, which never matches
 * an `<a>` (only form controls are `:enabled`), so a `Button asChild` link would not answer hover.
 */
export const inkButtonClass =
  'inline-flex h-12 items-center justify-center gap-2 rounded-md bg-landing-button px-6 text-lg text-landing-button-foreground no-underline shadow-pop outline-none transition hover:bg-landing-button-hover active:scale-97 focus-visible:ring-3 focus-visible:ring-ring max-md:w-full';

/**
 * The front page's one action: "Sign up" (on to /signup, where a teacher or a pupil chooses), or
 * the workspace when signed in. An admin reaches /admin from the workspace's Dashboard row
 * (#79), not from here. Nothing while the account loads.
 */
export function MainAction({ account }: { account: SignedInAccount | null | undefined }) {
  if (account === undefined) return null;
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {account ? (
        <Link to="/w" className={inkButtonClass}>
          Open your workspace
        </Link>
      ) : (
        <Link to="/signup" className={inkButtonClass}>
          {SIGN_UP}
        </Link>
      )}
    </div>
  );
}
