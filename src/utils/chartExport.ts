import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { toZonedTime } from 'date-fns-tz'
import type { ChartData } from 'chart.js'
import type { DayData, DaySimulation } from '../types'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

const TZ = 'Europe/Berlin'

/** Render a Chart.js chart offscreen and return base64 PNG data URL */
function renderChartToImage(
  type: 'line' | 'bar',
  data: ChartData,
  width = 800,
  height = 300,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const chart = new Chart(canvas, {
    type,
    data,
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 9 } } },
        y: { ticks: { font: { size: 9 } } },
      },
    },
  })

  const dataUrl = canvas.toDataURL('image/png')
  chart.destroy()
  return dataUrl
}

/** Generate monthly SoC chart image for all days in a month */
export function renderMonthlySocChart(
  _days: DayData[],
  simResults: DaySimulation[],
  month: string,
): string | undefined {
  const monthSim = simResults.filter((d) => d.date.startsWith(month))
  if (monthSim.length === 0) return undefined

  // Flatten all intervals across the month
  const labels: string[] = []
  const socData: number[] = []

  for (const daySim of monthSim) {
    for (const interval of daySim.intervals) {
      const berlin = toZonedTime(interval.timestamp, TZ)
      const day = berlin.getDate()
      const hour = berlin.getHours()
      // Show label only at midnight and noon
      if (hour === 0) {
        labels.push(`${day}.`)
      } else if (hour === 12) {
        labels.push('')
      } else {
        labels.push('')
      }
      socData.push(interval.soc_kwh)
    }
  }

  return renderChartToImage('line', {
    labels,
    datasets: [
      {
        label: 'SoC (kWh)',
        data: socData,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 1.5,
      },
    ],
  })
}

/** Generate monthly Erzeugung vs Verbrauch bar chart */
export function renderMonthlyEvChart(
  days: DayData[],
  month: string,
): string | undefined {
  const monthDays = days.filter((d) => d.date.startsWith(month))
  if (monthDays.length === 0) return undefined

  const labels = monthDays.map((d) => {
    const day = parseInt(d.date.split('-')[2])
    return `${day}.`
  })

  return renderChartToImage('bar', {
    labels,
    datasets: [
      {
        label: 'Erzeugung (kWh)',
        data: monthDays.map((d) => d.totals.erzeugung_kwh),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
      },
      {
        label: 'Verbrauch (kWh)',
        data: monthDays.map((d) => d.totals.verbrauch_kwh),
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
      },
    ],
  })
}
