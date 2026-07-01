import React, { act } from "react";
import { createRoot } from "react-dom/client";
import useBarcodeScanner from "./useBarcodeScanner";

function Harness({ onScan, enabled = true }) {
  useBarcodeScanner(onScan, { enabled });
  return null;
}

let container;
let root;

beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root && root.unmount());
  container.remove();
  jest.useRealTimers();
});

function mount(props) {
  act(() => {
    root = createRoot(container);
    root.render(<Harness {...props} />);
  });
}

function press(target, key) {
  const evt = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    target.dispatchEvent(evt);
  });
  return evt;
}

function scan(target, code) {
  for (const ch of code) press(target, ch);
  return press(target, "Enter");
}

test("captures a rapid scan ending in Enter when focus is on the body", () => {
  const onScan = jest.fn();
  mount({ onScan });
  scan(document.body, "6291107451234");
  expect(onScan).toHaveBeenCalledTimes(1);
  expect(onScan).toHaveBeenCalledWith("6291107451234");
});

test("ignores keystrokes typed into an editable input (search/customer/etc.)", () => {
  const onScan = jest.fn();
  mount({ onScan });
  const input = document.createElement("input");
  input.type = "text";
  document.body.appendChild(input);
  scan(input, "123456");
  expect(onScan).not.toHaveBeenCalled();
  input.remove();
});

test("ignores typing in a textarea", () => {
  const onScan = jest.fn();
  mount({ onScan });
  const ta = document.createElement("textarea");
  document.body.appendChild(ta);
  scan(ta, "123456");
  expect(onScan).not.toHaveBeenCalled();
  ta.remove();
});

test("does not fire for codes shorter than minLength", () => {
  const onScan = jest.fn();
  mount({ onScan });
  scan(document.body, "12");
  expect(onScan).not.toHaveBeenCalled();
});

test("prevents default on Enter so a focused button is not also activated", () => {
  const onScan = jest.fn();
  mount({ onScan });
  for (const ch of "12345") press(document.body, ch);
  const enter = press(document.body, "Enter");
  expect(enter.defaultPrevented).toBe(true);
});

test("a slow keystroke resets the buffer (stray manual keys never accumulate)", () => {
  const onScan = jest.fn();
  mount({ onScan });
  press(document.body, "1");
  press(document.body, "2");
  act(() => jest.advanceTimersByTime(100)); // gap > maxKeyIntervalMs
  press(document.body, "3");
  press(document.body, "4");
  press(document.body, "5");
  press(document.body, "Enter");
  expect(onScan).toHaveBeenCalledTimes(1);
  expect(onScan).toHaveBeenCalledWith("345"); // "12" was discarded
});

test("clears a partial buffer after the idle timeout", () => {
  const onScan = jest.fn();
  mount({ onScan });
  press(document.body, "9");
  press(document.body, "9");
  press(document.body, "9");
  act(() => jest.advanceTimersByTime(200)); // exceeds timeoutMs -> reset
  press(document.body, "Enter");
  expect(onScan).not.toHaveBeenCalled();
});

test("does nothing when disabled", () => {
  const onScan = jest.fn();
  mount({ onScan, enabled: false });
  scan(document.body, "6291107451234");
  expect(onScan).not.toHaveBeenCalled();
});
