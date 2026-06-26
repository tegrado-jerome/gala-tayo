import { buildPublicGalaPlanShareUrl, shareLink } from './share'

export function buildGalaPlanShareUrl(username: string, slug: string) {
  return buildPublicGalaPlanShareUrl(username, slug)
}

export async function shareGalaPlanLink(username: string, slug: string, title: string): Promise<void> {
  await shareLink({
    url: buildPublicGalaPlanShareUrl(username, slug),
    title,
    text: title,
  })
}
