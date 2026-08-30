# deepseek-harness-locale-ru

中文 | [Русский](README.md) | [English](README.en.md)

`deepseek-harness-locale-ru` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI 的俄语本地化语言包：插件将「Русский」（俄语）加入**官方本地化系统**，即界面设置中内置的语言切换器。

插件通过文档化的客户端本地化 API（`@deepseek-ai/dsh-client-locale`）注册语言与词典，并通过配置层为权限预设提供俄语显示名称。不修改 Harness 的任何文件——无需分叉，也无需重新构建。

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**本语言包会持续跟进：`node scripts/check.mjs` 会将词典与 upstream 当前字符串比对，CI 在每次 push 和 pull request 时运行该检查。词典中暂缺的字符串不会破坏界面——它们以英文显示（英文是配置的回退语言）。

安装前请阅读[安全说明](SAFETY.md)。

## 兼容性

- 本包是**外部 locale 插件**，而非内核内置语言：它通过公开 API 注册语言与词典，不需要修改 upstream。两条路径的保证不同——内置语言经过完整的内核发布周期，外部插件则针对特定 upstream 修订版本验证。
- 已针对 upstream 修订版本 `cd5ef81`（v0.1.2-alpha.1）测试。升级 dsh 后，请重新运行 `node scripts/check.mjs --strict`（需 Harness 克隆）——参见 [docs/upstream-sync.md](docs/upstream-sync.md)。
- 回滚只需一条命令：`dsh plugin --profile web remove deepseek-harness-locale-ru` 并重启 `dsh web`。

## 安装

### 一条命令

复制、粘贴、重启：

```sh
dsh plugin --profile web add github:warment/deepseek-harness-locale-ru
```

该命令适用于任何 dsh 安装方式——npm（`npx @deepseek-ai/dsh web`）或源码检出（`pnpm dsh web`）——并支持 macOS、Windows 和 Linux。`web` 配置档及其目录结构会自动创建，无需手动配置。

**30 秒验证：**

1. 重启 `dsh web`（停止后重新启动进程），打开 Web UI。
2. 打开 **Settings → General**，在 **Language** 一行选择 **«Русский»**。
3. 界面立即切换为俄语：侧边栏显示 «Новая сессия»（新会话）和 «Настройки»（设置）。选择会在重启后保留。

如果不选择语言，界面保持英文——«Русский» 始终可在同一设置项中选择。

### 从本地副本安装

不经过 GitHub 进行测试（例如发布前验证或使用自己的修改）：

```sh
dsh plugin --profile web add /path/to/deepseek-harness-locale-ru
```

### 更新与卸载

更新到新版本时，先移除再用同一条命令安装：

```sh
dsh plugin --profile web remove deepseek-harness-locale-ru
dsh plugin --profile web add github:warment/deepseek-harness-locale-ru
```

卸载：

```sh
dsh plugin --profile web remove deepseek-harness-locale-ru
```

任何插件变更后，请重启 `dsh web`。

## 社区与支持

- 翻译错误、未翻译的字符串、改进建议，请提交到本仓库的 [Issues](https://github.com/warment/deepseek-harness-locale-ru/issues)。
- 关于 DeepSeek Harness 本身的问题（安装、模型、会话——翻译除外），请前往官方仓库：[GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 与 [Discord 社区](https://discord.gg/Ycq5dCaS4)。

## 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。翻译工作流程简述：

1. 在 `upstream/corpus.json` 中找到英文原句——其命名空间和键名指明需要编辑的文件。
2. 编辑 `dict/ru/<namespace>.json`。
3. 校验词典：`node scripts/check.mjs`。
4. 重新构建客户端产物：`node scripts/build.mjs`。
5. 将两处变更一并提交：词典文件与更新后的 `lib/client.js`。

仓库结构：`dict/ru/*.json`——翻译源文件；`upstream/corpus.json`——从 upstream 提取的英文字符串（`node scripts/extract.mjs`，参见 [docs/upstream-sync.md](docs/upstream-sync.md)）；`lib/client.js`——已构建的浏览器端产物（直接提交，用户无需构建步骤）；`scripts/`——校验、构建、字符串提取与启动验证脚本。

## 许可证

[MIT](LICENSE)

DeepSeek Harness 由 [DeepSeek AI](https://deepseek.com) 开发，采用 MIT 许可证；署名与引用说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
