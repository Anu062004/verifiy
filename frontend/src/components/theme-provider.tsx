"use client";

import { ThemeProvider as NextThemesThemeProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesThemeProvider attribute="class" defaultTheme="light" enableSystem={false} {...props}>
      {children}
    </NextThemesThemeProvider>
  );
}
