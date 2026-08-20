export const AUTO_THEME_PREFERENCE = "auto" as const;

export const THEME_PREFERENCES = [
  AUTO_THEME_PREFERENCE,
  "light",
  "dark",
] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<
  ThemePreference,
  typeof AUTO_THEME_PREFERENCE
>;

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f5f5f7",
  dark: "#101114",
};

export interface ThemeState {
  preference: ThemePreference;
  theme: ResolvedTheme;
}

export interface ThemeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (value === AUTO_THEME_PREFERENCE || value === "light" || value === "dark")
  );
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : AUTO_THEME_PREFERENCE;
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark = false,
): ResolvedTheme {
  if (preference === AUTO_THEME_PREFERENCE) {
    return prefersDark ? "dark" : "light";
  }

  return preference;
}

export function readThemeStateFromDataset(dataset: {
  theme?: string;
  themePreference?: string;
}): ThemeState {
  const preference = parseThemePreference(dataset.themePreference);
  return {
    preference,
    theme: isResolvedTheme(dataset.theme)
      ? dataset.theme
      : resolveTheme(preference),
  };
}

export function readStoredThemePreference(
  storage: ThemeStorage | null | undefined,
  storageKey: string,
): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(storageKey) ?? null);
  } catch {
    return AUTO_THEME_PREFERENCE;
  }
}

export function persistThemePreference(
  storage: ThemeStorage | null | undefined,
  storageKey: string,
  preference: ThemePreference,
) {
  if (!storage) return false;

  try {
    if (preference === AUTO_THEME_PREFERENCE) {
      storage.removeItem(storageKey);
    } else {
      storage.setItem(storageKey, preference);
    }
    return true;
  } catch {
    return false;
  }
}

export function applyThemeToRoot(
  root: Pick<HTMLElement, "dataset" | "style">,
  preference: ThemePreference,
  theme: ResolvedTheme,
  themeColorMeta?: Pick<HTMLMetaElement, "content"> | null,
) {
  root.dataset.themePreference = preference;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (themeColorMeta) {
    themeColorMeta.content = THEME_COLORS[theme];
  }
}

export function createThemeBootstrapScript(
  exportRealmHash: string,
  storageKey: string,
) {
  const exportRealmHashLiteral = JSON.stringify(exportRealmHash);
  const storageKeyLiteral = JSON.stringify(storageKey);
  const themeColorsLiteral = JSON.stringify(THEME_COLORS);

  return [
    "(function(){",
    "var root=document.documentElement;",
    "var themeColors=",
    themeColorsLiteral,
    ";",
    "var applyTheme=function(preference,theme){",
    "root.dataset.themePreference=preference;",
    "root.dataset.theme=theme;",
    "root.style.colorScheme=theme;",
    "var meta=document.querySelector('meta[name=\"theme-color\"]');",
    "if(meta){meta.content=themeColors[theme];}",
    "};",
    "if(window.parent!==window&&window.location.hash===",
    exportRealmHashLiteral,
    "){applyTheme('auto','light');return;}",
    "var preference='auto';",
    "try{var stored=window.localStorage.getItem(",
    storageKeyLiteral,
    ");if(stored==='auto'||stored==='light'||stored==='dark'){preference=stored;}}catch(_error){}",
    "var theme=preference;",
    "if(preference==='auto'){var prefersDark=false;try{prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;}catch(_error){}theme=prefersDark?'dark':'light';}",
    "applyTheme(preference,theme);",
    "})();",
  ].join("");
}
