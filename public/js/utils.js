/**
 * 通用工具函数
 */

/** @type {{ timezone: string }} */
let config = { timezone: 'Asia/Shanghai' };

/**
 * 初始化配置（从服务器获取时区等设置）
 * @returns {Promise<void>}
 */
export async function initConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            config = await res.json();
        }
    } catch (e) {
        console.warn('Failed to load config, using defaults:', e);
    }
}

/**
 * 格式化文件大小
 * @param {number} bytes 
 * @returns {string}
 */
export function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 格式化日期
 * @param {string} dateStr 
 * @returns {string}
 */
export function formatDate(dateStr) {
    // D1 数据库的 CURRENT_TIMESTAMP 返回 UTC 时间，但没有 Z 后缀
    // 添加 Z 后缀告诉 JavaScript 这是 UTC 时间
    const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
    const date = new Date(utcDateStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: config.timezone
    });
}

/**
 * 复制文本到剪贴板
 * @param {string} text 
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        console.error('Copy failed:', e);
        return false;
    }
}

/**
 * 显示简单提示
 * @param {string} message 
 * @param {string} type - 'success' | 'error' | 'info'
 */
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#00cc66' : '#333'};
        color: white;
        padding: 12px 24px;
        font-family: var(--font-mono);
        font-size: 0.85rem;
        z-index: 9999;
        animation: fadeIn 0.2s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
