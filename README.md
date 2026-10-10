# 单击转为超链接

> Tampermonkey 用户脚本 — 单击页面中的纯文本 URL，自动识别并转换为可点击的超链接。

## ✨ 特性

- **智能触发** — 仅在单击时触发，拖拽选中等滑动操作不会误转换
- **精准定位** — 通过 `caretRangeFromPoint` 精确定位点击位置的文本，只转换被点击的那个链接
- **广泛匹配** — 支持 90+ 种顶级域名（国际通用、亚太、欧美、新 gTLD 等）
- **最长 TLD 优先** — 同一位置上最长的 TLD 胜出，`example.com` 不会被误识别成 `.co`
- **中文路径支持** — `https://zh.wikipedia.org/wiki/维基百科` 可识别；同时不吞紧贴正文的汉字
- **标点清理** — 自动剥离链接两侧粘连的中英文标点（`。`、`，`、`）` 等），且保留 `wiki/A_(b)` 这类成对括号
- **性能友好** — 事件委托 + 按需正则匹配，不影响页面正常交互
- **安全排除** — 自动跳过表单控件、可编辑区域、已有链接等，不干扰正常使用
- **新标签页打开** — 转换后的链接默认 `target="_blank"`，并附带 `rel="noopener noreferrer"`
- **`<p>` 段落豁免** — 点击落在 `<p>` 段落内时自动豁免可编辑区域排除（`<p>` 是展示段落，不存在输入场景）
- **调试模式** — 开启后在控制台输出每次点击“为什么被跳过 / 已转换”，方便排查问题

## 📦 安装

