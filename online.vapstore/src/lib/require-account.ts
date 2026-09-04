import { redirect } from "@tanstack/react-router";
import type { Customer } from "./account-api";

/* The guard every private account route runs.
 *
 * Thrown from `beforeLoad`, so a signed-out visitor is sent to the sign-in page
 * BEFORE a page full of somebody's order history is ever built — rather than
 * rendering one and bouncing them out of it afterwards.
 *
 * It does not carry a "come back here afterwards" destination. It could, and
 * the small convenience is not worth owning a redirect target that arrives in
 * a URL: a parameter that says where to send somebody after they sign in is the
 * classic shape of an open redirect, and this is a page whose whole job is to
 * be visited by people who are about to type a password.
 *
 * This is a convenience, not the security boundary. The real one is the server:
 * every /account endpoint identifies the customer from their token and will
 * refuse a request that has none, whatever the browser was allowed to render.
 */
export const requireAccount = ({
  context,
}: {
  context: { account: Customer | null };
}) => {
  if (!context.account) {
    throw redirect({ to: "/account/login" });
  }
  return { customer: context.account };
};
