# 🗺️ dsh-context-map

**中文** · [English](README.en.md)

<p align="center">
  <b>把一段对话的上下文，画成一张能贴进文档的信息架构图。</b><br>
  <sub>目标 · 背景 · 决策 · 动作 · 产物 · 风险 · 待确认 —— 分层成图，一次输出 SVG / 交互式 HTML / Mermaid。</sub>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="License"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square" alt="Node"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/runtime%20deps-0-blue?style=flat-square" alt="Zero dependencies"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/dsh-%3E%3D0.2.0--rc.1-4D6BFE?style=flat-square" alt="DSH"></a>
  <a href="https://github.com/gavinff1990/dsh-context-map/stargazers"><img src="https://img.shields.io/github/stars/gavinff1990/dsh-context-map?style=flat-square&color=4D6BFE" alt="Stars"></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#示例">示例</a> ·
  <a href="#能力">能力</a> ·
  <a href="#参数">参数</a> ·
  <a href="#安装详解与排错">安装排错</a> ·
  <a href="#常见问题">常见问题</a>
</p>

<p align="center">
  <img src="docs/context-map-example.svg" alt="一张由 dsh-context-map 生成的示例图：左侧是目标，右侧分为渠道调研、产品设计、交付计划、风险与待办四个分支" width="900">
</p>

<p align="center">
  <sub>这张图由插件自己生成：<code>examples/spec.json</code> → <code>docs/context-map-example.svg</code>（23.9 KB），没有用任何设计工具。</sub>
</p>

---

**为 DeepSeek Harness 补齐「把对话变成结构」这一步。**

长对话结束时，真正值钱的东西散落在上下文里：为什么改了方向、哪个文件才是产物、还有哪些没定。翻聊天记录找不回来，截图又不带结构。

`dsh-context-map` 给 agent 一个工具 `context_map`：agent 把对话蒸馏成节点，插件负责**校验 → 布局 → 渲染**。你得到的是左→右推进的分层结构，不是放射状的思维导图 —— 父子关系一眼可读。

- **零运行时依赖**，不带 API key，不联网，不读会话日志
- **确定性布局**：同一份输入永远得到同一张图，同一天重建字节一致，可以提交进 git
- **三种产物**：矢量 SVG、可缩放可搜索的 HTML、可进 PR 的 Mermaid Markdown

## 快速开始

### 1. 安装

环境要求：DeepSeek Harness（带 `dsh plugin` 命令）+ Node.js ≥ 20 + **pnpm 在 DSH 进程的 PATH 上**。

```sh
# 没装 pnpm 的话先装（DSH 的插件安装由 pnpm 执行）
npm install -g pnpm

# 安装插件
dsh plugin --profile web add dsh-context-map
```

其它装法：

| 方式 | 命令 |
| --- | --- |
| 从 GitHub 指定 tag | `dsh plugin --profile web add github:gavinff1990/dsh-context-map#v0.1.0` |
| 从 git 仓库 | `dsh plugin --profile web add git+https://github.com/gavinff1990/dsh-context-map.git` |
| 本地源码（开发用） | `dsh plugin --profile web add /absolute/path/to/dsh-context-map` |

装完确认挂载点进了合成配置：

```sh
dsh --profile web --dump-config | grep -A1 context-map
# - id: context-map
#   name: dsh-context-map
```

### 2. 说一句话

在会话里直接说（中英文都行）：

> 把这次讨论画成上下文架构图。
> 给我一张这个项目的信息架构图，标出风险和还没定的事。

agent 会调用 `context_map`，把对话整理成节点并渲染。想指定位置就说"放到 `docs/` 下"。

### 3. 打开产物

```
.dsh-context-map/context-map.svg     # 贴文档
.dsh-context-map/context-map.html    # 浏览器打开，可缩放/搜索/筛选
.dsh-context-map/context-map.md      # 进 PR / wiki
```

**建议让 agent 传绝对路径的 `outDir`**：插件进程的工作目录不一定等于会话工作区，绝对路径最稳。

## 示例

仓库里三份真实产物，都由 `examples/spec.json` 生成：

| 文件 | 大小 | 里面有什么 |
| --- | --- | --- |
| [`context-map-example.svg`](docs/context-map-example.svg) | 23.9 KB | 单文件矢量图；明暗两套主题内联，`prefers-color-scheme` 直接生效 |
| [`context-map-example.html`](docs/context-map-example.html) | 39.4 KB | 同一张图 + 工具栏 + 大纲栏；离线可用，无 CDN |
| [`context-map-example.md`](docs/context-map-example.md) | 5.6 KB | Mermaid `flowchart` + 嵌套大纲 + 类型统计 + 节点清单 |

## 能力

