import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  currentCondition,
  dayForecast,
  daysFromToday,
  describeWeather,
  findRainWindow,
  formatHour,
  formatHourRange,
  isOutdoorPlace,
  isRainLikelyHour,
  isWaterOrHikePlace,
  manilaHourKey,
  nextHours,
  outdoorTip,
  rainIntensity,
  rainSummary,
  safetyLine,
  summarizeDay,
  type DayForecast,
  type HourForecast,
} from './weather.ts'

type Spec = number | [chance: number, mm: number] | [chance: number, mm: number, code: number]

// Hourly entries from `start` ("YYYY-MM-DDTHH"). A bare number is a chance with 2 mm when ≥ 70, else 0 mm.
function hours(start: string, specs: Spec[], code = 2): HourForecast[] {
  const base = Date.parse(`${start}:00:00Z`)
  return specs.map((spec, index) => {
    const [rain, mm, hourCode] = typeof spec === 'number' ? [spec, spec >= 70 ? 2 : 0, code] : [spec[0], spec[1], spec[2] ?? code]
    return { time: new Date(base + index * 3_600_000).toISOString().slice(0, 16), temp: 30, code: hourCode, rain, mm }
  })
}

const dry = (count: number) => Array.from({ length: count }, () => 0)
const today: DayForecast = { date: '2026-10-06', code: 2, min: 25, max: 31, sunrise: '2026-10-06T05:48', sunset: '2026-10-06T17:45' }
const tomorrow: DayForecast = { date: '2026-10-07', code: 2, min: 25, max: 31, sunrise: '2026-10-07T05:48', sunset: '2026-10-07T17:44' }

test('manilaHourKey uses Asia/Manila (UTC+8)', () => {
  assert.equal(manilaHourKey(new Date('2026-10-06T07:30:00Z')), '2026-10-06T15:00')
  assert.equal(manilaHourKey(new Date('2026-10-06T16:10:00Z')), '2026-10-07T00:00')
})

test('formatHour and formatHourRange', () => {
  assert.equal(formatHour('2026-10-06T00:00'), '12 AM')
  assert.equal(formatHour('2026-10-06T15:00'), '3 PM')
  assert.equal(formatHour('2026-10-06T17:45'), '5:45 PM')
  assert.equal(formatHourRange('2026-10-06T15:00', '2026-10-06T17:00'), '3–5 PM')
  assert.equal(formatHourRange('2026-10-06T11:00', '2026-10-06T13:00'), '11 AM–1 PM')
})

test('nextHours starts at the current hour', () => {
  const list = hours('2026-10-06T10', dry(5))
  assert.deepEqual(nextHours(list, '2026-10-06T12:00', 2).map((hour) => hour.time), ['2026-10-06T12:00', '2026-10-06T13:00'])
})

test('rain is likely only at ≥ 70% chance AND ≥ 0.5 mm', () => {
  assert.equal(isRainLikelyHour({ rain: 70, mm: 0.5 }), true)
  assert.equal(isRainLikelyHour({ rain: 69, mm: 5 }), false)
  assert.equal(isRainLikelyHour({ rain: 100, mm: 0.4 }), false)
  // 100% with a trace of rain is not a rain window.
  assert.equal(findRainWindow(hours('2026-10-06T10', [[100, 0.2], [90, 0.3]])), null)
})

test('rain intensity bands: light < 1 mm/h, heavy ≥ 7.6 mm/h', () => {
  assert.equal(rainIntensity(0.9), 'light')
  assert.equal(rainIntensity(1), 'moderate')
  assert.equal(rainIntensity(7.5), 'moderate')
  assert.equal(rainIntensity(7.6), 'heavy')
})

test('findRainWindow finds the first likely run and its peak', () => {
  assert.equal(findRainWindow(hours('2026-10-06T10', [10, 20, 60])), null)
  assert.deepEqual(findRainWindow(hours('2026-10-06T10', [10, 20, [80, 3], [75, 9], 30, 80])), { start: '2026-10-06T12:00', end: '2026-10-06T14:00', startsNow: false, offset: 2, peakMm: 9 })
  assert.deepEqual(findRainWindow(hours('2026-10-06T10', [75, 80])), { start: '2026-10-06T10:00', end: null, startsNow: true, offset: 0, peakMm: 2 })
})

