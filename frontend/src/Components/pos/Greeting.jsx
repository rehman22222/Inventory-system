import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// What time it is where the shop is.
//
// Read in Europe/Dublin rather than off the machine's clock: a till in the back
// office set to another zone, or a laptop somebody carried over from testing,
// would otherwise wish the counter good evening at ten in the morning. The
// shop's hours are the shop's hours.
//
//   morning    05:00 – 11:59
//   afternoon  12:00 – 16:59
//   evening    17:00 – 23:59
//
// Midnight to 05:00 is nobody's morning: it is the tail of the evening shift
// that has not gone home yet, so it keeps saying evening.
export const partOfDay = (now = new Date()) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-IE", {
      timeZone: "Europe/Dublin",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );

  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
};

// Re-checks itself every minute, so a shift that runs through five o'clock sees
// the greeting change without anybody reloading the till.
export const usePartOfDay = () => {
  const [part, setPart] = useState(() => partOfDay());

  useEffect(() => {
    const tick = setInterval(() => setPart(partOfDay()), 60000);
    return () => clearInterval(tick);
  }, []);

  return part;
};

// Written on rather than switched on: each letter arrives in turn, left to
// right, the way a hand would put it there.
//
// Split into words first, and only then into letters, and each word kept
// unbreakable. A line of loose inline-block letters may break between any two
// of them, which on a narrow pane snaps words in half — "after / noon".
//
// How slowly it writes is the caller’s to choose.
//
// Anyone who has asked their system to stop animating things gets the finished
// line immediately — the words are the point, the writing is the flourish.
function Written({ text, className = "", delay = 0, step = 55, duration = 420 }) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // The spaces stay outside the word spans, as ordinary text. That is the only
  // place the line is allowed to break: two inline-blocks sitting flush against
  // each other give the browser no break opportunity at all, and the line would
  // run off the pane rather than wrap.
  const words = useMemo(() => text.split(" "), [text]);

  if (reduced) return <span className={className}>{text}</span>;

  let index = 0;

  return (
    <span className={className} aria-label={text}>
      {words.map((word, wordIndex) => {
        const letters = Array.from(word).map((letter, letterIndex) => (
          <span
            key={letterIndex}
            aria-hidden="true"
            className="pos-written"
            style={{
              animationDelay: `${delay + index++ * step}ms`,
              animationDuration: `${duration}ms`,
            }}
          >
            {letter}
          </span>
        ));

        // The space costs a beat too, so the rhythm does not speed up across
        // the gaps between words.
        if (wordIndex < words.length - 1) index += 1;

        return (
          <React.Fragment key={`${wordIndex}-${word}`}>
            <span className="inline-block whitespace-nowrap">{letters}</span>
            {wordIndex < words.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </span>
  );
}

// The greeting across the top of the till.
//
// Slow on purpose. It is the one thing on the screen with no work to do, so it
// takes its time — a letter every eighth of a second, each one nearly a second
// in the air. Anything quicker reads as a page loading; this reads as a hello.
export function Greeting({ className = "" }) {
  const { t } = useTranslation();
  const part = usePartOfDay();

  const text = t(`pos.greeting.${part}`, {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  }[part]);

  return <Written key={part} text={text} className={className} step={130} duration={900} />;
}

// The line on the empty grid, when no aisle is open. Says something about the
// hour rather than "no products found", which is true of an empty grid and
// useless to the person looking at it.
//
// It writes itself on once and then simply stays there, holding its place for
// as long as no category is open. The only thing that ever changes it is the
// clock: when the shop passes noon or five, the line is rewritten to match.
export function GreetingLine({ className = "" }) {
  const { t } = useTranslation();
  const part = usePartOfDay();

  const text = t(`pos.greeting.line.${part}`, {
    morning: "A fresh day at the counter — pick an aisle, or scan.",
    afternoon: "Good trade this afternoon — pick an aisle, or scan.",
    evening: "Winding down for the evening — pick an aisle, or scan.",
  }[part]);

  return <Written key={part} text={text} className={className} step={34} duration={620} />;
}

export default Greeting;
