// The contact form posts to /api/feedback, which stores one comment of up to 500 characters.
export const CONTACT_COMMENT_MAX_LENGTH = 500

export const contactTopics = ['Question', 'Suggest a place', 'Report a problem', 'Partnership or press', 'Something else'] as const

export type ContactTopic = (typeof contactTopics)[number]

export type ContactMessage = {
  topic: ContactTopic
  message: string
  replyEmail: string
}

/** "[Contact] Topic: message", plus the reply address when given, cut to fit the feedback comment. */
export function composeContactComment({ topic, message, replyEmail }: ContactMessage) {
  const replyLine = replyEmail.trim() ? `\nReply to: ${replyEmail.trim()}` : ''
  const head = `[Contact] ${topic}: `
  const room = CONTACT_COMMENT_MAX_LENGTH - head.length - replyLine.length
  return `${head}${message.trim().slice(0, room)}${replyLine}`
}

/** Characters left for the message itself once the topic and reply address are added. */
export function contactMessageRoom({ topic, replyEmail }: Pick<ContactMessage, 'topic' | 'replyEmail'>) {
  return CONTACT_COMMENT_MAX_LENGTH - composeContactComment({ topic, message: '', replyEmail }).length
}

export function contactMailtoUrl(to: string, { topic, message }: Pick<ContactMessage, 'topic' | 'message'>) {
  return `mailto:${to}?subject=${encodeURIComponent(`GalaTayo: ${topic}`)}&body=${encodeURIComponent(message.trim())}`
}
