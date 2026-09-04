/* The whole back office, for somebody whose job is only the blog.
 *
 * Content accounts ("seo") land here and nowhere else. It is the same
 * BlogManager the shop's own Online store → Blog tab renders, on its own page
 * with its own heading, minus the blog landing-page settings form — that copy
 * belongs to the shop, and the settings endpoint refuses these accounts anyway.
 *
 * Nothing here is a security boundary. An account that reaches this page has
 * already been fenced on the server (backend/middleware/Authmiddleware.js):
 * every request it can make is on an allowlist, so what this page does is
 * decide what is worth drawing, not what is permitted.
 */

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FiBookOpen } from "react-icons/fi";
import TopNavbar from "../Components/TopNavbar";
import BlogManager from "../Components/onlineStore/BlogManager";
import { getOnlineBlogPosts } from "../features/onlineStoreSlice";

export default function BlogStudioPage() {
  const dispatch = useDispatch();
  const online = useSelector((state) => state.onlineStore);
  const { Authuser } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(getOnlineBlogPosts());
  }, [dispatch]);

  return (
    <>
      <TopNavbar />
      <div className="min-w-0 p-4 sm:p-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <FiBookOpen className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold">Blog studio</h1>
              <p className="text-xs text-base-content/50">
                Write, edit and publish articles for the online store.
              </p>
            </div>
          </div>
          {Authuser?.name && (
            <span className="text-xs text-base-content/50">
              Signed in as {Authuser.name}
            </span>
          )}
        </header>

        <BlogManager
          posts={online.blogPosts}
          settings={online.settings}
          isActing={online.isActing}
          // The blog landing page's headings are the shop's copy, not the
          // agency's. Hidden here, and refused by the server regardless.
          canEditPage={false}
        />
      </div>
    </>
  );
}
