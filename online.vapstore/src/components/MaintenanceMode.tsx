import type { StorefrontSettings } from "@/lib/catalog";

type EmergencyAlert = StorefrontSettings["emergencyAlert"];

export function MaintenanceMode({ alert }: { alert: EmergencyAlert }) {
  const title = alert.title || "Under maintenance";
  const headline = title
    .replace(/^web\s*site\s*currently\s*/i, "")
    .replace(/^website\s+currently\s*/i, "")
    .replace(/^website\s+/i, "")
    .trim();
  const message =
    alert.message || "We are making a few improvements. Please check back shortly.";
  const buttonLabel = alert.buttonLabel || "Come back soon";
  const isWarning = alert.tone === "warning";
  const isInfo = alert.tone === "info";

  return (
    <main
      className={`relative grid min-h-screen place-items-center overflow-hidden px-6 py-12 text-center ${
        isWarning
          ? "bg-[#f2d9d6] text-[#32110f]"
          : isInfo
            ? "bg-[#dcecf8] text-[#102533]"
            : "bg-[#d7e90f] text-[#2c2f0a]"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-25">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-black/20 blur-3xl" />
      </div>

      <section className="relative mx-auto flex w-full max-w-3xl flex-col items-center">
        <div
          className={`relative grid h-28 w-32 place-items-center shadow-[0_18px_35px_rgba(0,0,0,0.18)] sm:h-36 sm:w-44 ${
            isWarning
              ? "bg-gradient-to-b from-red-300 to-red-500"
              : isInfo
                ? "bg-gradient-to-b from-sky-200 to-sky-500"
                : "bg-gradient-to-b from-yellow-200 to-orange-400"
          }`}
          style={{
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          }}
          aria-hidden="true"
        >
          <span className="translate-y-4 font-display text-6xl leading-none text-black/65 sm:text-7xl">
            !
          </span>
        </div>

        <div className="mt-10 space-y-2 uppercase">
          <p className="font-sans text-2xl font-light tracking-tight sm:text-4xl">
            Web site currently
          </p>
          <h1 className="font-display text-3xl leading-none tracking-tight sm:text-5xl">
            {headline || "Under maintenance"}
          </h1>
        </div>

        {message && (
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 opacity-70 sm:text-base">
            {message}
          </p>
        )}

        <div className="mt-8 rounded-md bg-black/65 px-7 py-3 font-mono text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_25px_rgba(0,0,0,0.22)]">
          {buttonLabel}
        </div>
      </section>
    </main>
  );
}
