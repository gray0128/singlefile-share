/**
 * Dashboard 逻辑
 */
import { formatSize, formatDate, copyToClipboard, showToast, initConfig } from './utils.js';

const state = {
    user: null,
    files: []
};

async function init() {
    // 加载时区配置
    await initConfig();

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
        loadTags();
        setupFilters();
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

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTagsModal();
            closeFileModal();
            closeRenameModal();
        }
    });
}

function setupFilters() {
    const searchInput = document.getElementById('searchInput');
    const tagFilter = document.getElementById('tagFilter');

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadFiles();
        }, 300);
    });

    tagFilter.addEventListener('change', () => {
        loadFiles();
    });
}

// Tag Management
let allTags = [];

window.loadTags = async function () {
    try {
        const res = await fetch('/api/tags');
        if (res.ok) {
            allTags = await res.json();
            renderTagsFilter();
            renderTagsList();
        }
    } catch (e) {
        console.error('Failed to load tags', e);
    }
}

function renderTagsFilter() {
    const select = document.getElementById('tagFilter');
    const currentVal = select.value;
    select.innerHTML = '<option value="">所有标签</option>';
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag.name;
        option.textContent = tag.name;
        select.appendChild(option);
    });
    select.value = currentVal;
}

function renderTagsList() {
    const container = document.getElementById('tagsList');
    if (!container) return; // Modal might not be open

    container.innerHTML = '';
    if (allTags.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); text-align:center;">暂无标签</div>';
        return;
    }

    allTags.forEach(tag => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:4px;';
        div.innerHTML = `
            <span>${tag.name}</span>
            <button onclick="deleteTag(${tag.id})" class="icon-btn" style="padding:4px; border:none;" title="删除"><span class="material-symbols-outlined" style="font-size:16px;">close</span></button>
        `;
        container.appendChild(div);
    });
}

window.openTagsModal = function () {
    document.getElementById('tagsModal').style.display = 'block';
    renderTagsList(); // Refresh list
}

window.closeTagsModal = function () {
    document.getElementById('tagsModal').style.display = 'none';
}

