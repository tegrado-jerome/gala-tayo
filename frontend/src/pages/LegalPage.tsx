import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Copyright } from '@phosphor-icons/react/dist/csr/Copyright'
import { Cookie } from '@phosphor-icons/react/dist/csr/Cookie'
import { Info } from '@phosphor-icons/react/dist/csr/Info'
import { Scales } from '@phosphor-icons/react/dist/csr/Scales'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import Breadcrumb from '../components/navigation/Breadcrumb'
import InternalLink from '../components/InternalLink'
import SeoHead from '../components/SeoHead'
import { Button, KeyValue, Page } from '../components/ui'
import { useCookieConsent } from '../context/CookieConsentContext'
import { LEGAL_UPDATED, legalDocs } from '../data/legalContent'
import { legalContactEmail, legalPages, type LegalPageType } from '../data/legalPages'
import { getSiteOrigin } from '../utils/seo'
import '../design/misc.css'

const icons: Record<LegalPageType, PhosphorIcon> = {
  privacy: ShieldCheck,
  terms: Scales,
  cookies: Cookie,
  copyright: Copyright,
  disclaimer: Info,
}

function CookieChoice() {
  const { consent, acceptCookies, rejectCookies } = useCookieConsent()
  const status = consent === 'accepted' ? 'Analytics is on.' : consent === 'rejected' ? 'Analytics is off.' : 'You have not chosen yet, so analytics is off.'

  return (
    <div className="g-panel mt-2 grid gap-3">
      <p className="font-semibold" role="status">
        {status}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" onClick={rejectCookies} aria-pressed={consent === 'rejected'}>
          Reject analytics
        </Button>
        <Button variant="ink" onClick={acceptCookies} aria-pressed={consent === 'accepted'}>
          Accept analytics
        </Button>
      </div>
    </div>
  )
}

function LegalPage({ type }: { type: LegalPageType }) {
  const doc = legalDocs[type]
  const Icon = icons[type]
  const canonicalPath = `/${type}`
  const label = legalPages.find((page) => page.href === canonicalPath)?.label ?? doc.title
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: doc.seoTitle,
      description: doc.seoDescription,
      url: `${getSiteOrigin()}${canonicalPath}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: label, item: `${getSiteOrigin()}${canonicalPath}` },
      ],
    },
  ]

  return (
    <Page narrow>
      <SeoHead title={doc.seoTitle} description={doc.seoDescription} canonicalPath={canonicalPath} jsonLd={jsonLd} />
      <Breadcrumb showBack backTo="/home" preferHistory className="mb-4" items={[{ label: 'Home', href: '/' }, { label }]} />

      <article className="m-legal">
        <header className="m-art-head border-0 pb-0">
          <span className="m-art-ic" aria-hidden="true">
            <Icon weight="light" />
          </span>
          <p className="m-onb-step">{doc.eyebrow}</p>
          <h1 className="g-h1 mt-1.5">{doc.title}</h1>
          <p className="g-mut mt-3 max-w-[65ch] text-[16px] leading-relaxed">{doc.intro}</p>
        </header>

        <div className="g-panel mt-6 max-w-[65ch]">
          <KeyValue
            items={[
              { label: 'Updated', value: LEGAL_UPDATED },
              { label: 'Contact', value: <a href={`mailto:${legalContactEmail}`} className="break-all underline underline-offset-2">{legalContactEmail}</a> },
            ]}
          />
        </div>

        <section aria-labelledby="legal-short" className="mt-6 max-w-[65ch]">
          <h2 id="legal-short" className="g-h3">
            The short version
          </h2>
          <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-[16px] leading-relaxed">
            {doc.shortVersion.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <nav aria-label="Sections" className="m-toc mt-8">
          {doc.sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(section.id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
              }}
            >
              {section.title}
            </a>
          ))}
        </nav>

        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} className="mt-10 max-w-[65ch] border-t border-[var(--line-2)] pt-8 first-of-type:border-0 first-of-type:pt-0">
            <h2 className="g-h2">{section.title}</h2>
            <div className="mt-3 grid gap-3 text-[16px] leading-[1.7]">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul className="grid list-disc gap-2 pl-5">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {section.links ? (
                <p className="flex flex-wrap gap-x-4">
                  {section.links.map((link) => (
                    <InternalLink key={link.href} href={link.href} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
                      {link.label}
                    </InternalLink>
                  ))}
                </p>
              ) : null}
              {type === 'cookies' && section.id === 'choice' ? <CookieChoice /> : null}
            </div>
          </section>
        ))}

        <nav aria-label="Other policies" className="mt-10 max-w-[65ch] border-t border-[var(--line-2)] pt-6">
          <h2 className="g-h3">Other policies</h2>
          <ul className="mt-1 flex flex-wrap gap-x-5">
            {legalPages
              .filter((page) => page.href !== canonicalPath)
              .map((page) => (
                <li key={page.href}>
                  <InternalLink href={page.href} className="inline-flex min-h-11 items-center underline underline-offset-2">
                    {page.label}
                  </InternalLink>
                </li>
              ))}
          </ul>
        </nav>

        <p className="g-sm g-mut mt-6 max-w-[65ch] rounded-[var(--r-3)] bg-[var(--fill)] p-4">
          Questions, rights requests or content concerns? Email{' '}
          <a href={`mailto:${legalContactEmail}`} className="font-semibold text-[var(--ink)] underline underline-offset-2">
            {legalContactEmail}
          </a>
          .
        </p>
      </article>
    </Page>
  )
}

export default LegalPage