1. 确保浏览器已安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 访问[此链接](https://greasyfork.org/zh-CN/scripts/589285-%E5%8D%95%E5%87%BB%E8%BD%AC%E4%B8%BA%E8%B6%85%E9%93%BE%E6%8E%A5)
3. 安装脚本

## 🔎 识别规则

脚本支持两种链接格式：

| 格式 | 示例 |
|------|------|
| 带协议的完整 URL | `https://example.com/path`、`http://example.com` |
| `www.` 开头 | `www.example.com` |
| 纯域名（含路径） | `example.com`、`example.com/page` |

其中无协议的域名会自动补全为 `https://`。

### 🎯 TLD 边界规则（避免被更短的 TLD 截断）

匹配时强制要求 **TLD 后面不能再跟域名可用字符**（字母 / 数字 / `-`）：

| 文本 | 结果 | 说明 |
|------|------|------|
| `example.com` | `example.com` | 长 TLD `com` 胜过短 TLD `co` |
| `myncdw.top` | `myncdw.top` | 长 TLD `top` 胜过短 TLD `to` |
| `myncdw.to` | `myncdw.to` | 短 TLD 仍然正常工作 |
| `example.comx` | 不匹配 | 不允许把 `example.com` 从长串中截出 |
| `example.com.` | `example.com` | 句末句号不计入 |
| `example.com:8080/p` | 整体匹配 | 支持可选端口 |

实现上做了**两层保险**：

1. **长度倒序排列** — TLD 交替按长度从长到短拼接（`com` 先于 `co`、`top` 先于 `to`），
   先尝试更长的。向 `tlds` 里添加新域名无需关心顺序，代码会自动排序。
2. **尾部否定前瞻** — 每个 TLD 后接 `(?![a-zA-Z0-9-])`。只靠 ① 是不够的：
   正则交替是“最左优先”，短 TLD 一旦匹配成功就不会再尝试更长的；
   加上断言后，后续字符不合法时**整个分支失败并回溯**，因此
   `myncdw.top` 会回溯到 `.top`，而 `example.comx` 则因无 TLD 能通过断言而整体不匹配。

### ✂️ 尾部标点与中文边界

URL 常被写在句子中间，两侧会粘连中文标点或汉字，脚本会自动处理：

| 文本 | 匹配结果 |
|------|----------|
| `请访问 https://myncdw.top。` | `https://myncdw.top` |
| `【https://github.com/user/repo】` | `https://github.com/user/repo` |
| `(https://example.com/a)` | `https://example.com/a` |
| `https://en.wikipedia.org/wiki/A_(b)` | 整体保留（括号成对） |
| `看https://example.com页面结束` | `https://example.com`（不吞中文） |
| `https://example.com/a, 以及 b.` | `https://example.com/a` |
| `http://。` | 不匹配（裁剪后不成 URL） |

处理方式分两层：

1. **字符类排除** — URL 字符集排除了空白、`<` `>` `"` `'`，以及 CJK 汉字/标点、全角字符和 emoji，
   因此紧贴的中文不会被吞进链接。
2. **尾部裁剪（`trimUrlTail`）** — 再逐个剥掉尾部的 `.,;:!?#` 与各类中文标点；
   `)` `]` `}` 仅在**找不到配对左括号**时才裁，以保留 `wiki/A_(b)` 这类合法路径。
   裁剪后如果只剩 `http://` 这样的空壳，则整条丢弃。

#### 🇨🇳 链接本身含中文怎么办（主机段禁中文 / 路径段允许中文）

中文**路径**在现实中很常见，且技术上完全可行：把 `https://zh.wikipedia.org/wiki/维基百科`
赋给 `a.href` 时，浏览器会自动 percent-encode 成 `%E7%BB%B4...`，点开完全正常。
但若允许汉字出现在**主机段**，`见https://x.com页面结束` 里的 `页面结束` 就会被整段吞掉。

所以脚本按段位区别对待：

| 位置 | 是否允许汉字 | 理由 |
|------|--------------|------|
| 主机段（`x.com`） | ❌ 只允许 ASCII | 汉字出现在这里，几乎一定是紧贴的正文 |
| 路径 / 查询 / 锚点段 | ✅ 允许 | 作者确实会把中文写进路径，浏览器会自动编码 |

| 文本 | 匹配结果 |
|------|----------|
| `https://zh.wikipedia.org/wiki/维基百科` | 整体保留 ✅ |
| `https://zh.wikipedia.org/wiki/维基百科，也是` | 到 `，` 处停下 ✅ |
| `看https://x.com页面结束` | `https://x.com`（主机段截断）✅ |
| `example.com页面` | `example.com`（裸域名同理）✅ |
| `https://x.com/a中文,后面` | `https://x.com/a中文`（吞进来的汉字连标点一起裁）✅ |
| `https://x.com/a页面` | 保留（少量误吞，实际很少见）⚠️ |

补充两点：

- **中文标点本身就是边界** — 路径字符类排除了中文标点，所以 `，` `。` `！` 会直接终止匹配，
  不需要依赖尾部裁剪。
- **中文域名不支持** — `中文.com` 不识别（`tlds` 表是纯 ASCII）。

## 🚫 排除区域（两级规则）

脚本采用**两级排除**，可在 `CONFIG` 中增删选择器：

**① 硬排除（`hardExclude`）— 任何情况下都生效**

| 类型 | 选择器 |
|------|--------|
| 已有链接 | `a` |
| 脚本 / 样式 | `script`, `style` |
| 表单控件 | `textarea`, `input`, `select`, `button` |

**② 可编辑区域排除（`editableExclude`）— 点击落在 `<p>` 段落内时自动豁免**

| 类型 | 选择器 |
|------|--------|
| 可编辑区域 | `[contenteditable]` 系列 |

### 💡 `<p>` 段落豁免规则

当点击位置位于 `<p>` 段落内时，脚本**只应用硬排除**（即仍不触碰已有 `<a>`、表单控件等），
但**不再检查可编辑区域**。这样即使是 `contenteditable` 容器里的 `<p>` 段落文本，
也能正常转换——因为 `<p>` 是展示段落，不存在输入场景。

```text
点击在 <p> 内     → 只用 hardExclude（a / 表单控件等）
点击在 <p> 外     → 用 hardExclude + editableExclude（含 contenteditable）
```

## 🛠 自定义（CONFIG）

脚本顶部集中了 `CONFIG` 配置，按分类组织并附带注释：

| 配置 | 说明 |
|------|------|
| `debug` | `true` 时在控制台输出「跳过原因 / 已转换」，便于排查 |
| `hardExclude` | 硬排除选择器列表（任何情况下都生效） |
| `editableExclude` | 可编辑区域排除列表（在 `<p>` 内自动豁免） |

**按站点覆盖而不用改脚本本体**：在某站点控制台执行下面的代码后刷新即可：

```js
window.__CLICK2LINK_CONFIG__ = {
  debug: true, // 临时排查
};
```

如需添加或移除域名，编辑脚本中的 `tlds` 数组即可。

## 📄 许可

MIT License
