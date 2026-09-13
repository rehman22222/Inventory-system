// React 19 uses this flag to distinguish a real test environment from an
// accidental render. It also keeps act() failures visible without noisy false
// warnings for correctly wrapped updates.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* TextEncoder/TextDecoder, which jsdom does not provide here.
 *
 * react-scripts 5 pins Jest 27, whose jsdom predates these being globals. Node
 * has had them since v11, just not on the global object in this environment —
 * so they are copied across rather than shimmed.
 *
 * react-router v7 reaches for TextEncoder while its module is still loading, so
 * without this any suite that renders a routed page dies at import time, before
 * a single test runs. Nothing in the app needs it: the browser has had both for
 * years, and webpack never touches this file.
 */
const { TextEncoder, TextDecoder } = require("util");

if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder;
}
