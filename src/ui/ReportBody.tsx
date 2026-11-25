import { Accordion } from '@base-ui/react/accordion';
import type { ReactNode } from 'react';
import type { ReportBody } from '../../shared/report-schema.ts';

type SectionKey = 'findings' | 'unlinked' | 'objections' | 'rejected' | 'questions';

const ALL: SectionKey[] = ['findings', 'unlinked', 'objections', 'rejected', 'questions'];

/**
 * The fixed template, summary first. Readers open sections as they need them
 * (Clarification). The author reviewing a draft sees everything open.
 * Evidence sits under the finding it supports (RPT-3, "linked where possible"), so a reader
 * never has to match numbers between two sections.
 */
export function ReportBodyView({ body: content, openAll = false }: { body: ReportBody; openAll?: boolean }) {
  const evidenceFor = (n: number) => content.evidence.filter((e) => e.supports === n);
  const unlinked = content.evidence.filter((e) => e.supports < 1 || e.supports > content.findings.length);
  return (
    <div className="flex flex-col gap-6 [overflow-wrap:anywhere]">
      <section aria-labelledby="summary-heading">
        <h3 id="summary-heading" className="mb-2 text-[15px] font-semibold text-ink">
          Summary
        </h3>
        <p className="text-[17px] leading-[1.6] text-pretty text-ink">{content.summary}</p>
      </section>

      <Accordion.Root multiple defaultValue={openAll ? ALL : []} className="border-t border-line">
        <Section value="findings" title="Findings" count={content.findings.length} empty="No findings.">
          {content.findings.map((f, i) => (
            <Item key={i} main={f.text} label="Reason" detail={f.reason}>
              {evidenceFor(i + 1).length > 0 && (
                <div className="mt-2">
                  <p className="text-[13px] font-medium text-ink-3">Evidence</p>
                  <ul className="mt-1 flex flex-col gap-1.5 border-l-2 border-line pl-3">
                    {evidenceFor(i + 1).map((e, j) => (
                      <li key={j} className="text-[14px] leading-relaxed text-ink-2">
                        {e.text}
                        {e.source && <span className="text-ink-3"> · {e.source}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Item>
          ))}
        </Section>
        {unlinked.length > 0 && (
          <Section value="unlinked" title="Other evidence" count={unlinked.length} empty="">
            {unlinked.map((e, i) => (
              <li key={i} className="text-[15px] leading-relaxed text-ink">
                {e.text}
                {e.source && <span className="text-ink-3"> · {e.source}</span>}
              </li>
            ))}
          </Section>
        )}
        <Section value="objections" title="Objections" count={content.objections.length} empty="No objections were raised.">
          {content.objections.map((o, i) => (
            <Item key={i} main={o.text} label="Why it matters" detail={o.reason} />
          ))}
        </Section>
        <Section
          value="rejected"
          title="Rejected directions"
          count={content.rejected_directions.length}
          empty="Nothing was ruled out."
        >
          {content.rejected_directions.map((r, i) => (
            <Item key={i} main={r.text} label="Dropped because" detail={r.reason} />
          ))}
        </Section>
        <Section value="questions" title="Open questions" count={content.open_questions.length} empty="No open questions.">
          {content.open_questions.map((q, i) => (
            <li key={i} className="text-[15px] leading-relaxed text-ink">
              {q.text}
            </li>
          ))}
        </Section>
      </Accordion.Root>
    </div>
  );
}

function Section({
  value,
  title,
  count,
  empty,
  children,
}: {
  value: SectionKey;
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Accordion.Item value={value} className="border-b border-line">
      <Accordion.Header className="m-0">
        <Accordion.Trigger className="pressable key-quiet group -mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-md px-2 py-4 text-left hover:text-ink">
          <span aria-hidden className="accordion-chevron text-[11px] text-ink-3">
            ▶
          </span>
          <span className="flex-1 text-[15px] font-semibold">{title}</span>
          <span className="text-[13px] text-ink-3 tabular-nums">{count}</span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className="accordion-panel">
        <div className="pb-5 pl-6">
          {count === 0 ? (
            <p className="text-[14px] text-ink-3">{empty}</p>
          ) : (
            <ol className="flex list-decimal flex-col gap-4 pl-4 marker:text-[13px] marker:text-ink-3">{children}</ol>
          )}
        </div>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function Item({ main, label, detail, children }: { main: string; label: string; detail: string; children?: ReactNode }) {
  return (
    <li className="pl-1">
      <p className="text-[15px] leading-relaxed text-ink">{main}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
        <span className="font-medium text-ink-3">{label}: </span>
        {detail}
      </p>
      {children}
    </li>
  );
}
