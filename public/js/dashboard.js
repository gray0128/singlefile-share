/**
 * Dashboard 逻辑
 */
import { formatSize, formatDate, copyToClipboard, showToast } from './utils.js';

const state = {
    user: null,
    files: []
};

async function init() {
    try {
        const res = await fetch('/auth/me');
        if (!res.ok) {
            window.location.href = '/';
            return;
        }
        state.user = await res.json();

        // 检查用户状态
        if (state.user.status === 'locked') {
            renderLocked();
            return;
        }

        renderUser();
        renderStorage();

        if (state.user.status === 'pending') {
            renderPending();
            return;
        }

        loadFiles();
    } catch (e) {
        console.error(e);
        window.location.href = '/';
    }

    setupUpload();
}

function renderUser() {
    const container = document.getElementById('userInfo');
    const isAdmin = state.user.role === 'admin';

    container.innerHTML = `
        <div class="user-menu-container">
            <span style="font-size: 0.9rem;">${state.user.username}</span>
            <img src="${state.user.avatar_url}" class="avatar" alt="${state.user.username}">
            
            <div class="user-menu-dropdown">
                ${isAdmin ? `
                <a href="/admin" class="user-menu-item highlight">
                    <span class="material-symbols-outlined" style="font-size:18px">admin_panel_settings</span>
                    管理后台
                </a>
                ` : ''}
                <button onclick="location.href='/auth/logout'" class="user-menu-item danger">
                    <span class="material-symbols-outlined" style="font-size:18px">logout</span>
                    退出登录
                </button>
            </div>
        </div>
    `;
}

function renderStorage() {
    const widget = document.getElementById('storageWidget');
    if (!widget) return;

    const usedBytes = state.user.storage_usage || 0;
    const limitBytes = state.user.storage_limit || 104857600;

    const usedMB = (usedBytes / (1024 * 1024)).toFixed(1);
    const limitMB = (limitBytes / (1024 * 1024)).toFixed(0);

    const percent = Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100));

    document.getElementById('storageText').innerText = `${usedMB} MB / ${limitMB} MB`;
    document.getElementById('storageBar').style.width = `${percent}%`;

    const bar = document.getElementById('storageBar');
    if (percent > 90) bar.style.background = '#ff4444';
    else if (percent > 70) bar.style.background = 'orange';
    else bar.style.background = 'var(--accent)';

    widget.style.display = 'block';
}

function renderLocked() {
    renderUser();
    const main = document.querySelector('.main-content');
    main.innerHTML = `
        <div class="status-locked">
            <span class="material-symbols-outlined" style="font-size: 64px; color: var(--accent); margin-bottom: 20px;">lock</span>
            <h1 style="color: var(--text-main); margin-bottom: 10px;">账号已锁定</h1>
            <p>您的账号已被管理员锁定，如有疑问请联系管理员。</p>
        </div>
    `;
}

function renderPending() {
    const main = document.querySelector('.main-content');
    main.innerHTML = `
        <div class="status-pending">
            <span class="material-symbols-outlined" style="font-size: 64px; color: orange; margin-bottom: 20px;">pending</span>
            <h1 style="color: var(--text-main); margin-bottom: 10px;">等待审核</h1>
            <p>您的账号正在等待管理员审核，审核通过后即可使用全部功能。</p>
        </div>
    `;
}

function setupUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (!dropZone || !fileInput) return;

    dropZone.onclick = () => fileInput.click();

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    };

    dropZone.ondragleave = () => {
        dropZone.classList.remove('dragover');
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    };

    fileInput.onchange = () => {
        handleFiles(fileInput.files);
    };
}

