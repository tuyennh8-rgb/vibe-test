/* Trang quản trị (A1 đăng nhập, A2 danh sách, A3 xác nhận xoá).
   Mọi dữ liệu người chơi chỉ được đưa vào trang bằng textContent, không bao giờ bằng innerHTML (QT-25: chống XSS). */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    viewLogin: $('view-login'), viewList: $('view-list'),
    loginForm: $('login-form'), loginUser: $('login-user'), loginPass: $('login-pass'),
    loginError: $('login-error'), loginNotice: $('login-notice'), loginSubmit: $('login-submit'),
    title: $('list-title'), search: $('search'), searchClear: $('search-clear'),
    btnExport: $('btn-export'), btnLogout: $('btn-logout'),
    listError: $('list-error'), rows: $('rows'), empty: $('empty'),
    prev: $('prev'), next: $('next'), pageInfo: $('page-info'),
    dialog: $('confirm'), confirmTitle: $('confirm-title'), confirmOk: $('confirm-ok'),
    confirmCancel: $('confirm-cancel'), confirmError: $('confirm-error')
  };

  const state = { q: '', page: 1, pages: 1, total: 0, loggedIn: false, pendingDelete: null, loadId: 0 };
  let searchTimer = 0;

  /* ---------- Gọi API ---------- */
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    if (response.status === 401 && state.loggedIn) {
      showLogin('Phiên đăng nhập đã hết hạn.');
      throw new Error('unauthorized');
    }
    return response;
  }

  async function errorMessage(response, fallback) {
    try {
      const data = await response.json();
      return (data && data.error && data.error.message) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  /* ---------- Hiển thị ---------- */
  function setText(el, text) {
    el.textContent = text || '';
    el.hidden = !text;
  }

  function showLogin(notice) {
    state.loggedIn = false;
    els.dialog.open && els.dialog.close();
    els.viewList.hidden = true;
    els.viewLogin.hidden = false;
    setText(els.loginNotice, notice);
    setText(els.loginError, '');
    els.loginPass.value = '';
    els.loginUser.focus();
  }

  function showList() {
    state.loggedIn = true;
    els.viewLogin.hidden = true;
    els.viewList.hidden = false;
    setText(els.loginNotice, '');
  }

  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  function formatDate(value) {
    const p = {};
    for (const { type, value: v } of dateFormatter.formatToParts(new Date(value))) p[type] = v;
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  }

  function formatPhone(phone) {
    return /^0\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
  }

  function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function renderRows(players) {
    els.rows.replaceChildren();
    for (const player of players) {
      const tr = document.createElement('tr');
      tr.append(cell(player.fullName), cell(player.email), cell(formatPhone(player.phone), 'nowrap'), cell(formatDate(player.createdAt), 'nowrap'));
      const actions = document.createElement('td');
      actions.className = 'actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-danger btn-sm';
      button.textContent = 'Xoá';
      button.addEventListener('click', () => askDelete(player));
      actions.append(button);
      tr.append(actions);
      els.rows.append(tr);
    }
  }

  function renderState(data) {
    state.page = data.page;
    state.pages = data.pages;
    state.total = data.total;
    els.title.textContent = `Người chơi (${data.total})`;
    renderRows(data.players);
    if (data.total === 0) {
      setText(els.empty, state.q ? `Không tìm thấy kết quả cho “${state.q}”.` : 'Chưa có người chơi nào.');
    } else {
      setText(els.empty, '');
    }
    els.pageInfo.textContent = `Trang ${data.page} / ${data.pages}`;
    els.prev.disabled = data.page <= 1;
    els.next.disabled = data.page >= data.pages;
    els.searchClear.hidden = state.q === '';
  }

  /* ---------- Tải danh sách (CN-14, CN-15) ---------- */
  async function load(page = state.page) {
    const myLoad = ++state.loadId;
    const params = new URLSearchParams({ page: String(page) });
    if (state.q) params.set('q', state.q);
    try {
      const response = await api(`/api/admin/players?${params}`);
      if (myLoad !== state.loadId) return;        // đã có yêu cầu mới hơn
      if (response.status === 401) return showLogin();
      if (!response.ok) throw new Error('load_failed');
      setText(els.listError, '');
      showList();
      renderState(await response.json());
    } catch (err) {
      if (err.message === 'unauthorized') return;
      setText(els.listError, 'Không tải được danh sách. Vui lòng thử lại.');
    }
  }

  function applySearch() {
    clearTimeout(searchTimer);
    const q = els.search.value.trim();
    if (q === state.q) return;
    state.q = q;
    load(1);
  }

  /* ---------- Đăng nhập, đăng xuất (CN-13) ---------- */
  async function onLogin(event) {
    event.preventDefault();
    setText(els.loginError, '');
    if (!els.loginUser.value.trim() || !els.loginPass.value) {
      setText(els.loginError, 'Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    els.loginSubmit.disabled = true;
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: els.loginUser.value.trim(), password: els.loginPass.value })
      });
      if (response.ok) {
        els.loginPass.value = '';
        state.q = '';
        els.search.value = '';
        await load(1);
      } else {
        setText(els.loginError, await errorMessage(response, 'Không thể đăng nhập lúc này. Vui lòng thử lại.'));
      }
    } catch (_) {
      setText(els.loginError, 'Không thể đăng nhập lúc này. Vui lòng thử lại.');
    } finally {
      els.loginSubmit.disabled = false;
    }
  }

  async function onLogout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      showLogin();
    }
  }

  /* ---------- Xoá có xác nhận (CN-16) ---------- */
  function askDelete(player) {
    state.pendingDelete = player;
    els.confirmTitle.textContent = `Xoá người chơi ${player.fullName}?`;
    setText(els.confirmError, '');
    els.dialog.showModal();
    els.confirmCancel.focus();
  }

  async function onConfirmDelete() {
    const player = state.pendingDelete;
    if (!player) return;
    els.confirmOk.disabled = true;
    try {
      const response = await api(`/api/admin/players/${encodeURIComponent(player.id)}`, { method: 'DELETE' });
      if (response.ok || response.status === 404) {
        els.dialog.close();
        state.pendingDelete = null;
        await load(state.page);                 // máy chủ tự lùi về trang cuối nếu trang hiện tại không còn dòng
      } else {
        setText(els.confirmError, 'Không thể xoá. Vui lòng thử lại.');
      }
    } catch (err) {
      if (err.message !== 'unauthorized') setText(els.confirmError, 'Không thể xoá. Vui lòng thử lại.');
    } finally {
      els.confirmOk.disabled = false;
    }
  }

  /* ---------- Xuất CSV (CN-17) ---------- */
  async function onExport() {
    els.btnExport.disabled = true;
    try {
      const params = state.q ? `?${new URLSearchParams({ q: state.q })}` : '';
      const response = await api(`/api/admin/players.csv${params}`);
      if (!response.ok) throw new Error('export_failed');
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match ? match[1] : 'nguoi-choi.csv';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setText(els.listError, '');
    } catch (err) {
      if (err.message !== 'unauthorized') setText(els.listError, 'Không xuất được CSV. Vui lòng thử lại.');
    } finally {
      els.btnExport.disabled = false;
    }
  }

  /* ---------- Khởi tạo ---------- */
  els.loginForm.addEventListener('submit', onLogin);
  els.btnLogout.addEventListener('click', onLogout);
  els.btnExport.addEventListener('click', onExport);
  els.prev.addEventListener('click', () => load(state.page - 1));
  els.next.addEventListener('click', () => load(state.page + 1));
  els.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applySearch, 450); });
  els.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySearch(); } });
  els.searchClear.addEventListener('click', () => { els.search.value = ''; applySearch(); els.search.focus(); });
  els.confirmOk.addEventListener('click', onConfirmDelete);

  // Mở trang: thử tải danh sách; chưa có phiên thì hiện form đăng nhập (A1).
  load(1).then(() => { if (!state.loggedIn) els.loginUser.focus(); });
})();
