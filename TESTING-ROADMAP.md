# SolarProof — Testing-Roadmap

> **Quelle:** Analyse auf Basis von `BRIEFING-TESTING-ROADMAP.md` (2026-04-18)
> **Klassifizierung:** Klasse 1 — Finanz/Compliance-relevant (Ertragsrechnung → Angebotspreis)
> **Stand dieser Datei:** 2026-04-18, vor Umsetzung

---

## Executive Summary

**Top-3-Risiken (heute, absteigend nach Severity):**

1. **Uncommitted Fixes im Working Tree** — der Power-Integration-Fix (Kern des 12.196-kWh-Bugs) liegt nur lokal vor. HEAD (`50f0bf5`) enthält ihn nicht. Ein frischer Build aus `main` reproduziert den Bug sofort. Reparatur: klein, dringend.
2. **`cost.ts` komplett ungetestet** — Kern der Preisrechnung (BDEW, Strompreisbremse, Eigenverbrauch-Annahme, Teilzeit-Skalierung). Klasse-1-Kernstück, 0 Unit-Tests. Auch `simulation.ts` (Speicher-Mathematik) und `gapDetection.ts` (Dedup) sind ungetestet.
3. **DST-Edge-Cases** historisch 3× gefixt (`afe9648`, `d63333b`, `0dd9e74`), aber **kein einziger Regressions-Test** — jeder Refactor kann die Fixes rückgängig machen und es fällt erst auf, wenn Kunden in DE zum 26.03./29.10. schaue.

