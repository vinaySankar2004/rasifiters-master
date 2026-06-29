"use client";

import { useEffect } from "react";
import { applyTheme, getStoredTheme, watchSystemTheme } from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const preference = getStoredTheme();
    applyTheme(preference);
    const unsubscribe = watchSystemTheme(() => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    });
    return unsubscribe;
  }, []);

  return <>{children}</>;
}
