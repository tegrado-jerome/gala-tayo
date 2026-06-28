type CategoryItem = {
  id: string
  name: string
}

type CategoryFiltersProps = {
  categories: CategoryItem[]
  selectedCategory: string
  onCategoryChange: (categoryId: string) => void
  className?: string
  wrap?: boolean
}

function CategoryFilters({
  categories,
  selectedCategory,
  onCategoryChange,
  className = '',
  wrap = false,
}: CategoryFiltersProps) {
  const containerLayout = wrap
    ? 'flex-wrap overflow-visible'
    : 'overflow-x-auto overflow-y-hidden whitespace-nowrap'

  const chipBehavior = wrap ? '' : 'shrink-0'

  return (
    <div className={`flex gap-2 pb-1 ${containerLayout} ${className}`}>
      <button
        type="button"
        onClick={() => onCategoryChange('all')}
        className={`${chipBehavior} rounded-full border px-3.5 py-2 text-xs font-medium transition ${
          selectedCategory === 'all'
            ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]'
            : 'border-[var(--line)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]'
        }`}
      >
        All
      </button>

      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onCategoryChange(category.id)}
          className={`${chipBehavior} rounded-full border px-3.5 py-2 text-xs font-medium transition ${
            selectedCategory === category.id
              ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent-deep)]'
              : 'border-[var(--line)] bg-white text-slate-700 hover:border-[var(--accent)] hover:bg-[var(--accent-wash)]'
          }`}
        >
          {category.name}
        </button>
      ))}
    </div>
  )
}

export default CategoryFilters
