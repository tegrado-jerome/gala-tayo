import { buildPublicGalaPlanShareUrl, shareLink, type ShareResult } from './share'

export function buildGalaPlanShareUrl(username: string, slug: string) {
  return buildPublicGalaPlanShareUrl(username, slug)
}

export async function shareGalaPlanLink(username: string, slug: string, title: string): Promise<ShareResult> {
  const result = await shareLink({
    url: buildPublicGalaPlanShareUrl(username, slug),
    title,
    text: title,
  })

  return result
}
