# Older changelog entries (moved from io-package.json common.news)

Current releases **0.10.63 and newer** (except the latest seven messagebox news entries) are documented in [README.md](README.md#changelog).

Removed from `common.news` when trimming to the ioBroker repository limit of **7** entries: 0.10.63 and older (see README), plus versions never published to npm (e.g. 0.10.50–0.10.53, 0.10.58), unpublished **0.10.82** / **0.10.83** (folded into 0.10.84), unpublished **0.10.88** / **0.10.89** (GitHub-only; folded into 0.10.90), **0.10.91**–**0.10.100** (GitHub-only VIS/Modbus work; see README changelog), **0.10.84**, **0.10.81**, **0.10.69**, **0.10.70**, **0.10.71**, **0.10.72**, **0.10.73**, **0.10.74**, **0.10.75**, **0.10.77**, **0.10.78**, **0.10.79**, and **0.10.85**.

## 0.10.85

- **en:** Admin: refresh curtailment labels to pvforecast (new i18n keys; clears stale solarprognose text)
- **de:** Admin: Abregelungs-Texte auf pvforecast aktualisiert (neue i18n-Keys; alte solarprognose-Texte weg)

## 0.10.100

- **en:** VIS Energy Home: fix duplicate grid flow line (GitHub-only, not on npm)
- **de:** VIS Energy Home: doppelte Netz-Linie behoben (nur GitHub, nicht auf npm)

## 0.10.91

- **en:** VIS/VIS-2: Energy Home widget (GitHub-only, not on npm)
- **de:** VIS/VIS-2: Energy-Home-Widget (nur GitHub, nicht auf npm)

## 0.10.84

- **en:** Curtailment: switch to pvforecast (removed from common.news; not on npm)
- **de:** Abregelung: Wechsel auf pvforecast (aus common.news entfernt; nicht auf npm)

## 0.10.89

- **en:** Admin: fix GUI error on Modbus (local) tab; buanet Docker docs match Python 3.11 best-effort (GitHub-only, not on npm)
- **de:** Admin: GUI-Fehler im Tab Modbus (lokal) behoben; buanet-Docker-Doku an Python 3.11 best-effort angepasst (nur GitHub, nicht auf npm)

## 0.10.88

- **en:** Optional local Modbus TCP: poll and control official Anker devices; buanet Docker Python guide (GitHub-only, not on npm)
- **de:** Optionaler lokaler Modbus-TCP: offizielle Anker-Geräte lesen und steuern; buanet-Docker-Anleitung (nur GitHub, nicht auf npm)

## 0.10.80

- **en:** Fix periodScheduleOffsetSec persistence: use extendForeignObjectAsync (no invalid anker-solix.0.system.adapter.* object in dumps)
- **de:** Fix periodScheduleOffsetSec: extendForeignObjectAsync (kein ungültiges anker-solix.0.system.adapter.*-Objekt mehr in Dumps)

## 0.10.79

- **en:** Repository re-review: period schedule jitter, sensor migration, Windows support documented, remove curtailmentModeBefore
- **de:** Repository Re-Review: Perioden-Jitter, Sensor-Migration, Windows-Unterstützung dokumentiert, curtailmentModeBefore entfernt

## 0.10.78

- **en:** Adapter-check: use adapter.setTimeout instead of plain setTimeout (E5005)
- **de:** Adapter-Check: adapter.setTimeout statt plain setTimeout (E5005)

## 0.10.77

- **en:** Repository review: English-only logs; English default state names and list labels
- **de:** Repository-Review: englische Logs; englische Standard-State-Namen und Listen-Labels

## 0.10.75

- **en:** Object structure: folder/device/channel hierarchy (E3009), valid state roles/types, release-script 5.2.1
- **de:** Objektstruktur: folder/device/channel-Hierarchie (E3009), gültige State-Rollen/Typen, release-script 5.2.1

## 0.10.74

- **en:** TypeScript 6, workflow actions @v1, npm pack policy test (adapter-check cleanup)
- **de:** TypeScript 6, Workflow-Actions @v1, npm-pack-Policy-Test (Adapter-Check)

## 0.10.73

- **en:** README: remove GitHub URL install hints (adapter-check E6013)
- **de:** README: GitHub-URL-Installation entfernt (Adapter-Check E6013)

## 0.10.72

- **en:** Repository checker: admin i18n sync, package.json os aligned with CI, policy tests
- **de:** Repository-Checker: Admin-i18n synchronisiert, package.json os an CI angepasst, Policy-Tests

## 0.10.71

- **en:** Python install: HA PEP 668 venv-first, Windows py -3.12/3.13 + tzdata, profile-based pip bootstrap
- **de:** Python-Installation: HA PEP 668 venv-first, Windows py -3.12/3.13 + tzdata, profilbasierter pip-Bootstrap

## 0.10.70

- **en:** Repository checks: max 7 news, npm-only versions, CI concurrency, admin schema; automated policy tests
- **de:** Repository-Prüfungen: max. 7 News, nur npm-Versionen, CI-Concurrency, Admin-Schema; automatische Policy-Tests

## 0.10.69

- **en:** Curtailment: midnight inactive reset until solarprognose forecast refresh; safe modeAfter release
- **de:** Abregelung: Mitternacht inactive bis Prognose-Update; Nutzungsmodus wird sicher zurückgesetzt

## 0.9.5 – 0.9.0

See git history / GitHub releases for 0.9.x notes (login cache, entity groups, captcha handling).

## 0.8.1

- **en:** Fix Python bridge import crash (invalid ApiCategories.device_parm)
- **de:** Python-Bridge-Absturz behoben (ungültiges ApiCategories.device_parm)

## 0.8.0

- **en:** Daily energy statistics (kWh) under statistics.*; enabled by default
- **de:** Tagesstatistiken (kWh) unter statistics.*; standardmäßig aktiv

## 0.7.0

- **en:** Add usage mode (preset_usage_mode) and AC fast charge switch
- **de:** Nutzungsmodus (Benutzerdefiniert, Eigenverbrauch, Smart, …) und Schnellladung

## 0.6.5

- **en:** Fix ac_charge_limit: MQTT cmds, power limit poll, all_ac_input_limit on combiner (read)
- **de:** ac_charge_limit: MQTT-Befehle, Power-Limit-Poll, all_ac_input_limit am Combiner (lesen)

## 0.6.3

- **en:** Fix combiner ac_output_limit (10004): MQTT parallel max load + HA-aligned API fallback
- **de:** Combiner ac_output_limit (10004): MQTT-Parallel-Last + HA-konformer API-Fallback

## 0.6.2

- **en:** Fix control state min/max for multisystem AC output (4800 W) and grid export limit 0
- **de:** Min/Max der Steuer-States für Multisystem AC-Ausgang (4800 W) und Netzeinspeisung 0 korrigiert

## 0.6.1

- **en:** Daemon: deferred auth on start, one-shot fallback if API rate-limited (26161)
- **de:** Daemon: Auth erst beim Poll, One-Shot-Fallback bei API-Limit (26161)

## 0.6.0

- **en:** Persistent Python bridge daemon: API and MQTT session stay open like Home Assistant
- **de:** Persistenter Python-Bridge-Daemon: API- und MQTT-Session bleiben wie in Home Assistant offen

## 0.5.0

- **en:** Poll cycle matches Home Assistant: interval counter, API delay/throttle, MQTT on detail refresh
- **de:** Poll-Zyklus wie Home Assistant: Intervallzähler, API-Delay/Throttle, MQTT bei Detail-Refresh

## 0.4.2

- **en:** Staggered polling like HA (sites every cycle, device details every 5th poll) plus API retries
- **de:** Gestaffeltes Polling wie HA (Sites jedes Mal, Gerätedetails jedes 5. Mal) plus API-Wiederholungen

## 0.4.1

- **en:** Rate-limit fix: debounced/serialized controls, MQTT-first AC charge limit, delayed poll after writes
- **de:** Rate-Limit-Fix: entprellte/serialisierte Steuerungen, MQTT zuerst für AC-Ladelimit, verzögertes Poll nach Schreibvorgängen

## 0.4.0

- **en:** Multisystem controls: total PV, SOC reserve, PV/AC limits, AC output limit, grid export switch/limit
- **de:** Multisystem-Steuerungen: Gesamt-PV, SOC-Reserve, PV/AC-Limits, AC-Ausgangs-Limit, Netzeinspeisung Schalter/Limit

## 0.3.0

- **en:** GitHub repository renamed to ioBroker.anker-solix
- **de:** GitHub-Repository umbenannt in ioBroker.anker-solix

## 0.2.7

- **en:** Admin tile: remove GitHub install symlink, normalize display name (Anker Solix)
- **de:** Admin-Kachel: GitHub-Symlink entfernt, einheitlicher Anzeigename (Anker Solix)
