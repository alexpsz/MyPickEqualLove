export const SHELL_ROUTES = {
  home: "/",
  journey: "/journey/",
  localEvent: "/local-event/",
} as const;

export type ShellRoute = (typeof SHELL_ROUTES)[keyof typeof SHELL_ROUTES];

function normalizeShellPathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function isCurrentShellRoute(
  pathname: string | null | undefined,
  route: ShellRoute,
): boolean {
  return (
    typeof pathname === "string" && normalizeShellPathname(pathname) === route
  );
}
