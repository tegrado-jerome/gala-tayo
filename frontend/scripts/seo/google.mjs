// Minimal Google API client for a service account (no dependencies): signs a JWT, trades it
// for an access token, and calls Search Console and the GA4 Data API. Both APIs are free.
import { createSign } from 'node:crypto'

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly']

export function readCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  return raw ? JSON.parse(raw) : null
}

export async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: credentials.client_email,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(credentials.private_key).toString('base64url')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  })
  if (!response.ok) throw new Error(`Google token ${response.status}: ${await response.text()}`)
  return (await response.json()).access_token
}

async function call(token, url, body) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(`${new URL(url).pathname} ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response.json()
}

// Finds which form of the property (domain or URL prefix) the service account was added to.
export async function findSearchConsoleSite(token, domain) {
  const { siteEntry = [] } = await call(token, 'https://www.googleapis.com/webmasters/v3/sites')
  const preferred = [`sc-domain:${domain}`, `https://${domain}/`, `https://www.${domain}/`]
  return preferred.find((site) => siteEntry.some((entry) => entry.siteUrl === site)) ?? null
}

export function searchAnalytics(token, site, body) {
  return call(token, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body)
}

export function listSitemaps(token, site) {
  return call(token, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps`)
}

export function runGa4Report(token, propertyId, body) {
  return call(token, `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, body)
}
