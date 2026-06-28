type CommentModerationNotice = {
  id: string
  commentId: string
  status: 'action_taken'
  message: string
  createdAt: string
  resolvedAt: string | null
  comment: {
    text: string
    status: 'hidden'
  }
  place: {
    id: string
    name: string | null
    slug: string | null
  } | null
}

type CommentModerationNoticesResponse = {
  notices?: CommentModerationNotice[]
  message?: string
}

function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()

  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function fetchMyCommentModerationNotices(token: string, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint('/me/comment-moderation-notices'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })
  const result = await readJson<CommentModerationNoticesResponse>(response)

  if (!response.ok) {
    throw new Error(result?.message || 'Could not load your comment notices. Please try again.')
  }

  return result?.notices || []
}

export { fetchMyCommentModerationNotices }
export type { CommentModerationNotice }
