/**
 * Admin 后台逻辑
 */
import { formatSize, formatDate, showToast } from './utils.js';

const state = {
    users: [],
    page: 1,
    limit: 20,
    total: 0,
    filters: {
        role: '',
        status: '',
        search: ''
    }
};

async function init() {
    // 检查权限
    try {
        const res = await fetch('/auth/me');
        if (!res.ok) {
            window.location.href = '/';
            return;
        }
        const user = await res.json();
        if (user.role !== 'admin') {
            window.location.href = '/dashboard';
            return;
        }
    } catch (e) {
        window.location.href = '/';
        return;
    }

    setupFilters();
    loadUsers();
}

function setupFilters() {
    const searchInput = document.getElementById('searchInput');
    const roleFilter = document.getElementById('roleFilter');
    const statusFilter = document.getElementById('statusFilter');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');

    let debounceTimer;
    searchInput.oninput = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            state.filters.search = searchInput.value;
            state.page = 1;
            loadUsers();
        }, 300);
    };

    roleFilter.onchange = () => {
        state.filters.role = roleFilter.value;
        state.page = 1;
        loadUsers();
    };

    statusFilter.onchange = () => {
        state.filters.status = statusFilter.value;
        state.page = 1;
        loadUsers();
    };

    prevPage.onclick = () => {
        if (state.page > 1) {
            state.page--;
            loadUsers();
        }
    };

    nextPage.onclick = () => {
        const maxPage = Math.ceil(state.total / state.limit);
        if (state.page < maxPage) {
            state.page++;
            loadUsers();
        }
    };
}

async function loadUsers() {
    const params = new URLSearchParams({
        page: state.page,
        limit: state.limit
    });

    if (state.filters.role) params.append('role', state.filters.role);
    if (state.filters.status) params.append('status', state.filters.status);
    if (state.filters.search) params.append('search', state.filters.search);

    try {
        const res = await fetch(`/api/admin/users?${params}`);
        if (!res.ok) throw new Error('加载失败');

        const data = await res.json();
        state.users = data.users || [];
        state.total = data.total || 0;

        renderUsers();
        updatePagination();
    } catch (e) {
        console.error(e);
        showToast(e.message, 'error');
    }
}

function renderUsers() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    if (state.users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px;">
                    无匹配用户
                </td>
            </tr>
        `;
        return;
    }

    state.users.forEach(user => {
        const tr = document.createElement('tr');

        const statusClass = `status-${user.status}`;
        const statusText = { pending: '待审核', active: '正常', locked: '已锁定' }[user.status] || user.status;
        const roleText = user.role === 'admin' ? '管理员' : '用户';

        const usedStorage = formatSize(user.total_storage_used || 0);
        const limitStorage = formatSize(user.storage_limit || 104857600);

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${user.avatar_url}" style="width: 32px; height: 32px; border: 1px solid var(--border-subtle);">
                    <div>
                        <div style="font-weight: 600;">${user.username}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">ID: ${user.github_id}</div>
                    </div>
                </div>
            </td>
            <td>${roleText}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <div>${usedStorage} / ${limitStorage}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${user.file_count || 0} 个文件</div>
            </td>
            <td>${formatDate(user.created_at)}</td>
            <td>
                ${user.status === 'pending' ? `<button class="action-btn" onclick="approveUser(${user.id})">通过</button>` : ''}
                ${user.status === 'active' ? `<button class="action-btn" onclick="lockUser(${user.id})">锁定</button>` : ''}
                ${user.status === 'locked' ? `<button class="action-btn" onclick="unlockUser(${user.id})">解锁</button>` : ''}
                <button class="action-btn" onclick="editQuota(${user.id}, ${user.storage_limit})">配额</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updatePagination() {
    const maxPage = Math.max(1, Math.ceil(state.total / state.limit));
    document.getElementById('pageInfo').textContent = `第 ${state.page} / ${maxPage} 页`;
    document.getElementById('prevPage').disabled = state.page <= 1;
    document.getElementById('nextPage').disabled = state.page >= maxPage;
}

window.approveUser = async (id) => {
    await updateStatus(id, 'active');
};

window.lockUser = async (id) => {
    if (!confirm('确定要锁定此用户吗？')) return;
    await updateStatus(id, 'locked');
};

window.unlockUser = async (id) => {
    await updateStatus(id, 'active');
};

async function updateStatus(id, status) {
    try {
        const res = await fetch(`/api/admin/users/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error('操作失败');
        showToast('操作成功', 'success');
        loadUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

window.editQuota = async (id, currentLimit) => {
    const currentMB = Math.round(currentLimit / (1024 * 1024));
    const input = prompt('请输入新的存储配额 (MB):', currentMB);
    if (input === null) return;

    const newMB = parseInt(input);
    if (isNaN(newMB) || newMB < 1) {
        showToast('请输入有效的数字', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/admin/users/${id}/quota`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: newMB * 1024 * 1024 })
        });
        if (!res.ok) throw new Error('操作失败');
        showToast('配额已更新', 'success');
        loadUsers();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

init();
