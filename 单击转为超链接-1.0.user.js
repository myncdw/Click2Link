// ==UserScript==
// @name         单击转为超链接
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  只有在单击文本时才识别是否为链接并转换，滑动选择不会触发，性能友好
// @author       myncdw
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

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

    // 需要排除的选择器（避免干扰已有链接、脚本、表单、可编辑区域等）
    const excludeSelector = [
        // ---- 已经是链接或脚本/样式标签 ----
        'a',
        'script',
        'style',

        // ---- 表单控件（用户正在输入内容） ----
        'textarea',
        'input',
        'select',
        'button',

        // ---- 可编辑区域（富文本编辑器等） ----
        '[contenteditable="true"]',
        '[contenteditable=""]',
        '[contenteditable]',
    ].join(', ');

    let mouseDownX = 0;
    let mouseDownY = 0;

    document.addEventListener('mousedown', (e) => {
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
    }, true);

    document.addEventListener('click', (e) => {
        // 1. 判断是否发生了滑动选择
        const moved = Math.abs(e.clientX - mouseDownX) > 3 || Math.abs(e.clientY - mouseDownY) > 3;
        if (moved) return;

        // 2. 当前有文字被选中则忽略
        const selection = window.getSelection();
        if (!selection.isCollapsed || selection.toString().length > 0) return;

        // 3. 点击目标本身或祖先是输入框/可编辑区域，直接排除
        if (e.target.closest(excludeSelector)) return;

        // 4. 获取点击位置的文本节点
        let range;
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            if (!pos) return;
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.setEnd(pos.offsetNode, pos.offset);
        } else {
            return;
        }

        if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return;

        const textNode = range.startContainer;
        const parent = textNode.parentNode;

        // 再次检查文本节点所在位置是否在排除区域内
        if (!parent || parent.closest(excludeSelector)) return;

        const fullText = textNode.nodeValue;
        if (!fullText) return;

        // 5. 查找点击位置是否落在某个 URL 上
        urlRegex.lastIndex = 0;
        let match;
        let targetMatch = null;

        while ((match = urlRegex.exec(fullText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            if (range.startOffset >= start && range.startOffset <= end) {
                targetMatch = { url: match[0], start, end };
                break;
            }
        }

        if (!targetMatch) return;

        // 6. 执行转换
        const { url, start, end } = targetMatch;

        let href = url;
        if (!/^https?:\/\//i.test(url)) {
            href = 'https://' + url;
        }

        const before = fullText.slice(0, start);
        const after = fullText.slice(end);

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
    }, true);
})();