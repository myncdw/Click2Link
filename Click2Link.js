// ==UserScript==
// @name         单击转为超链接
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  只有在单击文本时才识别是否为链接并转换，滑动选择不会触发。支持 Shadow DOM（如 B 站评论区）；点击落在 <p> 段落内时豁免可编辑区域排除
// @author       myncdw
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @license MIT
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置区 ====================
    // 默认配置。可按站点覆盖：在控制台执行
    //   window.__CLICK2LINK_CONFIG__ = { debug: true }
    // 后刷新页面即可（无需修改脚本本体）。
    const CONFIG = Object.assign(
        {
            // 调试模式：true 时在控制台输出“本次点击为什么被跳过/已转换”，便于排查
            debug: false,

            // ---------- 硬排除（任何情况下都生效）----------
            // 命中这些选择器一律不转换。
            // 注意：即使在 <p> 段落内也仍生效——避免把已有的 <a> 链接重复转换。
            hardExclude: [
                // 已经是链接或脚本/样式标签
                'a',
                'script',
                'style',

                // 表单控件（正常不会出现在 <p> 内，保险起见保留）
                'textarea',
                'input',
                'select',
                'button',
            ],

            // ---------- 可编辑区域排除 ----------
            // 命中这些选择器默认不转换；但当点击落在 <p> 段落内时自动豁免
            // （<p> 是展示段落，不存在输入场景）。
            editableExclude: [
                '[contenteditable="true"]',
                '[contenteditable="plaintext-only"]',
                '[contenteditable]',
            ],
        },
        window.__CLICK2LINK_CONFIG__ || {}
    );

    // 完整排除选择器（非 <p> 场景使用）
    const fullExcludeSel = CONFIG.hardExclude.concat(CONFIG.editableExclude).join(', ');
    // <p> 段落内仅保留硬排除
    const hardExcludeSel = CONFIG.hardExclude.join(', ');

    const log = (...args) => {
        if (CONFIG.debug) console.log('[Click2Link]', ...args);
    };

    // ========== 可维护的 TLD 列表 ==========
    const tlds = [
        // ---- 国际通用顶级域名 ----
        'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
        'info', 'biz', 'name', 'pro', 'aero', 'coop', 'museum',

        // ---- 亚太地区域名 ----
        'cn', 'jp', 'kr', 'tw', 'hk', 'mo', 'sg', 'my', 'th', 'vn',
        'ph', 'id', 'in', 'pk', 'bd', 'lk', 'np', 'mm', 'kh', 'la',
        'au', 'nz',

        // ---- 欧美地区域名 ----
        'us', 'uk', 'ca', 'de', 'fr', 'it', 'es', 'nl', 'ru', 'br',
        'mx', 'ar', 'pl', 'se', 'ch', 'be', 'at', 'dk', 'no', 'fi',
        'ie', 'pt', 'gr', 'cz', 'hu', 'ro', 'ua', 'tr',

        // ---- 其他常用国别域名 ----
        'io', 'co', 'me', 'tv', 'cc', 'ly', 'to', 'ws', 'fm', 'am',
        'gg', 'sh', 'st', 'so', 'tk', 'ml', 'ga', 'cf',

        // ---- 新通用顶级域名 (new gTLDs) ----
        'xyz', 'app', 'dev', 'tech', 'online', 'site', 'store', 'blog',
        'ai', 'cloud', 'club', 'design', 'news', 'media', 'studio',
        'live', 'today', 'email', 'world', 'space', 'website', 'life',
        'ink', 'fun', 'games', 'social', 'wiki', 'work', 'video',
        'run', 'guru', 'solutions', 'software', 'systems',

        // ---- 容易成为其他 TLD 前缀的域名（需配合边界断言）----
        'top', 'shop', 'vip', 'icu', 'art', 'cat', 'mobi', 'asia', 'tel',
    ];

    // ========== 正则构造 ==========
    // ---- TLD 交替：最长优先 ----
    // 同一位置上最长的 TLD 必须胜出（“x.com” 不能匹配成 “.co”），靠两层保险：
    //   ① 按长度倒序排列：com 排在 co 前、top 排在 to 前，先试更长的；
    //   ② 每个 TLD 后追加否定前瞻 “(?![a-zA-Z0-9-])”，后面若还跟着域名可用字符，
    //      整个分支失败并回溯去试其他 TLD。
    // 光靠 ① 不够 —— 正则交替是“最左优先”，短 TLD 一旦匹配成功就不会再尝试更长的，
    // 所以 ② 才是真正的兜底：“myncdw.top” 会回溯到 “.top”，
    // 而 “example.comx” 因无 TLD 能通过断言而整体不匹配。
    // 往 tlds 里加新域名无需关心顺序，这里会自动按长度排序。
    const tldAlt = tlds.slice().sort((a, b) => b.length - a.length).join('|');

    // ========== URL 字符类（主机段禁中文 / 路径段允许中文）==========
    // 主机段只允许 ASCII：汉字一旦出现在主机位置，说明它是紧贴 URL 的正文
    //   （“见https://x.com页面结束”），因此在这里天然截断。
    // 首尾都要求字母/数字，避免尾部留下 “x.com-” 这种残缺主机名。
    const HOST = '[a-zA-Z0-9](?:[a-zA-Z0-9\\-._]*[a-zA-Z0-9])?';
    // 路径 / 查询 / 锚点段允许汉字：作者确实会把中文写进路径
    //   （https://zh.wikipedia.org/wiki/维基百科），赋给 a.href 时浏览器会自动
    //   percent-encode，所以能安全支持。
    // 仍排除空白、尖括号、引号、中文标点、全角字符、非 BMP（emoji）等——
    //   中文标点被排除意味着它本身就是个可靠的收尾边界，
    //   例如 “…/wiki/维基百科，也是” 会在 “，” 处停下。
    const PATH_CHAR = '[^\\s<>"\'\\u2000-\\u206f\\u3000-\\u303f\\uff00-\\uffef\\ud800-\\udfff]';

    const URL_BODY = [
        // 分支 1：带协议或 www. 开头 —— 主机段与路径段分开写，实现上面说的“段位差异”
        '(?:https?:\\/\\/|www\\.)' + HOST + '(?::\\d{1,5})?(?:[/?#]' + PATH_CHAR + '*)?',
        '|',
        // 分支 2：裸域名 —— 主机段是 ASCII 标签 + TLD，同样天然不含汉字
        '(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+',
        '(?:' + tldAlt + ')',
        '(?![a-zA-Z0-9-])',
        '(?::\\d{1,5})?',
        '(?:[/?#]' + PATH_CHAR + '*)?'
    ].join('');

    // 全局检索用（g 标志）
    const urlRegex = new RegExp(URL_BODY, 'gi');
    // 单条精确校验用（无 g 标志，避免 lastIndex 干扰）
    const urlExactRegex = new RegExp('^(?:' + URL_BODY + ')$', 'i');

    // ========== URL 尾部标点裁剪 ==========
    // 路径段允许出现汉字后，尾部会有两类残留：
    //   ① 标点：“见 https://x.com/a.”   → 末尾 “.” 不是 URL 的一部分
    //            “(https://x.com/a)”     → 末尾 “)” 是句末括号，应裁掉
    //            “https://x.com/A_(b)”   → 末尾 “)” 属于 URL 内容，必须保留
    //   ② 半角标点 + 汉字：“https://x.com/a中文,后面” —— 逗号在 URL 中合法所以被吞了进来，
    //      但它后面的汉字其实是正文，需连标点一起裁掉
    const TRAIL_PUNCT = new Set([
        '.', ',', ';', ':', '!', '?', '#', '\'',
        '。', '，', '、', '；', '：', '！', '？', '…', '·', '～',
        '（', '）', '【', '】', '《', '》', '「', '」', '『', '』', '“', '”', '‘', '’',
    ]);

    // 汉字（含扩展 A 区与兼容区）
    const CJK_IDEOGRAPH = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
    // 裁汉字时允许被一起吃掉的半角标点
    const CJK_AFTER_PUNCT = new Set([',', ';', ':', '!', '?']);

    // 末尾右括号在 [0, end) 内是否有配对的左括号（有配对 → 属于 URL 内容）
    function hasPairingOpen(s, end, right, left) {
        let depth = 0;
        for (let i = end - 1; i >= 0; i--) {
            if (s[i] === right) depth++;
            else if (s[i] === left && --depth === 0) return true;
        }
        return false;
    }

    // 裁掉 URL 尾部粘连的标点
    function trimUrlTail(raw) {
        let end = raw.length;
        while (end > 0) {
            const ch = raw[end - 1];
            if (TRAIL_PUNCT.has(ch)) {
                end--;
                continue;
            }
            if (ch === ')' || ch === ']' || ch === '}') {
                const left = ch === ')' ? '(' : ch === ']' ? '[' : '{';
                if (!hasPairingOpen(raw, end, ch, left)) {
                    end--;
                    continue;
                }
            }
            // 汉字结尾：若这串汉字前面紧邻半角标点，说明汉字属于正文，连标点一起裁
            //   “https://x.com/a中文,后面” → “https://x.com/a中文”
            //   “https://x.com/wiki/中文”  → 前面的 “/” 不在名单里，保留
            if (CJK_IDEOGRAPH.test(ch)) {
                let s = end - 1;
                while (s > 0 && CJK_IDEOGRAPH.test(raw[s - 1])) s--;
                if (s > 0 && CJK_AFTER_PUNCT.has(raw[s - 1])) {
                    end = s - 1;
                    continue;
                }
            }
            break;
        }
        return raw.slice(0, end);
    }

    // 裁剪后仍需“像 URL”：协议后必须仍有主机名，避免只剩下 “http://”
    function isUsableUrl(u) {
        if (/^https?:\/\//i.test(u)) {
            return /[a-zA-Z0-9]/.test(u.slice(u.indexOf('//') + 2));
        }
        return urlExactRegex.test(u);
    }

    // 在文本中查找所有可用 URL（已裁剪尾部标点）；返回 [{ url, start, end }]
    function findUrlsIn(text) {
        const found = [];
        urlRegex.lastIndex = 0;
        let m;
        while ((m = urlRegex.exec(text)) !== null) {
            if (m[0].length === 0) {
                urlRegex.lastIndex++;
                continue;
            }
            const url = trimUrlTail(m[0]);
            if (!url || !isUsableUrl(url)) continue;
            found.push({ url, start: m.index, end: m.index + url.length });
        }
        return found;
    }

    let mouseDownX = 0;
    let mouseDownY = 0;

    document.addEventListener('mousedown', (e) => {
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
    }, true);

    // ========== Shadow DOM 支持 ==========
    // 说明：document.caretRangeFromPoint 无法穿透 shadow 树（点击 shadow 内文本时
    // 返回的是宿主等元素节点，而非文本节点）。因此 shadow 树内改用“文本命中检测”：
    // 测量每个 URL 的渲染区域，判断点击点是否落在其上。

    // 在指定文本节点内，判断偏移量是否落在某个 URL 上
    function matchUrlAtOffset(textNode, offset) {
        const fullText = textNode.nodeValue;
        if (!fullText) return null;
        for (const item of findUrlsIn(fullText)) {
            if (offset >= item.start && offset <= item.end) {
                return { textNode, url: item.url, start: item.start, end: item.end };
            }
        }
        return null;
    }

    // 获取点击点的 URL 目标；支持 shadow DOM。
    // 返回 { textNode, url, start, end } 或 null
    function findTargetAtPoint(x, y, hitEl) {
        const root = hitEl && hitEl.getRootNode ? hitEl.getRootNode() : document;
        const inShadow = root instanceof ShadowRoot;

        // 1) 普通文档：caretRangeFromPoint 足够可靠
        if (!inShadow) {
            let range = null;
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(x, y);
            } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(x, y);
                if (pos) {
                    range = document.createRange();
                    range.setStart(pos.offsetNode, pos.offset);
                    range.setEnd(pos.offsetNode, pos.offset);
                }
            }
            if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
                const target = matchUrlAtOffset(range.startContainer, range.startOffset);
                if (target) return target;
            }
        }

        // 2) 兜底：文本命中检测（shadow 树内无 caretRangeFromPoint，且部分边界情况也需要）
        return hitTestUrlAtPoint(x, y, hitEl, root);
    }

    // 文本命中检测：遍历文本节点，测量每个 URL 的渲染区域，判断点击点是否落在其上
    function hitTestUrlAtPoint(x, y, hitEl, root) {
        if (!hitEl) return null;
        let nodes = [];
        const walker = document.createTreeWalker(hitEl, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        // 若命中元素下没有直接文本（文本可能在更深的嵌套里），扩大到整个根树
        if (nodes.length === 0) {
            const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            while ((n = w2.nextNode())) nodes.push(n);
        }
        for (const tn of nodes) {
            const fullText = tn.nodeValue;
            if (!fullText) continue;
            for (const item of findUrlsIn(fullText)) {
                const r = document.createRange();
                r.setStart(tn, item.start);
                r.setEnd(tn, item.end);
                const rect = r.getBoundingClientRect();
                if (!rect || rect.width === 0) continue;
                if (x >= rect.left - 3 && x <= rect.right + 3 && y >= rect.top - 3 && y <= rect.bottom + 3) {
                    return { textNode: tn, url: item.url, start: item.start, end: item.end };
                }
            }
        }
        return null;
    }

    document.addEventListener('click', (e) => {
        // ---- 0. 实际被点击的元素（composedPath 可穿透 shadow DOM）----
        const pathEl = e.composedPath ? e.composedPath()[0] : e.target;
        const hitEl = pathEl instanceof Element ? pathEl : (e.target instanceof Element ? e.target : null);
        if (!hitEl) return;

        // ---- 1. 判断是否在 <p> 段落内，决定使用哪套排除规则 ----
        // 在 <p> 内时豁免“可编辑区域”排除（<p> 是展示段落，不存在输入场景），
        // 但仍保留硬排除（已有链接 a、表单控件等）。
        const inParagraph = !!hitEl.closest('p');
        const excludeSel = inParagraph ? hardExcludeSel : fullExcludeSel;

        // ---- 2. 判断是否发生了滑动选择 ----
        const moved = Math.abs(e.clientX - mouseDownX) > 3 || Math.abs(e.clientY - mouseDownY) > 3;
        if (moved) {
            log('跳过：检测到滑动选择');
            return;
        }

        // ---- 3. 当前有文字被选中则忽略 ----
        const selection = window.getSelection();
        if (!selection.isCollapsed || selection.toString().length > 0) {
            log('跳过：存在文字选区');
            return;
        }

        // ---- 4. 排除规则过滤 ----
        // hitEl 检查 shadow 树内祖先；e.target 检查 light DOM 祖先链（shadow 点击时事件目标被重定向为宿主）
        if (hitEl.closest(excludeSel) || (e.target instanceof Element && e.target.closest(excludeSel))) {
            log('跳过：目标命中', inParagraph ? '硬排除' : '黑名单', hitEl.tagName, hitEl.className);
            return;
        }

        // ---- 5. 获取点击位置的 URL 目标（支持 shadow DOM）----
        const target = findTargetAtPoint(e.clientX, e.clientY, hitEl);
        if (!target) {
            log('跳过：点击处未识别到 URL 或不是文本节点');
            return;
        }

        const { textNode, url, start, end } = target;
        const parent = textNode.parentNode;

        // ---- 6. 再次检查文本节点所在容器是否命中排除规则 ----
        if (!parent || parent.closest(excludeSel)) {
            log('跳过：文本所在容器命中', inParagraph ? '硬排除' : '黑名单');
            return;
        }

        // ---- 7. 执行转换 ----
        let href = url;
        if (!/^https?:\/\//i.test(url)) {
            href = 'https://' + url;
        }

        const before = textNode.nodeValue.slice(0, start);
        const after = textNode.nodeValue.slice(end);

        const frag = document.createDocumentFragment();

        if (before) {
            frag.appendChild(document.createTextNode(before));
        }

        const a = document.createElement('a');
        a.href = href;
        a.textContent = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.color = '#1a0dab';
        a.style.textDecoration = 'underline';
        frag.appendChild(a);

        if (after) {
            frag.appendChild(document.createTextNode(after));
        }

        parent.replaceChild(frag, textNode);
        log('已转换 →', href);
    }, true);
})();