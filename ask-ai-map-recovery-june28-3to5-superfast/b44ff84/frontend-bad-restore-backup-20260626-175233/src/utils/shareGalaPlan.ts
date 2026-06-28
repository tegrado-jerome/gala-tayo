export function buildGalaPlanShareUrl(username: string, slug: string) {
  return `${window.location.origin}/u/${encodeURIComponent(username)}/gala/${encodeURIComponent(slug)}`
}

export async function shareGalaPlanLink(username: string, slug: string, title: string) {
  const url = buildGalaPlanShareUrl(username, slug)

  if (navigator.share) {
    await navigator.share({
      title,
      text: title,
      url,
    })
    return 'Shared.'
  }

  await navigator.clipboard.writeText(url)
  return 'Link copied.'
}
