/*
 * The place page's price line ("Free entry", "Starting from ₱150", "Pricey"). Kept free of imports so node:test can run it.
 */

// Amounts in a note that are shared by a car, boat or group, not paid per person.
const SHARED_COST = /\bper (vehicle|car|boat|group|van)\b/i

export function buildPriceBadgeLabel(
  budgetMin: number | string | null | undefined,
  priceLevel: number | null | undefined,
  budgetNote?: string | null,
  category?: string | null,
  placeName?: string | null,
) {
  // A missing budget is unknown, not free: Number(null) and Number('') are 0.
  const parsedBudgetMin = budgetMin == null || budgetMin === '' ? NaN : Number(budgetMin)
  if (Number.isFinite(parsedBudgetMin) && parsedBudgetMin <= 0) {
    return 'Free entry'
  }
  if (Number.isFinite(parsedBudgetMin)) {
    return `Starting from ₱${new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(parsedBudgetMin)))}`
  }

  const cleanedBudgetNote = budgetNote?.trim() || ''
  if (cleanedBudgetNote) {
    const amountMatch = SHARED_COST.test(cleanedBudgetNote) ? null : cleanedBudgetNote.match(/(?:₱|PHP\s*)\s*([0-9][0-9,]*)/i)
    const parsedAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : NaN
    if (Number.isFinite(parsedAmount)) {
      return `Starting from ₱${new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(parsedAmount)))}`
    }

    const searchableText = [placeName, category, cleanedBudgetNote].filter(Boolean).join(' ').toLowerCase()
    const isFlexibleTicketedVenue =
      /\b(activity|arena|stadium|theater|theatre|cinema|concert|show|event|ticket|booking|venue)\b/.test(searchableText) ||
      /\b(flexible budget|latest (menu|ticket|booking) price|ticketed event)\b/.test(searchableText)

    if (isFlexibleTicketedVenue) {
      return 'Starting from: varies'
    }
  }

  if (priceLevel == null || !Number.isFinite(priceLevel)) {
    return ''
  }

  const labels = ['Free', 'Budget', 'Moderate', 'Pricey', 'Premium']
  return labels[Math.min(Math.max(Math.floor(priceLevel), 0), labels.length - 1)] || ''
}
