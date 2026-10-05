import { useEffect, useState } from 'react'

/** Desktop anchor tabs that follow the section in view (Klook / Booking pattern). */
export function SectionTabs({ items }: { items: Array<{ id: string; label: string }> }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  const idsKey = items.map((item) => item.id).join('|')

  useEffect(() => {
    const sections = idsKey
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-140px 0px -55% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [idsKey])

  return (
    <nav aria-label="Sections" className="g-only-desk pd-tabs">
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`} aria-current={activeId === item.id ? 'true' : undefined} onClick={(event) => {
            event.preventDefault()
            setActiveId(item.id)
            document.getElementById(item.id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
          }}>
          {item.label}
        </a>
      ))}
    </nav>
  )
}

export default SectionTabs