async function handleFiles(files) {
    if (!files.length) return;
    const file = files[0];

    if (!file.name.match(/\.html?$/i)) {
        showToast('只允许上传 HTML 文件', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('文件大小不能超过 10MB', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const dropZone = document.getElementById('dropZone');
    const originalText = dropZone.innerHTML;
    dropZone.innerHTML = '<p>上传中...</p>';

    try {
        const res = await fetch('/api/files', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error(await res.text());

        showToast('上传成功', 'success');
        await loadFiles();
        // 刷新用户信息获取最新存储空间
        const userRes = await fetch('/auth/me');
        if (userRes.ok) {
            state.user = await userRes.json();
            renderStorage();
        }
    } catch (e) {
        showToast('上传失败: ' + e.message, 'error');
    } finally {
        dropZone.innerHTML = originalText;
    }
}

window.loadFiles = async function () {
    try {
        const res = await fetch('/api/files');
        if (!res.ok) throw new Error('Failed to fetch files');
        state.files = await res.json();
        renderFiles();
    } catch (e) {
        console.error(e);
    }
};

function renderFiles() {
    const grid = document.getElementById('fileGrid');
    grid.innerHTML = '';

    if (state.files.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 60px 20px;">
                <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">folder_open</span>
                <p>暂无文件，上传一个开始吧</p>
            </div>
        `;
        return;
    }

    state.files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';

        const isShared = file.share_enabled;
        const shareUrl = isShared ? `${window.location.origin}/s/${file.share_id}` : '';

        const sizeStr = formatSize(file.size);
        const dateStr = formatDate(file.created_at);
        const visits = file.visit_count || 0;

        card.innerHTML = `
            <div class="preview" onclick="openPreview(${file.id}, '${file.share_id}', ${isShared})">
                <span class="material-symbols-outlined preview-icon">description</span>
            </div>
            <div class="meta">
                <div class="filename" title="${file.display_name}">${file.display_name}</div>
                <div class="card-actions">
                    <button class="btn-icon" onclick="renameFile(${file.id}, '${file.display_name.replace(/'/g, "\\'")}', event)" title="重命名">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="btn-icon" onclick="toggleShare(${file.id}, ${isShared}, event)" title="${isShared ? '关闭分享' : '开启分享'}">
                        <span class="material-symbols-outlined" style="color: ${isShared ? 'var(--accent)' : 'inherit'}; font-size: 24px;">
                            ${isShared ? 'toggle_on' : 'toggle_off'}
                        </span>
                    </button>
                    ${isShared ? `<button class="btn-icon" onclick="copyLink('${shareUrl}', event)" title="复制链接"><span class="material-symbols-outlined">link</span></button>` : ''}
                    <button class="btn-icon" onclick="deleteFile(${file.id}, event)" title="删除"><span class="material-symbols-outlined">delete</span></button>
                </div>
                <div class="meta-extra">
                   <div style="display:flex; justify-content:space-between;"><span>大小:</span> <span>${sizeStr}</span></div>
                   <div style="display:flex; justify-content:space-between;"><span>上传:</span> <span>${dateStr}</span></div>
                   ${isShared ? `<div style="display:flex; justify-content:space-between;"><span>访问:</span> <span>${visits} 次</span></div>` : ''}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.renameFile = async (id, oldName, e) => {
    e.stopPropagation();
    const newName = prompt('请输入新名称:', oldName);
    if (!newName || newName === oldName) return;

    try {
        const res = await fetch(`/api/files/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: newName })
        });
        if (!res.ok) throw new Error('重命名失败');
        showToast('重命名成功', 'success');
        loadFiles();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.deleteFile = async (id, e) => {
    e.stopPropagation();
    if (!confirm('确定要删除此文件吗？')) return;
    try {
        await fetch(`/api/files/${id}`, { method: 'DELETE' });
        showToast('删除成功', 'success');
        loadFiles();
        // 刷新存储空间
        const userRes = await fetch('/auth/me');
        if (userRes.ok) {
            state.user = await userRes.json();
            renderStorage();
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.toggleShare = async (id, currentStatus, e) => {
    e.stopPropagation();
    try {
        await fetch(`/api/files/${id}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enable: !currentStatus })
        });
        showToast(currentStatus ? '已关闭分享' : '已开启分享', 'success');
        loadFiles();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.copyLink = async (url, e) => {
    e.stopPropagation();
    const success = await copyToClipboard(url);
    if (success) {
        showToast('链接已复制', 'success');
    } else {
        showToast('复制失败', 'error');
    }
};

window.openPreview = (id, shareId, isShared) => {
    if (isShared && shareId) {
        window.open(`/s/${shareId}`, '_blank');
    } else {
        showToast('请先开启分享后再预览', 'info');
    }
};

init();
