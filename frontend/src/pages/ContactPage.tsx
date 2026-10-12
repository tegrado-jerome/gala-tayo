import { useState, type FormEvent } from 'react'
import { EnvelopeSimple } from '@phosphor-icons/react/dist/csr/EnvelopeSimple'
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import HoneypotField from '../components/HoneypotField'
import InternalLink from '../components/InternalLink'
import LegalFooter from '../components/navigation/LegalFooter'
import RatingPicker from '../components/RatingPicker'
import SeoHead from '../components/SeoHead'
import { Button, Page } from '../components/ui'
import '../design/misc.css'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { legalContactEmail } from '../data/legalPages'
import { getApiUrl } from '../utils/apiClient'
import { composeContactComment, contactMailtoUrl, contactMessageRoom, contactTopics, type ContactTopic } from '../utils/contactForm'
import { getSiteOrigin } from '../utils/seo'

const TITLE = 'Contact GalaTayo | Questions, place tips and problems'
const DESCRIPTION = 'Message the GalaTayo team: ask a question, suggest a place we missed, report a problem or reach us for partnerships and press.'

type Status = 'idle' | 'sending' | 'sent' | 'mailto'

function ContactPage() {
  const { session } = useSavedFavorites()
  const [topic, setTopic] = useState<ContactTopic>(contactTopics[0])
  const [message, setMessage] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const [rating, setRating] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [missing, setMissing] = useState<'message' | 'rating' | null>(null)
  const [website, setWebsite] = useState('')

  const room = contactMessageRoom({ topic, replyEmail })
  const mailto = contactMailtoUrl(legalContactEmail, { topic, message })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    if (!message.trim()) {
      setMissing('message')
      setErrorMessage('Write your message first.')
      document.getElementById('contact-message')?.focus()
      return
    }
    if (rating < 1) {
      setMissing('rating')
      setErrorMessage("Pick how GalaTayo is working for you so far. It's one tap!")
      return
    }
    setMissing(null)
    setStatus('sending')

    try {
      const response = await fetch(getApiUrl('/feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ rating, comment: composeContactComment({ topic, message, replyEmail }), website }),
      })
      // An API that still refuses guest feedback answers 401; the message then goes out by email.
      if (response.status === 401) {
        setStatus('mailto')
        window.location.href = mailto
        return
      }
      const result = (await response.json().catch(() => ({}))) as { message?: string }
      if (!response.ok) throw new Error(result.message || "Your message didn't go through.")
      setStatus('sent')
      setMessage('')
      setRating(0)
    } catch (error) {
      setStatus('idle')
      setErrorMessage(error instanceof Error ? error.message : "Your message didn't go through.")
    }
  }

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: TITLE,
      description: DESCRIPTION,
      url: `${getSiteOrigin()}/contact`,
      mainEntity: { '@id': `${getSiteOrigin()}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: 'Contact', item: `${getSiteOrigin()}/contact` },
      ],
    },
  ]

  return (
    <Page narrow className="lg:max-w-[1080px]">
      <SeoHead title={TITLE} description={DESCRIPTION} canonicalPath="/contact" jsonLd={jsonLd} />
      <MinimalBackNav to="/" label="Home" preferHistory={false} />

      <header className="m-art-head mt-2">
        <span className="m-art-ic" aria-hidden="true">
          <EnvelopeSimple weight="light" />
        </span>
        <p className="m-onb-step">Contact</p>
        <h1 className="g-h1 mt-1.5">Message the GalaTayo team</h1>
        <p className="g-mut mt-2 text-[16px]">A question, a place we missed, or something broken? Tell us. We read every message!</p>
      </header>

      {status === 'sent' ? (
        <p className="g-sm mt-6 flex items-center gap-2 rounded-[var(--r-2)] bg-[var(--ok-soft)] px-3.5 py-3 font-semibold text-[var(--ok)]" role="status">
          <CheckCircle weight="fill" className="h-5 w-5 shrink-0" aria-hidden="true" />
          Sent! Salamat, we got your message.
        </p>
      ) : null}

      {status === 'mailto' ? (
        <p className="g-sm mt-6 rounded-[var(--r-2)] bg-[var(--fill)] px-3.5 py-3" role="status">
          We opened your email app with your message. Nothing opened? Email us at{' '}
          <a className="font-semibold underline underline-offset-[3px]" href={mailto}>
            {legalContactEmail}
          </a>
          .
        </p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-12">
      <form className="mt-6 grid gap-7" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="g-field">
          <label htmlFor="contact-topic">What's it about?</label>
          <select id="contact-topic" className="g-input g-select text-[16px]" value={topic} onChange={(event) => setTopic(event.target.value as ContactTopic)}>
            {contactTopics.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="g-field">
          <label htmlFor="contact-message">Your message</label>
          <textarea
            id="contact-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={room}
            rows={6}
            placeholder="Spill it! The more detail, the faster we can help."
            className="g-input min-h-40 py-3 text-[16px] leading-relaxed"
            aria-invalid={missing === 'message' || undefined}
            aria-describedby="contact-message-count"
          />
          <span id="contact-message-count" className="g-hint text-right">
            {message.length} / {room}
          </span>
        </div>

        <div className="g-field">
          <label htmlFor="contact-email">Your email, if you want a reply (optional)</label>
          <input
            id="contact-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={replyEmail}
            onChange={(event) => setReplyEmail(event.target.value)}
            className="g-input text-[16px]"
          />
        </div>

        <RatingPicker legend="How's GalaTayo working for you so far?" value={rating} onChange={setRating} />
        <HoneypotField value={website} onChange={setWebsite} />

        {errorMessage ? (
          <p className="g-hint is-error -mt-2" role="alert">
            {errorMessage}{' '}
            {status === 'idle' && !missing ? (
              <>
                You can also email{' '}
                <a className="font-semibold underline underline-offset-[3px]" href={mailto}>
                  {legalContactEmail}
                </a>
                .
              </>
            ) : null}
          </p>
        ) : null}

        <Button type="submit" variant="tara" size="lg" loading={status === 'sending'} disabled={status === 'sending'} className="w-full sm:w-auto sm:justify-self-start">
          {status === 'sending' ? 'Sending…' : 'Send message'}
        </Button>
      </form>

      <section className="m-prose mt-10 max-w-[65ch] lg:sticky lg:top-24 lg:mt-6 lg:rounded-[var(--r-3)] lg:bg-[var(--fill)] lg:p-6" aria-labelledby="contact-other">
        <h2 id="contact-other" className="g-h2">
          Other ways to reach us
        </h2>
        <p className="mt-3">
          Email{' '}
          <a className="underline underline-offset-[3px]" href={`mailto:${legalContactEmail}`}>
            {legalContactEmail}
          </a>
          . Own a photo on GalaTayo? See{' '}
          <InternalLink href="/copyright" className="underline underline-offset-[3px]">
            copyright and takedown
          </InternalLink>
          . For your data or account deletion, use the{' '}
          <InternalLink href="/privacy-center" className="underline underline-offset-[3px]">
            privacy center
          </InternalLink>
          .
        </p>
      </section>
      </div>
      <LegalFooter />
    </Page>
  )
}

export default ContactPage
