import { Plus, Trash2 } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { REPORT_DECISION_LIMIT, type ReportBody } from '../../shared/report-schema.ts';
import { Button } from './Button.tsx';
import { Select } from './Select.tsx';
import { cx } from './cx.ts';

/**
 * The author edits the AI's draft in place before approving (Micro PRD RPT-5). The draft reads
 * like the finished report; clicking any text puts the cursor in it. Items can be removed or added.
 * The template rules still hold: a finding, objection or rejected direction cannot be saved without
 * its reason, and evidence must point to a finding.
 */

type Reasoned = { k: string; text: string; reason: string };
type Evidence = { k: string; text: string; source: string; supports: number };
type Question = { k: string; text: string };

export interface EditableReport {
  title: string;
  summary: string;
  findings: Reasoned[];
  evidence: Evidence[];
  objections: Reasoned[];
  rejected_directions: Reasoned[];
  open_questions: Question[];
  decision: string;
}

let seq = 0;
const key = () => `i${++seq}`;

export function toEditable(b: ReportBody): EditableReport {
  return {
    title: b.title,
    summary: b.summary,
    findings: b.findings.map((f) => ({ k: key(), ...f })),
    evidence: b.evidence.map((e) => ({ k: key(), text: e.text, source: e.source ?? '', supports: e.supports })),
    objections: b.objections.map((o) => ({ k: key(), ...o })),
    rejected_directions: b.rejected_directions.map((r) => ({ k: key(), ...r })),
    open_questions: b.open_questions.map((q) => ({ k: key(), text: q.text })),
    decision: b.decision ?? '',
  };
}

export function fromEditable(e: EditableReport): ReportBody {
  const t = (s: string) => s.trim();
  return {
    title: t(e.title),
    summary: t(e.summary),
    findings: e.findings.map((f) => ({ text: t(f.text), reason: t(f.reason) })),
    evidence: e.evidence.map((x) => ({ text: t(x.text), source: t(x.source) || null, supports: x.supports })),
    objections: e.objections.map((o) => ({ text: t(o.text), reason: t(o.reason) })),
    rejected_directions: e.rejected_directions.map((r) => ({ text: t(r.text), reason: t(r.reason) })),
    open_questions: e.open_questions.map((q) => ({ text: t(q.text) })),
    ...(t(e.decision) ? { decision: t(e.decision) } : {}),
  };
}

/** Field id → message, in reading order. Empty when the report can be saved. */
export function validate(e: EditableReport): Record<string, string> {
  const errs: Record<string, string> = {};
  const blank = (s: string) => !s.trim();
  if (blank(e.title)) errs['report-title'] = 'Give the report a title.';
  if (blank(e.summary)) errs['report-summary'] = 'Write a summary. It is the first thing people read.';
  const reasoned = (list: Reasoned[], what: string) =>
    list.forEach((x) => {
      if (blank(x.text)) errs[`${x.k}-text`] = `Write the ${what}, or remove it.`;
      if (blank(x.reason)) errs[`${x.k}-reason`] = `Add a reason, or remove this ${what}.`;
    });
  reasoned(e.findings, 'finding');
  e.evidence.forEach((x) => {
    if (blank(x.text)) errs[`${x.k}-text`] = 'Write the evidence, or remove it.';
    if (x.supports < 1 || x.supports > e.findings.length)
      errs[`${x.k}-supports`] = e.findings.length ? 'Pick the finding this supports.' : 'Add a finding first, or remove this evidence.';
  });
  reasoned(e.objections, 'objection');
  reasoned(e.rejected_directions, 'rejected direction');
  e.open_questions.forEach((x) => {
    if (blank(x.text)) errs[`${x.k}-text`] = 'Write the question, or remove it.';
  });
  if (e.decision.trim().length > REPORT_DECISION_LIMIT) errs['report-decision'] = `Keep the decision under ${REPORT_DECISION_LIMIT} characters.`;
  return errs;
}

/**
 * Reads exactly like the report: no outline on hover and no box on focus (user decision, 25 Nov).
 * The text cursor shows where you are typing. A box that cannot be saved gets a red border.
 */
const inlineCls =
  '-mx-2 block w-[calc(100%+16px)] cursor-text resize-none [field-sizing:content] rounded-md border border-transparent bg-transparent px-2 py-1 text-ink outline-none focus-visible:outline-none aria-[invalid=true]:border-danger';
