# SolarProof – Teststrecke

> **Regel (2026-04-17):** Bevor „ist live" gesagt werden darf, MUSS `npm test` grün sein.
> Grund: Mehrfach wurde „live" gemeldet, während etwas kaputt war. Diese Strecke fängt das ab.

## Ausführen

```bash
npm test               # Smoke + Unit
npm run test:smoke     # nur Smoke (Production-URLs)
npm run test:units     # nur Unit (Business-Logic)
```

## Was wird geprüft

### Smoke-Tests (`test/smoke.mjs`) – Post-Deploy-Liveness
Hit alle kritischen Production-Endpoints. Keine Dependencies, nur `fetch`.

| Test | Zweck |
|------|-------|
| `site-reachable` | https://solarproof.voltfair.de antwortet 200 |
| `site-has-widget-tag` | HTML enthält `<vector-chat>` Element |
| `site-widget-url` | Widget-Script lädt von `agent.maxone.one` |
| `site-no-studio-refs` | Keine `.maxone.studio`-URLs mehr im HTML |
| `widget-served` | Widget-JS liefert 200 und ~24KB |
| `widget-no-studio` | Kein `.maxone.studio` im Widget-JS |
| `widget-one-url` | `agent.maxone.one` als Endpoint im Widget |
| `widget-has-action-handler` | `handleAction`-Dispatch drin (autonome Actions) |
| `cors-preflight` | `Access-Control-Allow-Origin` matched Site-Origin |
| `chat-endpoint` | `POST /chat` liefert valid `{reply, sessionId}` |
| `chat-feedback-intent` | VECTOR erkennt „Ich möchte Feedback" → `action.type='open_feedback'` |
| `supabase-feedback-reachable` | Feedback-Table via Supabase erreichbar (benötigt `SUPABASE_ANON_KEY`) |

### Unit-Tests – Business-Logic (8 Test-Files, 249 Tests gesamt)

Business-Logik-Module werden per `npm run test:build` via esbuild gebundelt nach `.test-build/*.mjs`, dann von den Test-Files importiert. Das hält Tests Dependency-frei und erlaubt trotzdem direktes Testen der TS-Module.

**`test/units.mjs` — CSV-Parsing + Power-Integration (13 Tests)**
Nutzt Roberts SENEC-CSV (`S26870111194348548540356920-week-43-2021.csv`) als Golden Reference.

| Test | Zweck |
|------|-------|
| `csv-has-uhrzeit` / `csv-has-kw-unit` / `csv-has-stromerzeugung` | CSV-Format-Erkennung |
| `csv-rows-count` | Minimale Zeilenzahl vorhanden |
| `integration-2021-10-28` (und 5 weitere Tage) | Power-Integration P×Δt → kWh für bekannte Sonntage. 1% Toleranz. |
| `integration-weekly-plausible` | Wochensumme 80–200 kWh (plausibel für 10 kWp-Anlage im Oktober) |
| `naive-sum-is-implausible` / `naive-vs-integrated-ratio` | Bug-Reproduktion: 12.196-kWh-Bug |

**`test/cost.test.mjs` — Tarif/BDEW/Strompreisbremse (39 Tests, Klasse-1)**
Characterization Tests für `src/utils/cost.ts`. Alle Rechenschritte der Jahresabrechnung festgenagelt:
- BDEW-Preis-Katalog 2019–2026 (Strompreisbremse 2022/2023 mit Cap 40 ct)
- `getEffectivePrice` Cap-Logik (4 Kombinationen)
- Eigenverbrauch = `max(0, erzeugung − einspeisung)` inkl. Clamp bei Einspeisung > Erzeugung
- Teilzeit-Skalierung (`anteil = monthsInData/12`) für Nachzahlung/Wartung/Rückerstattung
- Per-Jahr/Per-Monat-Overrides (`nachzahlung_pro_jahr`, `cloud_pro_monat`)
- Missing-BDEW-Year → Silent-Skip (aktuelles Verhalten, `TODO-MAX` im Test-Kommentar)
- Multi-Year-Sortierung aufsteigend
- `einspeiseverguetung_eur` wird berechnet, aber NICHT in `gesamtkosten_eur` einbezogen (`TODO-MAX`)

**`test/simulation.test.mjs` — Speicher-Simulation (38 Tests, Klasse-1)**
Characterization Tests für `src/utils/simulation.ts`. Beide Modi (Grid-Flow + Surplus-Fallback):
- Mode-Detection (Grid-Flow bei `netzbezug_kwh > 0 || einspeisung_kwh > 0`)
- Batterie voll → Overflow bleibt Einspeisung
- Batterie leer → Netzbezug-Sim unverändert
- **Invariante**: `netzbezug_sim ≤ netzbezug_ist` (niemals Magie)
- Lade-/Entlade-Effizienz 90 % Roundtrip mit expliziten Werten
- DoD/`entladetiefe_pct` respektiert `minSoc`
- **SoC-Carry-Over über Tage** (Regressions-Test für `e03a4cc`)
- `anfangs_soc_pct` 0 % vs. 100 %
- socMin/socMax-Tracking pro Tag
- **Invariante**: geladen und entladen nicht gleichzeitig > 0 im selben Intervall

