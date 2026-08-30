# Safety / Безопасность

## Русский

`dsh-locale-ru` — независимый проект сообщества по локализации веб-интерфейса DeepSeek Harness. Он не является официальным продуктом DeepSeek и никак не связан с компанией DeepSeek.

### Что пакет может менять

- **Тексты веб-интерфейса.** Словари (`dict/ru/*.json`, собранные в `lib/client.js`) регистрируются в штатной системе локализации клиента (`@deepseek-ai/dsh-client-locale`) — меняется только отображаемый текст.
- **Отображаемые названия пресетов разрешений.** Через конфигурационный слой (`cordis.patch.yml`) пресетам задаются русские названия и описания. Идентификаторы пресетов, настройки sandbox и правила подтверждений не изменяются — `/permission <id>` и семантика сессий остаются прежними.

### Чего пакет не делает

- Не содержит серверной логики: хост-половина плагина (`index.js`) — намеренный no-op.
- Не добавляет инструменты, команды, агентов, пресеты агентов или провайдеров моделей.
- Не обращается к сети, файлам, процессам и учётным данным; не читает и не хранит содержимое сессий.
- Не модифицирует файлы самого DeepSeek Harness: подключается только через документированный API внешних плагинов.
- **Не имеет runtime-зависимостей**: `package.json` не содержит ни одного dependencies-пакета — устанавливаемый код ограничен тремя собственными файлами (`index.js`, `lib/client.js`, `cordis.patch.yml`), которые можно прочитать целиком за несколько минут перед установкой.

Поведение самого Harness (запуск модели, исполнение команд, доступ к файлам) этот пакет не меняет — вопросы безопасности самой платформы описаны в официальном [уведомлении DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/blob/main/SAFETY.md).

Как и любой плагин, языковой пакет исполняется с правами клиента Harness: перед установкой проверяйте источник (устанавливайте из официального репозитория `warment/dsh-locale-ru`), просматривайте состав поставки и используйте откат (`dsh plugin --profile web remove dsh-locale-ru`) при любых сомнениях.

## English

`dsh-locale-ru` is an independent community localization project for the DeepSeek Harness web UI. It is not an official DeepSeek product and is not affiliated with DeepSeek in any way.

### What the pack can modify

- **Web UI copy.** Dictionaries (`dict/ru/*.json`, built into `lib/client.js`) register with the client's locale service (`@deepseek-ai/dsh-client-locale`) — only displayed text changes.
- **Permission preset display names.** A configuration layer (`cordis.patch.yml`) restates the preset table with Russian display names and descriptions. Preset ids, sandbox settings, and approval semantics are unchanged — `/permission <id>` and session behavior are untouched.

### What the pack does not do

- It contains no host-side logic: the plugin's host half (`index.js`) is an intentional no-op.
- It adds no tools, commands, agents, agent presets, or model providers.
- It never touches the network, files, processes, or credentials; it does not read or store session content.
- It does not modify Harness files: it hooks in exclusively through the documented external-plugin API.
- **Zero runtime dependencies**: `package.json` declares no dependency packages — the installable code is limited to three first-party files (`index.js`, `lib/client.js`, `cordis.patch.yml`), each readable in full within minutes before installing.

The pack does not change Harness behavior itself (model execution, command execution, file access). For the platform's own security posture, see the official [DeepSeek Harness safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/main/SAFETY.md).

Like any plugin, a language pack executes with the Harness client's privileges: verify the install source (install from the official repository `warment/dsh-locale-ru`), review the shipped artifacts, and roll back (`dsh plugin --profile web remove dsh-locale-ru`) on any doubt.

## No warranty

Provided "as is" under the [MIT](LICENSE) license, without warranty of any kind. / Поставляется «как есть» по лицензии [MIT](LICENSE), без каких-либо гарантий.
