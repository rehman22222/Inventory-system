import { createContext, useContext } from "react";

// Shared open/close state for the responsive dashboard sidebar drawer.
// Safe no-op defaults so consumers (e.g. TopNavbar) never crash if rendered
// outside a provider.
export const SidebarContext = createContext({
  open: false,
  setOpen: () => {},
  toggle: () => {},
});

export const useSidebar = () => useContext(SidebarContext);
