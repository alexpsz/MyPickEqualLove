"use client";

import { useShell } from "@/i18n/shell/shell-context";
import { SHELL_ROUTES } from "@/i18n/shell/shell-routes";

export function AtlasHome() {
  const { messages } = useShell();

  return (
    <div className="atlas-home" id="atlas-home">
      <section className="atlas-home__hero" aria-labelledby="atlas-home-title">
        <h1 id="atlas-home-title">{messages.home.title}</h1>
        <p className="atlas-home__intro">{messages.home.description}</p>
        <div className="atlas-home__hero-actions">
          <a className="atlas-home__primary-action" href={SHELL_ROUTES.events}>
            {messages.home.primaryAction}
            <HomeIcon name="arrow" />
          </a>
          <a
            className="atlas-home__secondary-action"
            href={SHELL_ROUTES.journey}
          >
            {messages.home.secondaryAction}
            <HomeIcon name="arrow" />
          </a>
        </div>
      </section>

      <section
        aria-label={messages.home.quickActionsLabel}
        className="atlas-home__quick-actions"
      >
        <a className="atlas-home__quick-action" href={SHELL_ROUTES.journey}>
          <span aria-hidden="true" className="atlas-home__quick-action-icon">
            <HomeIcon name="journey" />
          </span>
          <span className="atlas-home__quick-action-copy">
            <strong>{messages.home.journeyTitle}</strong>
            <span>{messages.home.journeyDescription}</span>
          </span>
          <HomeIcon name="chevron" />
        </a>
        <a className="atlas-home__quick-action" href={SHELL_ROUTES.memory}>
          <span aria-hidden="true" className="atlas-home__quick-action-icon">
            <HomeIcon name="memory" />
          </span>
          <span className="atlas-home__quick-action-copy">
            <strong>{messages.home.memoryTitle}</strong>
            <span>{messages.home.memoryDescription}</span>
          </span>
          <HomeIcon name="chevron" />
        </a>
        <a className="atlas-home__quick-action" href={SHELL_ROUTES.localEvent}>
          <span aria-hidden="true" className="atlas-home__quick-action-icon">
            <HomeIcon name="events" />
          </span>
          <span className="atlas-home__quick-action-copy">
            <strong>{messages.home.localEventTitle}</strong>
            <span>{messages.home.localEventDescription}</span>
          </span>
          <HomeIcon name="chevron" />
        </a>
      </section>
    </div>
  );
}

function HomeIcon({
  name,
}: {
  name: "arrow" | "chevron" | "events" | "journey" | "memory";
}) {
  return (
    <svg
      aria-hidden="true"
      className="atlas-home__icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      {name === "arrow" ? <path d="M5 12h14m-5-5 5 5-5 5" /> : null}
      {name === "chevron" ? <path d="m9 6 6 6-6 6" /> : null}
      {name === "events" ? (
        <>
          <path d="M5 7.5h14M7.5 4v7M16.5 4v7" />
          <rect height="16" rx="2.5" width="18" x="3" y="5" />
          <path d="M7 14h3M14 14h3M7 17.5h3" />
        </>
      ) : null}
      {name === "journey" ? (
        <>
          <rect height="14" rx="2" width="16" x="4" y="6" />
          <path d="M8 3v6M16 3v6M4 11h16M12 14v4M10 16h4" />
        </>
      ) : null}
      {name === "memory" ? (
        <>
          <rect height="16" rx="2.5" width="18" x="3" y="4" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="m5.5 17 4.5-4.5 3 3 2-2 3.5 3.5" />
        </>
      ) : null}
    </svg>
  );
}