test('rainSummary lines carry intensity and never raw percentages', () => {
  assert.equal(rainSummary(hours('2026-10-06T13', [0, 0, 80, 90, 20, ...dry(7)])), 'Rain likely 3–5 PM')
  assert.equal(rainSummary(hours('2026-10-06T13', [0, 0, [80, 0.6], [90, 0.8], ...dry(8)])), 'Light rain likely 3–5 PM')
  assert.equal(rainSummary(hours('2026-10-06T13', [0, 0, [80, 9], 90, ...dry(8)])), 'Heavy rain likely 3–5 PM')
  assert.equal(rainSummary(hours('2026-10-06T10', [80, 75, 10, ...dry(9)])), 'Rain likely until 12 PM')
  assert.equal(rainSummary(hours('2026-10-06T10', [...dry(10), 80, 80])), 'Rain likely from 8 PM')
  assert.equal(rainSummary(hours('2026-10-06T10', dry(12))), 'Dry for the next 12 hrs')
  assert.equal(rainSummary(hours('2026-10-06T10', [0, [50, 0.3], ...dry(10)])), 'A few light showers possible')
  assert.equal(rainSummary(hours('2026-10-06T10', dry(12)), 61), 'Showers easing soon')
  assert.equal(rainSummary([]), '')
  for (const line of [rainSummary(hours('2026-10-06T10', [0, [60, 0.3], ...dry(10)]))]) assert.doesNotMatch(line, /%/)
})

test('no contradiction: a clear label never sits next to rain likely within 3 hours', () => {
  const soon = hours('2026-10-06T10', [0, 0, 80, 90, ...dry(8)])
  assert.deepEqual(currentCondition({ code: 0 }, soon), { label: 'Cloudy, rain soon', code: 3 })
  assert.deepEqual(currentCondition({ code: 1 }, hours('2026-10-06T10', [80, ...dry(11)])), { label: 'Cloudy, rain starting', code: 61 })
  // Rain later than 3 hours away keeps the real sky label.
  assert.deepEqual(currentCondition({ code: 0 }, hours('2026-10-06T10', [0, 0, 0, 80, ...dry(8)])), { label: 'Clear', code: 0 })
  // Already raining keeps the rain label.
  assert.deepEqual(currentCondition({ code: 63 }, soon), { label: 'Rain', code: 63 })
  // A high chance with only a trace of rain does not trigger it.
  assert.deepEqual(currentCondition({ code: 0 }, hours('2026-10-06T10', [[100, 0.1], ...dry(11)])), { label: 'Clear', code: 0 })

  // Across many hour patterns, a clear-sky label is never paired with rain likely in the next 3 hours.
  const patterns: Spec[][] = [[80], [0, 80], [0, 0, 80], [[90, 0.6]], [[70, 0.5], 0], [0, [75, 8]]]
  for (const pattern of patterns) {
    for (const code of [0, 1, 2]) {
      const list = hours('2026-10-06T10', [...pattern, ...dry(12 - pattern.length)])
      const { label } = currentCondition({ code }, list)
      const line = rainSummary(list, code)
      assert.ok(!(/^(Clear|Mostly clear|Partly cloudy|Sunny)$/.test(label) && /likely/.test(line)), `${label} / ${line}`)
    }
  }
})

test('isOutdoorPlace and isWaterOrHikePlace use category, tags, name and setting', () => {
  assert.equal(isOutdoorPlace({ category: 'Park', name: 'Rizal Park' }), true)
  assert.equal(isOutdoorPlace({ category: 'Activity', name: 'Escape room', indoorOutdoor: 'Indoor' }), false)
  assert.equal(isOutdoorPlace({ category: 'Heritage', name: 'White Beach Boracay' }), true)
  assert.equal(isOutdoorPlace({ category: 'Food', name: 'Lugawan', tags: [{ name: 'Comfort food' }] }), false)
  assert.equal(isOutdoorPlace({ category: 'Museum', name: 'National Museum' }), false)
  assert.equal(isWaterOrHikePlace({ category: 'Activity', name: 'Kawasan Falls' }), true)
  assert.equal(isWaterOrHikePlace({ category: 'Park', name: 'Rizal Park' }), false)
  assert.equal(isWaterOrHikePlace({ category: 'Heritage', name: 'Calle Crisologo', tags: [{ name: 'hiking' }], indoorOutdoor: 'indoor' }), false)
})

test('outdoorTip: daytime rain later says go before it', () => {
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T10', [0, 10, 20, 30, 80, 80, 70, 40, 0, 0, 0, 0]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T10:00'), 'Go before 2 PM today. Rain likely after.')
})

test('outdoorTip: a high chance with a trace of rain is not "rain likely"', () => {
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T10', [0, 0, 0, 0, [90, 0.2], [90, 0.2], 0, 0]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T10:00'), 'Dry until sunset (5:45 PM). Good time to go!')
})

test('outdoorTip: raining now, clears before sunset', () => {
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T10', [80, 70, 20, 10, 0, 0, 0, 0]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T10:00'), 'Rain likely until 12 PM. Head out after.')
})

