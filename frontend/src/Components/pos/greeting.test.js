import { act } from "react";
import { createRoot } from "react-dom/client";
import { partOfDay, GREETING_EMOJI, Greeting } from "./Greeting";

// The greeting is read in Europe/Dublin, not off the till's clock. These are
// written as UTC instants on purpose: a machine set to Karachi or New York must
// still greet the counter by Irish time, and asserting on local hours would
// pass everywhere and mean nothing.
//
// Ireland is UTC in winter and UTC+1 on summer time, so each boundary is
// checked in both halves of the year — that offset is exactly what a naive
// implementation gets wrong.
const at = (iso) => partOfDay(new Date(iso));

describe("partOfDay", () => {
  describe("winter, when Dublin is on UTC", () => {
    it("greets the morning from five", () => {
      expect(at("2026-01-15T04:59:00Z")).toBe("evening");
      expect(at("2026-01-15T05:00:00Z")).toBe("morning");
      expect(at("2026-01-15T11:59:00Z")).toBe("morning");
    });

    it("turns to afternoon at noon", () => {
      expect(at("2026-01-15T12:00:00Z")).toBe("afternoon");
      expect(at("2026-01-15T16:59:00Z")).toBe("afternoon");
    });

    it("turns to evening at five", () => {
      expect(at("2026-01-15T17:00:00Z")).toBe("evening");
      expect(at("2026-01-15T23:59:00Z")).toBe("evening");
    });
  });

  describe("summer, when Dublin is an hour ahead of UTC", () => {
    it("greets the morning from five Irish time, not five UTC", () => {
      // 04:00Z is 05:00 in Dublin — already morning.
      expect(at("2026-07-15T04:00:00Z")).toBe("morning");
      // 03:59Z is 04:59 in Dublin — not yet.
      expect(at("2026-07-15T03:59:00Z")).toBe("evening");
    });

    it("turns to afternoon at Irish noon", () => {
      expect(at("2026-07-15T10:59:00Z")).toBe("morning");
      expect(at("2026-07-15T11:00:00Z")).toBe("afternoon");
    });

    it("turns to evening at Irish five", () => {
      expect(at("2026-07-15T15:59:00Z")).toBe("afternoon");
      expect(at("2026-07-15T16:00:00Z")).toBe("evening");
    });
  });

  // The shop's three ranges cover 05:00 to 23:59 and stop. The small hours are
  // the tail of a late shift rather than the start of a new day, so they keep
  // saying evening instead of wishing a good morning at two in the morning.
  it("holds the evening through the small hours", () => {
    expect(at("2026-01-15T00:00:00Z")).toBe("evening");
    expect(at("2026-01-15T02:30:00Z")).toBe("evening");
    expect(at("2026-01-15T04:59:00Z")).toBe("evening");
  });

  it("reads the clock at the moment it is asked", () => {
    // No argument means now; whatever it is, it must be one of the three.
    expect(["morning", "afternoon", "evening"]).toContain(partOfDay());
  });
});

