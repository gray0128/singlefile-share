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
            console.error('[Dashboard] Auth check failed:', res.status, res.statusText);
            window.location.href = '/';
            return;
        }
        state.user = await res.json();
        console.log('[Dashboard] User authenticated:', state.user.username);

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
        console.error('[Dashboard] Init error:', e.message, e.stack);
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

async function handleFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
        // 验证文件类型
        if (!file.name.match(/\.(html?|md)$/i)) {
            showToast(`不支持的文件类型: ${file.name}`, 'error');
            continue;
        }

        // 验证文件大小 (10MB)
        if (file.size > 10 * 1024 * 1024) {
            showToast(`文件过大: ${file.name} (最大 10MB)`, 'error');
            continue;
        }

        try {
            const formData = new FormData();
            formData.append('file', file);

            showToast(`正在上传: ${file.name}...`, 'info');

            const res = await fetch('/api/files', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || '上传失败');
            }

            showToast(`${file.name} 上传成功`, 'success');
            loadFiles(); // 刷新文件列表

            // 刷新存储空间显示
            const userRes = await fetch('/auth/me');
            if (userRes.ok) {
                state.user = await userRes.json();
                renderStorage();
            }
        } catch (e) {
            console.error('Upload error:', e);
            showToast(`${file.name} 上传失败: ${e.message}`, 'error');
        }
    }

    // 清空文件输入框，允许重复上传相同文件
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
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
    const searchType = document.getElementById('searchType');
    const clearBtn = document.getElementById('clearSearchBtn');
    const tagFilter = document.getElementById('tagFilter');

    // Update clear button visibility
    const updateClearBtn = () => {
        clearBtn.style.display = searchInput.value ? 'block' : 'none';
    };

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        updateClearBtn();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadFiles();
        }, 300);
    });

    // Trigger search immediately on type change if there is a query
    searchType.addEventListener('change', () => {
        if (searchInput.value) {
            loadFiles();
        }
    });

    // Clear search interaction
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        updateClearBtn();
        searchInput.focus();
        loadFiles();
    });

    tagFilter.addEventListener('change', () => {
        loadFiles();
    });
}

// 加载标签列表到筛选下拉框
async function loadTags() {
    try {
        const res = await fetch('/api/tags');
        if (!res.ok) return;
        const tags = await res.json();

        const tagFilter = document.getElementById('tagFilter');
        if (!tagFilter) return;

        // 保留第一个"所有标签"选项
        tagFilter.innerHTML = '<option value="">所有标签</option>';

        tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.name;
            option.textContent = `#${tag.name}`;
            tagFilter.appendChild(option);
        });
    } catch (e) {
        console.error('Failed to load tags:', e);
    }
}

// ... existing code ...

