import AppHeader from '../components/AppHeader'
import Breadcrumb from '../components/Breadcrumb'
import { PageContainer, PageShell } from '../components/layout/ResponsiveLayouts'
import SeoHead from '../components/SeoHead'
import { getSiteOrigin } from '../utils/seo'
import { FileText, House, ShieldCheck, Sparkles } from 'lucide-react'

type LegalPageProps = {
  type: 'terms' | 'privacy'
}

type LegalSection = {
  title: string
  body: string[]
  bullets?: string[]
}

const contactEmail = 'tegradojeromebrent@gmail.com'

const termsSections: LegalSection[] = [
  {
    title: '1. About GalaTayo',
    body: [
      'GalaTayo is a Metro Manila place discovery and gala planning system created as a personal portfolio and career showcase project. It is currently not commercialized and is intended to demonstrate a real-world place discovery, planning, and community-based system.',
      'GalaTayo helps users discover places, view place details, save places, create gala plans, interact with community features, and use optional AI-assisted features if available.',
      'GalaTayo does not officially represent, own, operate, or endorse the listed places unless clearly stated.',
    ],
  },
  {
    title: '2. Account Registration',
    body: [
      'Users may need an account to access certain features, such as saving places, creating gala plans, posting comments, writing reviews, following users, submitting places, uploading photos, or using Ask AI features.',
      'When creating or using an account, you agree to provide accurate information and keep your account secure. You are responsible for activity under your account.',
      'GalaTayo may use third-party authentication providers, such as Google Sign-In, if enabled in the system.',
    ],
  },
  {
    title: '3. User Profiles',
    body: [
      'GalaTayo may allow users to create or update a profile. Profile information may include first name, middle name, last name, display name, username, avatar, bio, and visibility settings.',
      'Some profile information may be visible to other users depending on your settings and the features you use. Your public display name, username, avatar, public profile details, public gala plans, comments, reviews, ratings, and other public interactions may be visible to other users.',
      'You must not use your profile to impersonate another person, mislead users, harass others, upload inappropriate content, or violate the rights of any person, place, business, or organization.',
    ],
  },
  {
    title: '4. Public and Private Content',
    body: [
      'Some content in GalaTayo may be private, while some may be public. Private content may include private gala plans, account information, internal account records, private settings, and other content not intended for public display.',
      'Public content may include public profiles, public gala plans, comments, reviews, ratings, hearts, likes, follower/following information, user-submitted places, uploaded place photos, and other content made visible through the system.',
      'You are responsible for the content you choose to submit or make public.',
    ],
  },
  {
    title: '5. User-Generated Content',
    body: ['Users may be able to submit comments, replies, reviews, ratings, reports, gala plans, profile details, feedback, place submissions, place edits, and uploaded photos.'],
    bullets: [
      'Do not submit false, misleading, abusive, hateful, sexually explicit, defamatory, privacy-invasive, impersonating, illegal, malicious, infringing, or unrelated content.',
      'GalaTayo may hide, remove, restrict, edit, or moderate user content if it violates these Terms, affects user safety, causes abuse, or creates legal, privacy, copyright, or security concerns.',
    ],
  },
  {
    title: '6. User-Created Places',
    body: [
      'GalaTayo may allow users to create new place listings or submit edits to existing place information. When submitting a place or edit, you confirm that the information is accurate to the best of your knowledge and is not intentionally misleading.',
      'GalaTayo may review, approve, reject, edit, hide, remove, or restrict user-submitted places or edits if they are inaccurate, duplicated, inappropriate, unsafe, misleading, reported, or against these Terms.',
    ],
  },
  {
    title: '7. Uploaded Place Photos',
    body: [
      'By uploading a photo, you confirm that you own it, have permission to upload and share it, or otherwise have the right to submit it to GalaTayo.',
      'You retain ownership of photos you own. By uploading photos, you give GalaTayo limited permission to store, display, resize, compress, process, moderate, and use those photos inside the system for place listings, discovery, search, recommendations, moderation, and related features.',
      'GalaTayo may remove or restrict uploaded photos if they are inappropriate, low quality, misleading, infringing, reported, unsafe, or against these Terms.',
    ],
  },
  {
    title: '8. Third-Party Place Images',
    body: [
      'GalaTayo may display place-related images from third-party or publicly available sources to support place discovery and viewing. GalaTayo does not claim ownership over third-party images unless expressly stated.',
      `Rights owners may contact ${contactEmail} for review. GalaTayo may remove, replace, or update images as appropriate.`,
    ],
  },
  {
    title: '9. Comments, Reviews, and Ratings',
    body: [
      'Comments and reviews should reflect honest user opinions and experiences. Users must not post fake reviews, repeated spam, abusive replies, manipulated ratings, or content intended to unfairly harm or promote a place, person, or business.',
      'GalaTayo may limit, hide, remove, or moderate comments, replies, reviews, and ratings if they violate these Terms or community safety rules.',
    ],
  },
  {
    title: '10. Reports and Moderation',
    body: [
      'Users may report content, comments, reviews, profiles, places, photos, or other activity that appears to violate these Terms. GalaTayo may review reports and take action when needed.',
      'Actions may include hiding content, removing content, limiting features, rejecting submitted places, removing uploaded photos, suspending accounts, or keeping moderation records for safety, abuse prevention, accountability, and system integrity.',
    ],
  },
  {
    title: '11. Place Information Disclaimer',
    body: [
      'Place information may change at any time, including prices, operating hours, availability, entrance fees, contact details, policies, routes, accessibility, and safety conditions.',
      'Users should verify important information directly with the place, official page, map provider, or another reliable source before visiting.',
    ],
  },
  {
    title: '12. Maps, Routes, and Directions',
    body: [
      'Maps, coordinates, links, commute notes, nearby context, and directions-related information are provided for convenience only. GalaTayo does not guarantee route accuracy, traffic conditions, commute availability, safety, travel time, or accessibility.',
    ],
  },
  {
    title: '13. Ask AI and Live Search Features',
    body: [
      'AI-generated answers may be incomplete, outdated, inaccurate, or based on limited information. AI responses should not be treated as professional, legal, medical, financial, safety, or emergency guidance.',
      'Users should verify important information before relying on AI-generated responses.',
    ],
  },
  {
    title: '14. Third-Party Services',
    body: [
      'GalaTayo may rely on third-party services such as Supabase, Google Sign-In, Azure, Upstash Redis, Cloudflare R2 or another storage provider, map and direction providers, and AI or search providers.',
      'These services may have their own terms and policies. GalaTayo is not responsible for third-party service interruptions, policy changes, external platform issues, or issues outside its control.',
    ],
  },
  {
    title: '15. System Use and Restrictions',
    body: ['You agree not to hack, attack, overload, disrupt, scrape, bypass security, spam, upload malware, reverse engineer security-related parts, abuse community features, submit fake place information, upload infringing content, or use GalaTayo for illegal, harmful, or misleading activity.'],
  },
  {
    title: '16. Intellectual Property',
    body: [
      'The GalaTayo name, design, user interface, system structure, code, original text, original graphics, and other original project materials belong to their respective owners or creators.',
      'Users retain ownership of content they submit if they own it. By submitting content, users allow GalaTayo to store, display, process, resize, moderate, and use that content as needed to operate the system.',
    ],
  },
  {
    title: '17. Account Suspension or Removal',
    body: [
      `GalaTayo may restrict, suspend, or remove accounts that violate these Terms or create security, privacy, copyright, or legal risks. Users may request account deletion by contacting ${contactEmail} or through account deletion tools if available.`,
    ],
  },
  {
    title: '18. Availability and Changes',
    body: ['GalaTayo may change, update, pause, or remove features as the system improves. GalaTayo does not guarantee that the system will always be available, error-free, secure, or uninterrupted.'],
  },
  {
    title: '19. Limitation of Responsibility',
    body: ['GalaTayo is provided on an “as is” and “as available” basis. To the extent allowed by law, GalaTayo is not responsible for losses, inconvenience, harm, or damages caused by reliance on inaccurate information, third-party content, user content, uploaded photos, AI responses, map errors, route issues, service interruptions, or user-generated content.'],
  },
  {
    title: '20. Updates to These Terms',
    body: ['GalaTayo may update these Terms from time to time. If major changes are made, users may be notified through the system, email, or another reasonable method. Continued use of GalaTayo after changes means you agree to the updated Terms.'],
  },
  {
    title: '21. Contact',
    body: [`For questions, reports, rights concerns, privacy concerns, or image/content concerns, contact GalaTayo Support / Privacy Contact at ${contactEmail}.`],
  },
]

