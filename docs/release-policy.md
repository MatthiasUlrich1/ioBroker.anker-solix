# Release-Richtlinie

- **GitHub:** Commits auf `main` – Tester können vom Repo installieren.
- **npm:** Gezielte Releases per Git-Tag (`v*`); CI-Deploy veröffentlicht dann auf npm (Trusted Publishing / OIDC).
- **CI (`test-and-release.yml`):** Jeder Push auf `main` führt Lint, Typecheck und Adapter-Tests aus (Linux + Windows, Node 22/24/26). Deploy nach npm **nur** bei Git-Tag `v*`.
- **`common.news`:** Max. **7** Einträge. Nur **npm-veröffentlichte** Versionen plus die **aktuelle** Version, die gerade nach npm veröffentlicht wird (E1036 + E2004). Reine GitHub-Zwischenstände gehören in [README.md](../README.md#changelog) / [CHANGELOG_OLD.md](../CHANGELOG_OLD.md), nicht in `io-package.json`.
- **Vor jedem Push:** `npm run verify:ci`. Optionaler Pre-Push-Hook: einmalig `npm run setup:githooks` (kein `prepare`-Script — E0094).
- **Stable-Repository:** PR an [ioBroker.repositories](https://github.com/ioBroker/ioBroker.repositories) (`sources-dist-stable.json`) erst nach **1–2 Wochen auf LATEST**, mit Installationen und ohne schwere neue Issues. **Nie** dieselbe Version am Release-Tag/Tag 0 in STABLE heben (Bot-Label `STABLE-0-day-PR`). Die vom Stable-Bot genannte Version bevorzugen, nicht blind `npm latest`. Hotfixes nur bei Crashern/Blockern, minimal, mit Hinweis an `mcm1957` / `Apollon77`. Siehe Issue #13 / #23.