// The picture beside the words.
//
// Two things could go wrong here and both are invisible until somebody looks
// at the till: the emoji could be SPLIT, or it could be painted transparent.
//
// Split, because the greeting's words are drawn one character at a time, and
// the sun is two code points — U+2600 plus the U+FE0F selector that asks for
// the colour version. Half of that is a black-and-white dingbat and an
// invisible character.
//
// Transparent, because each of those letters carries a gradient clipped to the
// text, which paints the glyph itself see-through and lets the background
// show. An emoji drawn as one of those letters would not be there at all.
//
// Both are avoided the same way: the emoji goes in Written's `trailing` slot,
// which renders what it is handed whole and without that class. These check
// it stays that way.
describe("the greeting's emoji", () => {
  it("has one for every part of the day", () => {
    expect(Object.keys(GREETING_EMOJI).sort()).toEqual([
      "afternoon",
      "evening",
      "morning",
    ]);
  });

  it("has one for whatever partOfDay actually returns", () => {
    for (const iso of [
      "2026-01-15T08:00:00Z",
      "2026-01-15T14:00:00Z",
      "2026-01-15T20:00:00Z",
      "2026-07-15T02:00:00Z",
    ]) {
      expect(GREETING_EMOJI[partOfDay(new Date(iso))]).toBeTruthy();
    }
  });

  it("gives each part of the day a different picture", () => {
    expect(new Set(Object.values(GREETING_EMOJI)).size).toBe(3);
  });

  it("is the three the shop asked for", () => {
    expect(GREETING_EMOJI).toEqual({
      morning: "🍻",
      afternoon: "☀️",
      evening: "🪐",
    });
  });

  /* Drawn at a FIXED hour rather than at whatever time the suite runs.

     Two of the three emoji are a single code point and cannot be split at all,
     so a test that renders "now" would quietly do nothing for most of the day
     and only exercise the sun — the one that CAN break — between noon and five.
     Pinning the clock puts all three through the same checks every run. */
  describe("as the till actually draws it", () => {
    let container;
    let root;

    const renderAt = (iso) => {
      jest.useFakeTimers().setSystemTime(new Date(iso));
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => root.render(<Greeting />));
      return container;
    };

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
      jest.useRealTimers();
    });

    // Winter instants, so Dublin is on UTC and the hour reads as written.
    const hours = [
      ["2026-01-15T08:00:00Z", "morning"],
      ["2026-01-15T14:00:00Z", "afternoon"],
      ["2026-01-15T20:00:00Z", "evening"],
    ];

    it.each(hours)("at %s puts the %s emoji on the screen, whole", (iso, part) => {
      expect(renderAt(iso).textContent).toContain(GREETING_EMOJI[part]);
    });

    /* The one that would catch a split sun: no single element may hold only
       PART of the emoji. Every element that touches one of its code points has
       to hold the whole thing. */
    it.each(hours)("at %s never breaks the %s emoji across two elements", (iso, part) => {
      const emoji = GREETING_EMOJI[part];
      const pieces = Array.from(emoji);

      for (const el of renderAt(iso).querySelectorAll("*")) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("");
        if (pieces.some((piece) => own.includes(piece))) {
          expect(own).toContain(emoji);
        }
      }
    });

    /* The class that makes it bigger and sets it apart from the words. Worth
       asserting because losing it breaks nothing and throws nothing — the
       emoji simply goes back to the size of the type, and nobody notices
       until the shop looks at the till. */
    it.each(hours)("at %s the %s emoji is the one carrying its own styling", (iso, part) => {
      const worn = renderAt(iso).querySelector(".pos-greeting-emoji");
      expect(worn).not.toBeNull();
      expect(worn.textContent).toBe(GREETING_EMOJI[part]);
    });

    /* And the one that would catch an invisible sun. The gradient class paints
       its glyph transparent; the emoji must not be wearing it. */
    it.each(hours)("at %s the %s emoji does not wear the transparent gradient", (iso, part) => {
      const emoji = GREETING_EMOJI[part];
      for (const el of renderAt(iso).querySelectorAll(".pos-greeting-ink")) {
        expect(el.textContent).not.toContain(emoji);
      }
    });
  });
});

/* The other branch.
 *
 * Anyone who has asked their system to stop animating things gets the finished
 * line at once instead of the writing-on. That path builds its markup
 * DIFFERENTLY — one span of text rather than a span per letter — so the emoji
 * has to be checked separately there. jsdom reports no media queries at all, so
 * the ordinary tests above never reach it and a break here would be invisible
 * to every one of them.
 *
 * It is also the branch where getting it wrong is worst: the people who turn
 * animation off are the likeliest to be reading the till with assistive
 * software. */
describe("when the till is asked not to animate", () => {
  let container;
  let root;

  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
    delete window.matchMedia;
  });

  const renderAt = (iso) => {
    jest.useFakeTimers().setSystemTime(new Date(iso));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Greeting />));
    return container;
  };

  const hours = [
    ["2026-01-15T08:00:00Z", "morning"],
    ["2026-01-15T14:00:00Z", "afternoon"],
    ["2026-01-15T20:00:00Z", "evening"],
  ];

  it.each(hours)("at %s the %s greeting still has its words", (iso, part) => {
    // Lowercase: with no translation table loaded, t() returns the fallback
    // the component carries, not the capitalised string from en.json.
    const words = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" };
    expect(renderAt(iso).textContent).toContain(words[part]);
  });

  it.each(hours)("at %s the %s emoji is there, whole", (iso, part) => {
    expect(renderAt(iso).textContent).toContain(GREETING_EMOJI[part]);
  });

  it.each(hours)("at %s the %s emoji is not painted transparent", (iso, part) => {
    for (const el of renderAt(iso).querySelectorAll(".pos-greeting-ink")) {
      expect(el.textContent).not.toContain(GREETING_EMOJI[part]);
    }
  });

  it.each(hours)("at %s the %s emoji keeps its own styling", (iso, part) => {
    const worn = renderAt(iso).querySelector(".pos-greeting-emoji");
    expect(worn).not.toBeNull();
    expect(worn.textContent).toBe(GREETING_EMOJI[part]);
  });

  // The flourish is what is dropped, not the content.
  it("writes nothing on letter by letter", () => {
    expect(renderAt("2026-01-15T14:00:00Z").querySelectorAll(".pos-written").length).toBe(0);
  });
});