const privacySections: LegalSection[] = [
  {
    title: '1. Who We Are',
    body: [
      'GalaTayo is a Metro Manila place discovery and gala planning system created as a personal portfolio and career showcase project. It is currently not commercialized and is intended to demonstrate a real-world place discovery, planning, and community-based system.',
      `For privacy questions, data requests, content concerns, or rights concerns, contact ${contactEmail}.`,
    ],
  },
  {
    title: '2. Personal Data We May Collect',
    body: ['GalaTayo may collect account information, profile information, onboarding and policy acceptance records, app activity, user-submitted places, uploaded photos, Ask AI and Live Search activity, technical and security information, and location-related information depending on the features you use.'],
    bullets: [
      'Account data may include user ID, email, login provider, account creation date, session-related information, account status, and onboarding status.',
      'Profile data may include first name, middle name, last name, display name, username, avatar URL, bio, visibility settings, follower/following settings, and timestamps.',
      'Policy acceptance data may include accepted Terms and Privacy versions, acceptance timestamps, user ID, and related audit records if stored.',
    ],
  },
  {
    title: '3. Why We Use Personal Data',
    body: ['GalaTayo uses personal data to manage accounts, complete onboarding, record agreement to policies, manage profiles, save favorites and history, create gala plans, support community features, moderate reports and content, provide search and recommendations, operate AI features if enabled, prevent abuse, debug errors, improve reliability, respond to requests, and send necessary account or service-related messages.'],
  },
  {
    title: '4. Legal Bases for Processing',
    body: ['GalaTayo may process personal data based on consent, service necessity, legitimate interests such as security and moderation, and legal obligations such as responding to valid privacy or rights-related requests.'],
  },
  {
    title: '5. Publicly Visible Information',
    body: [
      'Publicly visible information may include display name, username, avatar, public profile details, public gala plans, submitted public places, approved uploaded photos, comments, replies, reviews, ratings, hearts or likes, and follower/following information depending on settings.',
      'Private account information such as email address, authentication details, first name, middle name, last name, private gala plans, private settings, security logs, internal moderation notes, and backend records are not intended to be publicly visible by default.',
    ],
  },
  {
    title: '6. Third-Party Images and Place Content',
    body: [`GalaTayo may display third-party place images and place information for system display purposes and does not claim ownership unless expressly stated. Rights owners may contact ${contactEmail} for review.`],
  },
  {
    title: '7. User-Uploaded Photos',
    body: ['Uploaded photos may be stored, processed, resized, compressed, displayed, reviewed, moderated, or removed as needed to operate the system. Users should only upload photos they own, have permission to use, or are allowed to submit.'],
  },
  {
    title: '8. Third-Party Services and Processors',
    body: ['GalaTayo may use providers such as Supabase, Google Sign-In, Azure, Upstash Redis, Cloudflare R2 or another storage provider, map and direction providers, and AI or search providers. These providers may process data as needed to provide their services. GalaTayo does not sell personal data.'],
  },
  {
    title: '9. AI Feature Privacy',
    body: ['If Ask AI or Live Search is used, prompts and related context may be processed to generate responses. Users should avoid submitting sensitive personal information, passwords, private documents, financial details, medical information, or information about other people into AI prompts.'],
  },
  {
    title: '10. Service Emails',
    body: ['GalaTayo may send necessary account or service-related emails, such as authentication messages, password reset or recovery messages, security notices, important account updates, policy notices, account deletion, or data request communications. GalaTayo does not send promotional marketing emails unless a separate optional consent is introduced in the future.'],
  },
  {
    title: '11. Data Retention',
    body: ['GalaTayo keeps personal data only as long as needed for the purposes described in this Privacy Policy, unless a longer period is required for legal, security, backup, moderation, or legitimate operational reasons.'],
  },
  {
    title: '12. Data Security',
    body: ['GalaTayo uses reasonable technical and organizational measures such as authentication controls, database access controls, Supabase Row Level Security where applicable, secure secrets management, HTTPS where applicable, rate limiting, backend validation, limited production data access, logs and monitoring, and moderation controls. No system is completely secure.'],
  },
  {
    title: '13. User Rights',
    body: [`Subject to applicable law, users may request access, correction, deletion, blocking, removal, objection, withdrawal of consent, portability, or other privacy assistance by contacting ${contactEmail}. GalaTayo may need to verify the requester’s identity.`],
  },
  {
    title: '14. Account Deletion and Data Requests',
    body: [`Users may request account deletion or personal data assistance by contacting ${contactEmail} or using account deletion tools if available. Some information may be retained when needed for legal, security, anti-abuse, moderation, backup, copyright, rights-review, or legitimate operational reasons.`],
  },
  {
    title: '15. Content and Image Removal Requests',
    body: [`Users, rights owners, place owners, or concerned individuals may contact ${contactEmail} to request review of content, place submissions, or images. GalaTayo may remove, hide, update, or restrict content when appropriate.`],
  },
  {
    title: '16. Children and Minors',
    body: ['GalaTayo is intended for users who can understand and agree to these Terms and Privacy Policy. If a user is a minor, they should use the system with guidance from a parent, guardian, or responsible adult.'],
  },
  {
    title: '17. Cookies, Local Storage, and Similar Technologies',
    body: ['GalaTayo may use cookies, local storage, or similar technologies for login sessions, authentication, security, remembering preferences, app functionality, debugging, and system performance.'],
  },
  {
    title: '18. International or External Processing',
    body: ['Some third-party services used by GalaTayo may store or process data outside the Philippines. GalaTayo will rely on appropriate service providers and reasonable safeguards for system operation and data protection.'],
  },
  {
    title: '19. Changes to This Privacy Policy',
    body: ['GalaTayo may update this Privacy Policy from time to time. If major changes are made, users may be notified through the system, email, or another reasonable method. If a change significantly affects personal data use, GalaTayo may request renewed consent where appropriate.'],
  },
  {
    title: '20. Contact',
    body: [`For privacy concerns, data requests, rights requests, content concerns, place concerns, or image concerns, contact GalaTayo Support / Privacy Contact at ${contactEmail}.`],
  },
]

