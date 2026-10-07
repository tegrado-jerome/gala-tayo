import { legalContactEmail as email, type LegalPageType } from './legalPages'

export type LegalSection = {
  id: string
  title: string
  body: string[]
  bullets?: string[]
  links?: Array<{ href: string; label: string }>
}

export type LegalDoc = {
  eyebrow: string
  title: string
  intro: string
  seoTitle: string
  seoDescription: string
  shortVersion: string[]
  sections: LegalSection[]
}

export const LEGAL_UPDATED = 'October 7, 2026'

const privacy: LegalDoc = {
  eyebrow: 'Privacy policy',
  title: 'Privacy Policy',
  intro: 'What we collect, why, who we share it with, and how you can see, fix or delete it.',
  seoTitle: 'Privacy Policy | GalaTayo',
  seoDescription: 'How GalaTayo collects, uses, shares and protects your data under the Philippine Data Privacy Act, and how to access or delete it.',
  shortVersion: [
    'We collect only what we need to run your account, your plans and the community features.',
    'We do not sell your data and we do not show ads.',
    'Analytics cookies load only if you tap Accept.',
    'AI chats go to an AI provider without your name or email. We strip emails and phone numbers first.',
    'You can ask for a copy of your data, fix it or delete your account anytime in the Privacy center.',
  ],
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are',
      body: [
        'GalaTayo (galatayo.app) is a free app for finding and planning trips to gala-worthy places in the Philippines. It is a personal project run by its creator in the Philippines.',
        `For the data in this policy, GalaTayo is the "personal information controller" under the Data Privacy Act of 2012 (Republic Act No. 10173). You can reach our Data Protection Officer at ${email}.`,
      ],
    },
    {
      id: 'what-we-collect',
      title: 'What we collect',
      body: ['What we collect depends on what you use. You can browse place pages without an account.'],
      bullets: [
        'Account: your email address and your password. Our login provider (Supabase) stores the password in scrambled (hashed) form, so we never see it. If you sign in with Google, Google gives us your name, email and profile photo.',
        'Guest mode: a temporary account with no name or email, so saves and plans work before you sign up.',
        'Profile: first, middle and last name, birthdate, username, display name, profile photo, bio, interests and visibility settings. Your full name and birthdate stay private.',
        'Things you create: saved places, places you opened recently, gala plans, gala lists, barkada members, RSVPs (going, maybe, no), "paid" marks, polls and votes, comments, reviews, ratings, place submissions, uploaded photos, follows, reports, feedback and privacy requests.',
        'Passport check-ins: which place you checked in to and on what date.',
        'Security records: the version and time you agreed to our Terms and this policy, with your IP address and browser type at that moment; login and two-step verification records; and logs of admin actions.',
        'Usage data: only if you accept analytics cookies. See the Cookies section.',
      ],
    },
    {
      id: 'birthdate',
      title: 'Your birthdate',
      body: [
        'The Data Privacy Act treats age as sensitive personal information. We ask for your birthdate only to check that you are old enough to use GalaTayo. We keep it private, never show it on your profile, and never send it to AI providers or analytics.',
      ],
    },
    {
      id: 'location',
      title: 'Your location',
      body: [
        'We use your location only when you allow it in your browser. "Near me" and distance features work on your device.',
        'For a Passport check-in, we send your location once to confirm you are at the place. We do not save your coordinates, only the place and the date.',
      ],
    },
    {
      id: 'ai',
      title: 'AI features (Tara, Plan with AI)',
      body: [
        'When you use Tara or Plan with AI, your message and the place details needed to answer go to our server and then to an AI provider: Google Gemini or Groq, and, as a backup, Cloudflare Workers AI or OpenRouter.',
        'Before sending, we remove email addresses and Philippine mobile numbers from your message. We do not send your name, email, account ID or birthdate.',
        'We do not save your chats in our database. What Tara remembers about your trip stays in your browser. We briefly cache answers to common questions so they load faster, and we count how many AI chats you use each day, by account or by a random guest ID kept in your browser.',
        'AI providers may keep or review what they receive under their own terms, so please do not type private details like passwords, ID numbers, health or money matters, or details about other people.',
      ],
    },
    {
      id: 'why',
      title: 'Why we use your data',
      bullets: [
        'To run your account and log you in.',
        'To keep GalaTayo safe: two-step verification, rate limits, spam and abuse checks.',
        'To save your places and run your plans, lists, barkada RSVPs and polls.',
        'To run community features and moderate reports.',
        'To power search, recommendations and AI answers.',
        'To reply to your messages and requests.',
        'To see how the app is used and make it better (analytics, only with your consent).',
        'To follow the law.',
      ],
      body: [],
    },
    {
      id: 'legal-basis',
      title: 'Our legal basis',
      body: [
        'Under Sections 12 and 13 of the Data Privacy Act, we rely on: your consent (given when you sign up, and separately for analytics cookies); what is needed to give you the service you asked for; our legitimate interest in keeping GalaTayo safe and free of abuse; and legal obligations.',
        'For your birthdate, which is sensitive personal information, we rely on your consent. You can withdraw consent anytime. That will not undo what we already did, but some features may stop working.',
      ],
    },
    {
      id: 'public',
      title: 'What other people can see',
      bullets: [
        'Anyone: your display name, username, profile photo, bio, public gala plans, comments, reviews, ratings, approved photos and approved place submissions. Followers and following lists show only if you allow it.',
        'Your barkada: people in the same gala plan see each other\'s names, RSVPs and "paid" marks.',
        'Anyone with the link: shared public plans and gala lists open for whoever has the link, even without an account.',
        'Only you and our admins: your email, full name, birthdate, private plans, settings and security records.',
      ],
      body: [],
    },
    {
      id: 'sharing',
      title: 'Who we share it with',
      body: ['We do not sell or rent your data, and we do not show ads. We share data only with the service providers that run GalaTayo for us, under their own security and privacy terms:'],
      bullets: [
        'Supabase: login and database.',
        'Microsoft Azure: website hosting, server functions and secret storage.',
        'Upstash: short-lived caching and rate limits.',
        'Cloudflare: photo storage and delivery (R2), and backup AI answers.',
        'Google: Google sign-in, Gemini AI answers, and Google Analytics (only if you accept cookies).',
        'Groq and OpenRouter: AI answers, without your account details.',
        'Brevo: sending login verification codes by email.',
        'Open-Meteo (weather) and OpenStreetMap (map tiles): your browser loads these directly, so they see your IP address but not your account.',
        'Authorities: only when the law requires it, like a valid court order.',
      ],
    },
    {
      id: 'abroad',
      title: 'Data stored outside the Philippines',
      body: [
        'Many of these providers keep data on servers outside the Philippines. We pick providers with strong security, and we stay responsible for your data under the Data Privacy Act wherever it is stored.',
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies and browser storage',
      body: [
        'We use browser storage to keep you logged in and remember your settings. Google Analytics cookies load only if you tap Accept, and you can change your choice anytime.',
      ],
      links: [{ href: '/cookies', label: 'Read the Cookie Policy' }],
    },
    {
      id: 'retention',
      title: 'How long we keep it',
      bullets: [
        'Account and profile data: while your account is open.',
        'After you delete your account: we delete or anonymise your data within 30 days of confirming the request. Public comments or reviews may stay with your name removed, unless you ask us to delete them too.',
        'Records we need to keep: proof of policy agreement, privacy request records and moderation or abuse records are kept only as long as needed for safety, legal claims or to show we followed the law.',
        'Caches and rate limits: these expire on their own within hours or days.',
        'Backups: deleted data drops out of our providers\' rolling backups on their schedule.',
        'Analytics: kept for the period set in our Google Analytics settings.',
      ],
      body: [],
    },
    {
      id: 'security',
      title: 'How we protect it',
      body: [
        'We use HTTPS everywhere, database rules that keep private tables closed to the public, secrets kept in a secure vault, rate limits, two-step verification with email codes, and admin-only access to private data. No system is 100% secure, though.',
        'If a breach happens that could harm you, we will notify the National Privacy Commission and the people affected within 72 hours of finding out, as NPC Circular 16-03 requires.',
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      body: [
        'Under the Data Privacy Act, you have the right to be informed, to access your data, to object, to have it erased or blocked, to correct it, to get a copy you can move (portability), to file a complaint, and to claim damages.',
        `Use the Privacy center when logged in, or email ${email}. We may ask you to confirm it is really you. We reply within 15 days.`,
      ],
      links: [{ href: '/privacy-center', label: 'Open the Privacy center' }],
    },
    {
      id: 'complaints',
      title: 'Complaints',
      body: [
        `Please email us first at ${email} so we can fix it. If we do not act within 15 days, or you are not happy with our answer, you can file a complaint with the National Privacy Commission at privacy.gov.ph or complaints@privacy.gov.ph.`,
      ],
    },
    {
      id: 'kids',
      title: 'Kids and teens',
      body: [
        'GalaTayo is not for children under 13, and we do not knowingly collect their data. If you are 13 to 17, please use GalaTayo with your parent or guardian\'s permission.',
        `If we learn that a child under 13 signed up, we delete the account. Parents and guardians can email ${email}.`,
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: [
        'When we change this policy, we update the date at the top. For big changes, we tell you in the app or by email before they take effect, and we ask for your consent again when the law requires it.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      body: [`Data Protection Officer, GalaTayo: ${email}`],
    },
  ],
}

const terms: LegalDoc = {
  eyebrow: 'Terms of use',
  title: 'Terms of Use',
  intro: 'The rules for using GalaTayo. Please read them, they are short.',
  seoTitle: 'Terms of Use | GalaTayo',
  seoDescription: 'The rules for using GalaTayo: accounts, community rules, AI features, photos, place information, liability and Philippine law.',
  shortVersion: [
    'GalaTayo is free. We help you find and plan trips; we do not sell tickets or tours.',
    'Be honest and kind. No fake reviews, no harassment, no posting things that are not yours.',
    'Place info and AI answers can be wrong or out of date. Check before you go and stay safe.',
    'You own what you post. You let us show it on GalaTayo.',
    'Philippine law applies.',
  ],
  sections: [
    {
      id: 'agreement',
      title: 'Agreeing to these terms',
      body: [
        'By using GalaTayo, you agree to these terms and to our Privacy Policy, Cookie Policy, Copyright and Takedown Policy and Disclaimer. If you do not agree, please do not use GalaTayo.',
      ],
      links: [
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/cookies', label: 'Cookie Policy' },
        { href: '/copyright', label: 'Copyright and Takedown Policy' },
        { href: '/disclaimer', label: 'Disclaimer' },
      ],
    },
    {
      id: 'about',
      title: 'What GalaTayo is',
      body: [
        'GalaTayo is a free personal project for finding and planning trips to places in the Philippines. We are not a travel agency, tour operator or booking site. We do not sell tickets, take payments or arrange transport.',
        'Listing a place does not mean we own, run, partner with or endorse it.',
      ],
    },
    {
      id: 'age',
      title: 'Who can use GalaTayo',
      body: [
        'You must be at least 13 years old to create an account. If you are under 18, you need your parent or guardian\'s permission, and they agree to these terms for you.',
      ],
    },
    {
      id: 'account',
      title: 'Your account',
      bullets: [
        'Give true information and keep it up to date.',
        'One person per account. Do not share your login.',
        'Keep your password safe. You are responsible for what happens on your account.',
        `If you think someone got into your account, change your password and email ${email}.`,
      ],
      body: [],
    },
    {
      id: 'your-content',
      title: 'Your content',
      body: [
        'You own the comments, reviews, photos, plans and places you post. By posting, you give GalaTayo a free, non-exclusive, worldwide permission to store, show, resize and share that content inside GalaTayo and in its share images, for as long as it stays on GalaTayo (and a short time after in backups).',
        'You promise that you have the right to post it, and that it does not break the law or anyone else\'s rights.',
      ],
    },
    {
      id: 'community',
      title: 'Community rules',
      bullets: [
        'Be honest. Review only places you actually visited. No fake or paid reviews, and no reviewing your own business or a competitor.',
        'No defamation. Do not post false claims that hurt the good name of a person or business. Online libel is a crime under the Cybercrime Prevention Act (Republic Act No. 10175).',
        'No harassment, hate speech, threats, bullying or sexual content.',
        'No doxxing. Do not post anyone\'s private details, like their address, phone number or ID.',
        'No spam, ads, scams or misleading links.',
        'Post only photos and text you own or have permission to use.',
        'Do not encourage illegal or dangerous acts, like trespassing or entering closed or restricted areas.',
      ],
      body: [],
    },
    {
      id: 'moderation',
      title: 'How we moderate',
      body: [
        'We do not check everything before it goes live, and what users post is their own opinion, not ours. We review reports and may hide, remove or reject content, or limit or suspend accounts, when something breaks these rules or puts people at risk. Safety reports are handled first.',
        `Use "Report a concern" on any place, the report option on comments and profiles, or email ${email}. If we removed your content and you think we got it wrong, email us and we will take another look.`,
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      body: ['When using GalaTayo, do not:'],
      bullets: [
        'Hack, overload or try to get around our security or usage limits.',
        'Scrape or bulk-copy our places, photos or text, or use bots to access GalaTayo.',
        'Upload malware or harmful code.',
        'Try to trick our AI into breaking its rules, or use it to make harmful content.',
        'Pretend to be someone else, including GalaTayo.',
        'Use GalaTayo for anything illegal.',
      ],
    },
    {
      id: 'ai',
      title: 'AI features',
      body: [
        'Tara, Plan with AI and Gala Today use AI to write answers, plans and posts. AI can be wrong, incomplete or out of date. Always check prices, opening times, routes, weather and safety before you go.',
        'AI answers are suggestions, not professional, legal, medical, financial or safety advice. You decide what to do with them. To the extent the law allows, GalaTayo is not responsible for losses that come from relying on AI suggestions. AI use has daily limits.',
      ],
    },
    {
      id: 'place-info',
      title: 'Place information and safety',
      body: [
        'Place details like prices, fees, hours and access can change without notice, and outdoor trips carry real risks. You visit any place at your own risk. Read the Disclaimer for safety tips and our editorial rules.',
      ],
      links: [{ href: '/disclaimer', label: 'Read the Disclaimer' }],
    },
    {
      id: 'photos',
      title: 'Photos and copyright',
      body: [
        'Some photos on GalaTayo belong to other people and are shown with credit and a link to the source. If a photo or text is yours and you want it removed or credited differently, follow our Copyright and Takedown Policy.',
        'Repeat infringers: we close the accounts of people who keep posting content that is not theirs. As a rule, an account with three valid copyright complaints is closed.',
      ],
      links: [{ href: '/copyright', label: 'Copyright and Takedown Policy' }],
    },
    {
      id: 'our-brand',
      title: 'Our name and content',
      body: [
        'The GalaTayo name, logo, design and original text belong to GalaTayo\'s creator. Please do not copy our logo or design, or make anything that looks like it comes from us. You are welcome to share links and the share images the app makes for you.',
        'Other names and logos you see on GalaTayo belong to their owners, and showing them does not mean they work with us.',
      ],
    },
    {
      id: 'other-services',
      title: 'Links and other services',
      body: [
        'GalaTayo links to other sites and apps, like Google Maps, official pages and social media. We do not control them and are not responsible for what they show or do.',
      ],
    },
    {
      id: 'closing',
      title: 'Closing accounts',
      body: [
        'You can delete your account anytime from the Privacy center. We may suspend or close accounts that break these terms or the law, or that put others at risk.',
      ],
    },
    {
      id: 'no-guarantees',
      title: 'No guarantees',
      body: [
        'GalaTayo is free and provided "as is" and "as available". To the extent the law allows, we do not promise that it will always work, be error-free, or that its information is complete, correct or current.',
      ],
    },
    {
      id: 'liability',
      title: 'Limits on our liability',
      body: [
        'To the extent Philippine law allows, GalaTayo and its creator are not liable for indirect or follow-on losses, or for injury, loss or damage that comes from visiting a place, travel, weather, the acts of businesses or other users, AI suggestions, or content posted by others. If we are found liable for anything else, our total liability is limited to PHP 1,000.',
        'Nothing in these terms limits liability for fraud, or anything else that cannot be limited under Philippine law, such as Article 1171 of the Civil Code.',
      ],
    },
    {
      id: 'indemnity',
      title: 'If you break the rules',
      body: [
        'If someone makes a claim against GalaTayo because of something you posted or did in breach of these terms or the law, you agree to cover the reasonable costs of that claim.',
      ],
    },
    {
      id: 'law',
      title: 'Governing law and disputes',
      body: [
        'These terms follow the laws of the Republic of the Philippines.',
        `If you have a problem with GalaTayo, please email ${email} first. We will try to sort it out with you within 30 days. If we cannot, the dispute will be filed in the proper courts of the Philippines. This does not take away any right you have as a consumer under Philippine law.`,
      ],
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      body: [
        'When we change these terms, we update the date at the top. For big changes, we tell you in the app or by email before they take effect. If you keep using GalaTayo after that, you agree to the new terms.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      body: [`Questions about these terms: ${email}`],
    },
  ],
}

const cookies: LegalDoc = {
  eyebrow: 'Cookie policy',
  title: 'Cookie Policy',
  intro: 'What GalaTayo keeps in your browser, and how to say yes or no to analytics.',
  seoTitle: 'Cookie Policy | GalaTayo',
  seoDescription: 'Which cookies and browser storage GalaTayo uses, why, and how to turn Google Analytics on or off.',
  shortVersion: [
    'Some browser storage is needed to log you in and remember your settings.',
    'Google Analytics loads only if you tap Accept.',
    'No ad cookies. Ever.',
  ],
  sections: [
    {
      id: 'what',
      title: 'What cookies and browser storage are',
      body: [
        'Cookies and browser storage (local storage and session storage) are small bits of data a website saves in your browser, so it can remember things between visits.',
      ],
    },
    {
      id: 'needed',
      title: 'Needed to make GalaTayo work',
      body: ['These are always on, because the app cannot work without them. They stay in your browser and are not used to track you on other sites.'],
      bullets: [
        'Login session, so you stay logged in.',
        'Your cookie choice, so we do not ask again.',
        'Trusted device token for two-step verification.',
        'Settings like dark mode, interests and filters.',
        'Your gala lists, drafts, recently viewed places and short-term caches that make pages load faster.',
        'Tara chat memory and a random guest ID that counts free AI chats.',
      ],
    },
    {
      id: 'analytics',
      title: 'Analytics (only if you accept)',
      body: [
        'If you tap Accept, we load Google Analytics 4. It sets cookies (starting with _ga) to count visits and see which features people use, like page views, searches, saves and shares. We do not send your name, email or account ID to Google Analytics.',
        'If you tap Reject, or do nothing, Google Analytics does not load.',
      ],
    },
    {
      id: 'third-party',
      title: 'Other services',
      body: [
        'Map tiles from OpenStreetMap and weather from Open-Meteo load straight from those services. If you use Google sign-in, Google\'s sign-in page uses its own cookies under Google\'s policies.',
      ],
    },
    {
      id: 'choice',
      title: 'Change your choice',
      body: ['You can change your analytics choice anytime below. You can also clear cookies and site data in your browser settings, which logs you out.'],
    },
  ],
}

const copyright: LegalDoc = {
  eyebrow: 'Copyright and takedown',
  title: 'Copyright and Takedown Policy',
  intro: 'How we credit photos, and how to ask us to fix a credit or take something down.',
  seoTitle: 'Copyright and Takedown Policy | GalaTayo',
  seoDescription: 'How GalaTayo credits photos and handles copyright, privacy and removal requests, with a 48-hour response time and a counter-notice process.',
  shortVersion: [
    'Every credited photo shows the author, licence or source, and a link to the original.',
    'Is it yours? Tell us. We reply within 48 hours.',
    'If you object, we take the photo down. No fuss.',
  ],
  sections: [
    {
      id: 'how-we-credit',
      title: 'How we use and credit photos',
      body: [
        'Some photos on GalaTayo come from other people: open-licence photos (like Wikimedia Commons), creators\' public posts, and official pages of places and tourism offices. We show these with credit to the author, the licence or source, and a link back to the original.',
        'The credit for the main photo shows on the photo itself, and every credit is listed under "Photo credits and removal" at the bottom of each place page. Cards and previews show a small version of the same photo, with its credit on the place page.',
        'Photos uploaded by users belong to them. They promise they have the right to share them.',
      ],
    },
    {
      id: 'request',
      title: 'Ask us to remove or re-credit something',
      body: [
        `Tap "Request removal" next to any photo credit, use "Report a concern" and pick "Photo or copyright", or email ${email} with the subject "Removal request". Please include:`,
      ],
      bullets: [
        'Your name and how to reach you.',
        'The GalaTayo page link, and which photo or text it is.',
        'Proof that it is yours or that you act for the owner, like a link to your original post or account.',
        'What you want: removal, or a different credit.',
        'A short statement that the information you gave is true.',
      ],
    },
    {
      id: 'what-we-do',
      title: 'What happens next',
      bullets: [
        'We reply within 48 hours.',
        'Once we have the details above, we take the photo or text down (or fix the credit) within 48 hours. We do not wait to argue about it.',
        'We let the person who posted it know, if it came from a user.',
        'We keep a record of the request.',
      ],
      body: [],
    },
    {
      id: 'counter-notice',
      title: 'If your content was removed',
      body: [
        `If something you posted was removed and you think it was a mistake, or you have the right to use it, email ${email} with the page link, why you believe you have the right, and proof if you have it. We review it and may put the content back. We may share your message with the person who complained, without your private details where we can.`,
      ],
    },
    {
      id: 'repeat',
      title: 'Repeat infringers',
      body: [
        'We close the accounts of people who keep posting content that is not theirs. As a rule, an account with three valid copyright complaints is closed.',
      ],
    },
    {
      id: 'other-concerns',
      title: 'Privacy, defamation and trademarks',
      body: [
        `Are you in a photo and want it gone? Is a comment false and hurting your name or business? Is your brand or logo being misused? Email ${email} the same way. Requests about your own face or private details are handled first.`,
      ],
    },
    {
      id: 'false-claims',
      title: 'False claims',
      body: [
        'Please send only true claims. Sending false takedown requests to remove other people\'s content may break the law, and we may ignore people who do it again and again.',
      ],
    },
    {
      id: 'law',
      title: 'The law behind this',
      body: [
        'Copyright in the Philippines is protected by the Intellectual Property Code (Republic Act No. 8293, as amended by Republic Act No. 10372). This policy is how GalaTayo respects those rights in practice. It is not legal advice.',
      ],
    },
  ],
}

const disclaimer: LegalDoc = {
  eyebrow: 'Disclaimer',
  title: 'Disclaimer: place info, safety and AI',
  intro: 'GalaTayo helps you pick a place. Checking it is open, safe and right for you is still up to you.',
  seoTitle: 'Disclaimer | GalaTayo',
  seoDescription: 'Place information can change, safety tips for beaches, hikes and volcanoes, our editorial independence, user content rules and AI disclosure.',
  shortVersion: [
    'Prices, hours and access can change. Check before you go.',
    'Weather and nature can be dangerous. Follow PAGASA, PHIVOLCS and local advisories.',
    'No one pays to be listed or ranked on GalaTayo.',
    'Some content is written with AI and can be wrong.',
  ],
  sections: [
    {
      id: 'place-info',
      title: 'Place information can change',
      body: [
        'Prices, entrance fees, opening hours, rules, routes, parking and access change, sometimes without notice. Budgets on GalaTayo are rough starting amounts per person. Places can close for repairs, events, weather or good.',
        'Before you go, check the place\'s official page, call ahead, or use the "Report a concern" button if you find something wrong so we can fix it for the next barkada.',
      ],
    },
    {
      id: 'safety',
      title: 'Stay safe',
      body: ['Trips outdoors carry real risks. You visit any place at your own risk, and you are responsible for your own safety and for the people with you.'],
      bullets: [
        'Weather: check PAGASA forecasts and typhoon bulletins. Skip beaches, boats, rivers, falls and hikes when a storm signal or heavy rain warning is up.',
        'Water: swim only where it is allowed, ideally with a lifeguard. Wear a life vest on boats. Watch for strong currents and sudden river surges.',
        'Hikes: register with the local tourism office, hire an accredited guide where required, bring water, start early and turn back if the weather turns.',
        'Volcanoes: follow PHIVOLCS alert levels. Never enter a Permanent Danger Zone or a closed trail.',
        'Respect closures, private property, sacred sites and local rules.',
      ],
    },
    {
      id: 'not-affiliated',
      title: 'We are not linked to the places we list',
      body: [
        `GalaTayo is not affiliated with, endorsed by or paid by the places, businesses or brands we list. Their names and logos belong to them. If you run a place and something is wrong, email ${email} and we will fix it.`,
      ],
    },
    {
      id: 'editorial',
      title: 'Editorial independence',
      body: [
        'We pick and rank places using our own gala-worthy scoring, based on public evidence like travel lists, reviews and social buzz. No one can pay to be listed, ranked higher or kept off a list.',
        'Today there are no paid placements, sponsored posts or affiliate links on GalaTayo. If that ever changes, they will be clearly labelled "Sponsored" or "Ad", as the Consumer Act of the Philippines (Republic Act No. 7394) expects. Notes from our team are labelled "Editor\'s note" and never count as a review or rating.',
      ],
      links: [{ href: '/about#curation', label: 'How we pick places' }],
    },
    {
      id: 'user-content',
      title: 'Reviews and comments from users',
      body: [
        'Reviews, ratings, comments and tips are the opinions of the people who posted them, not GalaTayo\'s. We do not check every post. Posts must follow our community rules: no fake reviews, no defamation, no harassment. Report anything that breaks them.',
      ],
      links: [{ href: '/terms#community', label: 'Community rules' }],
    },
    {
      id: 'ai',
      title: 'AI-written content',
      body: [
        'Tara and Plan with AI write answers and plans with AI, using GalaTayo\'s place pages and live weather. Gala Today posts are written with AI, checked by an AI editor and our rules, and use only places listed on GalaTayo.',
        'AI can still get things wrong, mix up details or miss recent changes. Treat AI answers as ideas, and check anything important, like prices, hours, routes, weather and safety, before you go. To the extent the law allows, GalaTayo is not responsible for decisions made from AI suggestions.',
      ],
    },
    {
      id: 'maps-weather',
      title: 'Maps, directions and weather',
      body: [
        'Map pins, distances and travel tips are estimates. Map data is from OpenStreetMap contributors, and weather forecasts are from Open-Meteo. Forecasts can be wrong, so check PAGASA for official warnings.',
      ],
    },
  ],
}

export const legalDocs: Record<LegalPageType, LegalDoc> = { privacy, terms, cookies, copyright, disclaimer }