window.loadFiles = async function () {
    try {
        const search = document.getElementById('searchInput')?.value || '';
        const type = document.getElementById('searchType')?.value || 'vector';
        const tag = document.getElementById('tagFilter')?.value || '';

        const params = new URLSearchParams();
        if (search) {
            params.append('search', search);
            params.append('type', type);
        }
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

    let contentDisplay = '';
    if (file.snippet) {
        // Search result snippet
        contentDisplay = `<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;" class="search-snippet">${file.snippet}</div>`;
    } else if (file.description) {
        contentDisplay = `<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${file.description}</div>`;
    }

    let tagsHtml = '';
    if (file.tags && file.tags.length > 0) {
        tagsHtml = '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">' +
            file.tags.map(t => `<span style="font-size:0.7rem; color:var(--accent); background:rgba(255,51,0,0.1); padding:2px 6px; border-radius:4px;">#${t.name}</span>`).join('') +
            '</div>';
    }

    card.innerHTML = `
        <div class="meta" style="cursor: default;">
            <div class="filename" onclick="openPreview(${file.id}, '${file.share_id}', ${isShared})" title="${file.display_name}" style="cursor: pointer; margin-bottom:8px;">${file.display_name}</div>

            ${contentDisplay}
            ${tagsHtml}

            <div class="card-actions">
                <button class="btn-icon rename-btn" data-id="${file.id}" data-name="${file.display_name.replace(/"/g, '&quot;')}" title="重命名">
                    <span class="material-symbols-outlined">edit</span>
                </button>
                ${file.mime_type === 'text/markdown' ? `<button class="btn-icon edit-md-btn" data-id="${file.id}" data-name="${file.display_name.replace(/"/g, '&quot;')}" title="编辑 Markdown">
                    <span class="material-symbols-outlined">edit_note</span>
                </button>` : ''}
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

// 事件委托：处理重命名按钮点击
document.addEventListener('click', (e) => {
    const renameBtn = e.target.closest('.rename-btn');
    if (renameBtn) {
        e.stopPropagation();
        const id = parseInt(renameBtn.dataset.id, 10);
        const oldName = renameBtn.dataset.name;

        renamingFileId = id;
        renamingFileOldName = oldName;

        const input = document.getElementById('renameInput');
        input.value = oldName;
        document.getElementById('renameModal').style.display = 'block';

        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
    }

    // Handle Markdown edit button click
    const editMdBtn = e.target.closest('.edit-md-btn');
    if (editMdBtn) {
        e.stopPropagation();
        const id = parseInt(editMdBtn.dataset.id, 10);
        openEditorModal(id);
    }
});

// Markdown Editor Modal Logic
let editingFileId = null;
let editorMdInstance = null;

window.openEditorModal = async function (id) {
    editingFileId = id;

    try {
        const res = await fetch(`/api/files/${id}/content`);
        if (!res.ok) {
            const error = await res.text();
            throw new Error(error || 'Failed to load content');
        }

        const { content } = await res.json();

        const modal = document.getElementById('editorModal');
        const container = document.getElementById('editorContainer');

        // Clear previous instance
        if (editorMdInstance) {
            editorMdInstance = null;
        }
        container.innerHTML = '';

        // Create Editor.md container
        const editorDiv = document.createElement('div');
        editorDiv.id = 'editormdContainer';
        editorDiv.style.height = 'calc(100vh - 180px)';
        container.appendChild(editorDiv);

        modal.style.display = 'block';

        // Initialize Editor.md with dark theme
        // Note: editormd expects jQuery to be available globally
        window.$ = window.jQuery;
        editormd.loadCSS('https://cdn.jsdelivr.net/npm/editor.md@1.5.0/css/editormd.preview.min.css');

        editorMdInstance = editormd('editormdContainer', {
            width: '100%',
            height: '100%',
            markdown: content,
            theme: 'dark',
            previewTheme: 'dark',
            editorTheme: 'pastel-on-dark',
            toolbar: true,
            toolbarIcons: function() {
                return [
                    'bold', 'italic', 'del', '|',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '|',
                    'list-ul', 'list-ol', '|',
                    'code', 'quote', '|',
                    'link', 'image', '|',
                    'table', 'datetime', '|',
                    'preview', 'fullscreen', '|'
                ];
            },
            toolbarIconsClass: {
                'bold': 'fa-bold',
                'italic': 'fa-italic',
                'del': 'fa-strikethrough',
                'h1': 'editormd-bold',
                'h2': 'editormd-bold',
                'h3': 'editormd-bold',
                'h4': 'editormd-bold',
                'h5': 'editormd-bold',
                'h6': 'editormd-bold',
                'list-ul': 'fa-list-ul',
                'list-ol': 'fa-list-ol',
                'quote': 'fa-quote-left',
                'code': 'fa-code',
                'link': 'fa-link',
                'image': 'fa-image',
                'table': 'fa-table',
                'preview': 'fa-eye',
                'fullscreen': 'fa-expand',
                'datetime': 'fa-clock'
            },
            toolbarCustomIcons: {
                'datetime': '<a href="javascript:;" title="当前时间" onclick="insertDateTime()"><i class="fa fa-clock"></i></a>'
            },
            toolbarHandlers: {
                'bold': function() {
                    this.bold();
                },
                'italic': function() {
                    this.italic();
                },
                'del': function() {
                    this.strikethrough();
                },
                'h1': function() {
                    this.headers(1);
                },
                'h2': function() {
                    this.headers(2);
                },
                'h3': function() {
                    this.headers(3);
                },
                'h4': function() {
                    this.headers(4);
                },
                'h5': function() {
                    this.headers(5);
                },
                'h6': function() {
                    this.headers(6);
                },
                'list-ul': function() {
                    this.list('ul');
                },
                'list-ol': function() {
                    this.list('ol');
                },
                'quote': function() {
                    this.blockquote();
                },
                'code': function() {
                    this.codeBlock();
                },
                'link': function() {
                    this.link();
                },
                'image': function() {
                    this.image();
                },
                'table': function() {
                    this.table();
                },
                'preview': function() {
                    this.preview();
                },
                'fullscreen': function() {
                    this.fullscreen();
                }
            },
            path: 'https://cdn.jsdelivr.net/npm/editor.md@1.5.0/lib/',
            codeFold: true,
            saveHTMLToTextarea: true,
            searchReplace: true,
            emoji: true,
            taskList: true,
            tocm: true,
            tex: true,
            flowChart: true,
            sequenceDiagram: true,
            imageUpload: false,
            imageFormats: ['jpg', 'jpeg', 'gif', 'png', 'webp'],
            onload: function() {
                console.log('Editor.md loaded');
            }
        });

    } catch (e) {
        console.error('Failed to open editor:', e);
        showToast(e.message, 'error');
    }
};

window.closeEditorModal = function () {
    document.getElementById('editorModal').style.display = 'none';

    if (editorMdInstance) {
        editorMdInstance = null;
    }

    // Remove the container
    const container = document.getElementById('editorContainer');
    const editorDiv = document.getElementById('editormdContainer');
    if (editorDiv) {
        editorDiv.remove();
    }

    editingFileId = null;
};

window.saveMarkdownContent = async function () {
    if (!editingFileId || !editorMdInstance) return;

    const content = editorMdInstance.getMarkdown();

    try {
        const res = await fetch(`/api/files/${editingFileId}/content`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(error || 'Failed to save');
        }

        showToast('保存成功', 'success');
        closeEditorModal();
        loadFiles();

        // Refresh storage info if size changed
        const userRes = await fetch('/auth/me');
        if (userRes.ok) {
            state.user = await userRes.json();
            renderStorage();
        }

    } catch (e) {
        console.error('Failed to save:', e);
        showToast(e.message, 'error');
    }
};

// Insert current datetime at cursor position
window.insertDateTime = function() {
    if (editorMdInstance) {
        const now = new Date();
        const formatted = now.toISOString().replace('T', ' ').substring(0, 19);
        editorMdInstance.insertValue('`' + formatted + '`');
    }
};

// Create Markdown file directly
window.createMarkdownFile = async function () {
    try {
        showToast('正在创建文件...', 'info');

        const res = await fetch('/api/files/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(error || '创建失败');
        }

        const newFile = await res.json();
        showToast('文件创建成功', 'success');

        // 刷新文件列表
        loadFiles();

        // 刷新存储空间显示
        const userRes = await fetch('/auth/me');
        if (userRes.ok) {
            state.user = await userRes.json();
            renderStorage();
        }

        // 自动打开编辑器
        openEditorModal(newFile.id);

    } catch (e) {
        console.error('Failed to create file:', e);
        showToast(e.message, 'error');
    }
};

init();
