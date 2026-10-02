// Outlook Email Manager - Frontend SPA

// ========== Theme ==========
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  const resolved = theme === 'auto' ? getSystemTheme() : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  // Update toggle buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function setTheme(theme, evt) {
  localStorage.setItem('theme', theme);

  // Fallback: no View Transitions support or user prefers reduced motion → instant swap
  if (!document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyTheme(theme);
    return;
  }

  // Circle Swoop: expand a clip-path circle centered on the clicked toggle button.
  // Spring-ish easing approximates the physical damping without a JS animation lib.
  let x = window.innerWidth - 60, y = 40;
  const target = evt?.currentTarget || evt?.target;
  if (target && target.getBoundingClientRect) {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = document.startViewTransition(() => applyTheme(theme));
  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 500,
        easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });
}

// Apply saved theme immediately
(function() {
  const saved = localStorage.getItem('theme') || 'auto';
  applyTheme(saved);
  // Listen for system theme changes when in auto mode
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'auto') applyTheme('auto');
  });
})();

const API = '/api';
let currentPage = 'accounts';
let state = {
  groups: [],
  tags: [],
  accounts: [],
  tempEmails: [],
  selectedAccount: null,
  emailList: [],
  selectedEmail: null,
  selectedEmailIds: new Set(),
  pendingEmailAccount: null,
  pendingAccountStatus: null,
};

// ========== API Helpers ==========
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (res.status === 401) {
    window.location.href = '/login.html';
    return null;
  }
  return data;
}

