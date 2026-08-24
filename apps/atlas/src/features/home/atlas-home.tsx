"use client";

import { useShell } from "@/i18n/shell/shell-context";
import { SHELL_ROUTES } from "@/i18n/shell/shell-routes";

export function AtlasHome() {
  const { messages } = useShell();

  return (
    <div className="atlas-home" id="atlas-home">
      <section className="atlas-home__hero" aria-labelledby="atlas-home-title">
        <p className="atlas-home__eyebrow">{messages.home.eyebrow}</p>
        <h1 id="atlas-home-title">{messages.home.title}</h1>
        <p className="atlas-home__intro">{messages.home.description}</p>
        <a
          aria-describedby="atlas-home-action-hint"
          className="atlas-home__primary-action"
          href={SHELL_ROUTES.localEvent}
        >
          {messages.home.primaryAction}
          <span aria-hidden="true">→</span>
        </a>
        <p className="atlas-home__action-hint" id="atlas-home-action-hint">
          {messages.home.primaryActionHint}
        </p>
      </section>

      <section
        aria-labelledby="your-journey-title"
        className="atlas-home__section"
        id="your-journey"
        tabIndex={-1}
      >
        <div className="atlas-home__section-heading">
          <p>{messages.home.emptyStateLabel}</p>
          <h2 id="your-journey-title">{messages.home.emptyStateTitle}</h2>
        </div>
        <div className="atlas-home__journey-card">
          <span aria-hidden="true" className="atlas-home__journey-orbit" />
          <p>{messages.home.emptyStateDescription}</p>
        </div>
      </section>

      <section
        aria-labelledby="local-custom-event-title"
        className="atlas-home__section atlas-home__section--grid"
        id="local-custom-event"
        tabIndex={-1}
      >
        <article className="atlas-home__information-card">
          <p className="atlas-home__card-kicker">Atlas</p>
          <h2 id="local-custom-event-title">{messages.home.localEventTitle}</h2>
          <p>{messages.home.localEventDescription}</p>
          <div className="atlas-home__action-slot" role="status">
            <strong>{messages.home.localEventAction}</strong>
            <span>{messages.home.localEventStatus}</span>
          </div>
        </article>
        <article className="atlas-home__information-card">
          <p className="atlas-home__card-kicker">Atlas</p>
          <h2>{messages.home.privacyTitle}</h2>
          <p>{messages.home.privacyDescription}</p>
        </article>
        <article className="atlas-home__information-card atlas-home__information-card--quiet">
          <p className="atlas-home__card-kicker">Atlas</p>
          <h2>{messages.home.sourceStatusTitle}</h2>
          <p>{messages.home.sourceStatusDescription}</p>
        </article>
      </section>
    </div>
  );
}
