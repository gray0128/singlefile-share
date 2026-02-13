/**
 * Share 页面逻辑
 */
import { formatSize, formatDate, initConfig } from './utils.js';

async function init() {
    // 加载时区配置
    await initConfig();

    // 从 URL 获取 share_id: /s/:share_id
    const path = window.location.pathname;
    const match = path.match(/^\/s\/([a-f0-9-]+)$/i);

    if (!match) {
        showError('无效的分享链接');
        return;
    }

    const shareId = match[1];

    try {
        // 获取分享信息
        const res = await fetch(`/api/s/${shareId}`);
        if (!res.ok) {
            showError('分享不存在或已关闭');
            return;
        }

        const share = await res.json();

        // 更新标题
        document.getElementById('fileTitle').textContent = share.display_name || share.filename;
        document.title = `${share.display_name || share.filename} - SingleFile Share`;

        // 更新元信息
        const metaEl = document.getElementById('fileMeta');
        metaEl.innerHTML = `
            <span>${formatSize(share.size)}</span>
            <span>访问 ${share.visit_count || 0} 次</span>
        `;

        // 设置下载链接
        const downloadBtn = document.getElementById('downloadBtn');
        downloadBtn.href = `/raw/${shareId}`;
        // 根据文件类型设置下载文件名
        const isMarkdown = share.mime_type === 'text/markdown' || share.filename?.endsWith('.md');
        const defaultName = isMarkdown ? 'document.md' : 'download.html';
        downloadBtn.download = share.filename || defaultName;

        // 创建 iframe 加载内容
        const container = document.getElementById('viewerContainer');
        const loadingMsg = document.getElementById('loadingMsg');

        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-scripts allow-same-origin';
        iframe.src = `/raw/${shareId}`;
        iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: #fff;';

        iframe.onload = () => {
            if (loadingMsg) loadingMsg.remove();
        };

        iframe.onerror = () => {
            showError('加载失败');
        };

        container.appendChild(iframe);

    } catch (e) {
        console.error(e);
        showError('加载失败: ' + e.message);
    }
}

function showError(message) {
    const container = document.getElementById('viewerContainer');
    const loadingMsg = document.getElementById('loadingMsg');
    if (loadingMsg) loadingMsg.remove();

    container.innerHTML = `
        <div class="error-msg">
            <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 16px;">error</span>
            <p>${message}</p>
            <a href="/" class="primary-btn" style="margin-top: 20px; text-decoration: none;">返回首页</a>
        </div>
    `;

    document.getElementById('fileTitle').textContent = '错误';
}

init();
