import { useEffect, useMemo, useState } from 'react'

const STORAGE_PREFIX = 'galatayo:auth-resend-cooldown:'

function getStorageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`
}

function readCooldownEndsAt(key: string | null) {
  if (!key || typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(getStorageKey(key))
  if (!storedValue) {
    return null
  }

  const parsedValue = Number(storedValue)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function writeCooldownEndsAt(key: string | null, cooldownEndsAt: number | null) {
  if (!key || typeof window === 'undefined') {
    return
  }

  const storageKey = getStorageKey(key)

  if (!cooldownEndsAt) {
    window.localStorage.removeItem(storageKey)
    return
  }

  window.localStorage.setItem(storageKey, String(cooldownEndsAt))
}

export function formatCooldownDuration(milliseconds: number) {
  const safeMilliseconds = Math.max(0, milliseconds)
  const totalSeconds = Math.ceil(safeMilliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function useResendCooldown(key: string | null, cooldownMs = 120000) {
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(() => readCooldownEndsAt(key))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const storedCooldownEndsAt = readCooldownEndsAt(key)
    setCooldownEndsAt(storedCooldownEndsAt)
    setNow(Date.now())
  }, [key])

  useEffect(() => {
    if (!cooldownEndsAt) {
      return undefined
    }

    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [cooldownEndsAt])

  useEffect(() => {
    if (!cooldownEndsAt) {
      return
    }

    if (cooldownEndsAt <= now) {
      writeCooldownEndsAt(key, null)
      setCooldownEndsAt(null)
    }
  }, [cooldownEndsAt, key, now])

  const remainingMs = useMemo(() => {
    if (!cooldownEndsAt) {
      return 0
    }

    return Math.max(0, cooldownEndsAt - now)
  }, [cooldownEndsAt, now])

  const isCoolingDown = remainingMs > 0

  const startCooldown = (durationMs = cooldownMs) => {
    if (!key) {
      return
    }

    const nextCooldownEndsAt = Date.now() + durationMs
    writeCooldownEndsAt(key, nextCooldownEndsAt)
    setCooldownEndsAt(nextCooldownEndsAt)
    setNow(Date.now())
  }

  const clearCooldown = () => {
    writeCooldownEndsAt(key, null)
    setCooldownEndsAt(null)
    setNow(Date.now())
  }

  return {
    clearCooldown,
    formatCooldownDuration,
    isCoolingDown,
    remainingMs,
    startCooldown,
  }
}
