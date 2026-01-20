/**
 * 通用工具函数
 */

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
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
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
