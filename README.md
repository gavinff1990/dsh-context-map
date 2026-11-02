# dsh-context-map

<div align="center">

**把一段对话的上下文，画成一张能贴进文档的信息架构图。**

目标、背景、决策、动作、产物、风险、待确认 —— 分层成图，一次输出 SVG / 交互式 HTML / Mermaid 三种格式。

[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-4D6BFE)](https://github.com/topics/dsh-plugin)
[![license](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-339933)](package.json)
[![deps](https://img.shields.io/badge/runtime%20deps-0-blue)](package.json)

<br>

<img src="docs/context-map-example.svg" alt="一张由 dsh-context-map 生成的示例图：左侧是目标，右侧分为渠道调研、产品设计、交付计划、风险与待办四个分支" width="880">

<sub>上面这张图由插件自己生成（`examples/spec.json` → `docs/context-map-example.svg`），没有经过任何设计工具。</sub>

</div>

---

## 它解决什么

长对话结束时，真正有价值的东西散落在上下文里：为什么改了方向、哪个文件是产物、还有哪些没定。翻聊天记录找不回来，截图又不结构化。

`dsh-context-map` 让 agent 把这段对话**蒸馏成一棵带语义的树**，再渲染成一张能直接交付的图：

- **分层结构**，不是思维导图式的放射状随机排布：左 → 右按层推进，父子关系一眼可读。
- **语义着色**：目标 / 背景 / 决策 / 动作 / 产物 / 风险 / 待确认，七类各有固定色，跨图一致。
- **三种落盘格式**，各司其职：
  | 文件 | 用途 |
  | --- | --- |
  | `.svg` | 贴文档、贴 README、放进幻灯片，矢量不失真 |
  | `.html` | 人在浏览器里看：缩放、搜索、按类型筛选、明暗主题、可打印 |
  | `.md` | 进 PR / wiki：Mermaid 源码 + 结构大纲 + 节点清单，diff 可审阅 |
- **确定性**：同一份输入永远得到同一张图（无随机数，时间戳只精确到日），同一天重新生成是**字节一致**的，可以放心提交进 git 而不会每次重建都产生噪声 diff。

## 安装

```sh
# Web / headless / TUI profile
dsh plugin --profile web add dsh-context-map

# 也可以从源码目录装（开发时）
dsh plugin --profile web add /absolute/path/to/dsh-context-map
```

桌面版（Desktop profile）由应用独占管理，请在应用内的插件市场安装；若市场尚未收录，可手动把这一行加到 `~/.dsh/profiles/desktop/cordis.patch.yml`：

```yaml
- id: context-map
  name: dsh-context-map
```

安装后无需任何配置：插件没有 API key、没有开关、没有网络请求。

## 用法

在对话里直接说：

> 把这次讨论画成上下文架构图。
> 给我一张这张项目的信息架构图，标出风险和还没定的事。

agent 会把对话整理成节点并调用 `context_map` 工具，返回三个文件路径。典型产出：

```
.dsh-context-map/context-map.svg
.dsh-context-map/context-map.html
.dsh-context-map/context-map.md
```

想指定位置，就说"放到 `docs/` 下"。**建议传绝对路径**：插件进程的工作目录不一定等于会话工作区，绝对路径最稳。

### 工具参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 图标题，一行 |
| `nodes` | ✅ | 节点数组，见下 |
| `subtitle` | | 副标题：这张图回答的问题 |
| `links` | | 树表达不了的跨分支依赖（如「风险 X 阻塞动作 Y」） |
| `outDir` | | 输出目录，默认 `.dsh-context-map`；推荐绝对路径 |
| `slug` | | 文件名，默认由标题推导 |
| `formats` | | `svg` / `html` / `md` 子集，默认全出 |
| `theme` | | `light` / `dark` / `auto`（默认跟随系统） |
| `locale` | | `zh` / `en`，默认 `zh` |

节点字段：`label`（必填）、`id`、`kind`、`detail`、`parent`、`status`。

### 七种节点类型

| kind | 含义 | 典型内容 |
| --- | --- | --- |
| `goal` | 目标 | 用户到底要什么 |
| `context` | 背景 / 约束 | 环境限制、已确认的事实、渠道规则 |
| `decision` | 已做的决策 | 选型、取舍、拍板结论 |
| `action` | 动作 | 正在做或要做的事 |
| `artifact` | 产物 | 文件、仓库、文档、图表 |
| `risk` | 风险 | 会翻车的地方 |
| `question` | 待确认 | 还没定的问题 |
| `note` | 备注 | 其他值得留下的信息 |

`status` 可选 `done` / `active` / `planned` / `blocked`，画成节点上的小圆点。

## 命令行

同一套渲染器也能脱网跑，方便进 CI 或手工校样：

```sh
node bin/cli.js examples/spec.json --out docs

# 只看几何（调试 / 做预览）
node bin/cli.js examples/spec.json --json

# 把 SVG 打到标准输出
node bin/cli.js examples/spec.json --stdout > map.svg
```

`--help` 有完整参数表。

## 设计取舍

**零运行时依赖。** 工具直接注册原始 `ToolDefinition`（`parameters` 就是模型看到的 JSON Schema），不依赖 `@deepseek-ai/dsh-tools` 的作者 DSL，因此不会随 SDK 版本漂移；整个包的运行时依赖为 0，安装即用。

**不做 LLM 调用。** 摘要由 agent 完成（它本来就在上下文里），插件只负责把结构画对。这让插件是纯函数式的：可测试、可复现、无 token 成本、无密钥。

**布局是算出来的，不是调出来的。** 列宽取该层最宽卡片、父节点对齐子节点子树带、叶子按序堆叠 —— 全部确定性计算，见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。没有 canvas，没有字体度量 API，Node 里跑出什么，浏览器里就是什么。

**两套主题写在同一个 SVG 里。** `prefers-color-scheme` 直接生效；HTML 版本还能手动切换。打印时自动铺满 A3 横向。

## 隐私与权限

- **不联网**：没有 `fetch`、没有 socket、没有遥测。
- **不读会话日志**：插件不碰 `~/.dsh/sessions`，只处理这次工具调用传进来的节点。
- **只写三处**：`outDir` 下的 `.svg` / `.html` / `.md`。文件系统根目录、`~/.dsh`、`~/.ssh`、`~/.aws` 等位置会被显式拒绝。
- **不 spawn 进程**，不 eval，不加载远程代码。

这些约束写在代码里（[`lib/files.js`](lib/files.js) 的 `resolveOutDir`），并由测试守着。

## 兼容性

- DSH `>=0.2.0-rc.1 <0.3.0-0`
- Node `>=20`（用到 `node:test`、`String.replaceAll`）
- macOS / Linux / Windows

## 开发

```sh
npm test          # 50 个用例：规格校验、布局不重叠、转义、插件注册、写盘、打包元数据
npm run demo      # 用 examples/spec.json 生成到 examples/out
npm run check     # node --check 入口文件
```

仓库结构：

```
lib/        spec → layout → svg → html/markdown → files
bin/        CLI（与工具共用同一套渲染）
test/       单元测试（同进程跑，沙箱环境也能过）
docs/       示例产物 + 架构说明
examples/   可以直接改的输入样例
```

测试里有一条专门校验**上架契约**：包名 slug 合法、`dsh.bundle.patch` 存在、LICENSE 是 SPDX 标识、README 含安装命令、零依赖 —— 免得改着改着把可上架性弄坏。

## License

[MIT](LICENSE)
