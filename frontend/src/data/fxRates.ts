// Rough rates for showing visitors an approximate USD/EUR price next to PHP. PHP stays the real price.
// Update both numbers and the date together. Source: ECB euro reference rates for 9 Oct 2026
// (https://api.frankfurter.dev/v1/latest?base=USD&symbols=PHP,EUR); BSP's October 2026 USD average was ₱62.71.
export const FX_RATES = {
  asOf: '2026-10-09',
  phpPer: { USD: 62.8, EUR: 70.4 },
} as const

export type ForeignCurrency = keyof typeof FX_RATES.phpPer