function LegalPage({ type }: LegalPageProps) {
  const isTerms = type === 'terms'
  const title = isTerms ? 'GalaTayo Terms of Service' : 'GalaTayo Privacy Policy'
  const intro = isTerms
    ? 'These Terms of Service explain the rules for using GalaTayo and the responsibilities of users when accessing or using the system.'
    : 'This Privacy Policy explains how GalaTayo collects, uses, stores, shares, protects, and deletes personal data when users access or use the system.'
  const sections = isTerms ? termsSections : privacySections
  const canonicalPath = isTerms ? '/terms' : '/privacy'
  const seoTitle = isTerms ? 'Terms of Service | GalaTayo' : 'Privacy Policy | GalaTayo'
  const seoDescription = isTerms
    ? 'Read GalaTayo terms covering accounts, content, place information, AI features, moderation, and service rules.'
    : 'Read the GalaTayo privacy policy covering account data, public content, AI feature usage, storage, and user rights.'
  const breadcrumbItems = [
    { label: 'Home', href: '/', icon: <House className="h-3.5 w-3.5" /> },
    { label: isTerms ? 'Terms' : 'Privacy', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  ]
  const quickFacts = [
    {
      label: 'Applies to',
      value: 'Users who access or use GalaTayo',
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      label: 'Updated',
      value: 'June 14, 2026',
      icon: <FileText className="h-4 w-4" />,
    },
    {
      label: 'Contact',
      value: contactEmail,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
  ]
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: seoTitle,
      description: seoDescription,
      url: `${getSiteOrigin()}${canonicalPath}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${getSiteOrigin()}/` },
        { '@type': 'ListItem', position: 2, name: isTerms ? 'Terms' : 'Privacy', item: `${getSiteOrigin()}${canonicalPath}` },
      ],
    },
  ]

  return (
    <PageShell>
      <SeoHead title={seoTitle} description={seoDescription} canonicalPath={canonicalPath} jsonLd={jsonLd} />
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:pb-16 lg:pt-8">
        <PageContainer size="wide" className="px-4 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1080px]">
            <Breadcrumb
              showBack
              backTo="/"
              preferHistory
              className="mb-5 sm:mb-6"
              items={breadcrumbItems}
            />

            <section className="relative overflow-hidden rounded-[32px] border border-[rgba(30,58,138,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(243,244,246,0.92))] px-5 py-6 shadow-[0_18px_42px_rgba(17,24,39,0.06)] backdrop-blur-sm sm:px-7 sm:py-8 lg:px-10 lg:py-10">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(30,58,138,0.4)] to-transparent" />
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:items-start">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(30,58,138,0.12)] bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)] shadow-[0_8px_22px_rgba(17,24,39,0.04)]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>{isTerms ? 'Terms of Service' : 'Privacy Policy'}</span>
                  </div>
                  <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-0.04em] text-slate-950 sm:text-4xl lg:text-5xl">
                    {title}
                  </h1>
                  <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-700 sm:text-[15px]">
                    {intro}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {isTerms ? (
                      <>
                        <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[12px] font-bold text-[var(--accent)]">
                          Account rules
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-[12px] font-bold text-slate-700">
                          Content & moderation
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-[12px] font-bold text-slate-700">
                          Service use
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[12px] font-bold text-[var(--accent)]">
                          Data handling
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-[12px] font-bold text-slate-700">
                          User rights
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-[12px] font-bold text-slate-700">
                          Third-party processors
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  {quickFacts.map((fact) => (
                    <div
                      key={fact.label}
                      className="rounded-[24px] border border-[var(--line)] bg-white/85 p-4 shadow-[0_10px_24px_rgba(17,24,39,0.05)]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                          {fact.icon}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{fact.label}</p>
                          <p className="mt-1 break-words text-sm font-bold leading-6 text-slate-900">{fact.value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </aside>
              </div>
            </section>

            <article className="mt-6 sm:mt-7 lg:mt-8">
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    title: isTerms ? 'How to use this' : 'What this covers',
                    body: isTerms
                      ? 'These terms explain how people can use GalaTayo, what content is allowed, and how moderation works.'
                      : 'This policy explains what data may be collected, how it is used, and when it may be shared with service providers.',
                  },
                  {
                    title: 'Your controls',
                    body: 'We keep the language direct so users can understand what they can request, change, or delete.',
                  },
                  {
                    title: 'Need help?',
                    body: `Questions, rights requests, or content concerns can be sent to ${contactEmail}.`,
                  },
                ].map((card) => (
                  <section
                    key={card.title}
                    className="rounded-[24px] border border-[var(--line)] bg-white/75 p-5 shadow-[0_8px_22px_rgba(17,24,39,0.04)]"
                  >
                    <h2 className="text-base font-black tracking-[-0.02em] text-slate-950">{card.title}</h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{card.body}</p>
                  </section>
                ))}
              </div>

              <div className="mt-6 grid gap-5 sm:mt-7 sm:gap-6 lg:mt-8 lg:gap-7">
                {sections.map((section) => (
                  <section
                    key={section.title}
                    className="rounded-[28px] border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-5 py-5 shadow-[0_10px_24px_rgba(17,24,39,0.04)] sm:px-6 sm:py-6"
                  >
                    <h2 className="text-lg font-black tracking-[-0.02em] text-slate-950 sm:text-[1.2rem]">
                      {section.title}
                    </h2>
                    <div className="mt-3 grid gap-3 sm:gap-4">
                      {section.body.map((paragraph) => (
                        <p key={paragraph} className="text-sm font-semibold leading-7 text-slate-700 sm:text-[15px]">
                          {paragraph}
                        </p>
                      ))}
                      {section.bullets ? (
                        <ul className="grid gap-2 pl-5 text-sm font-semibold leading-7 text-slate-700 sm:text-[15px]">
                          {section.bullets.map((item) => (
                            <li key={item} className="list-disc">
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default LegalPage