function toast(msg, type = 'success', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  // Backend messages arrive in Chinese; tServer maps known ones when LANG=en
  el.textContent = tServer(msg);
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ========== Auth ==========
async function checkAuth() {
  try {
    const res = await fetch(API + '/auth/me', { headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (!data?.data?.loggedIn) {
      window.location.href = '/login.html';
      return false;
    }
    // Auth passed: hide gate, show app
    const gate = document.getElementById('authGate');
    const app = document.getElementById('mainApp');
    if (gate) gate.style.display = 'none';
    if (app) app.style.display = 'flex';
    return true;
  } catch {
    window.location.href = '/login.html';
    return false;
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ========== Navigation ==========
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage();
}

function renderPage() {
  const content = document.getElementById('pageContent');
  const title = document.getElementById('topbarTitle');

  switch (currentPage) {
    case 'accounts':
      title.textContent = t('邮箱账号');
      renderAccounts(content);
      break;
    case 'groups':
      title.textContent = t('分组管理');
      renderGroups(content);
      break;
    case 'tags':
      title.textContent = t('标签管理');
      renderTags(content);
      break;
    case 'emails':
      title.textContent = t('邮件查看');
      renderEmails(content);
      break;
    case 'temp-emails':
      title.textContent = t('临时邮箱');
      renderTempEmails(content);
      break;
    case 'settings':
      title.textContent = t('系统设置');
      renderSettings(content);
      break;
    default:
      title.textContent = t('仪表盘');
      renderDashboard(content);
  }
}

// Page-level toolbar row: context info on the left, action buttons on the right.
// Rendered at the top of each page's content (replaces the old topbar button slot).
function pageToolbarHtml(info, actionsHtml) {
  return `<div class="page-toolbar">
    <span class="pt-info">${info || ''}</span>
    <div class="pt-actions">${actionsHtml || ''}</div>
  </div>`;
}

// ========== Dashboard ==========
async function renderDashboard(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载中...') + '</div>';
  await loadGroups();
  await loadAccounts();
  const activeCount = state.accounts.filter(a => a.status === 'active').length;
  const errorCount = state.accounts.filter(a => a.status === 'error').length;
  const disabledCount = state.accounts.filter(a => a.status === 'disabled').length;
  const stats = [
    { label: t('邮箱账号'), value: state.accounts.length, color: 'var(--primary)', bg: 'var(--primary-bg)', go: "navigate('accounts')", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' },
    { label: t('分组数量'), value: state.groups.length, color: 'var(--primary-light)', bg: 'rgba(129,140,248,0.1)', go: "navigate('groups')", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>' },
    { label: t('活跃'), value: activeCount, color: 'var(--success)', bg: 'var(--success-bg)', go: "goToAccounts('active')", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
    { label: t('异常'), value: errorCount, color: 'var(--danger)', bg: 'var(--danger-bg)', go: "goToAccounts('error')", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' },
  ];
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px;">
      ${stats.map(s => `<div class="card" style="display:flex;align-items:center;gap:16px;padding:20px 22px;cursor:pointer" onclick="${s.go}" title="${t('点击进入')}">
        <div style="width:44px;height:44px;border-radius:12px;background:${s.bg};display:flex;align-items:center;justify-content:center;color:${s.color};flex-shrink:0">${s.icon}</div>
        <div><div style="font-size:28px;font-weight:700;color:${s.color};line-height:1.1">${s.value}</div><div style="color:var(--text-dim);font-size:12.5px;margin-top:2px">${s.label}</div></div>
      </div>`).join('')}
    </div>
    ${state.accounts.length > 0 ? dashboardDetailCardsHtml(activeCount, errorCount, disabledCount) : ''}
    ${state.accounts.length === 0 ? `<div class="card" style="text-align:center;padding:40px">
      <div style="font-size:14px;color:var(--text-muted);margin-bottom:12px">${t('还没有添加邮箱账号')}</div>
      <button class="btn btn-primary" onclick="navigate('accounts')">${t('前往添加')}</button>
    </div>` : ''}
  `;
}

// Two glass cards below the stat tiles: account health (status stacked bar +
// shortcuts to broken accounts) and per-group distribution bars. Pure frontend
// aggregation over already-loaded state — no extra API calls, free-tier safe.
function dashboardDetailCardsHtml(activeCount, errorCount, disabledCount) {
  const total = state.accounts.length;
  // Status palette (reserved, matches badges): shown with label + count, never color alone
  const statuses = [
    { key: 'active', label: t('活跃'), count: activeCount, color: 'var(--success)' },
    { key: 'error', label: t('异常'), count: errorCount, color: 'var(--danger)' },
    { key: 'disabled', label: t('停用'), count: disabledCount, color: 'var(--text-dim)' },
  ];
  const segments = statuses.filter(s => s.count > 0).map(s =>
    `<div title="${s.label} ${s.count}" style="width:${(s.count / total * 100).toFixed(1)}%;background:${s.color};border-radius:3px;min-width:6px"></div>`
  ).join('');
  const legend = statuses.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)">
      <span style="width:8px;height:8px;border-radius:2px;background:${s.color};flex-shrink:0"></span>${s.label}
      <b style="color:var(--text);font-weight:600">${s.count}</b>
    </span>`
  ).join('');

  const errorAccounts = state.accounts.filter(a => a.status === 'error').slice(0, 3);
  const errorList = errorAccounts.length ? `
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">${t('待修复账号（点击直达编辑）')}</div>
      ${errorAccounts.map(a => `
        <div onclick="showEditAccountModal(${a.id})" title="${t('点击打开编辑，重新授权修复')}"
             style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;margin-bottom:6px;background:var(--danger-bg);border:1px solid rgba(244,63,94,0.15);border-radius:8px;cursor:pointer">
          <span style="font-family:monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.email)}</span>
          <span style="font-size:11px;color:var(--danger);flex-shrink:0">${t('去修复 →')}</span>
        </div>`).join('')}
      ${errorCount > 3 ? `<div style="font-size:11px;color:var(--text-dim)">${t('还有 {n} 个异常账号，', { n: errorCount - 3 })}<a style="cursor:pointer;color:var(--primary)" onclick="goToAccounts('error')">${t('查看全部')}</a></div>` : ''}
    </div>`
    : `<div style="margin-top:16px;font-size:12.5px;color:var(--success)">${t('✓ 所有账号授权状态正常')}</div>`;

  // Per-group bars: color follows each group's own user-assigned color
  const groups = [...state.groups].sort((a, b) => (b.account_count ?? 0) - (a.account_count ?? 0));
  const topGroups = groups.slice(0, 6);
  const restCount = groups.slice(6).reduce((n, g) => n + (g.account_count ?? 0), 0);
  const maxCount = Math.max(1, ...topGroups.map(g => g.account_count ?? 0));
  const groupBars = topGroups.map(g => {
    const count = g.account_count ?? 0;
    return `
    <div style="margin-bottom:12px" title="${esc(g.name)}: ${t('{n} 个账号', { n: count })}">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</span>
        <b style="color:var(--text);font-weight:600;flex-shrink:0">${count}</b>
      </div>
      <div style="height:8px;background:var(--bg-hover);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${(count / maxCount * 100).toFixed(1)}%;background:${esc(g.color)};border-radius:4px;min-width:${count > 0 ? 6 : 0}px"></div>
      </div>
    </div>`;
  }).join('');

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
      <div class="card">
        <h3 style="font-size:14px;margin-bottom:14px">${t('账号健康度')}</h3>
        <div style="display:flex;gap:2px;height:10px;margin-bottom:10px">${segments}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">${legend}</div>
        ${errorList}
      </div>
      <div class="card">
        <h3 style="font-size:14px;margin-bottom:14px">${t('分组账号分布')}</h3>
        ${groupBars || `<div style="font-size:12.5px;color:var(--text-dim)">${t('暂无分组数据')}</div>`}
        ${restCount > 0 ? `<div style="font-size:11px;color:var(--text-dim)">${t('其余 {g} 个分组共 {n} 个账号', { g: groups.length - 6, n: restCount })}</div>` : ''}
      </div>
    </div>`;
}

// Jump to accounts page, optionally pre-filtering by status (from dashboard cards)
function goToAccounts(status) {
  state.pendingAccountStatus = status || '';
  navigate('accounts');
}

// ========== Groups ==========
async function loadGroups() {
  const res = await api('/groups');
  if (res?.success) state.groups = res.data || [];
}

async function renderGroups(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载中...') + '</div>';
  await loadGroups();

  const toolbar = pageToolbarHtml(
    t('{n} 个分组', { n: state.groups.length }),
    `<button class="btn btn-primary btn-sm" onclick="showGroupModal()">${t('+ 新建分组')}</button>`
  );

  if (state.groups.length === 0) {
    el.innerHTML = toolbar + `<div class="empty-state">${t('暂无分组')}</div>`;
    return;
  }

  el.innerHTML = toolbar + `<div class="table-wrap"><table>
    <thead><tr><th>${t('名称')}</th><th>${t('颜色')}</th><th>${t('描述')}</th><th>${t('账号数')}</th><th>${t('操作')}</th></tr></thead>
    <tbody>${state.groups.map(g => `<tr>
      <td><span class="color-dot" style="background:${esc(g.color)}"></span>${esc(g.name)}</td>
      <td>${esc(g.color)}</td>
      <td style="color:var(--text-muted)">${esc(g.description)}</td>
      <td>${g.account_count ?? 0}</td>
      <td>
        ${g.id === 1 ? `<span style="color:var(--text-dim);font-size:12px">${t('默认分组')}</span>` : `
          <button class="btn btn-sm" onclick="showGroupModal(${g.id})">${t('编辑')}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteGroup(${g.id})">${t('删除')}</button>
        `}
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function showGroupModal(id) {
  const group = id ? state.groups.find(g => g.id === id) : null;
  showModal(group ? t('编辑分组') : t('新建分组'), `
    <div class="form-group"><label class="form-label">${t('名称')}</label><input class="form-input" id="mGroupName" value="${esc(group?.name ?? '')}"></div>
    <div class="form-group"><label class="form-label">${t('描述')}</label><input class="form-input" id="mGroupDesc" value="${esc(group?.description ?? '')}"></div>
    <div class="form-group"><label class="form-label">${t('颜色')}</label><input type="color" id="mGroupColor" value="${group?.color ?? '#2563eb'}" style="width:60px;height:36px;border:none;background:none;cursor:pointer;"></div>
  `, async () => {
    const name = document.getElementById('mGroupName').value.trim();
    if (!name) { toast(t('名称不能为空'), 'error'); return false; }
    const body = { name, description: document.getElementById('mGroupDesc').value, color: document.getElementById('mGroupColor').value };
    const res = id
      ? await api(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await api('/groups', { method: 'POST', body: JSON.stringify(body) });
    if (res?.success) { toast(res.message || t('操作成功')); navigate('groups'); return true; }
    toast(res?.error?.message || t('操作失败'), 'error');
    return false;
  });
}

async function deleteGroup(id) {
  if (!confirm(t('确认删除该分组？该分组下的邮箱将移至默认分组。'))) return;
  const res = await api(`/groups/${id}`, { method: 'DELETE' });
  if (res?.success) { toast(t('分组已删除')); navigate('groups'); }
  else toast(res?.error?.message || t('删除失败'), 'error');
}

// ========== Tags ==========
async function loadTags() {
  const res = await api('/tags');
  if (res?.success) state.tags = res.data || [];
}

async function renderTags(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载中...') + '</div>';
  await loadTags();

  const toolbar = pageToolbarHtml(
    t('{n} 个标签', { n: state.tags.length }),
    `<button class="btn btn-primary btn-sm" onclick="showTagModal()">${t('+ 新建标签')}</button>`
  );

  if (state.tags.length === 0) {
    el.innerHTML = toolbar + `<div class="empty-state">${t('暂无标签。标签可给一个账号打多个，用于跨分组筛选。')}</div>`;
    return;
  }

  el.innerHTML = toolbar + `<div class="table-wrap"><table>
    <thead><tr><th>${t('标签')}</th><th>${t('颜色')}</th><th>${t('账号数')}</th><th>${t('操作')}</th></tr></thead>
    <tbody>${state.tags.map(tg => `<tr>
      <td><span class="badge" style="background:${esc(tg.color)}22;color:${esc(tg.color)}">${esc(tg.name)}</span></td>
      <td>${esc(tg.color)}</td>
      <td>${tg.account_count ?? 0}</td>
      <td>
        <button class="btn btn-sm" onclick="showTagModal(${tg.id})">${t('编辑')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTag(${tg.id})">${t('删除')}</button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function showTagModal(id) {
  const tag = id ? state.tags.find(tg => tg.id === id) : null;
  showModal(tag ? t('编辑标签') : t('新建标签'), `
    <div class="form-group"><label class="form-label">${t('名称')}</label><input class="form-input" id="mTagName" value="${esc(tag?.name ?? '')}"></div>
    <div class="form-group"><label class="form-label">${t('颜色')}</label><input type="color" id="mTagColor" value="${tag?.color ?? '#6366f1'}" style="width:60px;height:38px;border:none;background:none;cursor:pointer"></div>
  `, async () => {
    const name = document.getElementById('mTagName').value.trim();
    if (!name) { toast(t('名称不能为空'), 'error'); return false; }
    const body = { name, color: document.getElementById('mTagColor').value };
    const res = id
      ? await api(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await api('/tags', { method: 'POST', body: JSON.stringify(body) });
    if (res?.success) { toast(res.message || t('操作成功')); navigate('tags'); return true; }
    toast(res?.error?.message || t('操作失败'), 'error');
    return false;
  });
}

async function deleteTag(id) {
  if (!confirm(t('确认删除该标签？已打此标签的账号会移除该标签（不影响账号本身）。'))) return;
  const res = await api(`/tags/${id}`, { method: 'DELETE' });
  if (res?.success) { toast(t('标签已删除')); navigate('tags'); }
  else toast(res?.error?.message || t('删除失败'), 'error');
}

// ========== Accounts ==========
async function loadAccounts(groupId) {
  const url = groupId ? `/accounts?group_id=${groupId}` : '/accounts';
  const res = await api(url);
  if (res?.success) state.accounts = res.data || [];
}

async function renderAccounts(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载中...') + '</div>';
  await loadGroups();
  await loadTags();
  await loadAccounts();

  // Single sticky row: filters + search + count on the left, page actions on the
  // right; the batch bar joins it so selection actions stay visible while the
  // (potentially very long) table scrolls underneath.
  const toolbar = `<div class="page-sticky">
  <div class="toolbar" style="margin-bottom:0">
    <select class="form-select" style="width:auto;min-width:140px" id="accountGroupFilter" onchange="filterAccountsByGroup(this.value)">
      <option value="">${t('全部分组')}</option>
      ${state.groups.map(g => `<option value="${g.id}">${esc(g.name)} (${g.account_count ?? 0})</option>`).join('')}
    </select>
    <select class="form-select" style="width:auto;min-width:110px" id="accountStatusFilter" onchange="filterAccountsByStatus(this.value)">
      <option value="">${t('全部状态')}</option>
      <option value="active">${t('活跃')}</option>
      <option value="disabled">${t('停用')}</option>
      <option value="error">${t('异常')}</option>
    </select>
    <select class="form-select" style="width:auto;min-width:110px" id="accountTagFilter" onchange="filterAccountsByTag(this.value)">
      <option value="">${t('全部标签')}</option>
      ${state.tags.map(tg => `<option value="${tg.id}">${esc(tg.name)} (${tg.account_count ?? 0})</option>`).join('')}
    </select>
    <input class="search-input" placeholder="${t('搜索邮箱或备注...')}" oninput="searchAccounts(this.value)">
    <span style="font-size:12px;color:var(--text-dim);white-space:nowrap" id="accountCount">${t('{n} 个账号', { n: state.accounts.length })}</span>
    <span style="flex:1"></span>
    <button class="btn btn-primary btn-sm" onclick="showAddAccountModal()">${t('+ 添加账号')}</button>
    <button class="btn btn-sm" onclick="showImportModal()">${t('批量导入')}</button>
    <button class="btn btn-sm" onclick="exportAccounts()">${t('导出全部')}</button>
  </div>
  <div id="batchBar" style="display:flex;margin-top:10px;padding:10px 14px;background:var(--primary-bg);border:1px solid var(--border-focus);border-radius:8px;align-items:center;gap:8px;font-size:13px">
    <span id="batchCount" style="color:var(--primary)">${t('未选中')}</span>
    <button class="btn btn-sm" id="btnBatchTest" onclick="batchTestAccounts()" disabled>${t('批量测试')}</button>
    <button class="btn btn-sm" id="btnBatchMove" onclick="batchAction('move')" disabled>${t('移动分组')}</button>
    <button class="btn btn-sm" id="btnBatchEnable" onclick="batchAction('enable')" disabled>${t('批量启用')}</button>
    <button class="btn btn-sm" id="btnBatchDisable" onclick="batchAction('disable')" disabled>${t('批量停用')}</button>
    <button class="btn btn-sm" id="btnBatchExport" onclick="exportSelected()" disabled>${t('导出选中')}</button>
    <button class="btn btn-sm btn-danger" id="btnBatchDelete" onclick="batchAction('delete')" disabled>${t('批量删除')}</button>
    <button class="btn btn-sm" id="btnBatchClear" onclick="clearSelection()" disabled>${t('取消选择')}</button>
  </div>
  </div>`;

  if (state.accounts.length === 0) {
    el.innerHTML = `<div class="accounts-layout">${toolbar}<div class="empty-state">${t('暂无账号，点击"添加账号"开始')}</div></div>`;
    return;
  }

  el.innerHTML = `<div class="accounts-layout">
  ${toolbar}
  <div class="table-wrap accounts-table-wrap"><table>
    <thead><tr>
      <th style="width:32px"><input type="checkbox" id="selectAll" onchange="toggleSelectAll(this.checked)"></th>
      <th>${t('邮箱')}</th><th>${t('分组')}</th><th>${t('状态')}</th><th>${t('备注')}</th><th>${t('操作')}</th>
    </tr></thead>
    <tbody id="accountsBody"></tbody>
  </table></div>
  <div class="page-footer">
    <span style="font-size:12px;color:var(--text-dim)">${t('每页')}</span>
    <select class="form-select" style="width:auto" onchange="accSetPageSize(this.value)">
      ${[20, 50, 100].map(n => `<option value="${n}" ${n === accPageSize ? 'selected' : ''}>${n}</option>`).join('')}
    </select>
    <span style="font-size:12px;color:var(--text-dim)">${t('条')}</span>
    <span style="flex:1"></span>
    <button class="btn btn-sm" id="accPrevBtn" onclick="accTurnPage(-1)">${t('上一页')}</button>
    <span id="accPageInfo" style="font-size:12.5px;color:var(--text-muted);min-width:52px;text-align:center"></span>
    <button class="btn btn-sm" id="accNextBtn" onclick="accTurnPage(1)">${t('下一页')}</button>
  </div>
  </div>`;

  setAccountsView(state.accounts);

  // Apply a status filter requested from the dashboard cards (活跃 / 异常)
  if (state.pendingAccountStatus) {
    const sel = document.getElementById('accountStatusFilter');
    if (sel) { sel.value = state.pendingAccountStatus; filterAccountsByStatus(state.pendingAccountStatus); }
    state.pendingAccountStatus = null;
  }
}

var selectedAccountIds = new Set();

// ---- Client-side pagination over the (filtered) account list ----
var accountsView = [];
var accPage = 1;
var accPageSize = parseInt(localStorage.getItem('accPageSize')) || 20;

// Every filter path funnels through here: swap the visible list, reset to page 1
function setAccountsView(list) {
  accountsView = list || [];
  accPage = 1;
  renderAccountsTable();
}

function renderAccountsTable() {
  const tbody = document.getElementById('accountsBody');
  if (!tbody) return;
  const totalPages = Math.max(1, Math.ceil(accountsView.length / accPageSize));
  if (accPage > totalPages) accPage = totalPages;
  if (accPage < 1) accPage = 1;
  const start = (accPage - 1) * accPageSize;
  tbody.innerHTML = renderAccountRows(accountsView.slice(start, start + accPageSize));

  const cnt = document.getElementById('accountCount');
  if (cnt) cnt.textContent = t('{n} 个账号', { n: accountsView.length });
  const info = document.getElementById('accPageInfo');
  if (info) info.textContent = accPage + ' / ' + totalPages;
  const prev = document.getElementById('accPrevBtn');
  if (prev) prev.disabled = accPage <= 1;
  const next = document.getElementById('accNextBtn');
  if (next) next.disabled = accPage >= totalPages;
  // Header checkbox only ever refers to the rows on the current page
  const all = document.getElementById('selectAll');
  if (all) all.checked = false;
  const wrap = tbody.closest('.accounts-table-wrap');
  if (wrap) wrap.scrollTop = 0;
}

function accSetPageSize(v) {
  accPageSize = parseInt(v) || 20;
  localStorage.setItem('accPageSize', String(accPageSize));
  accPage = 1;
  renderAccountsTable();
}

function accTurnPage(delta) {
  accPage += delta;
  renderAccountsTable();
}

function renderAccountRows(accounts) {
  return accounts.map(a => `<tr>
    <td><input type="checkbox" class="acc-check" value="${a.id}" onchange="onAccountCheck(this)" ${selectedAccountIds.has(a.id) ? 'checked' : ''}></td>
    <td>
      <div style="display:flex;align-items:center;gap:6px">
        <a class="email-link" onclick="goToEmail(${a.id})" title="${t('查看该账号邮件')}">${esc(a.email)}</a>
        <button class="btn btn-sm" style="padding:2px 6px;font-size:10px;opacity:0.6" onclick="copyText('${esc(a.email)}',this)" title="${t('复制邮箱')}">${t('复制')}</button>
      </div>
      ${tagBadgesHtml(a.tags)}
    </td>
    <td><span class="color-dot" style="background:${esc(a.group_color)}"></span>${esc(a.group_name)}</td>
    <td><span class="badge badge-${a.status}">${a.status}</span></td>
    <td style="color:var(--text-muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.remark)}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-sm" onclick="showEditAccountModal(${a.id})">${t('编辑')}</button>
      <button class="btn btn-sm" onclick="testAccount(${a.id},this)">${t('测试')}</button>
      <button class="btn btn-sm" onclick="copyApiCommand(${a.id},this)">${t('API')}</button>
      <button class="btn btn-sm" onclick="exportAccounts([${a.id}])">${t('导出')}</button>
      <button class="btn btn-sm" onclick="toggleAccountStatus(${a.id},'${a.status}')">${a.status === 'active' ? t('停用') : t('启用')}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteAccount(${a.id})">${t('删除')}</button>
    </td>
  </tr>`).join('');
}

// Copy text to clipboard. Buttons that contain an icon carry a .btn-label span;
// swap only that span's text so the icon survives the "已复制" feedback.
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const label = btn.querySelector('.btn-label') || btn;
    const orig = label.textContent;
    const origOpacity = btn.style.opacity;
    label.textContent = t('已复制');
    btn.style.opacity = '1';
    setTimeout(() => { label.textContent = orig; btn.style.opacity = origOpacity; }, 1200);
  }).catch(() => toast(t('复制失败'), 'error'));
}

// Jump to email view for a specific account
function goToEmail(accountId) {
  state.pendingEmailAccount = accountId;
  navigate('emails');
}

// Export accounts. Pass an array of ids to export specific rows (single or selected);
// omit to export all (respecting the current group filter).
async function exportAccounts(ids) {
  let url = '/accounts/export';
  if (Array.isArray(ids) && ids.length) {
    url += '?ids=' + ids.join(',');
  } else {
    const groupFilter = document.getElementById('accountGroupFilter')?.value;
    if (groupFilter) url += '?group_id=' + groupFilter;
  }
  const res = await api(url);
  if (!res?.success || !res.data?.content) { toast(t('没有可导出的账号'), 'error'); return; }

  showModal(t('导出账号 ({n} 个)', { n: res.data.count }), `
    <div class="form-group">
      <label class="form-label">${t('导出内容（格式：邮箱----密码----client_id----refresh_token）')}</label>
      <textarea class="form-textarea" id="exportData" rows="10" readonly style="font-size:12px">${esc(res.data.content)}</textarea>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" type="button" onclick="copyText(document.getElementById('exportData').value,this)">${t('复制全部')}</button>
      <button class="btn btn-sm" type="button" onclick="downloadExport()">${t('下载 TXT')}</button>
    </div>
  `, () => true);
}

// Export currently selected accounts (from the batch bar)
function exportSelected() {
  const ids = [...selectedAccountIds];
  if (!ids.length) { toast(t('请先选择账号'), 'error'); return; }
  exportAccounts(ids);
}

function downloadExport() {
  const text = document.getElementById('exportData')?.value;
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'accounts_' + new Date().toISOString().slice(0,10) + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Batch selection. Delta-based (not rebuilt from the DOM) so selections
// survive switching pages — only the current page's rows are in the DOM.
function onAccountCheck(cb) {
  const id = parseInt(cb.value);
  if (cb.checked) selectedAccountIds.add(id);
  else selectedAccountIds.delete(id);
  updateBatchBar();
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.acc-check').forEach(cb => {
    cb.checked = checked;
    const id = parseInt(cb.value);
    if (checked) selectedAccountIds.add(id);
    else selectedAccountIds.delete(id);
  });
  updateBatchBar();
}

function clearSelection() {
  selectedAccountIds.clear();
  document.querySelectorAll('.acc-check').forEach(cb => { cb.checked = false; });
  if (document.getElementById('selectAll')) document.getElementById('selectAll').checked = false;
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('batchBar');
  if (!bar) return;
  const count = selectedAccountIds.size;
  const hasSelection = count > 0;

  // Update count text
  const countSpan = document.getElementById('batchCount');
  if (countSpan) {
    countSpan.textContent = hasSelection ? t('已选 {n} 个', { n: count }) : t('未选中');
  }

  // Enable/disable all batch action buttons based on selection state
  const buttons = ['btnBatchTest', 'btnBatchMove', 'btnBatchEnable', 'btnBatchDisable', 'btnBatchExport', 'btnBatchDelete', 'btnBatchClear'];
  buttons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !hasSelection;
  });
}

async function batchAction(action) {
  const ids = [...selectedAccountIds];
  if (!ids.length) return;

  if (action === 'delete') {
    if (!confirm(t('确认批量删除 {n} 个账号？此操作不可撤销。', { n: ids.length }))) return;
    const res = await api('/accounts/batch', { method: 'POST', body: JSON.stringify({ action: 'delete', ids }) });
    if (res?.success) { toast(res.message); clearSelection(); navigate('accounts'); }
    else toast(res?.error?.message || t('操作失败'), 'error');
    return;
  }

  if (action === 'move') {
    showModal(t('移动到分组'), `
      <div class="form-group"><label class="form-label">${t('目标分组')}</label>
      <select class="form-select" id="batchMoveGroup">${state.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
    `, async () => {
      const groupId = parseInt(document.getElementById('batchMoveGroup').value);
      const res = await api('/accounts/batch', { method: 'POST', body: JSON.stringify({ action: 'move', ids, group_id: groupId }) });
      if (res?.success) { toast(res.message); clearSelection(); navigate('accounts'); return true; }
      toast(res?.error?.message || t('操作失败'), 'error'); return false;
    });
    return;
  }

  // enable / disable
  const res = await api('/accounts/batch', { method: 'POST', body: JSON.stringify({ action, ids }) });
  if (res?.success) { toast(res.message); clearSelection(); navigate('accounts'); }
  else toast(res?.error?.message || t('操作失败'), 'error');
}

// Filter by status
function filterAccountsByStatus(status) {
  setAccountsView(status ? state.accounts.filter(a => a.status === status) : state.accounts);
}

async function filterAccountsByGroup(gid) {
  await loadAccounts(gid || undefined);
  setAccountsView(state.accounts);
}

async function filterAccountsByTag(tagId) {
  const res = await api(`/accounts${tagId ? '?tag_id=' + tagId : ''}`);
  if (res?.success) {
    state.accounts = res.data || [];
    setAccountsView(state.accounts);
  }
}

let searchTimer;
function searchAccounts(keyword) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const res = await api(`/accounts${keyword ? '?keyword=' + encodeURIComponent(keyword) : ''}`);
    if (res?.success) {
      state.accounts = res.data || [];
      setAccountsView(state.accounts);
    }
  }, 300);
}

var THUNDERBIRD_CLIENT_ID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';

function showAddAccountModal() {
  const guideLink = `<a href="https://github.com/roseforyou/cf-outlook-email/blob/main/docs/GUIDE.md#自己注册-azure-应用" target="_blank">${t('部署教程')}</a>`;
  showModal(t('添加账号'), `
    <div style="background:var(--primary-bg);border:1px solid var(--border-focus);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:13px;color:var(--primary);margin-bottom:8px;font-weight:550">${t('快捷方式：一键授权 Outlook 邮箱')}</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="form-input" id="mOAuthEmail" placeholder="${t('输入邮箱地址（可选，用于自动登录）')}" style="flex:1">
        <button class="btn btn-primary btn-sm" type="button" onclick="startOAuth()" style="white-space:nowrap">${t('一键授权')}</button>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:8px;line-height:1.6">${t('点击后弹出微软登录窗口，授权成功后自动填入 Client ID 和 Refresh Token。<br><b style="color:var(--warning)">⚠️ 网页一键授权需注册自己的 Azure 应用</b>：默认 Thunderbird 公开 ID 仅用于桌面端，无法在网页授权（会报 redirect_uri 错误）。请把下面这个<b>回调地址</b>登记到你的 Azure 应用，并在下方 Client ID 填入你自己的应用 ID。')}</div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px">
        <input class="form-input" id="oauthRedirect" readonly value="${location.origin}/api/oauth/callback" style="flex:1;font-size:11px;font-family:monospace">
        <button class="btn btn-sm" type="button" onclick="copyText(document.getElementById('oauthRedirect').value,this)" style="white-space:nowrap">${t('复制回调地址')}</button>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.6">${t('注册步骤见 {link}。若已有现成的 refresh_token，直接用「批量导入」或在下方手动填入即可，无需授权。', { link: guideLink })}</div>
    </div>
    <div style="background:var(--bg-hover);border:1px solid var(--border-light);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;font-weight:550">${t('方式二：手动授权（免注册 Azure，用默认 Thunderbird ID）')}</div>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.7">${t('① 点「打开授权页」登录并授权 → 浏览器会跳到一个打不开的 <code>https://localhost</code> 页面（<b>正常现象</b>）<br>② 复制浏览器<b>地址栏的完整网址</b>（含 <code>?code=...</code>）粘到下面 → ③ 点「提取并获取 Token」自动填入')}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-sm" type="button" onclick="openManualAuth()" style="white-space:nowrap">${t('① 打开授权页')}</button>
        <input class="form-input" id="manualAuthUrl" placeholder="${t('② 粘贴跳转后的完整地址（或仅 code）')}" style="flex:1">
        <button class="btn btn-primary btn-sm" type="button" onclick="exchangeManualCode(this)" style="white-space:nowrap">${t('③ 获取 Token')}</button>
      </div>
    </div>
    <div class="form-group"><label class="form-label">${t('邮箱')}</label><input class="form-input" id="mAccEmail" placeholder="example@outlook.com"></div>
    <div class="form-group">
      <label class="form-label">Client ID</label>
      <input class="form-input" id="mAccClientId" value="${THUNDERBIRD_CLIENT_ID}">
      <div style="font-size:11px;color:var(--text-dim);margin-top:5px;line-height:1.6;background:var(--bg-hover);padding:8px 10px;border-radius:6px;margin-top:8px">
        <b style="color:var(--text-secondary)">${t('什么是 Client ID？')}</b><br>
        ${t('Client ID 是在 Azure 注册的应用标识。不同的 Client ID 有不同的权限配置：')}<br>
        · ${t('<b>默认值</b>为 Mozilla Thunderbird 的公开 ID，已配置 Graph Mail.Read 权限，推荐使用')}<br>
        · ${t('如果你有<b>其他来源的 Client ID</b>（自己注册的 Azure 应用、或别人提供的），也可以替换')}<br>
        · ${t('注意：仅有 IMAP 权限的 Client ID <b>无法读取邮件</b>（测试连接会成功，但查看邮件报 401）')}<br>
        · ${t('遇到这种情况，请在编辑页面点"重新授权"切换到 Thunderbird 授权')}
      </div>
    </div>
    <div class="form-group"><label class="form-label">Refresh Token</label><textarea class="form-textarea" id="mAccToken" rows="3"></textarea></div>
    <div class="form-group"><label class="form-label">${t('密码 (可选)')}</label><input class="form-input" id="mAccPwd"></div>
    <div class="form-group"><label class="form-label">${t('分组')}</label><select class="form-select" id="mAccGroup">${state.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">${t('备注')}</label><input class="form-input" id="mAccRemark"></div>
  `, async () => {
    const body = {
      email: document.getElementById('mAccEmail').value.trim(),
      client_id: document.getElementById('mAccClientId').value.trim(),
      refresh_token: document.getElementById('mAccToken').value.trim(),
      password: document.getElementById('mAccPwd').value,
      group_id: parseInt(document.getElementById('mAccGroup').value),
      remark: document.getElementById('mAccRemark').value,
    };
    if (!body.email || !body.client_id || !body.refresh_token) {
      toast(t('邮箱、Client ID、Refresh Token 不能为空'), 'error'); return false;
    }
    const res = await api('/accounts', { method: 'POST', body: JSON.stringify(body) });
    if (res?.success) { toast(res.message || t('添加成功')); navigate('accounts'); return true; }
    toast(res?.error?.message || t('添加失败'), 'error');
    return false;
  });
}

// OAuth: open popup for Microsoft authorization
async function startOAuth(loginHintOverride) {
  const loginHint = loginHintOverride || document.getElementById('mOAuthEmail')?.value?.trim() || '';
  const clientId = document.getElementById('mAccClientId')?.value?.trim() || THUNDERBIRD_CLIENT_ID;
  const params = new URLSearchParams();
  if (clientId) params.set('client_id', clientId);
  if (loginHint) params.set('login_hint', loginHint);

  const res = await api('/oauth/authorize?' + params.toString());
  if (!res?.success) { toast(res?.error?.message || t('获取授权链接失败'), 'error'); return; }

  let authUrl = res.data.url;
  authUrl += '&state=' + encodeURIComponent(res.data.client_id);

  const popup = window.open(authUrl, 'oauth', 'width=600,height=700');
  if (!popup) { toast(t('请允许弹窗，或检查浏览器是否拦截了弹窗'), 'error'); return; }
}

// Manual flow (no Azure app needed): open the authorize page with the
// https://localhost redirect, which is registered for the Thunderbird client.
function openManualAuth() {
  const clientId = document.getElementById('mAccClientId')?.value?.trim() || THUNDERBIRD_CLIENT_ID;
  const loginHint = document.getElementById('mOAuthEmail')?.value?.trim()
    || document.getElementById('mAccEmail')?.value?.trim() || '';
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: 'https://localhost',
    scope: 'Mail.ReadWrite offline_access',
    response_mode: 'query',
  });
  if (loginHint) params.set('login_hint', loginHint);
  window.open('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + params.toString(), '_blank');
}

// Take the pasted redirect URL (or raw code), exchange it for a refresh_token server-side
async function exchangeManualCode(btn) {
  const raw = document.getElementById('manualAuthUrl')?.value?.trim() || '';
  if (!raw) { toast(t('请粘贴跳转后的完整地址或 code'), 'error'); return; }

  // Accept either a full URL containing ?code=... or a bare code
  let code = raw;
  const m = raw.match(/[?&]code=([^&\s]+)/);
  if (m) code = decodeURIComponent(m[1]);

  const clientId = document.getElementById('mAccClientId')?.value?.trim() || THUNDERBIRD_CLIENT_ID;
  if (btn) { btn.disabled = true; btn.textContent = t('获取中...'); }
  const res = await api('/oauth/exchange', {
    method: 'POST',
    body: JSON.stringify({ code, client_id: clientId, redirect_uri: 'https://localhost' }),
  });
  if (btn) { btn.disabled = false; btn.textContent = t('③ 获取 Token'); }

  if (!res?.success) { toast(res?.error?.message || t('获取 Token 失败'), 'error', 6000); return; }
  const cidInput = document.getElementById('mAccClientId');
  const tokInput = document.getElementById('mAccToken');
  if (cidInput) cidInput.value = res.data.client_id || clientId;
  if (tokInput) tokInput.value = res.data.refresh_token || '';
  toast(t('已获取 Refresh Token 并自动填入'));
}

// Listen for OAuth callback message from popup
window.addEventListener('message', function(e) {
  // Origin check: the callback page is same-origin with us; anything else is
  // spoofed. Reject before touching e.data so a hostile frame can't smuggle
  // input into the client_id / refresh_token fields.
  if (e.origin !== window.location.origin) return;
  if (e.data?.type !== 'oauth-callback') return;
  if (e.data.success && e.data.data) {
    const d = e.data.data;
    const clientIdInput = document.getElementById('mAccClientId');
    const tokenInput = document.getElementById('mAccToken');
    if (clientIdInput) clientIdInput.value = d.client_id || '';
    if (tokenInput) tokenInput.value = d.refresh_token || '';
    toast(t('授权成功，已自动填入 Client ID 和 Refresh Token'));
  } else {
    const err = e.data.error || t('授权失败');
    // The most common failure: default Thunderbird client_id rejects the worker's redirect_uri
    if (/redirect_uri|invalid_request/i.test(err)) {
      toast(t('授权失败：默认 Client ID 不支持网页授权。请注册自己的 Azure 应用，把弹窗里的回调地址登记进去，并在 Client ID 填入你的应用 ID（详见添加账号弹窗的说明）。'), 'error', 9000);
    } else {
      toast(err, 'error', 6000);
    }
  }
});

function showImportModal() {
  showModal(t('批量导入'), `
    <div class="form-group"><label class="form-label">${t('分组')}</label><select class="form-select" id="mImpGroup">${state.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">${t('账号数据 (每行一个: 邮箱----密码----client_id----refresh_token)')}</label><textarea class="form-textarea" id="mImpData" rows="8" placeholder="email----password----client_id----refresh_token"></textarea></div>
  `, async () => {
    const data = document.getElementById('mImpData').value.trim();
    if (!data) { toast(t('请输入账号数据'), 'error'); return false; }
    const res = await api('/accounts', { method: 'POST', body: JSON.stringify({
      account_string: data,
      group_id: parseInt(document.getElementById('mImpGroup').value),
    })});
    if (res?.success) { toast(res.message || t('导入成功')); navigate('accounts'); return true; }
    toast(res?.error?.message || t('导入失败'), 'error');
    return false;
  });
}

async function showEditAccountModal(id) {
  const res = await api(`/accounts/${id}`);
  if (!res?.success) { toast(t('获取账号详情失败'), 'error'); return; }
  const a = res.data;
  const isError = a.status === 'error';
  await loadTags();
  showModal(t('编辑账号'), `
    ${isError ? `<div style="background:var(--danger-bg);border:1px solid rgba(244,63,94,0.2);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:13px;color:var(--danger);font-weight:550">${t('该账号状态异常，Token 可能已过期')}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:4px;line-height:1.6">${t('点击下方"重新授权"获取新 Token。重新授权会使用 Thunderbird Client ID，这是推荐的方式。')}</div>
    </div>` : ''}
    <div style="background:var(--primary-bg);border:1px solid var(--border-focus);border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:13px;color:var(--primary);margin-bottom:8px;font-weight:550">${t('重新授权（刷新 Token / 获取读写权限以删除邮件）')}</div>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.7;margin-bottom:8px">
        ${t('⚠️ 默认 Thunderbird ID <b>不支持网页一键授权</b>（会报 redirect_uri 错误），请用「手动授权」：<br>① 点「打开授权页」登录授权 → ② 复制跳转后打不开的 <code>https://localhost?code=...</code> 完整网址 → ③ 点「获取 Token」自动填入下方。')}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn" type="button" onclick="openManualAuth()" style="white-space:nowrap">${t('① 打开授权页')}</button>
        <input class="form-input" id="manualAuthUrl" placeholder="${t('② 粘贴跳转后的完整地址')}" style="flex:1">
        <button class="btn btn-primary" type="button" onclick="exchangeManualCode(this)" style="white-space:nowrap">${t('③ 获取 Token')}</button>
      </div>
      <div style="font-size:11px;color:var(--text-dim)">${t('有自己的 Azure 应用（已登记回调地址）才可用')} <button class="btn btn-sm" type="button" onclick="startOAuth('${esc(a.email)}')">${t('一键授权')}</button></div>
    </div>
    <div class="form-group"><label class="form-label">${t('邮箱')}</label><input class="form-input" id="mAccEmail" value="${esc(a.email)}"></div>
    <div class="form-group">
      <label class="form-label">Client ID</label>
      <input class="form-input" id="mAccClientId" value="${esc(a.client_id)}">
      <div style="font-size:11px;color:var(--text-dim);margin-top:5px;line-height:1.5">${t('当前使用的 Client ID。不同来源的账号可能用不同的 ID，只要有 Graph Mail.Read 权限即可正常读取邮件。仅有 IMAP 权限的 ID 会导致测试成功但读邮件 401。')}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Refresh Token</label>
      <textarea class="form-textarea" id="mAccToken" rows="3" placeholder="${t('留空保持原值')}">${isError ? '' : ''}</textarea>
      <div style="font-size:11px;color:var(--text-dim);margin-top:4px">${t('当前: {v}（已脱敏）。留空表示不修改，填入新值会覆盖。', { v: esc(a.refresh_token) })}</div>
    </div>
    <div class="form-group"><label class="form-label">${t('密码')}</label><input class="form-input" id="mAccPwd" value="${esc(a.password || '')}"></div>
    <div class="form-group"><label class="form-label">${t('分组')}</label><select class="form-select" id="mAccGroup">${state.groups.map(g => `<option value="${g.id}" ${g.id === a.group_id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">${t('备注')}</label><input class="form-input" id="mAccRemark" value="${esc(a.remark)}"></div>
    <div class="form-group"><label class="form-label">${t('标签')}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${state.tags.length ? state.tags.map(tg => `<label style="display:inline-flex;align-items:center;gap:5px;font-size:13px;padding:4px 10px;border:1px solid var(--border-light);border-radius:20px;cursor:pointer">
          <input type="checkbox" class="acc-tag-check" value="${tg.id}" ${(a.tag_ids || []).includes(tg.id) ? 'checked' : ''}><span style="color:${esc(tg.color)}">${esc(tg.name)}</span>
        </label>`).join('') : `<span style="font-size:12px;color:var(--text-dim)">${t('暂无标签，可去「标签管理」创建')}</span>`}
      </div>
    </div>
  `, async () => {
    const body = {
      email: document.getElementById('mAccEmail').value.trim(),
      client_id: document.getElementById('mAccClientId').value.trim(),
      group_id: parseInt(document.getElementById('mAccGroup').value),
      remark: document.getElementById('mAccRemark').value,
      tag_ids: [...document.querySelectorAll('.acc-tag-check:checked')].map(c => parseInt(c.value)),
    };
    const token = document.getElementById('mAccToken').value.trim();
    if (token) body.refresh_token = token;
    const pwd = document.getElementById('mAccPwd').value;
    if (pwd) body.password = pwd;
    const r = await api(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    if (r?.success) { toast(t('更新成功')); navigate('accounts'); return true; }
    toast(r?.error?.message || t('更新失败'), 'error');
    return false;
  });
}

async function testAccount(id, btn) {
  btn.disabled = true;
  btn.textContent = t('测试中...');
  const res = await api(`/accounts/${id}/test`, { method: 'POST' });
  btn.disabled = false;
  btn.textContent = t('测试');
  if (res?.success && res.data?.connected) {
    toast(t('Graph API 连接正常'));
  } else {
    toast(res?.data?.error || res?.error?.message || t('连接失败'), 'error');
  }
  navigate('accounts');
}

// Batch test connections: parallel requests with a cap of 40 (subrequest limit)
async function batchTestAccounts() {
  const ids = [...selectedAccountIds];
  if (!ids.length) return;

  const MAX_BATCH = 40;
  if (ids.length > MAX_BATCH) {
    toast(t('单次最多测试 {n} 个账号，请分批选择', { n: MAX_BATCH }), 'error');
    return;
  }

  const btn = document.getElementById('btnBatchTest');
  if (btn) { btn.disabled = true; btn.textContent = t('测试中...'); }

  // Fire all test requests in parallel
  const results = await Promise.all(
    ids.map(id => api(`/accounts/${id}/test`, { method: 'POST' }))
  );

  if (btn) { btn.disabled = false; btn.textContent = t('批量测试'); }

  const success = results.filter(r => r?.success && r.data?.connected).length;
  const failed = ids.length - success;

  if (failed === 0) {
    toast(t('全部连接正常 ({n} 个)', { n: success }), 'success');
  } else {
    toast(t('{ok} 个成功，{fail} 个失败', { ok: success, fail: failed }), failed > success ? 'error' : 'warning');
  }

  // Refresh the accounts page to reflect any status changes
  navigate('accounts');
}

// Copy API command for a single account (curl example with email pre-filled)
async function copyApiCommand(accountId, btn) {
  const acc = state.accounts.find(a => a.id === accountId);
  if (!acc) return;

  // Fetch the external API key from settings
  const res = await api('/settings');
  const apiKey = res?.data?.external_api_key;
  if (!apiKey) {
    toast(t('对外 API 未启用，请先在「系统设置」生成 API Key'), 'error');
    return;
  }

  const workerUrl = window.location.origin;
  const command = `curl "${workerUrl}/api/external/emails?email=${encodeURIComponent(acc.email)}&top=5" -H "X-API-Key: ${apiKey}"`;

  await navigator.clipboard.writeText(command);

  const orig = btn.textContent;
  btn.textContent = t('已复制');
  setTimeout(() => { btn.textContent = orig; }, 2000);
  toast(t('API 调用命令已复制'), 'success');
}

async function toggleAccountStatus(id, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
  const res = await api(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
  if (res?.success) { toast(t('状态已更新')); navigate('accounts'); }
  else toast(res?.error?.message || t('更新失败'), 'error');
}

async function deleteAccount(id) {
  if (!confirm(t('确认删除该账号？此操作不可撤销。'))) return;
  const res = await api(`/accounts/${id}`, { method: 'DELETE' });
  if (res?.success) { toast(t('账号已删除')); navigate('accounts'); }
  else toast(res?.error?.message || t('删除失败'), 'error');
}

// ========== Emails ==========
async function renderEmails(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载中...') + '</div>';
  await loadAccounts();

  if (state.accounts.length === 0) {
    el.innerHTML = `<div class="empty-state">${t('暂无邮箱账号，请先添加账号')}</div>`;
    return;
  }

  const activeAccounts = state.accounts.filter(a => a.status !== 'disabled');
  // Toolbar groups follow scan order: left = pick the mailbox (select + copy its
  // address), divider, right = act within it (folder, search, refresh).
  const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
  const refreshIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
  el.innerHTML = `
    <div class="email-layout">
      <div class="email-toolbar">
        <div class="combo" id="emailAccountCombo" style="min-width:280px">
          <input class="search-input" id="emailAccountInput" style="width:100%;padding-right:32px" placeholder="${t('点击选择 / 输入关键字筛选账号')}" autocomplete="off"
            onfocus="openAccountCombo(this)" onclick="clickAccountCombo(this)" oninput="filterAccountCombo(this.value)" onkeydown="accountComboKeydown(event)">
          <button class="combo-arrow" type="button" title="${t('展开账号列表')}" onclick="toggleAccountCombo()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div class="combo-list" id="accountComboList" style="display:none">
            ${activeAccounts.map(a => `<div class="combo-item" data-id="${a.id}" data-email="${esc(a.email.toLowerCase())}" onclick="pickAccountComboEl(this)">${esc(a.email)}</div>`).join('')}
            <div class="combo-empty" style="display:none">${t('无匹配账号')}</div>
          </div>
        </div>
        <button class="btn" onclick="copySelectedEmail(this)" title="${t('复制当前邮箱地址')}" style="display:inline-flex;align-items:center;gap:6px">${copyIcon}<span class="btn-label">${t('复制')}</span></button>
        <span class="vr"></span>
        <select class="form-select" style="width:auto;min-width:100px" id="emailFolder" onchange="onFolderChange()">
          <option value="inbox">${t('收件箱')}</option>
          <option value="junkemail">${t('垃圾箱')}</option>
          <option value="deleteditems">${t('已删除')}</option>
          <option value="all">${t('全部（收件箱+垃圾箱）')}</option>
        </select>
        <input class="search-input" id="emailSearch" placeholder="${t('搜索邮件...')}" onkeydown="if(event.key==='Enter')searchEmails()">
        <button class="btn" onclick="refreshEmails()" title="${t('重新拉取当前文件夹')}" style="display:inline-flex;align-items:center;gap:6px">${refreshIcon}<span class="btn-label">${t('刷新')}</span></button>
        <span style="flex:1"></span>
        <span id="emailBatchActions" style="display:flex;align-items:center;gap:6px"></span>
        <span style="font-size:12px;color:var(--text-dim)" id="emailCount"></span>
      </div>
      <div id="emailAccountTags" style="padding:0 2px 8px"></div>
      <div class="email-panes">
        <div class="email-list-pane" id="emailListPane">
          <div class="empty-state">${t('请选择一个邮箱账号')}</div>
        </div>
        <div class="email-detail-pane" id="emailDetailPane">
          <div class="empty-state">${t('选择一封邮件查看详情')}</div>
        </div>
      </div>
    </div>
  `;
  if (state.pendingEmailAccount) {
    const acc = state.accounts.find(a => String(a.id) === String(state.pendingEmailAccount));
    const input = document.getElementById('emailAccountInput');
    if (acc && input) {
      input.value = acc.email;
      loadEmailList(acc.id);
    }
    state.pendingEmailAccount = null;
  }
}

// ---- Searchable account combobox: a select and a type-to-filter input in one.
// Focus/arrow shows the full list (select-like); typing narrows it (100+ accounts).
function openAccountCombo(input) {
  input.select();
  filterAccountCombo('');
}

// Re-open on click when already focused (focus event won't refire)
function clickAccountCombo(input) {
  const list = document.getElementById('accountComboList');
  if (list && list.style.display === 'none') filterAccountCombo(input.value);
}

function toggleAccountCombo() {
  const list = document.getElementById('accountComboList');
  if (!list) return;
  if (list.style.display === 'none') {
    filterAccountCombo('');
    document.getElementById('emailAccountInput')?.focus();
  } else {
    list.style.display = 'none';
  }
}

function filterAccountCombo(keyword) {
  const list = document.getElementById('accountComboList');
  if (!list) return;
  const kw = (keyword || '').trim().toLowerCase();
  let visible = 0;
  list.querySelectorAll('.combo-item').forEach(it => {
    const hit = !kw || it.dataset.email.includes(kw);
    it.style.display = hit ? '' : 'none';
    if (hit) visible++;
  });
  const empty = list.querySelector('.combo-empty');
  if (empty) empty.style.display = visible ? 'none' : '';
  list.style.display = '';
}

function pickAccountComboEl(el) {
  const input = document.getElementById('emailAccountInput');
  const list = document.getElementById('accountComboList');
  if (input) input.value = el.textContent.trim();
  if (list) list.style.display = 'none';
  loadEmailList(el.dataset.id);
}

function accountComboKeydown(e) {
  const list = document.getElementById('accountComboList');
  if (!list) return;
  if (e.key === 'Escape') { list.style.display = 'none'; return; }
  if (e.key === 'Enter') {
    const first = [...list.querySelectorAll('.combo-item')].find(it => it.style.display !== 'none');
    if (first) pickAccountComboEl(first);
  }
}

// Close the combobox when clicking anywhere outside it
document.addEventListener('click', (e) => {
  const combo = document.getElementById('emailAccountCombo');
  const list = document.getElementById('accountComboList');
  if (list && combo && !combo.contains(e.target)) list.style.display = 'none';
});

const EMAIL_PAGE_SIZE = 30;

// Fetch one page of emails. Returns { items } or { error }.
async function fetchEmailPage(accountId, skip) {
  const keyword = document.getElementById('emailSearch')?.value?.trim();
  const folder = document.getElementById('emailFolder')?.value || 'inbox';
  let url = `/accounts/${accountId}/emails?top=${EMAIL_PAGE_SIZE}&skip=${skip}&folder=${encodeURIComponent(folder)}`;
  if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;

  const res = await api(url);
  if (!res?.success || res.data?.error) {
    return { error: res?.data?.error || res?.error?.message || t('获取邮件失败') };
  }
  return { items: res.data?.items || [] };
}

// Render email item rows; `startIndex` keeps onclick indices aligned with state.emailList
function renderEmailItems(emails, startIndex) {
  return emails.map((e, k) => {
    const i = startIndex + k;
    const checked = state.selectedEmailIds.has(e.id) ? 'checked' : '';
    return `<div class="email-item ${e.isRead ? '' : 'unread'}" id="emailItem${i}">
      <label class="email-check-wrap" onclick="event.stopPropagation()">
        <input type="checkbox" class="email-check" data-id="${esc(e.id)}" ${checked} onchange="toggleEmailSelect('${esc(e.id)}', this.checked)">
      </label>
      <div class="email-item-body" onclick="viewEmail(${i})">
        <div class="email-from">${esc(tServer(e.from?.name || e.from?.address || '未知'))}</div>
        <div class="email-subject">${esc(tServer(e.subject))}</div>
        <div class="email-preview">${esc(e.bodyPreview)}</div>
        <div class="email-meta">
          <span class="email-date">${formatDate(e.receivedDateTime)}</span>
          <div class="email-badges">
            ${e.hasAttachments ? '<span style="font-size:11px;color:var(--text-dim)">📎</span>' : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// "Load more" footer — shown only when the last page was full (likely more to fetch).
// Disabled for the aggregated "all" view, which returns a single merged page.
function loadMoreFooterHtml() {
  const folder = document.getElementById('emailFolder')?.value || 'inbox';
  if (folder === 'all') return '';
  if (state.emailList.length === 0 || state.emailList.length % EMAIL_PAGE_SIZE !== 0) return '';
  return `<div id="loadMoreWrap" style="padding:12px;text-align:center">
    <button class="btn btn-sm" onclick="loadMoreEmails()">${t('加载更多')}</button>
  </div>`;
}

// Copy the currently selected account's email address
function copySelectedEmail(btn) {
  const acc = state.accounts.find(a => String(a.id) === String(state.selectedAccount));
  if (!acc) { toast(t('请先选择邮箱账号'), 'error'); return; }
  copyText(acc.email, btn);
}

function updateEmailCount() {
  const countEl = document.getElementById('emailCount');
  if (countEl) countEl.textContent = t('已加载 {n} 封', { n: state.emailList.length });
}

async function loadEmailList(accountId) {
  if (!accountId) return;
  state.selectedAccount = accountId;
  state.selectedEmail = null;
  state.emailList = [];
  state.selectedEmailIds.clear();
  updateEmailBatchActions();
  // Show the selected account's tags under the toolbar
  const tagBox = document.getElementById('emailAccountTags');
  if (tagBox) {
    const acc = state.accounts.find(a => String(a.id) === String(accountId));
    tagBox.innerHTML = acc ? tagBadgesHtml(acc.tags) : '';
  }
  const pane = document.getElementById('emailListPane');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载邮件...') + '</div>';
  document.getElementById('emailDetailPane').innerHTML = `<div class="empty-state">${t('选择一封邮件查看详情')}</div>`;

  const { items, error } = await fetchEmailPage(accountId, 0);
  if (error) {
    pane.innerHTML = `<div class="empty-state" style="color:var(--danger)">${esc(tServer(error))}</div>`;
    return;
  }

  state.emailList = items;
  updateEmailCount();

  if (state.emailList.length === 0) {
    pane.innerHTML = `<div class="empty-state">${t('该文件夹暂无邮件')}</div>`;
    return;
  }

  pane.innerHTML = renderEmailItems(state.emailList, 0) + loadMoreFooterHtml();
}

// Append the next page without re-rendering existing rows (preserves scroll position)
async function loadMoreEmails() {
  const accountId = state.selectedAccount;
  if (!accountId) return;
  const wrap = document.getElementById('loadMoreWrap');
  const btn = wrap?.querySelector('button');
  if (btn) { btn.disabled = true; btn.textContent = t('加载中...'); }

  const startIndex = state.emailList.length;
  const { items, error } = await fetchEmailPage(accountId, startIndex);
  if (error) {
    toast(error, 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('加载更多'); }
    return;
  }
  if (!items.length) { wrap?.remove(); return; }

  state.emailList.push(...items);
  if (wrap) wrap.insertAdjacentHTML('beforebegin', renderEmailItems(items, startIndex));
  updateEmailCount();

  // Drop the footer when the last page wasn't full (no further pages)
  if (items.length < EMAIL_PAGE_SIZE) wrap?.remove();
  else if (btn) { btn.disabled = false; btn.textContent = t('加载更多'); }
}

function refreshEmails() {
  if (state.selectedAccount) loadEmailList(state.selectedAccount);
}

// Switch mail folder (inbox / junkemail / deleteditems)
function onFolderChange() {
  if (state.selectedAccount) loadEmailList(state.selectedAccount);
}

function searchEmails() {
  if (state.selectedAccount) loadEmailList(state.selectedAccount);
}

async function viewEmail(index) {
  const email = state.emailList[index];
  if (!email) return;
  state.selectedEmail = index;

  document.querySelectorAll('.email-item').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  const pane = document.getElementById('emailDetailPane');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载详情...') + '</div>';

  const res = await api(`/accounts/${state.selectedAccount}/emails/${email.id}`);
  if (!res?.success) {
    pane.innerHTML = `<div class="empty-state" style="color:var(--danger)">${esc(tServer(res?.error?.message) || t('获取详情失败'))}</div>`;
    return;
  }

  const e = res.data;
  const bodyContent = e.body?.contentType === 'html'
    ? `<iframe id="emailFrame" sandbox="allow-same-origin" onload="resizeFrame(this)"></iframe>`
    : `<pre style="white-space:pre-wrap;font-family:inherit">${esc(e.body?.content || e.bodyPreview || '')}</pre>`;

  pane.innerHTML = `
    <div class="detail-pane" style="border:none;padding:0">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <h2 style="flex:1">${esc(tServer(e.subject))}</h2>
        <button class="btn btn-danger btn-sm" style="flex-shrink:0" onclick="deleteCurrentEmail('${esc(e.id)}')">${t('删除')}</button>
      </div>
      <div class="detail-meta">
        <span>${t('发件人:')} ${esc(e.from?.name || '')} &lt;${esc(e.from?.address || '')}&gt;</span><br>
        <span>${t('收件人:')} ${(e.toRecipients || []).map(r => esc(r.address)).join(', ')}</span><br>
        ${e.ccRecipients?.length ? `<span>${t('抄送:')} ${e.ccRecipients.map(r => esc(r.address)).join(', ')}</span><br>` : ''}
        <span>${t('时间:')} ${formatDate(e.receivedDateTime)}</span>
      </div>
      ${e.hasAttachments ? '<div id="emailAttachments" style="margin-bottom:16px"></div>' : ''}
      <div class="detail-body">${bodyContent}</div>
    </div>
  `;

  if (e.hasAttachments) loadAttachments(e.id);

  if (e.body?.contentType === 'html') {
    const frame = document.getElementById('emailFrame');
    if (frame) {
      const doc = frame.contentDocument;
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;color:#333;margin:12px;}</style></head><body>${e.body.content}</body></html>`);
      doc.close();
    }
  }
}

function resizeFrame(frame) {
  try { frame.style.height = frame.contentDocument.body.scrollHeight + 40 + 'px'; } catch {}
}

function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// Load and render downloadable attachments for the open email
async function loadAttachments(messageId) {
  const box = document.getElementById('emailAttachments');
  if (!box) return;
  box.innerHTML = `<span style="font-size:12px;color:var(--text-dim)">${t('加载附件...')}</span>`;
  const res = await api(`/accounts/${state.selectedAccount}/emails/${messageId}/attachments`);
  const items = res?.data?.items || [];
  if (!res?.success || items.length === 0) {
    box.innerHTML = '';
    return;
  }
  // Each link hits the download endpoint; Content-Disposition triggers the browser download
  box.innerHTML = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${t('附件 ({n})', { n: items.length })}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${items.map(a =>
      `<a class="btn btn-sm" href="${API}/accounts/${state.selectedAccount}/emails/${messageId}/attachments/${a.id}" target="_blank" rel="noopener" title="${esc(a.name)}">📎 ${esc(a.name)} <span style="color:var(--text-dim);margin-left:4px">${fmtSize(a.size)}</span></a>`
    ).join('')}</div>`;
}

// ---- Email deletion (single / batch) ----
function toggleEmailSelect(id, checked) {
  if (checked) state.selectedEmailIds.add(id);
  else state.selectedEmailIds.delete(id);
  updateEmailBatchActions();
}

function updateEmailBatchActions() {
  const el = document.getElementById('emailBatchActions');
  if (!el) return;
  const n = state.selectedEmailIds.size;
  el.innerHTML = n > 0
    ? `<span style="font-size:12px;color:var(--text-muted)">${t('已选 {n}', { n })}</span>
       <button class="btn btn-danger btn-sm" onclick="deleteSelectedEmails()">${t('删除选中')}</button>
       <button class="btn btn-sm" onclick="clearEmailSelection()">${t('取消')}</button>`
    : '';
}

function clearEmailSelection() {
  state.selectedEmailIds.clear();
  document.querySelectorAll('.email-check').forEach(cb => { cb.checked = false; });
  updateEmailBatchActions();
}

// Remove deleted messages from the in-memory list and re-render, without a full refetch
function removeEmailsFromList(ids) {
  const set = new Set(ids);
  state.emailList = state.emailList.filter(e => !set.has(e.id));
  ids.forEach(id => state.selectedEmailIds.delete(id));
  state.selectedEmail = null;

  const pane = document.getElementById('emailListPane');
  if (pane) {
    pane.innerHTML = state.emailList.length
      ? renderEmailItems(state.emailList, 0) + loadMoreFooterHtml()
      : `<div class="empty-state">${t('该文件夹暂无邮件')}</div>`;
  }
  const detail = document.getElementById('emailDetailPane');
  if (detail) detail.innerHTML = `<div class="empty-state">${t('选择一封邮件查看详情')}</div>`;
  updateEmailCount();
  updateEmailBatchActions();
}

async function deleteCurrentEmail(id) {
  if (!confirm(t('确认删除这封邮件？（移至「已删除」文件夹）'))) return;
  const res = await api(`/accounts/${state.selectedAccount}/emails/${id}`, { method: 'DELETE' });
  if (!res?.success) { toast(res?.error?.message || t('删除失败'), 'error'); return; }
  toast(t('已删除'));
  removeEmailsFromList([id]);
}

async function deleteSelectedEmails() {
  const ids = [...state.selectedEmailIds];
  if (!ids.length) return;
  if (!confirm(t('确认删除选中的 {n} 封邮件？（移至「已删除」文件夹）', { n: ids.length }))) return;
  const res = await api(`/accounts/${state.selectedAccount}/emails/batch-delete`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  if (!res?.success) { toast(res?.error?.message || t('删除失败'), 'error', 6000); return; }
  toast(res.message || t('已删除'), 'success', 5000);
  // Only remove the ones actually deleted is hard to know per-id; refetch is simplest & correct
  removeEmailsFromList(ids);
}

// ========== Temp Emails ==========
async function loadTempEmails() {
  const res = await api('/temp-emails');
  if (res?.success) state.tempEmails = res.data || [];
}

async function renderTempEmails(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载中...') + '</div>';
  await loadTempEmails();

  const toolbar = pageToolbarHtml(
    t('{n} 个临时邮箱', { n: state.tempEmails.length }),
    `<button class="btn btn-primary btn-sm" onclick="generateTempEmail()">${t('+ 生成临时邮箱')}</button>`
  );

  if (state.tempEmails.length === 0) {
    el.innerHTML = toolbar + `<div class="empty-state">${t('暂无临时邮箱')}</div>`;
    return;
  }

  el.innerHTML = toolbar + `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:16px;min-height:500px;">
      <div class="card" style="padding:0;overflow-y:auto;max-height:calc(100vh - 200px)">
        ${state.tempEmails.map(e => `
          <div class="email-item" style="display:flex;justify-content:space-between;align-items:center">
            <div style="cursor:pointer;flex:1;min-width:0" onclick="loadTempMessages(${e.id})">
              <div style="font-size:13px;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.email)}</div>
              <div style="font-size:11px;color:var(--text-dim)">${formatDate(e.created_at)}</div>
            </div>
            <button class="btn btn-sm btn-danger" style="flex-shrink:0;margin-left:8px" onclick="deleteTempEmail(${e.id})">${t('删除')}</button>
          </div>
        `).join('')}
      </div>
      <div class="card" id="tempMailContent">
        <div class="empty-state">${t('选择一个临时邮箱查看邮件')}</div>
      </div>
    </div>
  `;
}

async function generateTempEmail() {
  const res = await api('/temp-emails', { method: 'POST', body: '{}' });
  if (res?.success) { toast(res.message || t('生成成功')); navigate('temp-emails'); }
  else toast(res?.error?.message || t('生成失败'), 'error');
}

async function deleteTempEmail(id) {
  if (!confirm(t('确认删除该临时邮箱？'))) return;
  const res = await api(`/temp-emails/${id}`, { method: 'DELETE' });
  if (res?.success) { toast(t('已删除')); navigate('temp-emails'); }
  else toast(res?.error?.message || t('删除失败'), 'error');
}

async function loadTempMessages(id) {
  const pane = document.getElementById('tempMailContent');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载邮件...') + '</div>';

  const res = await api(`/temp-emails/${id}/messages`);
  if (!res?.success) {
    pane.innerHTML = `<div class="empty-state" style="color:var(--danger)">${esc(tServer(res?.error?.message) || t('获取失败'))}</div>`;
    return;
  }

  const emails = res.data?.emails || [];
  if (emails.length === 0) {
    pane.innerHTML = `<div class="empty-state">${t('暂无邮件')}</div>`;
    return;
  }

  pane.innerHTML = emails.map(e => `
    <div class="email-item" onclick="viewTempMessage(${id},'${esc(String(e.id))}')">
      <div class="email-from">${esc(tServer(String(e.from)))}</div>
      <div class="email-subject">${esc(tServer(String(e.subject)))}</div>
      <div class="email-preview">${esc(String(e.body_preview))}</div>
    </div>
  `).join('');
}

async function viewTempMessage(emailId, messageId) {
  const pane = document.getElementById('tempMailContent');
  pane.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载详情...') + '</div>';

  const res = await api(`/temp-emails/${emailId}/messages/${messageId}`);
  if (!res?.success) {
    pane.innerHTML = `<div class="empty-state" style="color:var(--danger)">${t('获取失败')}</div>`;
    return;
  }

  const e = res.data;
  // Render untrusted HTML bodies inside a sandboxed, script-less iframe (same as
  // the main mailbox detail view) so malicious markup - e.g. <img onerror> - can't
  // execute in the app origin. Plain-text bodies stay escaped in a <pre>.
  const isHtml = e.body_type === 'html';
  const bodyContent = isHtml
    ? `<iframe id="tempMailFrame" sandbox="allow-same-origin" onload="resizeFrame(this)" style="width:100%;border:none;min-height:300px;background:#fff;border-radius:var(--radius)"></iframe>`
    : `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7">${esc(String(e.body || ''))}</pre>`;
  pane.innerHTML = `
    <div>
      <button class="btn btn-sm" onclick="loadTempMessages(${emailId})" style="margin-bottom:12px">${t('← 返回列表')}</button>
      <h3>${esc(tServer(String(e.subject)))}</h3>
      <div style="color:var(--text-muted);font-size:13px;margin:8px 0">From: ${esc(String(e.from))} → ${esc(String(e.to))}</div>
      <div style="margin-top:16px">${bodyContent}</div>
    </div>
  `;

  if (isHtml) {
    const frame = document.getElementById('tempMailFrame');
    if (frame) {
      const doc = frame.contentDocument;
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;color:#333;margin:12px;}</style></head><body>${e.body || ''}</body></html>`);
      doc.close();
    }
  }
}

// ========== Settings ==========
async function renderSettings(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>' + t('加载中...') + '</div>';
  const res = await api('/settings');
  const settings = res?.data || {};

  el.innerHTML = `
    <div class="settings-grid">
    <div class="card">
      <h3 style="margin-bottom:20px">${t('系统设置')}</h3>
      <div class="form-group">
        <label class="form-label">${t('登录密码 (当前: {v})', { v: esc(settings.login_password || t('未设置')) })}</label>
        <input class="form-input" id="sPassword" type="password" placeholder="${t('输入新密码（留空不修改）')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('GPTMail API Key (当前: {v})', { v: esc(settings.gptmail_api_key || t('未设置')) })}</label>
        <input class="form-input" id="sApiKey" placeholder="${t('输入 API Key')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('站点标题')}</label>
        <input class="form-input" id="sSiteTitle" value="${esc(settings.site_title || t('Outlook 邮件管理'))}">
      </div>
      <button class="btn btn-primary" onclick="saveSettings()">${t('保存设置')}</button>
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">${t('对外 API')}</h3>
      <div style="font-size:12.5px;color:var(--text-dim);line-height:1.7;margin-bottom:16px">
        ${t('用 API Key 免登录拉取邮件（适合脚本自动取验证码）。详见 {link}。', { link: `<a href="https://github.com/roseforyou/cf-outlook-email/blob/main/docs/API.md" target="_blank">${t('API 文档')}</a>` })}
      </div>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="sExternalKey" readonly value="${esc(settings.external_api_key || '')}" placeholder="${t('未启用（点下方「生成 API Key」）')}" style="flex:1;font-family:monospace;font-size:12px">
          <button class="btn" type="button" onclick="copyText(document.getElementById('sExternalKey').value, this)" ${settings.external_api_key ? '' : 'disabled'}>${t('复制')}</button>
        </div>
      </div>
      ${settings.external_api_key ? `<div class="form-group">
        <label class="form-label">${t('调用示例')}</label>
        <input class="form-input" readonly value="${location.origin}/api/external/emails?email=${t('你的邮箱')}&key=${esc(settings.external_api_key)}" style="font-family:monospace;font-size:11px" onclick="this.select()">
      </div>` : ''}
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" type="button" onclick="generateApiKey()">${settings.external_api_key ? t('重新生成') : t('生成 API Key')}</button>
        ${settings.external_api_key ? `<button class="btn btn-danger" type="button" onclick="clearApiKey()">${t('停用')}</button>` : ''}
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">${t('定时刷新 Token')}</h3>
      <div style="font-size:12.5px;color:var(--text-dim);line-height:1.7;margin-bottom:16px">
        ${t('定时自动刷新账号 Token，让长期不用的号也不过期。Cloudflare 每 6 小时唤醒一次，实际是否执行由下面的「间隔」决定。')}
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="sRefreshEnabled" ${settings.token_refresh_enabled === '1' ? 'checked' : ''}> ${t('启用定时刷新')}
        </label>
      </div>
      <div style="display:flex;gap:12px">
        <div class="form-group" style="flex:1">
          <label class="form-label">${t('间隔（小时）')}</label>
          <input class="form-input" id="sRefreshInterval" type="number" min="6" value="${esc(settings.token_refresh_interval_hours || '24')}">
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">${t('每批数量（≤40）')}</label>
          <input class="form-input" id="sRefreshBatch" type="number" min="1" max="40" value="${esc(settings.token_refresh_batch || '20')}">
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">${t('上次执行：{v}', { v: esc(tServer(settings.token_refresh_last_result || '尚未执行')) })}</div>
      <div style="background:var(--warning-bg);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:11.5px;color:var(--text-secondary);line-height:1.8">
        <b style="color:var(--warning)">${t('⚠️ 频率风险（请勿设太频繁）')}</b><br>
        · ${t('<b>微软风控（最重要）</b>：refresh_token 每次刷新都会被微软轮换，高频自动刷新可能触发 Graph 限流（429），对「领来的」账号还可能被微软判定异常活动而<b>锁号</b>。Token 只要每隔几天被用到就不会过期，<b>没必要高频刷，建议间隔 ≥ 12 小时，默认 24 小时足够</b>。')}<br>
        · ${t('<b>子请求限制</b>：免费层单次最多 50 个子请求，每个账号刷新占 1 个，故「每批」上限 40，超出的账号下一轮再刷。')}<br>
        · ${t('<b>账号多时</b>：账号数 > 每批数量，会分多轮轮换刷新（按最久未刷新优先），不会一次刷完。')}<br>
        · ${t('<b>请求配额</b>：免费层 10 万次/天，定时任务本身消耗极小，正常用不会触顶。')}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" type="button" onclick="saveRefreshSettings()">${t('保存')}</button>
        <button class="btn" type="button" onclick="refreshTokensNow(this)">${t('立即刷新一批')}</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">${t('Telegram 推送新邮件')}</h3>
      <div style="font-size:12.5px;color:var(--text-dim);line-height:1.7;margin-bottom:16px">
        ${t('新邮件到达时推送到 Telegram（适合实时收验证码）。需先 {bot} 拿到 Bot Token，再给机器人发条消息后用 {userinfo} 获取 Chat ID。Cloudflare 每 5 分钟唤醒一次，推送延迟取决于邮件到达时刻与下一次唤醒的间隔，平均约 2~3 分钟、最长约 5 分钟；下面的「间隔」默认 1（每次唤醒都推，即最快），设得比 5 大则进一步拉长。', {
          bot: `<a href="https://core.telegram.org/bots#how-do-i-create-a-bot" target="_blank">${t('用 @BotFather 创建机器人')}</a>`,
          userinfo: '<a href="https://t.me/userinfobot" target="_blank">@userinfobot</a>',
        })}
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px">
        <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="sTgEnabled" ${settings.telegram_push_enabled === '1' ? 'checked' : ''}> ${t('启用推送')}
        </label>
      </div>
      <div class="form-group">
        <label class="form-label">Bot Token</label>
        <input class="form-input" id="sTgToken" value="${esc(settings.telegram_bot_token || '')}" placeholder="123456:ABC-DEF..." style="font-family:monospace;font-size:12px">
      </div>
      <div style="display:flex;gap:12px">
        <div class="form-group" style="flex:1">
          <label class="form-label">Chat ID</label>
          <input class="form-input" id="sTgChatId" value="${esc(settings.telegram_chat_id || '')}" placeholder="${t('例如 123456789')}">
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">${t('间隔（分钟）')}</label>
          <input class="form-input" id="sTgInterval" type="number" min="1" value="${esc(settings.telegram_push_interval_minutes || '1')}">
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">${t('上次执行：{v}', { v: esc(tServer(settings.telegram_push_last_result || '尚未执行')) })}</div>
      <div style="background:var(--warning-bg);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:11.5px;color:var(--text-secondary);line-height:1.8">
        <b style="color:var(--warning)">${t('⚠️ 说明')}</b><br>
        · ${t('通过<b>轮询</b>实现（非微软实时推送），延迟取决于邮件到达与下次唤醒的间隔，<b>平均约 2~3 分钟、最长约 5 分钟</b>；间隔设得比 5 大则进一步拉长。')}<br>
        · ${t('受子请求限制，每轮最多扫描 8 个账号、每账号最多推 3 条；账号多时按最久未扫优先轮换。')}<br>
        · ${t('首次为每个账号只记录水位、<b>不补推历史邮件</b>，之后只推新到达的邮件。')}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" type="button" onclick="saveTelegramSettings()">${t('保存')}</button>
        <button class="btn" type="button" onclick="testTelegram(this)">${t('发送测试消息')}</button>
        <button class="btn" type="button" onclick="pushNow(this)">${t('立即推送一轮')}</button>
      </div>
    </div>
    </div>
  `;
}

async function saveTelegramSettings() {
  const body = {
    telegram_push_enabled: document.getElementById('sTgEnabled').checked ? '1' : '0',
    telegram_bot_token: document.getElementById('sTgToken').value.trim(),
    telegram_chat_id: document.getElementById('sTgChatId').value.trim(),
    telegram_push_interval_minutes: document.getElementById('sTgInterval').value.trim() || '1',
  };
  const res = await api('/settings', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.success) toast(res.message || t('已保存'));
  else toast(res?.error?.message || t('保存失败'), 'error');
}

async function testTelegram(btn) {
  if (btn) { btn.disabled = true; btn.textContent = t('发送中...'); }
  const res = await api('/settings/telegram-test', { method: 'POST' });
  if (btn) { btn.disabled = false; btn.textContent = t('发送测试消息'); }
  if (res?.success) toast(res.message || t('已发送'), 'success', 5000);
  else toast(res?.error?.message || t('发送失败'), 'error');
}

async function pushNow(btn) {
  if (btn) { btn.disabled = true; btn.textContent = t('推送中...'); }
  const res = await api('/settings/push-now', { method: 'POST' });
  if (btn) { btn.disabled = false; btn.textContent = t('立即推送一轮'); }
  if (res?.success) { toast(res.message || t('已执行'), 'success', 5000); navigate('settings'); }
  else toast(res?.error?.message || t('推送失败'), 'error');
}

async function saveRefreshSettings() {
  const body = {
    token_refresh_enabled: document.getElementById('sRefreshEnabled').checked ? '1' : '0',
    token_refresh_interval_hours: document.getElementById('sRefreshInterval').value.trim() || '24',
    token_refresh_batch: document.getElementById('sRefreshBatch').value.trim() || '20',
  };
  const res = await api('/settings', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.success) toast(res.message || t('已保存'));
  else toast(res?.error?.message || t('保存失败'), 'error');
}

async function refreshTokensNow(btn) {
  if (btn) { btn.disabled = true; btn.textContent = t('刷新中...'); }
  const res = await api('/settings/refresh-now', { method: 'POST' });
  if (btn) { btn.disabled = false; btn.textContent = t('立即刷新一批'); }
  if (res?.success) { toast(res.message || t('已刷新'), 'success', 5000); navigate('settings'); }
  else toast(res?.error?.message || t('刷新失败'), 'error');
}

async function generateApiKey() {
  if (document.getElementById('sExternalKey')?.value && !confirm(t('重新生成会使旧 Key 立即失效，确认？'))) return;
  const res = await api('/settings/external-key', { method: 'POST' });
  if (res?.success) { toast(res.message || t('已生成')); navigate('settings'); }
  else toast(res?.error?.message || t('生成失败'), 'error');
}

async function clearApiKey() {
  if (!confirm(t('停用后对外 API 将无法使用，确认？'))) return;
  const res = await api('/settings/external-key', { method: 'DELETE' });
  if (res?.success) { toast(res.message || t('已停用')); navigate('settings'); }
  else toast(res?.error?.message || t('操作失败'), 'error');
}

async function saveSettings() {
  const body = {};
  const pwd = document.getElementById('sPassword').value.trim();
  const apiKey = document.getElementById('sApiKey').value.trim();
  const title = document.getElementById('sSiteTitle').value.trim();
  if (pwd) body.login_password = pwd;
  if (apiKey) body.gptmail_api_key = apiKey;
  if (title) body.site_title = title;

  if (Object.keys(body).length === 0) { toast(t('没有需要更新的设置'), 'error'); return; }
  const res = await api('/settings', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.success) toast(res.message || t('设置已保存'));
  else toast(res?.error?.message || t('保存失败'), 'error');
}

// ========== Modal Helpers ==========
function showModal(title, bodyHtml, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">${t('取消')}</button>
        <button class="btn btn-primary" id="modalConfirmBtn">${t('确定')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Intentionally NOT closing on backdrop click — only × or Cancel close the modal

  const confirmBtn = document.getElementById('modalConfirmBtn');
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = t('处理中...');
    const result = await onConfirm();
    if (result) {
      overlay.remove();
    } else {
      confirmBtn.disabled = false;
      confirmBtn.textContent = t('确定');
    }
  });
}

// Render a row of tag badges (small tag icon + name, tinted by tag color)
function tagBadgesHtml(tags) {
  if (!tags || !tags.length) return '';
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="9" height="9" style="flex-shrink:0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${tags.map(t =>
    `<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:1px 7px;border-radius:10px;background:${esc(t.color)}22;color:${esc(t.color)}">${icon}${esc(t.name)}</span>`
  ).join('')}</div>`;
}

// ========== Utilities ==========
function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const locale = LANG === 'en' ? 'en-US' : 'zh-CN';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

// ========== Sidebar Toggle ==========
function toggleSidebar() {
  const app = document.getElementById('mainApp');
  app.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebarCollapsed', app.classList.contains('sidebar-collapsed'));
}

function restoreSidebar() {
  if (localStorage.getItem('sidebarCollapsed') === 'true') {
    document.getElementById('mainApp')?.classList.add('sidebar-collapsed');
  }
}

// ========== Init ==========
// Suppress browser autofill dropdowns (saved addresses / contacts) on every
// rendered input, current and future. The whole UI is built via innerHTML, so
// instead of hand-annotating each template we stamp autocomplete="off" on any
// input/textarea that doesn't declare its own autocomplete attribute, as nodes
// are added.
function applyAutocompleteOff(node) {
  if (node.nodeType !== 1) return;
  if (node.matches('input:not([autocomplete]), textarea:not([autocomplete])')) {
    node.setAttribute('autocomplete', 'off');
  }
  node.querySelectorAll('input:not([autocomplete]), textarea:not([autocomplete])')
    .forEach(el => el.setAttribute('autocomplete', 'off'));
}

// Re-render the current page when the language changes (setLang in i18n.js).
// Open modals are closed: their content was rendered in the old language and
// re-opening is cheaper and safer than patching them in place.
window.onLangChange = () => {
  document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
  document.title = t('Outlook 邮件管理');
  renderPage();
};

document.addEventListener('DOMContentLoaded', async () => {
  applyAutocompleteOff(document.body);
  new MutationObserver(muts => {
    for (const m of muts) m.addedNodes.forEach(applyAutocompleteOff);
  }).observe(document.body, { childList: true, subtree: true });

  restoreSidebar();
  document.title = t('Outlook 邮件管理');
  const authed = await checkAuth();
  if (authed) navigate('dashboard');
});
