import { Fragment } from 'react';
import { parseRichText, type RichSpan } from '@vtt/shared';

/** Pinta texto con formato sencillo (sin HTML: nada de lo que se escribe se ejecuta). */
export function RichText({ text }: { text: string }) {
  return (
    <div className="rich-text">
      {parseRichText(text).map((b, i) => {
        if (b.type === 'ul')
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Spans spans={it} />
                </li>
              ))}
            </ul>
          );
        const Tag = b.type;
        return (
          <Tag key={i}>
            <Spans spans={b.spans} />
          </Tag>
        );
      })}
    </div>
  );
}

function Spans({ spans }: { spans: RichSpan[] }) {
  return (
    <>
      {spans.map((s, i) => {
        const lines = s.text.split('\n').map((l, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {l}
          </Fragment>
        ));
        if (s.bold) return <strong key={i}>{lines}</strong>;
        if (s.italic) return <em key={i}>{lines}</em>;
        return <Fragment key={i}>{lines}</Fragment>;
      })}
    </>
  );
}
