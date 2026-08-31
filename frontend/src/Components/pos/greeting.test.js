import { partOfDay } from "./Greeting";

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
