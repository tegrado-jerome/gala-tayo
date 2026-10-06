import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import '../design/misc.css'
import type { Faq } from '../utils/seoAnswers'

/** Answer-first summary (who it's for, cost, how to get there) that search and AI answers can quote. */
export function QuickAnswer({ rows }: { rows: Array<{ label: string; value: string | null | undefined }> }) {
  const shown = rows.filter((row): row is { label: string; value: string } => Boolean(row.value))
  if (!shown.length) return null
  return (
    <section className="m-answer" aria-labelledby="quick-answer-title">
      <h2 id="quick-answer-title">Quick answer</h2>
      <dl>
        {shown.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="m-faq mt-4">
      {faqs.map((faq, index) => (
        <details key={faq.question} open={index === 0}>
          <summary>
            {faq.question}
            <CaretDown aria-hidden="true" />
          </summary>
          <p>{faq.answer}</p>
        </details>
      ))}
    </div>
  )
}
