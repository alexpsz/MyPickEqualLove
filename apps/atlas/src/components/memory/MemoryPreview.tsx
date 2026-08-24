import type { MemoryDrawPlan } from "../../share/memory-draw-plan.js";

interface MemoryPreviewProps {
  readonly plan: MemoryDrawPlan;
  readonly className?: string;
}

/** The DOM preview receives the same draw plan as Canvas, never Journey data. */
export function MemoryPreview({ className, plan }: MemoryPreviewProps) {
  return (
    <article
      className={className}
      data-memory-preview
      data-memory-template={plan.templateId}
    >
      <div data-memory-preview-heading>
        <p data-memory-preview-group>{plan.groupName}</p>
        <h3 data-memory-preview-title>{plan.eventName}</h3>
        <p data-memory-preview-date>
          <strong>{plan.dateLabel}</strong>
          <span>{plan.date}</span>
        </p>
      </div>

      <div data-memory-preview-details>
        {plan.sections.length === 0 ? (
          <p data-memory-preview-empty>{plan.noOptionalDetails}</p>
        ) : (
          <dl>
            {plan.sections.map((section, sectionIndex) => (
              <div data-memory-preview-section key={sectionIndex}>
                <dt>{section.label}</dt>
                {section.values.map((value, valueIndex) => (
                  <dd key={valueIndex}>{value}</dd>
                ))}
              </div>
            ))}
          </dl>
        )}
      </div>

      <p data-memory-preview-privacy>{plan.privacyLine}</p>
    </article>
  );
}