window.createTag = async function () {
    const input = document.getElementById('newTagInput');
    const name = input.value.trim();
    if (!name) return;

    try {
        const res = await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error(await res.text());

        input.value = '';
        await loadTags();
        showToast('标签已创建', 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

window.deleteTag = async function (id) {
    if (!confirm('确定删除此标签吗？')) return;
    try {
        const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete');
        await loadTags();
        showToast('标签已删除', 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// File Edit Logic
let editingFileId = null;
let editingFileTags = []; // IDs of tags assigned to file

window.openFileModal = async function (fileId) {
    editingFileId = fileId;
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;

    document.getElementById('fileModal').style.display = 'block';
    document.getElementById('fileDistDescription').value = file.description || '';

    // Init tags
    editingFileTags = (file.tags || []).map(t => t.id);
    renderFileTagsInput();
}

window.closeFileModal = function () {
    document.getElementById('fileModal').style.display = 'none';
    editingFileId = null;
}

function renderFileTagsInput() {
    const container = document.getElementById('fileTagsInput');
    container.innerHTML = '';

    allTags.forEach(tag => {
        const isSelected = editingFileTags.includes(tag.id);
        const pill = document.createElement('div');
        pill.className = isSelected ? 'tag-pill selected' : 'tag-pill';
        pill.style.cssText = `
            padding: 4px 12px; 
            border: 1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}; 
            color: ${isSelected ? '#fff' : 'var(--text-muted)'};
            background: ${isSelected ? 'var(--accent)' : 'transparent'};
            cursor: pointer;
            font-size: 0.8rem;
            border-radius: 100px;
            transition: all 0.2s;
        `;
        pill.textContent = tag.name;
        pill.onclick = () => toggleFileTag(tag.id);
        container.appendChild(pill);
    });
}

function toggleFileTag(tagId) {
    if (editingFileTags.includes(tagId)) {
        editingFileTags = editingFileTags.filter(id => id !== tagId);
    } else {
        editingFileTags.push(tagId);
    }
    renderFileTagsInput();
}

window.saveFileDetails = async function () {
    if (!editingFileId) return;

    const description = document.getElementById('fileDistDescription').value;
    const originalFile = state.files.find(f => f.id === editingFileId);
    const originalTags = (originalFile.tags || []).map(t => t.id);

    try {
        // Update Description
        if (description !== originalFile.description) {
            await fetch(`/api/files/${editingFileId}/description`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description })
            });
        }

        // Update Tags
        // Find added tags
        const added = editingFileTags.filter(id => !originalTags.includes(id));
        // Find removed tags
        const removed = originalTags.filter(id => !editingFileTags.includes(id));

        for (const tagId of added) {
            await fetch(`/api/files/${editingFileId}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagId })
            });
        }

        for (const tagId of removed) {
            await fetch(`/api/files/${editingFileId}/tags/${tagId}`, {
                method: 'DELETE'
            });
        }

        showToast('保存成功', 'success');
        closeFileModal();
        loadFiles(); // Refresh list to show new metadata
    } catch (e) {
        showToast('保存失败: ' + e.message, 'error');
    }
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
        const search = document.getElementById('searchInput')?.value || '';
        const tag = document.getElementById('tagFilter')?.value || '';

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (tag) params.append('tag', tag);

        const res = await fetch(`/api/files?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch files');
        state.files = await res.json();
        renderFiles();
    } catch (e) {
        console.error(e);
    }
};

function renderFiles() {
    // 更新统计信息
    const totalCount = state.files.length;
    const sharedCount = state.files.filter(f => f.share_enabled).length;
    const statsEl = document.getElementById('fileStats');
    if (statsEl) {
        statsEl.textContent = `共 ${totalCount} 个文件，已分享 ${sharedCount} 个`;
    }

    renderMasonry();
}

function renderMasonry() {
    const grid = document.getElementById('fileGrid');
    const containerWidth = grid.offsetWidth;

    // Calculate column count based on breakpoints
    let colCount = 4;
    if (containerWidth < 600) colCount = 1;
    else if (containerWidth < 900) colCount = 2;
    else if (containerWidth < 1400) colCount = 3;

    // Save existing elements if we want to restore state,
    // but here we just rebuild from state.files for simplicity and correctness.
    grid.innerHTML = '';

    if (state.files.length === 0) {
        grid.innerHTML = `
            <div style="width: 100%; text-align: center; color: var(--text-muted); padding: 60px 20px;">
                <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">folder_open</span>
                <p>暂无文件，上传一个开始吧</p>
            </div>
        `;
        return;
    }

    // Create column elements
    const columns = [];
    for (let i = 0; i < colCount; i++) {
        const col = document.createElement('div');
        col.className = 'masonry-column';
        grid.appendChild(col);
        columns.push(col);
    }

    // Distribute files to columns
    // Strategy: Shortest column first to balance height
    state.files.forEach(file => {
        const card = createFileCard(file);

        // Find shortest column
        let minHeight = Infinity;
        let targetCol = columns[0];

        columns.forEach(col => {
            if (col.offsetHeight < minHeight) {
                minHeight = col.offsetHeight;
                targetCol = col;
            }
        });

        targetCol.appendChild(card);
    });
}

function createFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';

    const isShared = file.share_enabled;
    const shareUrl = isShared ? `${window.location.origin}/s/${file.share_id}` : '';

    const sizeStr = formatSize(file.size);
    const dateStr = formatDate(file.created_at);
    const visits = file.visit_count || 0;

    const desc = file.description ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${file.description}</div>` : '';

    let tagsHtml = '';
    if (file.tags && file.tags.length > 0) {
        tagsHtml = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">' +
            file.tags.map(t => `<span style="font-size:0.7rem; color:var(--accent); background:rgba(255,51,0,0.1); padding:2px 6px; border-radius:4px;">#${t.name}</span>`).join('') +
            '</div>';
    }

    card.innerHTML = `
        <div class="meta" style="cursor: default;">
            <div class="filename" onclick="openPreview(${file.id}, '${file.share_id}', ${isShared})" title="${file.display_name}" style="cursor: pointer; margin-bottom:8px;">${file.display_name}</div>
            
            ${desc}
            ${tagsHtml}

            <div class="card-actions">
                <button class="btn-icon" onclick="renameFile(${file.id}, '${file.display_name.replace(/'/g, "\\'")}', event)" title="重命名">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="btn-icon" onclick="openFileModal(${file.id})" title="编辑详情">
                     <span class="material-symbols-outlined">description</span>
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
    return card;
}

// Window resize handler with debounce
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        renderMasonry();
    }, 200);
});

// Rename Modal Logic
let renamingFileId = null;
let renamingFileOldName = '';

window.renameFile = (id, oldName, e) => {
    e.stopPropagation();
    renamingFileId = id;
    renamingFileOldName = oldName;

    const input = document.getElementById('renameInput');
    input.value = oldName;
    document.getElementById('renameModal').style.display = 'block';

    // 自动聚焦并选中文本
    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);
};

window.closeRenameModal = function () {
    document.getElementById('renameModal').style.display = 'none';
    renamingFileId = null;
    renamingFileOldName = '';
};

window.confirmRename = async function () {
    if (!renamingFileId) return;

    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || newName === renamingFileOldName) {
        closeRenameModal();
        return;
    }

    try {
        const res = await fetch(`/api/files/${renamingFileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: newName })
        });
        if (!res.ok) throw new Error('重命名失败');
        showToast('重命名成功', 'success');
        closeRenameModal();
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