test('outdoorTip: raining through sunset', () => {
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T14', [80, 70, 80, 90, 10]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T14:00'), 'Rain likely until sunset. Save it for tomorrow.')
})

test('outdoorTip: after dark it looks at tomorrow', () => {
  const night = hours('2026-10-06T19', Array.from({ length: 30 }, (_, index) => (index >= 18 ? 80 : 0)))
  // Index 18 from 7 PM is 1 PM tomorrow.
  assert.equal(outdoorTip({ days: [today, tomorrow], hours: night }, '2026-10-06T19:00'), 'Tomorrow: go before 1 PM. Rain likely after.')
  assert.equal(outdoorTip({ days: [today, tomorrow], hours: hours('2026-10-06T19', dry(30)) }, '2026-10-06T19:00'), 'Tomorrow looks dry from sunrise (5:48 AM). Good day to go!')
})

test('outdoorTip: no data, no tip', () => {
  assert.equal(outdoorTip({ days: [], hours: [] }, '2026-10-06T10:00'), null)
  assert.equal(outdoorTip({ days: [today], hours: hours('2026-10-06T19', [0, 0]) }, '2026-10-06T19:00'), null)
})

test('safetyLine flags storms now, likely storms and likely heavy rain only', () => {
  assert.equal(safetyLine({ code: 2 }, hours('2026-10-06T10', [0, 0])), null)
  assert.equal(safetyLine({ code: 95 }, []), 'Skip swimming and trails during thunderstorms.')
  assert.equal(safetyLine({ code: 2 }, hours('2026-10-06T10', [[80, 3, 96]])), 'Skip swimming and trails during thunderstorms.')
  // A storm code at a low chance is not "likely".
  assert.equal(safetyLine({ code: 2 }, hours('2026-10-06T10', [[30, 0.2, 95]])), null)
  assert.equal(safetyLine({ code: 61 }, hours('2026-10-06T10', [[80, 8]])), 'Heavy rain expected. Skip swimming and trails until it passes.')
  assert.equal(safetyLine({ code: 61 }, hours('2026-10-06T10', [[80, 3]])), null)
})

test('summarizeDay: plain wording from hourly data, no percentages', () => {
  const at = (specs: Spec[]) => hours('2026-10-09T06', specs)
  assert.deepEqual(summarizeDay(at([...dry(8), [80, 4, 95], [90, 6, 95], ...dry(6)]), '2026-10-09'), { text: 'Thunderstorms likely in the afternoon', code: 95 })
  assert.deepEqual(summarizeDay(at([[80, 0.6], 0, 0, [75, 0.7], 0, 0, 0, [80, 0.8], ...dry(8)]), '2026-10-09'), { text: 'Light showers on and off', code: 80 })
  assert.deepEqual(summarizeDay(at([[80, 0.6], [80, 0.7], ...dry(14)]), '2026-10-09'), { text: 'Light rain likely in the morning', code: 61 })
  assert.deepEqual(summarizeDay(at([...dry(12), [80, 9], [80, 3], ...dry(2)]), '2026-10-09'), { text: 'Heavy rain likely in the evening', code: 65 })
  assert.deepEqual(summarizeDay(at([[80, 2], ...dry(6), [80, 2], ...dry(5), [80, 2], 0, 0]), '2026-10-09'), { text: 'Rain likely most of the day', code: 63 })
  assert.deepEqual(summarizeDay(at([0, [100, 0.2], ...dry(14)]), '2026-10-09'), { text: 'A few light showers possible', code: 2 })
  assert.deepEqual(summarizeDay(at(dry(16)), '2026-10-09'), { text: 'Mostly dry', code: 1 })
  assert.equal(summarizeDay(at(dry(16)), '2026-10-20'), null)
})

test('describeWeather maps WMO codes', () => {
  assert.equal(describeWeather(0), 'Clear')
  assert.equal(describeWeather(2), 'Partly cloudy')
  assert.equal(describeWeather(63), 'Rain')
  assert.equal(describeWeather(81), 'Rain showers')
  assert.equal(describeWeather(95), 'Thunderstorm')
})

test('plan day helpers', () => {
  assert.equal(daysFromToday('2026-10-06', '2026-10-06'), 0)
  assert.equal(daysFromToday('2026-10-19', '2026-10-06'), 13)
  assert.equal(daysFromToday('2026-10-01', '2026-10-06'), -5)
  assert.equal(dayForecast([today, tomorrow], '2026-10-07'), tomorrow)
  assert.equal(dayForecast([today], '2026-10-20'), null)
})
