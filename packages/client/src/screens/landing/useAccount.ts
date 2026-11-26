import { useEffect, useState } from 'react';
import { currentAccount, type SignedInAccount } from '../../api/auth';

/** Who is signed in: undefined while asking, null when nobody (or the call failed). */
export function useAccount(): SignedInAccount | null | undefined {
  const [account, setAccount] = useState<SignedInAccount | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    currentAccount()
      .then((a) => live && setAccount(a))
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);
  return account;
}
