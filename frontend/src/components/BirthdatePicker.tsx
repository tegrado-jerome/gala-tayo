import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { Button, cx } from './ui'

type BirthdatePickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  helperText?: string
  error?: string
  minYear?: number
  maxYear?: number
}

function isValidBirthdate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function parseBirthdate(value: string | null | undefined) {
  if (!value || !isValidBirthdate(value)) {
    return null
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatBirthdateInput(value: Date) {
  const year = value.getUTCFullYear()
  const month = `${value.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${value.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
}

function addUtcMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1))
}

function buildCalendarDays(viewMonth: Date) {
  const monthStart = startOfUtcMonth(viewMonth)
  const firstWeekday = monthStart.getUTCDay()
  const gridStart = new Date(monthStart)
  gridStart.setUTCDate(monthStart.getUTCDate() - firstWeekday)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setUTCDate(gridStart.getUTCDate() + index)
    return date
  })
}

function isSameUtcDay(left: Date | null, right: Date | null) {
  if (!left || !right) {
    return false
  }

  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth() && left.getUTCDate() === right.getUTCDate()
}

function isSameUtcMonth(left: Date, right: Date) {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth()
}

const BIRTHDATE_WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2024, 0, 7 + index))),
)

function BirthdatePicker({ id, value, onChange, helperText, error, minYear = 1900, maxYear }: BirthdatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isYearMenuOpen, setIsYearMenuOpen] = useState(false)
  const [yearMenuStyle, setYearMenuStyle] = useState<CSSProperties>({})
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfUtcMonth(parseBirthdate(value) ?? new Date()))
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const yearButtonRef = useRef<HTMLButtonElement | null>(null)
  const yearMenuRef = useRef<HTMLDivElement | null>(null)
  const dialogTitleId = useId()
  const selectedDate = useMemo(() => parseBirthdate(value), [value])
  const currentDate = useMemo(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  }, [])
  const today = useMemo(() => startOfUtcMonth(currentDate), [currentDate])
  const resolvedMaxYear = maxYear ?? currentDate.getUTCFullYear()
  const minDate = useMemo(() => new Date(Date.UTC(minYear, 0, 1)), [minYear])
  const maxDate = useMemo(() => {
    const maxYearEnd = new Date(Date.UTC(resolvedMaxYear, 11, 31))
    return maxYearEnd > currentDate ? currentDate : maxYearEnd
  }, [currentDate, resolvedMaxYear])
  const maxMonth = useMemo(() => startOfUtcMonth(maxDate), [maxDate])
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth])
  const yearOptions = useMemo(() => Array.from({ length: resolvedMaxYear - minYear + 1 }, (_, index) => resolvedMaxYear - index), [minYear, resolvedMaxYear])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsYearMenuOpen(false)
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setIsYearMenuOpen(false)
      return
    }

    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setVisibleMonth(startOfUtcMonth(selectedDate ?? new Date()))
  }, [isOpen, selectedDate])

  useEffect(() => {
    if (!isYearMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const targetNode = event.target as Node
      const clickedButton = yearButtonRef.current?.contains(targetNode)
      const clickedMenu = yearMenuRef.current?.contains(targetNode)

      if (!clickedButton && !clickedMenu) {
        setIsYearMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [isYearMenuOpen])

  useEffect(() => {
    if (!isYearMenuOpen) {
      return
    }

    const updateYearMenuPosition = () => {
      if (!yearButtonRef.current) {
        return
      }

      const rect = yearButtonRef.current.getBoundingClientRect()
      const viewportPadding = 12
      const gap = 8
      const menuWidth = Math.max(96, Math.min(120, rect.width + 24))
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding
      const spaceAbove = rect.top - gap - viewportPadding
      const shouldOpenUpward = spaceBelow < 280 && spaceAbove > spaceBelow
      const preferredLeft = rect.left + rect.width / 2 - menuWidth / 2
      const maxLeft = window.innerWidth - viewportPadding - menuWidth
      const left = Math.min(Math.max(viewportPadding, preferredLeft), Math.max(viewportPadding, maxLeft))

      setYearMenuStyle({
        position: 'fixed',
        left,
        top: shouldOpenUpward ? undefined : rect.bottom + gap,
        bottom: shouldOpenUpward ? window.innerHeight - rect.top + gap : undefined,
        width: menuWidth,
        maxHeight: Math.min(280, Math.max(160, shouldOpenUpward ? spaceAbove : spaceBelow)),
        visibility: 'visible',
        zIndex: 7200,
      })
    }

    updateYearMenuPosition()
    window.addEventListener('resize', updateYearMenuPosition)
    window.addEventListener('scroll', updateYearMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateYearMenuPosition)
      window.removeEventListener('scroll', updateYearMenuPosition, true)
    }
  }, [isYearMenuOpen])

  useEffect(() => {
    if (!isYearMenuOpen) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const selectedOption = yearMenuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      selectedOption?.scrollIntoView({ block: 'center' })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [isYearMenuOpen, visibleMonth])

  const openCalendar = () => {
    setVisibleMonth(startOfUtcMonth(selectedDate ?? new Date()))
    setIsYearMenuOpen(false)
    setIsOpen(true)
  }

  const closeCalendar = () => {
    setIsYearMenuOpen(false)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const selectDate = (date: Date) => {
    onChange(formatBirthdateInput(date))
    setVisibleMonth(startOfUtcMonth(date))
    closeCalendar()
  }

  const clearDate = () => {
    onChange('')
    closeCalendar()
  }

  const handleYearSelect = (nextYear: number) => {
    setVisibleMonth(new Date(Date.UTC(nextYear, visibleMonth.getUTCMonth(), 1)))
    setIsYearMenuOpen(false)
  }

  const canGoPrev = visibleMonth.getUTCFullYear() > minYear || visibleMonth.getUTCMonth() > 0
  const canGoNext = visibleMonth < maxMonth

  const goPrevMonth = () => {
    if (!canGoPrev) return
    setVisibleMonth(addUtcMonths(visibleMonth, -1))
  }

  const goNextMonth = () => {
    if (!canGoNext) return
    setVisibleMonth(addUtcMonths(visibleMonth, 1))
  }

  const isDateDisabled = (date: Date) => date < minDate || date > maxDate

  const longDate = (date: Date) => new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
  const messageId = id && (error || helperText) ? `${id}-msg` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={messageId}
        onClick={() => (isOpen ? closeCalendar() : openCalendar())}
        className="g-input flex items-center justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Calendar className="g-ic" style={{ color: 'var(--ink-2)' }} aria-hidden="true" />
          <span className="truncate" style={{ color: selectedDate ? 'var(--ink)' : 'var(--ink-3)' }}>
            {selectedDate ? longDate(selectedDate) : 'Select birthdate'}
          </span>
        </span>
        <ChevronDown
          className="g-ic"
          style={{ color: 'var(--ink-3)', transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform var(--t) var(--ease-g)' }}
          aria-hidden="true"
        />
      </button>

      {isOpen
        ? createPortal(
            <div className="g-sheet-scrim" role="presentation" onClick={closeCalendar}>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                className="g-sheet"
                style={{ maxWidth: 420 }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="g-grab" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id={dialogTitleId} className="g-h3">
                      Birthdate
                    </h2>
                    <p className="g-xs g-mut mt-0.5">{selectedDate ? 'Edit your birthdate.' : 'Pick your birthdate.'}</p>
                  </div>
                  <Button variant="soft" size="sm" iconOnly onClick={closeCalendar} aria-label="Close">
                    <X aria-hidden="true" />
                  </Button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button variant="line" size="sm" iconOnly onClick={goPrevMonth} disabled={!canGoPrev} aria-label="Previous month">
                    <ChevronLeft aria-hidden="true" />
                  </Button>

                  <div className="flex min-w-0 items-center gap-2">
                    <span className="g-h3">{new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(visibleMonth)}</span>
                    <button
                      ref={yearButtonRef}
                      type="button"
                      onClick={() => setIsYearMenuOpen((current) => !current)}
                      className="g-chip"
                      aria-haspopup="listbox"
                      aria-expanded={isYearMenuOpen}
                      aria-label={`Year ${visibleMonth.getUTCFullYear()}, change year`}
                    >
                      {visibleMonth.getUTCFullYear()}
                      <ChevronDown style={{ transform: isYearMenuOpen ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
                    </button>
                  </div>

                  <Button variant="line" size="sm" iconOnly onClick={goNextMonth} disabled={!canGoNext} aria-label="Next month">
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                  {BIRTHDATE_WEEKDAYS.map((day) => (
                    <span key={day} className="g-xs g-fnt py-1 font-semibold">
                      {day}
                    </span>
                  ))}
                  {calendarDays.map((date) => {
                    const isCurrentMonth = isSameUtcMonth(date, visibleMonth)
                    const isSelected = isSameUtcDay(date, selectedDate)
                    const isToday = isSameUtcDay(date, new Date())
                    const isDisabled = isDateDisabled(date)

                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => selectDate(date)}
                        aria-pressed={isSelected}
                        aria-label={longDate(date)}
                        className={cx(
                          'g-sm grid h-10 place-items-center rounded-full',
                          isSelected ? 'font-semibold' : 'hover:bg-[var(--fill)]',
                          isDisabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer',
                        )}
                        style={{
                          background: isSelected ? 'var(--ink)' : undefined,
                          color: isSelected ? 'var(--on-ink)' : isCurrentMonth ? 'var(--ink)' : 'var(--ink-3)',
                          boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px var(--ink-3)' : undefined,
                        }}
                      >
                        {date.getUTCDate()}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="g-xs g-mut min-w-0">{selectedDate ? `Selected: ${longDate(selectedDate)}` : 'Used for age checks and reminders.'}</span>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="text" size="sm" onClick={() => setVisibleMonth(today)}>
                      Today
                    </Button>
                    {selectedDate ? (
                      <Button variant="text" size="sm" onClick={clearDate}>
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              {isYearMenuOpen
                ? createPortal(
                    <div
                      ref={yearMenuRef}
                      role="listbox"
                      aria-label="Birth year"
                      className="overflow-y-auto p-1"
                      style={{
                        visibility: 'hidden',
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--r-3)',
                        boxShadow: 'var(--sh-3)',
                        ...yearMenuStyle,
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {yearOptions.map((year) => {
                        const selected = year === visibleMonth.getUTCFullYear()
                        return (
                          <button
                            key={year}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => handleYearSelect(year)}
                            className={cx('g-sm block h-9 w-full rounded-[var(--r-2)] text-center', selected ? 'font-semibold' : 'hover:bg-[var(--fill)]')}
                            style={selected ? { background: 'var(--ink)', color: 'var(--on-ink)' } : { color: 'var(--ink)' }}
                          >
                            {year}
                          </button>
                        )
                      })}
                    </div>,
                    document.body,
                  )
                : null}
            </div>,
            document.body,
          )
        : null}

      {error ? (
        <span id={messageId} className="g-hint is-error">{error}</span>
      ) : helperText ? (
        <span id={messageId} className="g-hint">{helperText}</span>
      ) : null}
    </div>
  )
}

export default BirthdatePicker
