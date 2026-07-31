# 单击转为超链接

> Tampermonkey 用户脚本 — 单击页面中的纯文本 URL，自动识别并转换为可点击的超链接。

## ✨ 特性

- **智能触发** — 仅在单击时触发，拖拽选中等滑动操作不会误转换
- **精准定位** — 通过 `caretRangeFromPoint` 精确定位点击位置的文本，只转换被点击的那个链接
- **广泛匹配** — 支持 90+ 种顶级域名（国际通用、亚太、欧美、新 gTLD 等）
- **性能友好** — 事件委托 + 按需正则匹配，不影响页面正常交互
- **安全排除** — 自动跳过表单控件、可编辑区域、已有链接等，不干扰正常使用
- **新标签页打开** — 转换后的链接默认 `target="_blank"`，并附带 `rel="noopener noreferrer"`

## 📦 安装

1. 确保浏览器已安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 点击 Tampermonkey 图标 → **添加新脚本**
3. 将 `单击转为超链接-1.0.user.js` 的内容粘贴进去
4. 保存（`Ctrl+S`），脚本即生效

## 🔎 识别规则

脚本支持两种链接格式：

| 格式 | 示例 |
|------|------|
| 带协议的完整 URL | `https://example.com/path`、`http://example.com` |
| `www.` 开头 | `www.example.com` |
| 纯域名（含路径） | `example.com`、`example.com/page` |

其中无协议的域名会自动补全为 `https://`。

## 🚫 排除区域

以下区域中的文本**不会**被转换，确保不影响正常使用：

| 类型 | 选择器 |
|------|--------|
| 已有链接 | `a` |
| 脚本 / 样式 | `script`, `style` |
| 表单控件 | `textarea`, `input`, `select`, `button` |
| 可编辑区域 | `[contenteditable]` 系列 |

## 🛠 自定义

如需添加或移除域名，编辑脚本中的 `tlds` 数组即可。如需修改排除规则，编辑 `excludeSelector` 数组。两个变量均按分类组织并附带注释，方便维护。

## 📄 许可

MIT License
