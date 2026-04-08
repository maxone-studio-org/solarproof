import type { BdewPrice, CostParams, YearCostComparison } from '../types/cost'
import type { DayData } from '../types'

/** BDEW Durchschnittspreise Haushaltsstrom (ct/kWh, brutto) — Spec v1.2 */
const BDEW_PRICES: BdewPrice[] = [
  { year: 2019, price_ct: 31.20, cap_ct: null,  capped_default: false },
  { year: 2020, price_ct: 32.30, cap_ct: null,  capped_default: false },
  { year: 2021, price_ct: 32.80, cap_ct: null,  capped_default: false },
  { year: 2022, price_ct: 46.30, cap_ct: 40.00, capped_default: true },
  { year: 2023, price_ct: 47.00, cap_ct: 40.00, capped_default: true },
  { year: 2024, price_ct: 40.20, cap_ct: null,  capped_default: false },
  { year: 2025, price_ct: 39.30, cap_ct: null,  capped_default: false },
  { year: 2026, price_ct: 37.20, cap_ct: null,  capped_default: false },
]

export function getBdewPrices(): BdewPrice[] {
  return BDEW_PRICES
}

export function getEffectivePrice(price: BdewPrice, capActive: boolean): number {
  if (capActive && price.cap_ct !== null) {
    return Math.min(price.price_ct, price.cap_ct)
  }
  return price.price_ct
}

/** Calculate cost comparison per year */
export function calculateCostComparison(
  days: DayData[],
  params: CostParams,
  capOverrides: Record<number, boolean>, // year → cap active
): YearCostComparison[] {
  // Group days by year
  const yearMap = new Map<number, DayData[]>()
  for (const day of days) {
    const year = parseInt(day.date.substring(0, 4))
    if (!yearMap.has(year)) yearMap.set(year, [])
    yearMap.get(year)!.push(day)
  }

  const results: YearCostComparison[] = []

  for (const [year, yearDays] of [...yearMap.entries()].sort((a, b) => a[0] - b[0])) {
    const monthsInData = new Set(yearDays.map((d) => d.date.substring(0, 7))).size
    const anteil = monthsInData / 12

    // Verbrauchsdaten
    const eigenverbrauch_kwh = yearDays.reduce((s, d) => {
      // Eigenverbrauch = Erzeugung - Einspeisung (was selbst genutzt wurde)
      const ev = d.totals.erzeugung_kwh - d.totals.einspeisung_kwh
      return s + Math.max(0, ev)
    }, 0)
    const einspeisung_kwh = yearDays.reduce((s, d) => s + d.totals.einspeisung_kwh, 0)

    // Seite A: Gesamtkosten
    const kreditrate_eur = params.kreditrate_eur_monat * monthsInData
    const nachzahlung_eur = params.nachzahlung_eur_jahr * anteil
    const rueckerstattung_eur = params.rueckerstattung_eur_jahr * anteil
    const wartung_eur = params.wartung_eur_jahr * anteil
    const cloud_eur = params.cloud_eur_monat * monthsInData
    const einspeiseverguetung_eur = (einspeisung_kwh * params.einspeiseverguetung_ct_kwh) / 100

    const gesamtkosten_eur = kreditrate_eur + nachzahlung_eur + wartung_eur + cloud_eur - rueckerstattung_eur

    // Seite B: Äquivalenter Netzstrom
    const bdew = BDEW_PRICES.find((p) => p.year === year)
    if (!bdew) continue // Warnung: kein Preis für dieses Jahr

    const capActive = capOverrides[year] ?? bdew.capped_default
    const strompreis_ct = getEffectivePrice(bdew, capActive)
    const aequivalent_kwh = strompreis_ct > 0 ? (gesamtkosten_eur / (strompreis_ct / 100)) : 0

    results.push({
      year,
      kreditrate_eur,
      nachzahlung_eur,
      rueckerstattung_eur,
      wartung_eur,
      cloud_eur,
      einspeiseverguetung_eur,
      gesamtkosten_eur,
      eigenverbrauch_kwh,
      einspeisung_kwh,
      strompreis_ct,
      aequivalent_kwh,
      differenz_kwh: eigenverbrauch_kwh - aequivalent_kwh,
    })
  }

  return results
}