| 入口 | 适合 | 你得到什么 |
| :--- | :--- | :--- |
| 🖼️ **SVG** | 贴进文档、README、幻灯片 | 矢量不失真，深浅色自动适配 |
| 🖱️ **HTML** | 自己看、发给别人看 | 缩放、适配、搜索、按类型筛选、大纲跳转、A3 打印 |
| 🧾 **Markdown** | 进 PR、进 wiki、让 review 看见结构 | Mermaid 源码 + 大纲 + 清单，diff 可审阅 |
| ⌨️ **CLI** | 进 CI、批量重建、手工校样 | 同一套渲染器，`--json` 还能吐布局几何 |

### 🧭 分层布局，不是雷达图

深度就是一列：列宽取该层最宽卡片，父节点对齐子节点子树带，同级按序堆叠且不重叠。跨分支关联（如「风险 X 阻塞动作 Y」）走虚线，绕右缘出画面，不穿过卡片。算法与不变量写在 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

### 🎨 语义着色，跨图一致

八种节点各有固定色与色条：目标蓝、背景灰、决策紫、动作绿、产物琥珀、风险玫红、待确认青、备注石板灰。状态（`done` / `active` / `planned` / `blocked`）画成节点左侧的小圆点。

### 🖱️ HTML 里能做什么

- `/` 聚焦搜索，`+` / `-` 缩放，`0` 还原，`f` 适配，`Esc` 清空
- 点图例里的某一类，隐藏/显示该类节点
- 点左侧大纲的任意一行，跳到对应节点并高亮
- 右上角 `◐` 在 auto / light / dark 之间切换；`⎙` 直接打印

### 🔒 零网络、零依赖、零配置

没有 `fetch`、没有 socket、没有遥测，不 spawn 子进程，不 `eval`。它只写 `outDir` 下的三个文件，并显式拒绝文件系统根目录、`~/.dsh`、`~/.ssh`、`~/.aws` 等位置。

## 参数

### 工具参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 图标题，一行 |
| `nodes` | ✅ | 节点数组，上限 300 |
| `subtitle` | | 副标题：这张图回答的问题 |
| `links` | | 树表达不了的跨分支依赖，上限 150 |
| `outDir` | | 输出目录，默认 `.dsh-context-map`；推荐绝对路径 |
| `slug` | | 文件基名，默认由标题推导为 `[a-z0-9-]` |
| `formats` | | `svg` / `html` / `md` 子集，默认全出 |
| `theme` | | `light` / `dark` / `auto`（默认跟随系统） |
| `locale` | | `zh` / `en`，默认 `zh` |

### 节点字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `label` | ✅ | 短标签，建议 ≤ 40 字，一行能扫完 |
| `kind` | | 见下表，默认 `context` |
| `detail` | | 一句补充：理由、证据、确切路径 |
| `parent` | | 父节点 id；不填即为根（多根会自动加合成根） |
| `id` | | 稳定 id，供 `parent` / `links` 引用；默认 `n1…nN` |
| `status` | | `done` / `active` / `planned` / `blocked` |

### 八种节点类型

| kind | 含义 | 典型内容 |
| --- | --- | --- |
| `goal` | 目标 | 用户到底要什么 |
| `context` | 背景 / 约束 | 环境限制、已确认的事实、外部规则 |
| `decision` | 已做的决策 | 选型、取舍、拍板结论 |
| `action` | 动作 | 正在做或要做的事 |
| `artifact` | 产物 | 文件、仓库、文档、图表 |
| `risk` | 风险 | 会翻车的地方 |
| `question` | 待确认 | 还没定的问题 |
| `note` | 备注 | 其他值得留下的信息 |

## 命令行

同一套渲染器也能脱网跑，方便进 CI 或手工校样：

```sh
node bin/cli.js examples/spec.json --out docs        # 写三份文件
node bin/cli.js examples/spec.json --json            # 只看布局几何（调试）
node bin/cli.js examples/spec.json --stdout > m.svg  # SVG 到标准输出
echo '{"title":"t","nodes":[{"label":"root"}]}' | node bin/cli.js -   # 从标准输入读
```

`--help` 有完整参数表（`--formats` / `--theme` / `--locale` / `--slug` / `--quiet`）。

## 安装详解与排错

### 桌面版怎么装

Desktop profile 由 Electron 应用独占管理，`dsh plugin --profile desktop add` 会被拒绝。请在应用内的插件市场安装；市场尚未收录时，把下面这行加到 `~/.dsh/profiles/desktop/cordis.patch.yml` 的数组里，并确保该包已在 profile 的 `node_modules` 中：

```yaml
- id: context-map
  name: dsh-context-map
```

### `pnpm: command not found`

DSH 的插件安装由 pnpm 执行，而它要求 pnpm 在 **DSH 进程**的 PATH 上（不是只在某个终端里）。

```sh
npm install -g pnpm
pnpm --version        # 确认能找到
```

装完重启 DSH，让新 PATH 生效。

### 装完看不到 `context_map` 工具

