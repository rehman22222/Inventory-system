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
// right, the way a hand would put it there. It is the first thing on an empty
// till and it should feel like the shop saying hello, not a label appearing.
//
// Anyone who has asked their system to stop animating things gets the finished
// line immediately — the words are the point, the writing is the flourish.
function Written({ text, className = "", delay = 0, step = 55 }) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Keyed on the text so changing it writes the new line out again instead of
  // leaving half the old one on screen.
  const letters = useMemo(() => Array.from(text), [text]);

  if (reduced) return <span className={className}>{text}</span>;

  return (
    <span className={className} aria-label={text}>
      {letters.map((letter, index) => (
        <span
          key={`${text}-${index}`}
          aria-hidden="true"
          className="pos-written"
          style={{ animationDelay: `${delay + index * step}ms` }}
        >
          {letter === " " ? " " : letter}
        </span>
      ))}
    </span>
  );
}

// The greeting across the top of the till.
export function Greeting({ className = "" }) {
  const { t } = useTranslation();
  const part = usePartOfDay();

  const text = t(`pos.greeting.${part}`, {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  }[part]);

  return <Written key={part} text={text} className={className} />;
}

// The line on the empty grid, when no aisle is open. Says something about the
// hour rather than "no products found", which is true of an empty grid and
// useless to the person looking at it.
export function GreetingLine({ className = "" }) {
  const { t } = useTranslation();
  const part = usePartOfDay();

  const text = t(`pos.greeting.line.${part}`, {
    morning: "A fresh day at the counter — pick an aisle, or scan.",
    afternoon: "Good trade this afternoon — pick an aisle, or scan.",
    evening: "Winding down for the evening — pick an aisle, or scan.",
  }[part]);

  return <Written key={part} text={text} className={className} step={22} />;
}

export default Greeting;
