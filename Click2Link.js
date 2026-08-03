// ==UserScript==
// @name         单击转为超链接
// @namespace    http://tampermonkey.net/
// @version      1.1
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
    ];

    // ========== 多行正则 ==========
    const urlRegex = new RegExp(
        [
            '(?:https?:\\/\\/|www\\.)[^\\s<>"\']+',
            '|',
            '(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+',
            '(?:' + tlds.join('|') + ')',
            '(?:\\/[^\\s<>"\']*)?'
        ].join(''),
        'gi'
    );

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
        urlRegex.lastIndex = 0;
        let m;
        while ((m = urlRegex.exec(fullText)) !== null) {
            const start = m.index;
            const end = start + m[0].length;
            if (offset >= start && offset <= end) {
                return { textNode, url: m[0], start, end };
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
            urlRegex.lastIndex = 0;
            let m;
            while ((m = urlRegex.exec(fullText)) !== null) {
                const start = m.index;
                const end = start + m[0].length;
                const r = document.createRange();
                r.setStart(tn, start);
                r.setEnd(tn, end);
                const rect = r.getBoundingClientRect();
                if (!rect || rect.width === 0) continue;
                if (x >= rect.left - 3 && x <= rect.right + 3 && y >= rect.top - 3 && y <= rect.bottom + 3) {
                    return { textNode: tn, url: m[0], start, end };
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