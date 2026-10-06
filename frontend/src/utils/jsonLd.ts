/**
 * JSON for a <script type="application/ld+json"> block. "<" is escaped so text such as a trend title
 * containing "</script>" cannot close the tag when the page is prerendered to static HTML.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
