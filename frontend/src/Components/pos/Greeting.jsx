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
function Written({
  text,
  className = "",
  // Carried on each LETTER rather than on the line around them, and that is
  // not a style preference — it is what keeps the gradient and the animation
  // able to coexist. Clipping a background to text on the parent means the
  // parent paints the colour and the letters paint nothing, so animating a
  // letter's opacity would move something already invisible and the writing-on
  // would simply not happen. Each letter carrying its own clipped gradient
  // keeps both. The gradient runs top to bottom, so every letter shows the same
  // sweep and the line still reads as one colour rather than a rainbow.
  letterClassName = "",
  // Something to arrive after the last letter, on the next beat, as though
  // the same hand put it there. Kept OUT of letterClassName on purpose: that
  // class clips a gradient to the text and paints the glyph transparent,
  // which turns a colour emoji into an invisible one.
  trailing = null,
  delay = 0,
  step = 55,
  duration = 420,
}) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // The spaces stay outside the word spans, as ordinary text. That is the only
  // place the line is allowed to break: two inline-blocks sitting flush against
  // each other give the browser no break opportunity at all, and the line would
  // run off the pane rather than wrap.
  const words = useMemo(() => text.split(" "), [text]);

  if (reduced) {
    return (
      <span className={className}>
        <span className={letterClassName}>{text}</span>
        {trailing ? (
          <span aria-hidden="true"> {trailing}</span>
        ) : null}
      </span>
    );
  }

  let index = 0;

  return (
    <span className={className} aria-label={text}>
      {words.map((word, wordIndex) => {
        const letters = Array.from(word).map((letter, letterIndex) => (
          <span
            key={letterIndex}
            aria-hidden="true"
            className={`pos-written ${letterClassName}`.trim()}
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
      {trailing ? (
        <span
          aria-hidden="true"
          className="pos-written"
          style={{
            animationDelay: `${delay + (index + 1) * step}ms`,
            animationDuration: `${duration}ms`,
          }}
        >
          {" "}
          {trailing}
        </span>
      ) : null}
    </span>
  );
}

/* The picture that goes with the hour. The shop chose these three.
 *
 * The sun is U+2600 followed by U+FE0F, the variation selector that asks for
 * the colour emoji rather than the black-and-white dingbat — two code points
 * for one picture. That matters here because the greeting is drawn by walking
 * its text a character at a time, and a walk like that would split the sun in
 * half and strand the selector.
 *
 * It does not happen, and the reason is structural rather than lucky: these
 * are passed to Written as `trailing`, which renders what it is given WHOLE
 * and never walks it. Keep it that way — the moment one of these is fed
 * through the letter-by-letter path, the sun loses its colour. */
export const GREETING_EMOJI = {
  morning: "🍻",
  afternoon: "☀️",
  evening: "🪐",
};

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

  return (
    <Written
      key={part}
      text={text}
      className={className}
      letterClassName="pos-greeting-ink"
      trailing={
        <span className="pos-greeting-emoji">{GREETING_EMOJI[part]}</span>
      }
      step={130}
      duration={900}
    />
  );
}

export default Greeting;
