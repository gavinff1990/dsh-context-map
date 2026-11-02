# 架构与算法

这份文档解释三件事：插件怎么被 DSH 加载、一张图是怎么算出来的、为什么这样切模块。

## 1. 加载路径

DSH 的 profile 是「插件包补丁层」的栈。`package.json` 里的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，内容只有一条 `insert`：

```yaml
- insert:
    - id: context-map
      name: dsh-context-map
```

`name` 从 profile 自己的 `node_modules` 解析，所以 `dsh plugin --profile <p> add dsh-context-map` 装好即可挂载。插件入口导出 `inject: ['tools']`，等工具注册表就绪后调用 `ctx.tools.register(definition)`；Cordis 把 dispose 绑在插件生命周期上，卸载即注销。

```
dsh loader ──cordis.patch.yml──▶ dsh-context-map/lib/index.js
                                     │ inject: ['tools']
                                     ▼
                              ctx.tools.register(  context_map  )
                                     │
                          execute(args) ─▶ lib/build.js
```

## 2. 从参数到文件

```
args ─normalizeSpec─▶ model ─layout─▶ geo ─┬─renderSvg────▶ .svg
                                           ├─renderHtml───▶ .html   (内嵌同一份 SVG)
                                           └─renderMarkdown▶ .md
                                                        └─files.js──▶ 磁盘
```

`composeMap()` 是纯函数（除了最终写盘），因此测试可以在不碰磁盘的情况下断言几何与字符串。

### normalizeSpec（`lib/spec.js`）

把模型的松散输入收紧成可渲染的模型：

- 补齐 id（`n1…nN`）、kind 默认 `context`、status 默认 `unknown`；
- 校验 parent 存在、无自指、无环（沿父链最多走 N 步）；
- 多根时插入一个合成根（标题沿用 subtitle 或「上下文全景」），保证树形；
- 从根做 BFS，填充 `depth` 与 `children`；
- 链接去重、端点校验；`formats`/`locale`/`theme`/`slug` 归一化；
- 每一个错误都带 `code` 与**可执行**的中文提示（模型据此自我修正）。

### layout（`lib/layout.js`）

三层计算，全部确定性：

1. **列宽**：先按文本量估算每张卡的自然宽度（CJK 记 1 em，拉丁记 ~0.55 em），取该层最大值作为列宽。列宽统一，网格感来自这里。
2. **卡片高度**：用列宽换算出文本换行行数 → `pill + label行 + detail行 + padding`。
3. **纵向**：递归求子树高度 `subtree = max(自身高, 子节点总高)`；父节点放在子树带正中，子节点按序堆叠。

约束：同级不重叠、卡片不出画布、父节点落在子节点带内。测试逐条验证（`test/layout.test.js`）。

边是从父右缘到子左缘的三次贝塞尔，弯曲量随水平距离变化。跨层关联（`links`）单独处理：**同列**时从右缘绕出再绕回，避免穿过卡片；跨列时走上下弧，画布会为其标签扩宽。

### renderSvg（`lib/svg.js`）

单文件 SVG：内联 CSS 变量（明/暗两套）、内联 marker、无外部字体或图片。所有用户文本走 `escapeXml`，`<title>`/`<desc>` 提供无障碍描述。

细节：左侧 3px 色条编码 kind，kind 药丸用大写小字距，状态点带 `<title>` 提示，图例每行 6 个。

### renderHtml（`lib/html.js`）

把同一份 SVG 嵌进页面，附一条工具栏（缩放 / 适配 / 搜索 / 主题 / 打印）和左侧大纲栏。全部内联，无 CDN、无网络请求、可离线分发。搜索按 `data-search` 过滤并对命中节点加高亮；点击图例可隐藏整类；`/` 聚焦搜索，`+ - 0 f` 操作视图；打印时自动铺满 A3 横向。

### renderMarkdown（`lib/markdown.js`）

Mermaid `flowchart LR` + 类定义（与 SVG 同色）+ 嵌套大纲 + 类型统计 + 节点清单。尖括号被转成实体，`<script>` 这类来自对话的样本不会在 Markdown 宿主的 HTML 渲染里变成标签。

## 3. 为什么这样切

| 模块 | 只做一件事 | 收益 |
| --- | --- | --- |
| `spec.js` | 校验 + 归一化 | 渲染层不需要防御性检查 |
| `layout.js` | 计算几何 | 三种格式共用同一份坐标，不会互相漂移 |
| `svg.js` | 画一张图 | HTML 里嵌的就是这个字符串，所见即所得 |
| `files.js` | 唯一碰磁盘的地方 | 权限面收敛到 40 行，可审计可测试 |
| `tool.js` | 协议适配 | 换 SDK 只改这一层 |

## 4. 上架约束的自动化

`test/package.test.js` 把三个目录的硬性要求变成断言：包名 slug 合法、`dsh.bundle.patch` 存在且指向真实文件、LICENSE 为 SPDX 标识、README 含 `dsh plugin --profile … add`、关键词含 `dsh-plugin` 与 `deepseek-harness`、运行时依赖为空。改坏了，测试先红。
