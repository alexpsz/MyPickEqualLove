export const SHELL_ROUTES = {
  home: "/",
  events: "/events/",
  journey: "/journey/",
  memory: "/memory/",
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
  if (typeof pathname !== "string") return false;
  const normalized = normalizeShellPathname(pathname);
  return route === SHELL_ROUTES.events
    ? normalized.startsWith(SHELL_ROUTES.events)
    : normalized === route;
}
