import AppHeader from '../components/AppHeader'
import { navigateToPath } from '../utils/navigation'

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

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 lg:py-10">
        <article className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-[0_18px_42px_rgba(47,116,232,0.1)] sm:p-8">
          <button
            type="button"
            onClick={() => window.history.length > 1 ? window.history.back() : navigateToPath('/search')}
            className="mb-6 text-sm font-black text-[var(--accent-deep)] transition hover:text-[var(--accent)]"
          >
            Back
          </button>
          <header className="border-b border-[var(--line)] pb-6">
            <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-700">{intro}</p>
            <dl className="mt-5 grid gap-2 text-sm font-bold text-[var(--muted)] sm:grid-cols-2">
              <div><dt className="inline text-slate-900">Effective Date: </dt><dd className="inline">Launch Date</dd></div>
              <div><dt className="inline text-slate-900">Last Updated: </dt><dd className="inline">June 14, 2026</dd></div>
            </dl>
          </header>

          <div className="mt-7 grid gap-7">
            {sections.map((section) => (
              <section key={section.title} className="grid gap-3">
                <h2 className="text-xl font-black text-slate-950">{section.title}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm font-semibold leading-7 text-slate-700">{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="grid gap-2 pl-5 text-sm font-semibold leading-7 text-slate-700">
                    {section.bullets.map((item) => (
                      <li key={item} className="list-disc">{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  )
}

export default LegalPage
