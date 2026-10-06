import { cx } from '../ui'

/** Five sun dots, filled to the nearest half. Only shown when a place has enough real ratings. */
export function SunDots({ rating, large = false, className }: { rating: number; large?: boolean; className?: string }) {
  const rounded = Math.round(Math.min(Math.max(rating, 0), 5) * 2) / 2
  return (
    <span className={cx('g-sun', large && 'pd-sun-lg', className)} role="img" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <i key={value} className={value <= rounded ? 'is-f' : value - 0.5 === rounded ? 'is-h' : undefined} />
      ))}
    </span>
  )
}

export default SunDots
