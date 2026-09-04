import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { getAccount, logoutAccount, type Customer } from "./account-api";

/* Who is signed in, available to the whole shell.
 *
 * Loaded on the SERVER in the root route's loader, so the header renders with
 * the right state in the very first HTML — no signed-out flash on a signed-in
 * visitor, and nothing for a shopper on a slow phone to watch flicker.
 *
 * `refresh` re-runs that loader rather than keeping a second copy of the
 * customer here. One source of truth, and every page that shows a balance
 * updates together when points move.
 */

interface AccountContextValue {
  customer: Customer | null;
  signedIn: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  signingOut: boolean;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({
  customer,
  children,
}: {
  customer: Customer | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const refresh = useCallback(async () => {
    await router.invalidate();
  }, [router]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await logoutAccount();
      await router.invalidate();
      await router.navigate({ to: "/" });
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  return (
    <AccountContext.Provider
      value={{ customer, signedIn: Boolean(customer), refresh, signOut, signingOut }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) {
    // A component reaching for the customer outside the shell is a wiring
    // mistake, and a silent null here would show every shopper a signed-out
    // header on a page they are signed in to.
    throw new Error("useAccount must be used inside <AccountProvider>");
  }
  return value;
}

export { getAccount };
export type { Customer };
