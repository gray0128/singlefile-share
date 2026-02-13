/**
 * Markdown 渲染模块
 * 支持 Markdown 解析、代码高亮和 Mermaid 图表
 */

// 简单的 Markdown 解析器（无需外部依赖）
function parseMarkdown(text) {
    let html = text;

    // 转义 HTML 特殊字符
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');

    // 代码块 (```language\ncode\n```)
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || 'text';
        if (language === 'mermaid') {
            return `<div class="mermaid">${code.trim()}</div>`;
        }
        return `<pre><code class="language-${language}">${code.trim()}</code></pre>`;
    });

    // 行内代码 (`code`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 标题 (# ## ### #### ##### ######)
    html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 粗体 (**text** 或 __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体 (*text* 或 _text_)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // 删除线 (~~text~~)
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 链接 [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 图片 ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" loading="lazy" />');

    // 无序列表 (- item 或 * item)
    html = html.replace(/(^|\n)(-\s.*(\n|$))+/g, (match) => {
        const items = match.trim().split('\n').map(line => `<li>${line.substring(2)}</li>`).join('');
        return `<ul>${items}</ul>`;
    });

    // 有序列表 (1. item)
    html = html.replace(/(^|\n)(\d+\.\s.*(\n|$))+/g, (match) => {
        const items = match.trim().split('\n').map(line => `<li>${line.replace(/^\d+\.\s*/, '')}</li>`).join('');
        return `<ol>${items}</ol>`;
    });

    // 引用 (> text)
    html = html.replace(/(^|\n)>(.*)/g, '$1<blockquote>$2</blockquote>');

    // 水平分隔线 (--- 或 *** 或 ___)
    html = html.replace(/(^|\n)(---|___|\*\*\*)(\n|$)/g, '$1<hr />$3');

    // 段落 (处理空行分隔的文本块)
    html = html.replace(/([^\n]+)/g, (match) => {
        // 如果已经是块级元素，不再包装
        if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|div|p)/.test(match)) {
            return match;
        }
        return `<p>${match}</p>`;
    });

    // 清理空段落
    html = html.replace(/<p><\/p>/g, '');

    return html;
}

// 从 Markdown 内容提取标题（第一行 # 标题）
export function extractTitleFromMarkdown(content) {
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^#\s+(.+)$/);
        if (match) {
            return match[1].trim();
        }
    }
    return null;
}

// 从 Markdown 提取纯文本（用于搜索索引）
export function extractTextFromMarkdown(content) {
    return content
        .replace(/```[\s\S]*?```/g, ' ') // 移除代码块
        .replace(/`([^`]+)`/g, '$1') // 移除行内代码标记
        .replace(/#+ /g, ' ') // 移除标题标记
        .replace(/\*\*([^*]+)\*\*/g, '$1') // 移除粗体
        .replace(/\*([^*]+)\*/g, '$1') // 移除斜体
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 保留链接文本
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ') // 移除图片
        .replace(/\s+/g, ' ') // 合并空白
        .trim();
}

// 渲染 Markdown 为完整 HTML 页面
export function renderMarkdownToHtml(content, title = 'Markdown Document') {
    const bodyHtml = parseMarkdown(content);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            background: #fff;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
            line-height: 1.25;
        }
        h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1em; }
        p { margin: 0 0 1em; }
        a { color: #0366d6; text-decoration: none; }
        a:hover { text-decoration: underline; }
        code {
            background: rgba(27, 31, 35, 0.05);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 0.85em;
        }
        pre {
            background: #f6f8fa;
            padding: 16px;
            overflow: auto;
            border-radius: 6px;
            line-height: 1.45;
        }
        pre code {
            background: transparent;
            padding: 0;
            font-size: 100%;
        }
        blockquote {
            border-left: 4px solid #dfe2e5;
            padding: 0 1em;
            color: #6a737d;
            margin: 0 0 1em;
        }
        ul, ol {
            padding-left: 2em;
            margin: 0 0 1em;
        }
        li + li { margin-top: 0.25em; }
        img { max-width: 100%; height: auto; }
        hr {
            border: none;
            border-top: 1px solid #eaecef;
            margin: 2em 0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #dfe2e5;
            padding: 6px 13px;
        }
        th {
            background: #f6f8fa;
        }
        .mermaid {
            text-align: center;
            margin: 1em 0;
        }
        @media (prefers-color-scheme: dark) {
            body {
                background: #0d1117;
                color: #c9d1d9;
            }
            h1, h2 { border-bottom-color: #30363d; }
            a { color: #58a6ff; }
            code { background: rgba(110, 118, 129, 0.4); }
            pre { background: #161b22; }
            blockquote { border-left-color: #30363d; color: #8b949e; }
            th { background: #161b22; }
            th, td { border-color: #30363d; }
            hr { border-top-color: #30363d; }
        }
    </style>
</head>
<body>
${bodyHtml}
<script>
    // 初始化 Mermaid
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: true,
            theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
            securityLevel: 'strict'
        });
    }
<\/script>
</body>
</html>`;
}

// HTML 转义辅助函数
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
