import type { DayData, SimulationParams, SimulationInterval, DaySimulation } from '../types'

/**
 * Run battery simulation across all days.
 *
 * Two modes:
 * 1. Grid-flow mode (preferred): Uses actual netzbezug/einspeisung per interval.
 *    Guarantees netzbezug_sim ≤ netzbezug_ist. Required for SENEC and other systems
 *    where erzeugung/verbrauch may include battery effects.
 * 2. Fallback mode: Uses erzeugung - verbrauch when netzbezug/einspeisung aren't available.
 */
export function runSimulation(
  days: DayData[],
  params: SimulationParams
): DaySimulation[] {
  // Detect if netzbezug/einspeisung data is available
  const hasGridFlowData = days.some((d) =>
    d.intervals.some((i) => i.netzbezug_kwh > 0 || i.einspeisung_kwh > 0)
  )

  return hasGridFlowData
    ? simulateFromGridFlows(days, params)
    : simulateFromSurplus(days, params)
}

/** Mode 1: Simulate using actual grid flows (netzbezug/einspeisung) */
function simulateFromGridFlows(
  days: DayData[],
  params: SimulationParams
): DaySimulation[] {
  const maxCapacity = params.kapazitaet_kwh
  const minSoc = maxCapacity * (1 - params.entladetiefe_pct / 100)
  const chargeEff = params.ladewirkungsgrad_pct / 100
  const dischargeEff = params.entladewirkungsgrad_pct / 100

  let soc = maxCapacity * (params.anfangs_soc_pct / 100)
  const results: DaySimulation[] = []

  for (const day of days) {
    const socAtDayStart = soc
    const simIntervals: SimulationInterval[] = []
    let dayGeladen = 0
    let dayEntladen = 0
    let dayNetzbezugSim = 0
    let dayEinspeisungSim = 0
    let socMin = soc
    let socMax = soc

    for (const interval of day.intervals) {
      let geladen = 0
      let entladen = 0
      let netzbezugSim = interval.netzbezug_kwh
      let einspeisungSim = interval.einspeisung_kwh

      // Charge from surplus (energy that would go to grid)
      if (einspeisungSim > 0) {
        const availableCapacity = maxCapacity - soc
        const maxChargeFromSurplus = availableCapacity / chargeEff
        const captured = Math.min(einspeisungSim, maxChargeFromSurplus)
        geladen = captured * chargeEff
        soc += geladen
        einspeisungSim -= captured
      }

      // Discharge to cover deficit (energy that would come from grid)
      if (netzbezugSim > 0) {
        const availableDischarge = (soc - minSoc) * dischargeEff
        const covered = Math.min(netzbezugSim, availableDischarge)
        entladen = covered / dischargeEff
        soc -= entladen
        netzbezugSim -= covered
      }

      socMin = Math.min(socMin, soc)
      socMax = Math.max(socMax, soc)
      dayGeladen += geladen
      dayEntladen += entladen
      dayNetzbezugSim += netzbezugSim
      dayEinspeisungSim += einspeisungSim

      simIntervals.push({
        timestamp: interval.timestamp,
        soc_kwh: soc,
        geladen_kwh: geladen,
        entladen_kwh: entladen,
        netzbezug_sim_kwh: netzbezugSim,
        einspeisung_sim_kwh: einspeisungSim,
      })
    }

    results.push({
      date: day.date,
      soc_start_kwh: socAtDayStart,
      intervals: simIntervals,
      totals: {
        geladen_kwh: dayGeladen,
        entladen_kwh: dayEntladen,
        netzbezug_sim_kwh: dayNetzbezugSim,
        einspeisung_sim_kwh: dayEinspeisungSim,
        soc_min_kwh: socMin,
        soc_max_kwh: socMax,
      },
    })
  }

  return results
}

/** Mode 2: Fallback — simulate using erzeugung - verbrauch (no grid flow data) */
function simulateFromSurplus(
  days: DayData[],
  params: SimulationParams
): DaySimulation[] {
  const maxCapacity = params.kapazitaet_kwh
  const minSoc = maxCapacity * (1 - params.entladetiefe_pct / 100)
  const chargeEff = params.ladewirkungsgrad_pct / 100
  const dischargeEff = params.entladewirkungsgrad_pct / 100

  let soc = maxCapacity * (params.anfangs_soc_pct / 100)
  const results: DaySimulation[] = []

  for (const day of days) {
    const socAtDayStart = soc
    const simIntervals: SimulationInterval[] = []
    let dayGeladen = 0
    let dayEntladen = 0
    let dayNetzbezugSim = 0
    let dayEinspeisungSim = 0
    let socMin = soc
    let socMax = soc

    for (const interval of day.intervals) {
      const ueberschuss = interval.erzeugung_kwh - interval.verbrauch_kwh

      let geladen = 0
      let entladen = 0
      let netzbezugSim = 0
      let einspeisungSim = 0

      if (ueberschuss > 0) {
        const maxCharge = maxCapacity - soc
        geladen = Math.min(ueberschuss * chargeEff, maxCharge)
        soc += geladen
        einspeisungSim = ueberschuss - geladen / chargeEff
      } else {
        const bedarf = Math.abs(ueberschuss)
        const maxDischarge = soc - minSoc
        entladen = Math.min(bedarf / dischargeEff, maxDischarge)
        soc -= entladen
        netzbezugSim = bedarf - entladen * dischargeEff
      }

      socMin = Math.min(socMin, soc)
      socMax = Math.max(socMax, soc)
      dayGeladen += geladen
      dayEntladen += entladen
      dayNetzbezugSim += netzbezugSim
      dayEinspeisungSim += einspeisungSim

      simIntervals.push({
        timestamp: interval.timestamp,
        soc_kwh: soc,
        geladen_kwh: geladen,
        entladen_kwh: entladen,
        netzbezug_sim_kwh: netzbezugSim,
        einspeisung_sim_kwh: einspeisungSim,
      })
    }

    results.push({
      date: day.date,
      soc_start_kwh: socAtDayStart,
      intervals: simIntervals,
      totals: {
        geladen_kwh: dayGeladen,
        entladen_kwh: dayEntladen,
        netzbezug_sim_kwh: dayNetzbezugSim,
        einspeisung_sim_kwh: dayEinspeisungSim,
        soc_min_kwh: socMin,
        soc_max_kwh: socMax,
      },
    })
  }

  return results
}
