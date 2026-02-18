"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "profile_theme_dark";

export function ProfilePreferencesClient() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const nextDarkMode = localStorage.getItem(THEME_STORAGE_KEY) === "1";
    setDarkMode(nextDarkMode);
    document.documentElement.classList.toggle("dark", nextDarkMode);
  }, []);

  const onToggleDarkMode = (nextValue: boolean) => {
    setDarkMode(nextValue);
    localStorage.setItem(THEME_STORAGE_KEY, nextValue ? "1" : "0");
    document.documentElement.classList.toggle("dark", nextValue);
  };

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Mode sombre</span>
        <span className="text-muted-foreground">
          {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={darkMode}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          darkMode ? "bg-primary" : "bg-muted-foreground/30"
        }`}
        onClick={() => onToggleDarkMode(!darkMode)}
        aria-label="Activer le mode sombre"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            darkMode ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
