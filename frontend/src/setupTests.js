// React 19 uses this flag to distinguish a real test environment from an
// accidental render. It also keeps act() failures visible without noisy false
// warnings for correctly wrapped updates.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