**`test/gapDetection.test.mjs` — Gap- + Overlap-Detection (39 Tests)**
Characterization Tests für `src/utils/gapDetection.ts`.
- Missing days: Einzel- und Mehrfach-Lücken zwischen Datentagen
- Missing intervals: Gap > 2× Median-Interval wird erkannt
- DST-Transition-Tage (Spring-Forward + Fall-Back): keine False Positives im 00–04 UTC Fenster
- Gaps außerhalb des DST-Fensters an DST-Tagen werden weiterhin erkannt
- Dedup: erstes Vorkommen bleibt, Totals werden neu berechnet
- Multiple File-Paar-Konflikte werden getrennt in Summaries gruppiert

**`test/extremes.test.mjs` — Anlagen-Extreme (44 Tests)**
Edge-Cases für pathologische Anlagen/Speicher:
- 0 kWp-Anlage (keine Erzeugung)
- Kein Speicher (0 kWh), Mini-Speicher (1 kWh), Groß-Speicher (30 kWh)
- Extremer DoD (1 %, 100 %), niedrige Wirkungsgrade (50 %)
- Riesen-Einspeisung/Netzbezug pro Intervall (Speicher bleibt bounded)
- Invariante `netzbezug_sim ≤ netzbezug_ist` für 4 Extremkonfigurationen
- Keine NaN/Infinity in Totals oder Intervallen

**`test/dst.test.mjs` — DST + Schaltjahr (18 Tests)**
Regressionstests für `src/utils/timezone.ts` (commits afe9648, d63333b, 0dd9e74).
- Spring-Forward 2024-03-31: 02:00 lokal fehlt → `missing_hour` Warning
- Fall-Back 2024-10-27: Tag-Zuordnung bleibt korrekt (`double_hour` Warning nur bei System-TZ=Europe/Berlin reproduzierbar, siehe Kommentar im Test)
- Schaltjahr 2024-02-29 wird akzeptiert; 2025-02-29 ungültig → Zeile geskipped
- Power-Integration: DST-Gap wird auf Fallback-Duration gedeckelt
- Keine False-Positive-Warnings an Nicht-DST-Tagen
- Datumsformat-Auto-Detection (ISO + DE)

**`test/annual.test.mjs` — Jahres-Regression 12.196-kWh-Bug (11 Tests)**
Synthetische 10 kWp-Jahreskurve (365 Tage × 5-min-Raster, Sinus-Sonnenkurve +
saisonale Gauss-Skalierung + deterministischer Bewölkungsfaktor). Integriert über
das volle Jahr → erwartete Summe 5 000–12 000 kWh. Der naive-Summen-Bug würde
> 100 000 kWh liefern und ist damit hart ausgeschlossen.
- Schaltjahr 2024 → 366 Tage
- Sommer-Peak-Tag (21.06.) realistisch gegen Winter-Tief (21.12.)
- Skalierung mit Anlagengröße ≈ linear (10 kWp vs. 20 kWp)
- Intervall-Dichte > 250 pro Tag (nicht sparse)

**`test/csv.test.mjs` — CSV-Qualität (47 Tests)**
Parsing + Validation für `src/utils/csv.ts`.
- `parseNumber`: Punkt/Komma-Dezimalen, deutsches Tausendertrennzeichen (`1.234,56`), Whitespace-Trim
- Delimiter-Auto-Detection (`;`, `,`)
- BOM-Handling (UTF-8 mit BOM am Anfang)
- Auto-Mapping pro Hersteller (SENEC, Fronius)
- Unit-Detection aus Headern (`[kW]`, `[kWh]`, `[Wh]`, Default)
- Wh→kWh Umrechnung (`factor=0.001`)
- Kombinierte Datetime-Spalte (SENEC-Format `DD.MM.YYYY HH:MM:SS`)
- Zeile mit NaN → geskipped, Error aggregiert
- Implausible-Value-Guard (Median > 50 ⇒ vermutl. Wh)
- CRLF-Line-Endings, leere CSV, fehlende Grid-Spalten → `null`

### Golden-Values (aus manueller Verifikation 2026-04-16)
```
2021-10-26:  4.58 kWh  (Teiltag)
2021-10-27:  7.62 kWh  (bewölkt)
2021-10-28: 21.81 kWh  (sonnig Peak)
2021-10-29: 20.41 kWh
2021-10-30: 19.87 kWh
2021-10-31: 15.62 kWh
```

## Was NICHT abgedeckt ist (Grenzen der Teststrecke)

- **Browser-Rendering** — kein Headless-Browser-Test. Shadow-DOM-Layout, Click-Flows, Mobile-Viewport manuell prüfen.
- **Full-Flow CSV-Import → PDF-Export** — nur die Kern-Rechenschritte sind unit-getestet.
- **Robert's Mehrjahresdaten** — nur Woche 43/2021 als Golden. Für Mehrjahres-Szenarien müsste Robert uns zusätzliche (anonymisierte) Daten geben.
- **Visual regression** — keine Screenshot-Tests.

## Wann wird was erweitert?

- **Nach jedem User-gemeldeten Bug** → Test hinzufügen, der den Bug reproduziert, dann fixen. (Wh/kWh war so ein Fall.)
- **Vor jedem Deploy** → `npm test` muss grün sein.
- **Bei neuen Features** → mindestens ein Happy-Path Smoke-Test.

## ENV-Vars

```
SITE=https://solarproof.voltfair.de    # Default
VECTOR=https://agent.maxone.one         # Default
SUPABASE=https://panel.maxone.one       # Default
SUPABASE_ANON_KEY=<key>                 # Optional für supabase-feedback-reachable
```

Alle überschreibbar per Environment — z.B. für Staging-Deploy.
