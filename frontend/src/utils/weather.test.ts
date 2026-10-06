import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dayForecast,
  daysFromToday,
  describeWeather,
  findRainWindow,
  formatHour,
  formatHourRange,
  isOutdoorPlace,
  isWaterOrHikePlace,
  manilaHourKey,
  nextHours,
  outdoorTip,
  rainSummary,
  safetyLine,
  type DayForecast,
  type HourForecast,
} from './weather.ts'

// Hourly entries from `start` ("YYYY-MM-DDTHH") with the given rain chances.
function hours(start: string, rain: number[], code = 2): HourForecast[] {
  const base = Date.parse(`${start}:00:00Z`)
  return rain.map((chance, index) => ({ time: new Date(base + index * 3_600_000).toISOString().slice(0, 16), temp: 30, code, rain: chance }))
}

const today: DayForecast = { date: '2026-10-06', code: 2, min: 25, max: 31, rain: 60, sunrise: '2026-10-06T05:48', sunset: '2026-10-06T17:45' }
const tomorrow: DayForecast = { date: '2026-10-07', code: 2, min: 25, max: 31, rain: 20, sunrise: '2026-10-07T05:48', sunset: '2026-10-07T17:44' }

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
  const list = hours('2026-10-06T10', [0, 0, 0, 0, 0])
  assert.deepEqual(nextHours(list, '2026-10-06T12:00', 2).map((hour) => hour.time), ['2026-10-06T12:00', '2026-10-06T13:00'])
})

test('findRainWindow finds the first likely run', () => {
  assert.equal(findRainWindow(hours('2026-10-06T10', [10, 20, 40])), null)
  assert.deepEqual(findRainWindow(hours('2026-10-06T10', [10, 20, 60, 70, 30, 80])), { start: '2026-10-06T12:00', end: '2026-10-06T14:00', startsNow: false })
  assert.deepEqual(findRainWindow(hours('2026-10-06T10', [55, 60])), { start: '2026-10-06T10:00', end: null, startsNow: true })
})

test('rainSummary lines', () => {
  assert.equal(rainSummary(hours('2026-10-06T10', [0, 10, 60, 70, 20, 0, 0, 0, 0, 0, 0, 0])), 'Rain likely 12–2 PM')
  assert.equal(rainSummary(hours('2026-10-06T13', [0, 0, 60, 70, 20, 0, 0, 0, 0, 0, 0, 0])), 'Rain likely 3–5 PM')
  assert.equal(rainSummary(hours('2026-10-06T10', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 'Dry for the next 12 hrs')
  assert.equal(rainSummary(hours('2026-10-06T10', [0, 0, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 'Up to 40% chance of rain, next 12 hrs')
  assert.equal(rainSummary(hours('2026-10-06T10', [70, 60, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 'Rain likely until 12 PM')
  assert.equal(rainSummary(hours('2026-10-06T10', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60, 70])), 'Rain likely from 8 PM')
  assert.equal(rainSummary([]), '')
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
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T10', [0, 10, 20, 30, 60, 80, 70, 40, 0, 0, 0, 0]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T10:00'), 'Go before 2 PM today. Rain likely after.')
})

test('outdoorTip: raining now, clears before sunset', () => {
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T10', [80, 70, 20, 10, 0, 0, 0, 0]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T10:00'), 'Rain likely until 12 PM. Head out after.')
})

test('outdoorTip: raining through sunset', () => {
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T14', [80, 70, 60, 90, 10]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T14:00'), 'Rain likely until sunset. Save it for tomorrow.')
})

test('outdoorTip: dry daylight', () => {
  const forecast = { days: [today, tomorrow], hours: hours('2026-10-06T10', [0, 0, 0, 0, 0, 0, 0, 0, 0]) }
  assert.equal(outdoorTip(forecast, '2026-10-06T10:00'), 'Dry until sunset (5:45 PM). Good time to go!')
})

test('outdoorTip: after dark it looks at tomorrow', () => {
  const night = hours('2026-10-06T19', Array.from({ length: 30 }, (_, index) => (index >= 18 ? 70 : 0)))
  // Index 18 from 7 PM is 1 PM tomorrow.
  assert.equal(outdoorTip({ days: [today, tomorrow], hours: night }, '2026-10-06T19:00'), 'Tomorrow: go before 1 PM. Rain likely after.')
  const dry = hours('2026-10-06T19', Array.from({ length: 30 }, () => 0))
  assert.equal(outdoorTip({ days: [today, tomorrow], hours: dry }, '2026-10-06T19:00'), 'Tomorrow looks dry from sunrise (5:48 AM). Good day to go!')
})

test('outdoorTip: no data, no tip', () => {
  assert.equal(outdoorTip({ days: [], hours: [] }, '2026-10-06T10:00'), null)
  assert.equal(outdoorTip({ days: [today], hours: hours('2026-10-06T19', [0, 0]) }, '2026-10-06T19:00'), null)
})

test('safetyLine flags storms and heavy rain only', () => {
  assert.equal(safetyLine({ code: 2 }, hours('2026-10-06T10', [0, 0])), null)
  assert.equal(safetyLine({ code: 95 }, []), 'Skip swimming and trails during thunderstorms.')
  assert.equal(safetyLine({ code: 2 }, hours('2026-10-06T10', [80], 96)), 'Skip swimming and trails during thunderstorms.')
  assert.equal(safetyLine({ code: 65 }, []), 'Heavy rain expected. Skip swimming and trails until it passes.')
  assert.equal(safetyLine({ code: 61 }, hours('2026-10-06T10', [60], 61)), null)
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
