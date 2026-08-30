# Third-Party Notices

This package (`dsh-locale-ru`) is an independent community localization of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) project ("the upstream project").

## Upstream project

- Upstream: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- Copyright © DeepSeek AI
- License: [MIT](https://github.com/deepseek-ai/deepseek-harness/blob/main/LICENSE)

This pack localizes the upstream web UI through its documented external-plugin locale API and restates the permission preset display names through a configuration layer. It is not affiliated with, endorsed by, or an official product of DeepSeek. All upstream code, product names, and trademarks remain the property of their respective owners. The upstream project itself is required to use this pack and is not distributed with it.

## This package's own dependencies

`dsh-locale-ru` ships **no third-party runtime dependencies of its own**:

- Zero npm dependencies in `package.json`.
- The browser bundle (`lib/client.js`) is generated from this repository's own dictionaries (`dict/ru/*.json`).
- The host entry (`index.js`) is a no-op.
- Development scripts (`scripts/*.mjs`) use only the Node.js standard library.

## License

This package is distributed under the [MIT](LICENSE) license.
