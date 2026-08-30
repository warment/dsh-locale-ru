# Публикация релиза

Runbook для владельца. Все шаги выполняются из корня репозитория `deepseek-harness-locale-ru`, если не сказано иное.

## 0. Предусловия

- `gh` авторизован (`gh auth status`) под аккаунтом warment.
- Чистое дерево: `git status --porcelain` пуст.
- Валидатор зелёный: `node scripts/check.mjs --strict`.

## 1. Первый релиз (репозитория ещё нет)

```sh
git tag v0.1.0
gh repo create warment/deepseek-harness-locale-ru --public --source=. --push
gh release create v0.1.0 --title "v0.1.0 — полный русский интерфейс" --notes "33 namespace, 1061 строка, установка одной командой: dsh plugin --profile web add github:warment/deepseek-harness-locale-ru"
```

## 2. Проверка после пуша

```sh
gh repo view warment/deepseek-harness-locale-ru --web
# чистая установка с github: — в изолированном HOME:
DSH_HOME=/tmp/dsh-check pnpm dsh plugin --profile web add github:warment/deepseek-harness-locale-ru   # запускать из клона harness
DSH_HOME=/tmp/dsh-check pnpm dsh web --no-open --port 3081                                # открыть URL из лога, выбрать «Русский»
DSH_HOME=/tmp/dsh-check pnpm dsh plugin --profile web remove deepseek-harness-locale-ru && rm -rf /tmp/dsh-check
```

## 3. Настройки репозитория (один раз)

- About: «Русский язык для DeepSeek Harness web UI — one-command install», сайт не нужен.
- Topics: `dsh-plugin`, `deepseek-harness`, `localization`, `russian`, `i18n`.
- Settings → General → Releases: включить; Discussions — включить.

## 4. Следующие версии

```sh
# 1. правки словарей + node scripts/build.mjs + node scripts/check.mjs --strict
npm version patch        # или minor/major
git push --follow-tags
gh release create v0.x.y --generate-notes
```

Пользователи обновляются повторным `dsh plugin --profile web add github:warment/deepseek-harness-locale-ru` (pnpm подтянет новый коммит main).

## 5. Опционально: npm

Требует аккаунта npm (`npm login`). Пакет готов: `files` покрывает всё нужное, пребилд `lib/client.js` закоммичен.

```sh
npm publish --access public
```

После этого установка сокращается до `dsh plugin --profile web add deepseek-harness-locale-ru`.

## 6. Откат / вывод пользователя

- Пользователь: `dsh plugin --profile web remove deepseek-harness-locale-ru` + перезапуск `dsh web`.
- Владелец: `git revert <sha>` + новая patch-версия; в крайнем случае вернуть предыдущий тег на main.
