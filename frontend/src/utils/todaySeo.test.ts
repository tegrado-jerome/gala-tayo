import assert from 'node:assert/strict'
import { test } from 'node:test'
import { todayListJsonLd, todayPostTitle } from './todaySeo.ts'

test('keeps the section name when the title is short enough', () => {
  assert.equal(todayPostTitle('Rainy Day Plans in Metro Manila'), "Rainy Day Plans in Metro Manila | Today's Plan")
})

test('drops the section name, then cuts at a word, to stay within 60 characters', () => {
  // Launch QA round 2: these went out at 63, 67 and 80 characters.
  for (const title of [
    'One Day Plan: Great things to do in Metro Manila',
    '₱300 Rainy Day Activities in Metro Manila: ₱75 Spent',
    'Things to do in Davao Region this weekend: The official tier list',
  ]) {
    const seoTitle = todayPostTitle(title)
    assert.ok(seoTitle.length <= 60, `${seoTitle.length}: ${seoTitle}`)
  }
  assert.equal(todayPostTitle('One Day Plan: Great things to do in Metro Manila'), 'One Day Plan: Great things to do in Metro Manila')
  assert.equal(todayPostTitle('Things to do in Davao Region this weekend: The official tier list'), "Things to do in Davao Region this weekend | Today's Plan")
  assert.equal(todayPostTitle('An extremely long trending headline without any colon that keeps on going'), 'An extremely long trending headline without any colon that')
})

test('lists the posts newest first as a CollectionPage ItemList', () => {
  const posts = [
    { slug: 'b', title: 'Second', publishedAt: '2026-10-12T06:30:00+08:00' },
    { slug: 'a', title: 'First', publishedAt: '2026-10-11T06:30:00+08:00' },
  ]
  const [page, breadcrumb] = todayListJsonLd(posts, 'https://galatayo.app')
  assert.equal(page['@type'], 'CollectionPage')
  assert.equal(page.url, 'https://galatayo.app/today')
  assert.equal(page.dateModified, posts[0].publishedAt)
  assert.equal(page.mainEntity.numberOfItems, 2)
  assert.deepEqual(page.mainEntity.itemListElement[0], { '@type': 'ListItem', position: 1, url: 'https://galatayo.app/today/b', name: 'Second' })
  assert.equal(breadcrumb['@type'], 'BreadcrumbList')
})
