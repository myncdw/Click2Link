# 单击转为超链接

> Tampermonkey 用户脚本 — 单击页面中的纯文本 URL，自动识别并转换为可点击的超链接。

## ✨ 特性

- **智能触发** — 仅在单击时触发，拖拽选中等滑动操作不会误转换
- **精准定位** — 通过 `caretRangeFromPoint` 精确定位点击位置的文本，只转换被点击的那个链接
- **广泛匹配** — 支持 90+ 种顶级域名（国际通用、亚太、欧美、新 gTLD 等）
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