const smallCtl =
  'h-8 rounded-md border border-transparent bg-transparent px-1.5 text-[13px] text-ink-2 outline-none focus-visible:outline-none aria-[invalid=true]:border-danger';

/** The report title, placed inside the report header by the caller. */
export function TitleField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <textarea
        id="report-title"
        aria-label="Report title"
        rows={1}
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'report-title-err' : undefined}
        className={cx(inlineCls, 'text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance')}
      />
      {error && (
        <p id="report-title-err" className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ReportEditor({
  value,
  onChange,
  errors,
}: {
  value: EditableReport;
  onChange: (fn: (e: EditableReport) => EditableReport) => void;
  errors: Record<string, string>;
}) {
  const set = <K extends keyof EditableReport>(k: K, v: EditableReport[K]) => onChange((e) => ({ ...e, [k]: v }));

  // Evidence sits under the finding it supports. Removing a finding removes its evidence; later numbers shift down.
  const removeFinding = (i: number) =>
    onChange((e) => ({
      ...e,
      findings: e.findings.filter((_, j) => j !== i),
      evidence: e.evidence.filter((x) => x.supports !== i + 1).map((x) => (x.supports > i + 1 ? { ...x, supports: x.supports - 1 } : x)),
    }));
  const setEvidence = (k: string, p: Partial<Evidence>) => set('evidence', value.evidence.map((y) => (y.k === k ? { ...y, ...p } : y)));
  const removeEvidence = (k: string) => set('evidence', value.evidence.filter((y) => y.k !== k));
  const addEvidence = (supports: number) => {
    const k = key();
    onChange((e) => ({ ...e, evidence: [...e.evidence, { k, text: '', source: '', supports }] }));
    setTimeout(() => document.getElementById(`${k}-text`)?.focus());
  };
  // Evidence the AI tied to no existing finding: shown on its own so it can be pointed at one or removed.
  const orphans = value.evidence.filter((x) => x.supports < 1 || x.supports > value.findings.length);

  return (
    <div className="flex flex-col gap-6 [overflow-wrap:anywhere]">
      <section>
        <label htmlFor="report-summary" className="mb-2 block text-[15px] font-semibold text-ink">
          Summary
        </label>
        <textarea
          id="report-summary"
          rows={3}
          value={value.summary}
          onChange={(e) => set('summary', e.target.value)}
          aria-invalid={Boolean(errors['report-summary'])}
          aria-describedby={errors['report-summary'] ? 'report-summary-err' : undefined}
          className={cx(inlineCls, 'text-[17px] leading-[1.6] text-pretty')}
        />
        <Err id="report-summary" errors={errors} />
      </section>

      <div className="border-t border-line">
        <ListSection title="Findings" addLabel="Add finding" onAdd={() => set('findings', [...value.findings, { k: key(), text: '', reason: '' }])}>
          {value.findings.map((f, i) => (
            <ReasonedItem
              key={f.k}
              n={i + 1}
              what="finding"
              reasonLabel="Reason"
              item={f}
              errors={errors}
              onChange={(p) => set('findings', value.findings.map((x) => (x.k === f.k ? { ...x, ...p } : x)))}
              onRemove={() => removeFinding(i)}
            >
              <EvidenceList
                items={value.evidence.filter((x) => x.supports === i + 1)}
                finding={i + 1}
                errors={errors}
                onChange={setEvidence}
                onRemove={removeEvidence}
                onAdd={() => addEvidence(i + 1)}
              />
            </ReasonedItem>
          ))}
        </ListSection>

        {orphans.length > 0 && (
          <section className="flex flex-col gap-3 border-b border-line py-4">
            <h3 className="text-[15px] font-semibold text-ink">Evidence not tied to a finding</h3>
            <ol className="flex flex-col gap-4 pl-6">
              {orphans.map((x, i) => (
                <ItemShell key={x.k} n={i + 1} what="evidence" onRemove={() => removeEvidence(x.k)}>
                  <Text id={`${x.k}-text`} label={`Evidence ${i + 1}`} value={x.text} errors={errors} onChange={(v) => setEvidence(x.k, { text: v })} />
                  <div className="-ml-1.5 flex flex-wrap items-center gap-x-1 text-[13px] text-ink-3">
                    <label htmlFor={`${x.k}-supports`} className="pl-1.5 font-medium">
                      Supports
                    </label>
                    <Select
                      id={`${x.k}-supports`}
                      value={null}
                      onChange={(v) => setEvidence(x.k, { supports: Number(v) })}
                      options={value.findings.map((_, j) => ({ value: String(j + 1), label: `Finding ${j + 1}` }))}
                      placeholder="Pick a finding"
                      invalid={Boolean(errors[`${x.k}-supports`])}
                      describedBy={errors[`${x.k}-supports`] ? `${x.k}-supports-err` : undefined}
                    />
                  </div>
                  <Err id={`${x.k}-supports`} errors={errors} />
                </ItemShell>
              ))}
            </ol>
          </section>
        )}

        <ListSection title="Open questions" addLabel="Add question" onAdd={() => set('open_questions', [...value.open_questions, { k: key(), text: '' }])}>
          {value.open_questions.map((q, i) => (
            <ItemShell key={q.k} n={i + 1} what="question" onRemove={() => set('open_questions', value.open_questions.filter((x) => x.k !== q.k))}>
              <Text id={`${q.k}-text`} label={`Question ${i + 1}`} value={q.text} errors={errors} onChange={(v) => set('open_questions', value.open_questions.map((x) => (x.k === q.k ? { ...x, text: v } : x)))} />
            </ItemShell>
          ))}
        </ListSection>

        <details open={Boolean(value.objections.length || value.rejected_directions.length) || undefined}>
          <summary className="cursor-pointer rounded-md py-3 text-[13px] font-medium text-ink-2">Objections and rejected directions</summary>
          <ListSection title="Objections" addLabel="Add objection" onAdd={() => set('objections', [...value.objections, { k: key(), text: '', reason: '' }])}>
            {value.objections.map((o, i) => (
              <ReasonedItem
                key={o.k}
                n={i + 1}
                what="objection"
                reasonLabel="Why it matters"
                item={o}
                errors={errors}
                onChange={(p) => set('objections', value.objections.map((x) => (x.k === o.k ? { ...x, ...p } : x)))}
                onRemove={() => set('objections', value.objections.filter((x) => x.k !== o.k))}
              />
            ))}
          </ListSection>

          <ListSection title="Rejected directions" addLabel="Add rejected direction" onAdd={() => set('rejected_directions', [...value.rejected_directions, { k: key(), text: '', reason: '' }])}>
            {value.rejected_directions.map((r, i) => (
              <ReasonedItem
                key={r.k}
                n={i + 1}
                what="rejected direction"
                reasonLabel="Dropped because"
                item={r}
                errors={errors}
                onChange={(p) => set('rejected_directions', value.rejected_directions.map((x) => (x.k === r.k ? { ...x, ...p } : x)))}
                onRemove={() => set('rejected_directions', value.rejected_directions.filter((x) => x.k !== r.k))}
              />
            ))}
          </ListSection>
        </details>
      </div>
      <section>
        <label htmlFor="report-decision" className="mb-2 block text-[15px] font-semibold text-ink">
          Decision <span className="text-[13px] font-normal text-ink-3">(optional)</span>
        </label>
        <textarea
          id="report-decision"
          rows={2}
          maxLength={REPORT_DECISION_LIMIT}
          value={value.decision}
          onChange={(e) => set('decision', e.target.value)}
          placeholder="What did you decide?"
          aria-invalid={Boolean(errors['report-decision'])}
          aria-describedby={errors['report-decision'] ? 'report-decision-err' : undefined}
          className="block w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus-visible:border-accent aria-[invalid=true]:border-danger"
        />
        <Err id="report-decision" errors={errors} />
      </section>
    </div>
  );
}

function ListSection({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: ReactNode[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  const add = () => {
    onAdd();
    // Put the cursor in the new item's first box.
    setTimeout(() => listRef.current?.querySelector<HTMLTextAreaElement>(':scope > li:last-child textarea')?.focus());
  };
  return (
    <section className="flex flex-col gap-3 border-b border-line py-4">
      {children.length > 0 && <h3 className="text-[15px] font-semibold text-ink">{title}</h3>}
      {children.length > 0 && (
        <ol ref={listRef} className="flex flex-col gap-4 pl-6">
          {children}
        </ol>
      )}
      <div className="pl-4">
        <Button variant="ghost" size="sm" onClick={add}>
          <Plus aria-hidden size={16} strokeWidth={1.75} className="size-4 shrink-0" /> {addLabel}
        </Button>
      </div>
    </section>
  );
}

function ItemShell({ n, what, onRemove, children }: { n: number; what: string; onRemove: () => void; children: ReactNode }) {
  return (
    <li className="group flex gap-3">
      <span aria-hidden className="w-4 shrink-0 pt-1.5 text-right text-[13px] text-ink-3 tabular-nums">
        {n}.
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      {/* Shown on hover, or when the keyboard reaches it. */}
      <Button
        variant="ghost"
        size="sm"
        className="w-8 px-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Remove ${what} ${n}`}
        onClick={onRemove}
      >
        <Trash2 aria-hidden size={16} strokeWidth={1.75} className="size-4 shrink-0" />
      </Button>
    </li>
  );
}

function ReasonedItem({
  n,
  what,
  reasonLabel,
  item,
  errors,
  onChange,
  onRemove,
  children,
}: {
  n: number;
  what: string;
  reasonLabel: string;
  item: Reasoned;
  errors: Record<string, string>;
  onChange: (p: Partial<Reasoned>) => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const label = what.charAt(0).toUpperCase() + what.slice(1);
  return (
    <ItemShell n={n} what={what} onRemove={onRemove}>
      <Text id={`${item.k}-text`} label={`${label} ${n}`} value={item.text} errors={errors} onChange={(v) => onChange({ text: v })} />
      <label htmlFor={`${item.k}-reason`} className="mt-1 text-[13px] font-medium text-ink-3">
        {reasonLabel}
      </label>
      <Text id={`${item.k}-reason`} value={item.reason} errors={errors} onChange={(v) => onChange({ reason: v })} small />
      {children}
    </ItemShell>
  );
}

/** A finding's evidence, right under it: each fact with where it came from. */
function EvidenceList({
  items,
  finding,
  errors,
  onChange,
  onRemove,
  onAdd,
}: {
  items: Evidence[];
  finding: number;
  errors: Record<string, string>;
  onChange: (k: string, p: Partial<Evidence>) => void;
  onRemove: (k: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-2">
      {items.length > 0 && (
        <>
          <p className="text-[13px] font-medium text-ink-3">Evidence</p>
          <ul className="flex flex-col gap-2 border-l-2 border-line pl-3">
            {items.map((x, j) => (
              <li key={x.k} className="group/ev flex gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Text id={`${x.k}-text`} label={`Evidence ${j + 1} for finding ${finding}`} value={x.text} errors={errors} onChange={(v) => onChange(x.k, { text: v })} small />
                  <div className="-ml-1.5 flex items-center gap-x-1 text-[13px] text-ink-3">
                    <label htmlFor={`${x.k}-source`} className="pl-1.5">
                      Source
                    </label>
                    <input
                      id={`${x.k}-source`}
                      value={x.source}
                      placeholder="None"
                      onChange={(e) => onChange(x.k, { source: e.target.value })}
                      className={cx(smallCtl, 'h-7 min-w-40 flex-1 text-ink-3 placeholder:text-ink-3')}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-8 px-0 opacity-0 group-hover/ev:opacity-100 group-focus-within/ev:opacity-100 focus-visible:opacity-100"
                  aria-label={`Remove evidence ${j + 1} for finding ${finding}`}
                  onClick={() => onRemove(x.k)}
                >
                  <Trash2 aria-hidden size={16} strokeWidth={1.75} className="size-4 shrink-0" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="-ml-3">
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus aria-hidden size={16} strokeWidth={1.75} className="size-4 shrink-0" /> Add evidence
        </Button>
      </div>
    </div>
  );
}

function Text({
  id,
  label,
  value,
  errors,
  onChange,
  small = false,
}: {
  id: string;
  label?: string;
  value: string;
  errors: Record<string, string>;
  onChange: (v: string) => void;
  small?: boolean;
}) {
  const err = errors[id];
  return (
    <>
      <textarea
        id={id}
        aria-label={label}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(err)}
        aria-describedby={err ? `${id}-err` : undefined}
        className={cx(inlineCls, small ? 'text-[14px] leading-relaxed text-ink-2' : 'text-[15px] leading-relaxed')}
      />
      <Err id={id} errors={errors} />
    </>
  );
}

function Err({ id, errors }: { id: string; errors: Record<string, string> }) {
  return errors[id] ? (
    <p id={`${id}-err`} className="text-[13px] text-danger">
      {errors[id]}
    </p>
  ) : null;
}