**Geschätzter Gesamt-Aufwand zum Schließen der Lücken:** ca. **2–3 Arbeitstage** (konzentriert), verteilt auf 5 priorisierte Blöcke — Details im [Abschnitt Roadmap](#roadmap-priorisiert) unten.

**Regel (erneut bestätigt aus CLAUDE.md):** Bei Klasse-1-Code darf NICHT gesprintet werden. Jeder Block wird separat umgesetzt, mit `npm test` grün bevor der nächste beginnt.

---

## 1. Ist-Analyse: Was ist abgedeckt

### Code-Inventar (Business-Logic)

| Modul | Zeilen | Zweck | Unit-Tests | Risiko |
|-------|-------:|-------|:----------:|:------:|
| `src/utils/csv.ts` | 319 | CSV-Parsing, Unit-Detection (kWh/Wh/kW/W), Manufacturer-Profiles | teilweise (Unit-Detection) | 🔴 hoch |
| `src/utils/timezone.ts` | 226 | Timestamp-Parsing, DST-Warnungen, Power-Integration P×Δt | teilweise (Integration) | 🔴 hoch |
| `src/utils/cost.ts` | 98 | BDEW-Tarife, Strompreisbremse, Eigenverbrauch, Äquivalent-Rechnung | **keine** | 🔴 höchstes |
| `src/utils/simulation.ts` | 186 | Speicher-Simulation (2 Modi: Grid-Flow + Surplus-Fallback) | **keine** | 🔴 hoch |
| `src/utils/gapDetection.ts` | 194 | Dedup identischer Timestamps + Missing-Day/Interval-Erkennung | **keine** | 🟠 mittel |
| `src/utils/timestamp.ts` | 129 | Low-level Zeit-Helper | **keine** | 🟡 niedrig |
| `src/utils/hash.ts` | — | File-Hashing für Duplicate-Detection | **keine** | 🟡 niedrig |
| `src/store/index.ts` | 566 | Zustand-Orchestrierung (Re-Parse, Persist, Aggregation) | **keine** (nur indirekt) | 🟠 mittel |

### Bestehende Teststrecke

**Smoke-Tests (`test/smoke.mjs`) — 11 Tests, alle HTTP-Endpoint-Checks:**
- Site (URL-Migration, Widget-Tag-Präsenz)
- Widget (Größe, handleAction-Handler, keine `.studio`-Refs)
- CORS, Chat-Endpoint, Feedback-Intent, Supabase-Reachability

**Unit-Tests (`test/units.mjs`) — 13 Tests, alle auf Roberts Woche 43/2021:**
- CSV-Format-Erkennung (3 Tests)
- Power-Integration für 6 Referenztage gegen Golden-Values (1 % Toleranz, exakt bestanden)
- Wochensumme-Plausibilitäts-Check
- Naive-Sum-Bug-Reproduktion + Ratio ≈ 12 (=60 min/5 min)

### Was damit tatsächlich bewiesen ist

✅ Produktions-URLs antworten mit 200 und haben die richtigen Zeichen drin
✅ Power-Integration (P × Δt) liefert exakt die manuell verifizierten Werte für **eine** Woche Oktober 2021
✅ Der naive Summen-Bug (Faktor 12 zu hoch) wäre im Test sichtbar, bevor er live geht

### Was damit nicht bewiesen ist (→ Lücken siehe Abschnitt 3)

---

## 2. Bug-Historie & Regressions-Test-Status

Aus `git log --all` extrahiert. Alle Commits mit Bezug zu Rechen-/Daten-Korrektheit:

| Commit | Message | Was war kaputt | Regressions-Test heute? |
|--------|---------|----------------|:-----------------------:|
| `26d2d96` | implement Robert's feedback — Wh detection, cost inputs, units, print | SENEC exportierte [kW], App interpretierte als kWh → Werte ×12–×1000 zu groß. **Das ist der 12.196-kWh-Bug.** | 🟡 teilweise — `naive-sum-is-implausible` fängt den Original-Bug ab, aber nur für 28.10.2021. **Der eigentliche Power-Integrations-Fix ist uncommitted** (siehe Risiko 1). |
| `7c14185` | Fix simulation: use actual grid flows instead of erzeugung-verbrauch | Speicher-Simulation berechnete Überschuss aus `erzeugung − verbrauch`, was bei SENEC falsch ist (Werte enthalten bereits Batterie-Effekte). | ❌ **kein Regressions-Test** — `simulation.ts` hat 0 Tests. |
| `afe9648` | Fix DST false gaps | Beim Zeitumstellungs-Tag wurden 1-Std-Lücken als „Datenausfall" gemeldet. | ❌ keiner |
| `d63333b` | Fix DST warnings: only trigger on actual transition days | Gap-Detection löste DST-Warnung an jedem Tag aus. | ❌ keiner |
| `0dd9e74` | Fix false-positive DST warnings when data doesn't cover night hours | DST-Warnung trotz fehlender Nacht-Intervalle. | ❌ keiner |
| `06b82f5` | Update cost comparison to v1.2 spec | Kosten-Rechnung auf neues Spec umgestellt (BDEW, Cap). | ❌ keiner — `cost.ts` hat 0 Tests. |
| `e03a4cc` | Implement v1.2 spec: duplicate detection, SoC carry-over | Speicher-Stand wurde pro Tag resettet (falsch). | ❌ keiner für SoC-Carry-Over |
| `7fa216b` | Support SENEC CSV format: combined datetime, semicolons, comma decimals | Spezifische SENEC-Formatierung | ✅ indirekt via `csv-has-*`-Tests |

**Zusammenfassung Regressions-Deckung:** 1 von 8 Bugs hat einen (teilweisen) Test. **7 Bugs könnten bei Refactor jederzeit wiederkehren, ohne dass es auffällt.**

---

## 3. Lücken (priorisiert nach Risiko)

### 🔴 Block A — Klasse-1-Kern (Rechenfehler = Kundengeld)

A1. **`cost.ts` komplette Testabdeckung**
- BDEW-Preis-Lookup für alle 8 Jahre (2019–2026)
- Strompreisbremse-Cap-Logik: `cap_ct` wird nur angewendet bei `capped_default` ODER User-Override → alle vier Kombinationen
- Eigenverbrauch-Formel `max(0, erzeugung − einspeisung)` — inkl. Edge: einspeisung > erzeugung (dürfte nie passieren, sollte aber ≥ 0 bleiben)
- Teilzeit-Skalierung `anteil = monthsInData / 12` für Nachzahlung/Wartung/Rückerstattung
- Cloud-Kosten: `cloud_pro_monat` vs. Fallback `cloud_eur_monat`
- Nachzahlung: `nachzahlung_pro_jahr[year]` vs. Fallback
- Jahr ohne BDEW-Preis → `continue` (Silent Skip — ist das gewünscht? → Test + Doku-Entscheidung)
- **Auffällig**: `einspeiseverguetung_eur` wird berechnet aber **nicht** in `gesamtkosten_eur` einbezogen. Beabsichtigt (wegen separater Rückerstattung)? → expliziter Test + Entscheidung.

Aufwand: **mittel** (ca. 4 h für 15–20 Tests plus manuelle Verifikation einer Referenz-Jahresrechnung)

A2. **`simulation.ts` komplette Testabdeckung**
- Mode-Detection: wann `simulateFromGridFlows`, wann `simulateFromSurplus`
- Grid-Flow-Mode:
  - Batterie voll → overflow geht in Einspeisung
  - Batterie leer → Netzbezug bleibt
  - Effizienz 100 % vs. realistisch 90 %
  - `minSoc` bei `entladetiefe_pct = 80` (DoD) korrekt respektiert
  - `netzbezug_sim ≤ netzbezug_ist`-Invariante (muss durch Test **hart bewiesen** werden, in JEDEM Intervall)
- Surplus-Mode:
  - symmetrisch zu Grid-Flow, aber mit Überschuss-Formel
- SoC-Carry-Over über Tage (Regressions-Test für `e03a4cc`)
- `anfangs_soc_pct = 0` vs. `100` — beide Grenzen
- Leere `days`-Liste
- Einzelner Tag
- **Invariante**: `geladen` und `entladen` dürfen nicht im selben Intervall beide > 0 sein (würde unphysikalisch doppelte Verluste bedeuten)

Aufwand: **mittel–groß** (ca. 6 h, weil Speicher-Mathe vielschichtig)

A3. **Regressions-Test für 12.196-kWh-Bug**
- Dedizierter Test: „importiere Roberts 2024-CSV (wenn verfügbar), erwarte ≈ 8 600 kWh Jahressumme ±10 %"
- Falls 2024-CSV nicht verfügbar: synthetische 10 kWp-Jahresdaten mit plausibler Sonnenkurve generieren und die App durchrechnen lassen
- Blockiert die gesamte Rechenkette: Parse → Integration → Aggregate → Cost

Aufwand: **klein–mittel** (ca. 2 h, hauptsächlich Golden-Generierung)

### 🔴 Block B — Uncommitted State

B1. **Power-Integration-Fix committen und pushen**
- `git add` für `src/utils/csv.ts`, `src/utils/timezone.ts`, `src/store/index.ts`, `src/types/index.ts`, `src/components/ColumnMapping.tsx`, `src/components/DataIntegrityPanel.tsx`, `test/`, `TESTING.md`, `package.json`
- Commit-Message (Englisch, per Konvention): z. B. `fix: integrate SENEC kW power samples over interval duration`
- Testlauf (`npm test`) muss grün sein — ist es aktuell
- Auch `src/components/VectorChat.tsx` (wird nicht mehr importiert) — **löschen** statt committen? → bewusste Entscheidung.

Aufwand: **klein** (15 min), aber **dringend** — ohne diesen Commit läuft der nächste CI-Build mit dem alten Code.

### 🟠 Block C — DST & Kalender

C1. **DST-Transition-Regressions-Tests**
- Gap-Detection ignoriert DST-Tage korrekt (`afe9648`)
- Nur echte DST-Tage werden geprüft (`d63333b`)
- Daten ohne Nachtstunden erzeugen keine False-Positive (`0dd9e74`)
- Synthetische Testdaten für 26.03.2023 (Frühling) + 29.10.2023 (Herbst)

Aufwand: **klein–mittel** (3 h, Test-Daten bauen + 3–4 Tests)

C2. **Schaltjahr-Check**
- 29.02.2024 in einem CSV — wird korrekt geparst?
- Jahresumme 2024 berücksichtigt 366 Tage

Aufwand: **klein** (1 h)

### 🟠 Block D — Dedup & Gaps

D1. **`gapDetection.ts` Testabdeckung**
- Zwei CSVs mit überlappenden Intervallen → keine Doppelzählung (Regressions-Test für potentielle Verdoppelung)
- Identische Timestamps auf Sekunden-Ebene → einer wird gedroppt, Summe stimmt
- Timestamps mit Millisekunden-Unterschied → werden beide behalten (Gefahr: Verdoppelung bei off-by-seconds CSVs)
- Missing-Day-Detection: 3 Tage Lücke → ein Gap-Entry
- Missing-Interval-Detection: doppelter Intervall-Abstand → Gap (außer DST)

Aufwand: **mittel** (3 h)

### 🟡 Block E — Breite & Edge-Cases

E1. **Anlagen-Extreme**
- 0 kWp-Anlage (nur Verbrauch, keine Erzeugung)
- 1 kWp-Mini-Anlage
- 30 kWp-Großanlage
- Anlage ohne Speicher (`kapazitaet_kwh = 0`) — crasht aktuell möglicherweise (`minSoc = 0`, Division-by-Zero?)
- Defekter Speicher (`entladewirkungsgrad_pct = 0`) — gleiches Risiko

Aufwand: **mittel** (3 h)

E2. **CSV-Qualität**
- CSV mit BOM (UTF-8)
- CSV mit Windows-Line-Endings (`\r\n`)
- Leere Zeilen mittendrin
- Führende/trailing Whitespace in Zahlenfeldern
- Nur 1 Datenzeile (Minimum)
- Sehr große CSV (100 k+ Zeilen) — Performance-Benchmark

Aufwand: **mittel** (3 h)

E3. **Tarif-Besonderheiten**
- Jahr 2027 (nicht in BDEW_PRICES) — aktuell wird das Jahr stumm übersprungen. Test soll das Verhalten festnageln (entweder: expliziter Fehler, oder: dokumentierter Skip).
- Tarif-Wechsel mittendrin (`strompreis_ct` pro Monat statt pro Jahr) — nicht unterstützt, aber: sollte beim Test dokumentiert werden als „Known Limitation".

Aufwand: **klein** (1 h, hauptsächlich Dokumentation)

---

## 4. Golden-Reference-Erweiterung

Aktuell: **nur 1 Datensatz** (Roberts Woche 43/2021, 10 kWp, SENEC).

### Vorschlag: 4 zusätzliche Referenz-Szenarien

| Szenario | Herkunft | Priorität | Aufwand |
|----------|----------|:---------:|:-------:|
| Roberts **2024-Jahr** (komplett) | Kunde anfragen, anonymisieren | 🔴 | klein (nach Erhalt) |
| Kleine Anlage **3 kWp** ohne Speicher | Google Drive? Andere Kundenprojekte? Oder synthetisch. | 🟠 | mittel (wenn synthetisch: + Plausibilitäts-Check durch Max gegenzeichnen) |
| Große Anlage **20 kWp mit Speicher** | synthetisch | 🟠 | mittel |
| **Winter-Minimum-Woche** (Dezember, viel Netzbezug) | synthetisch auf Basis PVGIS-Daten Gießen | 🟡 | mittel |

**Empfehlung:** Erst Block A (ungetestete Module) schließen, dann Golden-Reference-Erweiterung — sonst testet man die neuen Szenarien gegen untesteten Code.

---

## 5. Roadmap priorisiert

| # | Block | Inhalt | Aufwand | Status |
|---|-------|--------|--------:|:------:|
| 1 | **B1** | Uncommitted Fixes committen | 15 min | ⏳ wartet auf User-Freigabe |
| 2 | **A1** | `cost.ts` Tests | ~4 h | ✅ **39 Tests grün** (2026-04-18) |
| 3 | **A2** | `simulation.ts` Tests | ~6 h | ✅ **38 Tests grün** (2026-04-18) |
| 4 | **A3** | 12.196-kWh-Regressions-Test mit Jahresdaten | ~2 h | ✅ **11 Tests grün** (2026-04-18, synthetische 10/20 kWp-Jahreskurve) — echte Jahres-CSV von Robert nachreichen bei Verfügbarkeit |
| 5 | **C1 + C2** | DST + Schaltjahr | ~4 h | ✅ **18 Tests grün** (2026-04-18) |
| 6 | **D1** | `gapDetection.ts` | ~3 h | ✅ **39 Tests grün** (2026-04-18) |
| 7 | **E1** | Anlagen-Extreme | ~3 h | ✅ **44 Tests grün** (2026-04-18) |
| 8 | **E2** | CSV-Qualität | ~3 h | ✅ **47 Tests grün** (2026-04-18) |
| 9 | **Golden** | 4 neue Referenzdatensätze | ~4 h | ⏳ offen (synthetische Generierung — Block A3/Robert-Daten zuerst klären) |

**Stand 2026-04-18 Abend:** Block 2, 3, 5, 6, 7, 8 abgeschlossen — **225 Unit-Tests + 11 Smoke-Tests grün** (gesamt 238 Unit-Tests). Offene Blöcke (1, 4, 9) sind entweder User-Freigabe-abhängig (Commit) oder externe-Daten-abhängig (Robert's Jahres-CSVs).

**Gesamt ursprünglich:** ca. **30 h** (~3½ konzentrierte Arbeitstage). Empfohlene Taktung: Block 1 sofort, Block 2 am Tag danach, dann Block 3–4 in einer Session, Rest in Folge-Sessions.

---

## 6. Offene Fragen an Max

Diese Punkte brauchen eine bewusste Entscheidung, bevor Tests geschrieben werden:

1. **`einspeiseverguetung_eur` nicht in `gesamtkosten_eur`** — gewollt (separate Spalte in UI), oder wurde Abzug vergessen?
2. **Jahr ohne BDEW-Preis** — soll explizit fehlschlagen oder still übersprungen werden? Aktuell: stillschweigend weggelassen.
3. **`einspeisung > erzeugung`** (theoretisch unmöglich bei echten Daten) — harter Fehler oder Warnung oder Silent-Clamp auf 0?
4. **`kapazitaet_kwh = 0`** (keine Batterie) — UI erlaubt das, Simulation könnte crashen → Verhalten definieren.
5. **Roberts 2024/2025-CSVs** — können wir die bekommen (anonymisiert)? Würde Block A3 sofort freischalten.
6. **`src/components/VectorChat.tsx`** (375 Zeilen) — ist laut `App.tsx` nicht mehr importiert. Löschen oder aufbewahren?
7. **`double_hour`-Warnung in `timezone.ts`** (Fall-Back DST) — beim Schreiben von [test/dst.test.mjs](test/dst.test.mjs) entdeckt: aus realen CSV-Imports praktisch nicht erreichbar, weil `fromZonedTime` die ambigue 02:00-Stunde deterministisch auf EINE UTC-Zeit auflöst (CEST-first). Beide Einträge kollidieren → Dedup. Die Warning-Logik könnte toter Code sein. Soll das Verhalten geändert (z. B. ISO-Offset-Erkennung beim CSV-Parsing) oder der Warning-Pfad entfernt werden?

---

## 7. Rahmen

- **Keine Umsetzung in dieser Session** — das ist der Plan, nichts mehr.
- **Jeder Block** wird als eigene Session abgearbeitet, mit eigenem Commit, grünem `npm test` und kurzem Status-Report.
- **Unit-Tests bleiben Zero-Dependency** (native `fetch` + `Papaparse`, das schon Dep ist). Kein Jest, kein Vitest — das Pattern ist robust und schnell.
- **Golden-Values** werden mit einem Kommentar im Test-File dokumentiert: woher (CSV + Zeile + manueller Rechenweg).
- **CLAUDE.md-Regel** bleibt bindend: vor „live" grünes `npm test`.
