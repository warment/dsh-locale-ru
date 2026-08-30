# deepseek-harness-locale-ru

English | [Русский](README.md) | [中文](README.zh.md)

`deepseek-harness-locale-ru` is a Russian localization of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI: the plugin adds «Русский» (Russian) to the **official localization system** — the built-in language picker in the UI settings.

The plugin registers the language and dictionaries through the documented client locale API (`@deepseek-ai/dsh-client-locale`) and restates the permission preset display names through a configuration layer. No Harness files are modified — no fork, no rebuild.

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.** This pack tracks that: `node scripts/check.mjs` validates the dictionaries against current upstream strings, and CI runs the check on every push and pull request. Strings missing from the dictionary do not break the UI — they are shown in English (English is the configured fallback).

Review the [safety notice](SAFETY.md) before installing.

## Compatibility

- This pack is an **external locale plugin**, not a core-bundled language: it registers the language and dictionaries through a public API and requires no upstream changes. The two paths carry different guarantees — a bundled locale goes through the full core release cycle, an external plugin is verified against a specific revision.
- Tested against upstream revision `cd5ef81` (v0.1.2-alpha.1). After upgrading dsh, re-run `node scripts/check.mjs --strict` (with a Harness clone) — see [docs/upstream-sync.md](docs/upstream-sync.md).
- Rollback is one command: `dsh plugin --profile web remove deepseek-harness-locale-ru` and restart `dsh web`.

## Install

### One command

Copy, paste, restart:

```sh
dsh plugin --profile web add github:warment/deepseek-harness-locale-ru
```

The command works with any dsh installation — npm (`npx @deepseek-ai/dsh web`) or a source checkout (`pnpm dsh web`) — on macOS, Windows, and Linux. The `web` profile and its layout are created automatically; nothing to configure by hand.

**30-second verification:**

1. Restart `dsh web` (stop and start the process) and open the UI.
2. Open **Settings → General** and pick **«Русский»** in the **Language** row.
3. The UI switches to Russian immediately: the sidebar shows «Новая сессия» (New Session) and «Настройки» (Settings). The choice persists across restarts.

If you skip the language pick, the UI stays English — «Русский» remains available in the same settings row.

### From a local checkout

To test without GitHub (e.g. before publishing or with your own edits):

```sh
dsh plugin --profile web add /path/to/deepseek-harness-locale-ru
```

### Update and uninstall

To update to a new version, remove the package and install it again with the same command:

```sh
dsh plugin --profile web remove deepseek-harness-locale-ru
dsh plugin --profile web add github:warment/deepseek-harness-locale-ru
```

Uninstall:

```sh
dsh plugin --profile web remove deepseek-harness-locale-ru
```

Restart `dsh web` after any plugin change.

## Community and support

- Translation bugs, missing strings, and ideas go to this repository's [Issues](https://github.com/warment/deepseek-harness-locale-ru/issues).
- Questions about DeepSeek Harness itself (installation, models, sessions — everything except the translation) belong in the official repository: [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) and the [Discord community](https://discord.gg/Ycq5dCaS4).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The translation workflow in brief:

1. Find the English string in `upstream/corpus.json` — its namespace and key identify the file to edit.
2. Edit `dict/ru/<namespace>.json`.
3. Validate the dictionaries: `node scripts/check.mjs`.
4. Rebuild the client bundle: `node scripts/build.mjs`.
5. Commit both changes: the dictionary file and the updated `lib/client.js`.

Repository layout: `dict/ru/*.json` — translation sources; `upstream/corpus.json` — English strings extracted from upstream (`node scripts/extract.mjs`, see [docs/upstream-sync.md](docs/upstream-sync.md)); `lib/client.js` — built browser bundle (committed, so users never need a build step); `scripts/` — validation, build, extraction, live boot verification.

## License

[MIT](LICENSE)

DeepSeek Harness is a project by [DeepSeek AI](https://deepseek.com), licensed MIT; attribution and borrowings are described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
