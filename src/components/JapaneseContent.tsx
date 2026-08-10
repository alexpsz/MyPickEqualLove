import { Fragment, type ReactNode } from "react";

export default function JapaneseContent({ children }: { children: ReactNode }) {
  return (
    <span lang="ja" className="japanese-content">
      {children}
    </span>
  );
}

export function LocalizedTextWithJapaneseValue({
  text,
  value,
}: {
  text: string;
  value: string;
}) {
  if (!value || !text.includes(value)) return text;

  return text.split(value).map((segment, index) => (
    <Fragment key={`${index}-${segment}`}>
      {index > 0 ? <JapaneseContent>{value}</JapaneseContent> : null}
      {segment}
    </Fragment>
  ));
}
