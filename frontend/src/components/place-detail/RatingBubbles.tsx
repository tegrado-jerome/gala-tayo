import { cx } from '../ui'

/** Tripadvisor-style score: five small circles, filled to the nearest half. */
export function RatingBubbles({ rating, large = false, className }: { rating: number; large?: boolean; className?: string }) {
  const rounded = Math.round(Math.min(Math.max(rating, 0), 5) * 2) / 2
  return (
    <span className={cx('pd-bubbles', large && 'is-lg', className)} role="img" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <span key={value} className={cx('pd-bub', value <= rounded ? 'is-full' : value - 0.5 === rounded && 'is-half')} />
      ))}
    </span>
  )
}

export default RatingBubbles
