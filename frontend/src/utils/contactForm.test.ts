import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONTACT_COMMENT_MAX_LENGTH, composeContactComment, contactMailtoUrl, contactMessageRoom } from './contactForm.ts'

test('the feedback comment carries the topic and the reply address', () => {
  assert.equal(
    composeContactComment({ topic: 'Suggest a place', message: '  Try Hidden Valley Springs! ', replyEmail: ' me@example.com ' }),
    '[Contact] Suggest a place: Try Hidden Valley Springs!\nReply to: me@example.com',
  )
  assert.equal(composeContactComment({ topic: 'Question', message: 'Open on Mondays?', replyEmail: '' }), '[Contact] Question: Open on Mondays?')
})

test('a long message is cut so the comment fits the feedback limit with the reply address kept', () => {
  const comment = composeContactComment({ topic: 'Report a problem', message: 'x'.repeat(900), replyEmail: 'me@example.com' })
  assert.equal(comment.length, CONTACT_COMMENT_MAX_LENGTH)
  assert.ok(comment.endsWith('\nReply to: me@example.com'))
})

test('the message counter matches the room the comment leaves', () => {
  const room = contactMessageRoom({ topic: 'Question', replyEmail: 'me@example.com' })
  const full = composeContactComment({ topic: 'Question', message: 'y'.repeat(room), replyEmail: 'me@example.com' })
  assert.equal(full.length, CONTACT_COMMENT_MAX_LENGTH)
})

test('the email fallback encodes the subject and body', () => {
  assert.equal(
    contactMailtoUrl('team@example.com', { topic: 'Partnership or press', message: 'Hi & hello\nthere' }),
    'mailto:team@example.com?subject=GalaTayo%3A%20Partnership%20or%20press&body=Hi%20%26%20hello%0Athere',
  )
})