1. `dsh --profile web --dump-config | grep -A1 context-map` —— 没有这一行说明包没装上；
2. 有这一行但工具没出现：确认 profile 里 `@deepseek-ai/dsh-tools` 正常加载（`inject: ['tools']` 会等它）；
3. 重启 DSH 会话（工具列表在会话开始时就固定了）。

### 更新与卸载

```sh
dsh plugin --profile web add dsh-context-map@latest   # 更新
dsh plugin --profile web remove dsh-context-map       # 卸载
```

## 隐私与数据

| 项目 | 情况 |
| --- | --- |
| 网络请求 | **无**。没有 `fetch` / socket / 遥测 |
| 会话日志 | **不读**。不碰 `~/.dsh/sessions`，只处理本次调用传入的节点 |
| 写入范围 | 仅 `outDir` 下 `<slug>.svg` / `<slug>.html` / `<slug>.md` 三个文件 |
| 进程 / 代码执行 | 不 spawn、不 `eval`、不加载远程代码、无安装钩子 |
| 密钥 | 不需要任何 API key |

这些约束写在 [`lib/files.js`](lib/files.js) 的 `resolveOutDir` 里，并由测试守着。

## 兼容性

- DSH `>=0.2.0-rc.1 <0.3.0-0`。在 **0.2.1-rc.2** 上验证过：临时 profile 跑 `--dump-config` 能合成出 `context-map` 这一行。
- Node `>=20`（用到 `node:test`、`String.replaceAll`）。
- macOS / Linux / Windows。

## 设计取舍

**摘要交给 agent，渲染交给插件。** 插件不调模型：它没有密钥、没有 token 成本、输出可复现，也因此能用一个纯函数的方式被测穿。

**注册原始 `ToolDefinition`，不依赖作者 DSL。** `parameters` 就是模型看到的 JSON Schema，`dsh-tools` 升级不会让插件漂移；整个包 `dependencies` 为空。

**布局是算出来的。** 没有 canvas、没有字体度量 API：文本宽度用 CJK 感知的估算，Node 里算出什么，浏览器里就是什么。

## 限制

- 一张图 = 一棵树。多个根会自动加一个合成根。
- 单图上限 300 节点 / 150 条跨分支关联。节点多时图会很高，**先分组**（3–5 个分支，每支 2–6 个子节点）—— 工具描述里就是这么要求模型的。
- 它不决定内容，只负责画对；要点该不该进图由 agent 判断。
- 不是设计工具：没有拖拽、没有手工调位、不导出 PNG/PDF（SVG 与浏览器打印够用）。

## 常见问题

**为什么不让插件自己读聊天记录？**
DSH 的会话是 `session.v4.jsonl.zstd`——多帧拼接的 zstd 内部格式，解析它会在版本升级时碎掉。而且模型本来就在上下文里，让它蒸馏比让插件猜更准。插件只做渲染，才换来「无网络、无密钥、可复现」。

**图太宽/太高怎么办？**
先分组。单层十几个兄弟节点会拉出一条很长的竖列；3–5 个分支、每支 2–6 个叶子读起来最舒服。已生成的图可以在 HTML 里缩放、搜索、按类型筛。

**能改配色吗？**
改 [`lib/theme.js`](lib/theme.js) 的 `KIND_STYLES`：每个 kind 一个 accent + 一个 tint，明暗两套一起生效。

**每次生成的图会不一样吗？**
坐标完全确定，时间戳只到日。同一天重建是字节一致的；跨天只有那一行日期会变。

## 本地开发

```sh
npm test          # 55 个用例 / 6 个套件
npm run demo      # 用 examples/spec.json 生成到 examples/out
npm run check     # node --check 入口
```

测试为什么不用 `node --test`：它会给每个文件 fork 子进程，在被限制的沙箱里会 `EPERM`。`scripts/test.mjs` 把 6 个套件 import 进同一进程，语义一致、退出码一样。

```
lib/        spec → layout → svg → html / markdown → files
bin/        CLI（与工具共用同一套渲染）
test/       规格校验、布局不变量、渲染与转义、插件注册、打包元数据、schema 契约
docs/       示例产物 + 架构说明
examples/   可以直接改的输入样例
```

其中 [`test/package.test.js`](test/package.test.js) 把**上架契约**变成了断言：包名 slug 合法、`dsh.bundle.patch` 指向真实文件、LICENSE 是 SPDX 标识、README 含安装命令、运行时依赖为空。改坏了测试先红。

## 反馈

- 问题与建议：[Issues](https://github.com/gavinff1990/dsh-context-map/issues)
- 更新记录：[CHANGELOG](CHANGELOG.md) · 版本：[Releases](https://github.com/gavinff1990/dsh-context-map/releases)
- 参与开发：[CONTRIBUTING](CONTRIBUTING.md) · 安全策略：[SECURITY](SECURITY.md)

## License

[MIT](LICENSE)
