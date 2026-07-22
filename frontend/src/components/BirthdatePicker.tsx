import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendar, faChevronDown, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'

type BirthdatePickerProps = {
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

function BirthdatePicker({ value, onChange, helperText, error, minYear = 1900, maxYear }: BirthdatePickerProps) {
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
      const selectedOption = yearMenuRef.current?.querySelector<HTMLButtonElement>('.gala-date-year-option.is-selected')
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

  return (
    <div className="gala-date-picker">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closeCalendar() : openCalendar())}
        className="gala-date-trigger"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="gala-date-icon">
            <FontAwesomeIcon icon={faCalendar} className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0">
            <span className={`block truncate text-left text-sm font-semibold ${selectedDate ? 'text-[var(--text-main)]' : 'text-[var(--text-disabled)]'}`}>
              {selectedDate ? new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(selectedDate) : 'Select birthdate'}
            </span>
            <span className="block truncate text-left text-xs text-[var(--muted)]">
              {selectedDate ? 'Stored as YYYY-MM-DD' : 'Optional birthdate for your account'}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <FontAwesomeIcon icon={faChevronDown} className={`gala-date-chevron h-4 w-4 shrink-0 text-[var(--text-disabled)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {isOpen
        ? createPortal(
            <div className="gala-date-popover" role="presentation" onClick={closeCalendar}>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                className="gala-date-popover-shell"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="gala-date-popover-header">
                  <div className="min-w-0">
                    <p id={dialogTitleId} className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                      Birthdate
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                      {selectedDate ? 'Edit your stored birthdate.' : 'Pick a birthdate.'}
                    </p>
                  </div>
                </div>

                <div className="gala-date-popover-controls">
                  <button
                    type="button"
                    onClick={goPrevMonth}
                    disabled={!canGoPrev}
                    className="gala-date-nav-button"
                    aria-label="Previous month"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
                  </button>

                  <div className="gala-date-month-label">
                    <span className="block text-sm font-black tracking-[-0.03em] text-[var(--text-main)]">
                      {new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(visibleMonth)}
                    </span>
                    <div className="gala-date-year-wrap">
                      <button
                        ref={yearButtonRef}
                        type="button"
                        onClick={() => setIsYearMenuOpen((current) => !current)}
                        className="gala-date-year-button"
                        aria-haspopup="listbox"
                        aria-expanded={isYearMenuOpen}
                      >
                        <span>{visibleMonth.getUTCFullYear()}</span>
                        <FontAwesomeIcon icon={faChevronDown} className={`h-3.5 w-3.5 transition-transform ${isYearMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={goNextMonth}
                    disabled={!canGoNext}
                    className="gala-date-nav-button"
                    aria-label="Next month"
                  >
                    <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
                  </button>
                </div>

                <div className="gala-date-popover-actions">
                  <button type="button" onClick={() => setVisibleMonth(today)} className="gala-date-utility-button">
                    Today
                  </button>
                  {selectedDate ? (
                    <button type="button" onClick={clearDate} className="gala-date-utility-button">
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="gala-date-calendar">
                  <div className="gala-date-weekdays">
                    {BIRTHDATE_WEEKDAYS.map((day) => (
                      <span key={day} className="gala-date-weekday">
                        {day}
                      </span>
                    ))}
                  </div>
                  <div className="gala-date-grid">
                    {calendarDays.map((date) => {
                      const dayNumber = date.getUTCDate()
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
                          className={[
                            'gala-date-day',
                            isCurrentMonth ? 'gala-date-day-current' : 'gala-date-day-outside',
                            isSelected ? 'gala-date-day-selected' : '',
                            isToday ? 'gala-date-day-today' : '',
                          ].join(' ')}
                        >
                          <span>{dayNumber}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="gala-date-popover-footer">
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    {selectedDate ? `Selected: ${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(selectedDate)}` : 'Choose a birthdate for age checks and reminders.'}
                  </span>
                </div>
              </div>
              {isYearMenuOpen
                ? createPortal(
                    <div
                      ref={yearMenuRef}
                      role="listbox"
                      aria-label="Birth year"
                      className="gala-date-year-menu"
                      style={{ visibility: 'hidden', ...yearMenuStyle }}
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
                            className={`gala-date-year-option ${selected ? 'is-selected' : ''}`}
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

      {helperText ? <p className="text-xs font-semibold text-[var(--muted)]">{helperText}</p> : null}
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  )
}

export default BirthdatePicker
