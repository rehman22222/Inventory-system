import { createFileRoute, Outlet } from "@tanstack/react-router";

/* The /account branch.
 *
 * Deliberately just an outlet, with NO guard of its own. Its children are two
 * different kinds of page: the private ones (overview, orders, rewards,
 * details) and the ones you reach precisely because you are signed out (sign
 * in, register, forgotten password). A redirect here would apply to both and
 * make the sign-in page unreachable to the only people who need it.
 *
 * So each private route carries its own `beforeLoad` guard instead. More
 * typing, and correct.
 */
export const Route = createFileRoute("/account")({
  component: () => <Outlet />,
});
