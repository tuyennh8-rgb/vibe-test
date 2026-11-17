/* Game Đập chuột — viết theo docs/ (CN-01..CN-09, QT-01..QT-12) */
(() => {
  'use strict';

  /* ---------- Tham số cấu hình (docs/04, mục "Tham số cấu hình") ---------- */
  const CONFIG = Object.freeze({
    GRID_SIZE: 3,
    GAME_DURATION_MS: 30000,
    MOLE_VISIBLE_MS: 800,
    MOLE_GAP_MS: 200,
    HIT_POINTS: 1,
    MISS_POINTS: -1,
    MIN_SCORE: 0,
    DOUBLE_TAP_GRACE_MS: 150,
    LOW_TIME_SECONDS: 5,          // docs/03: dưới 6 giây đổi màu đồng hồ
    FLASH_MS: 200,                // docs/03: hiệu ứng dưới 300 ms
    STORAGE_KEY: 'dap-chuot:diem-cao-nhat'
  });
  const CELL_COUNT = CONFIG.GRID_SIZE * CONFIG.GRID_SIZE;
  const CYCLE_MS = CONFIG.MOLE_VISIBLE_MS + CONFIG.MOLE_GAP_MS;
  const MAX_SCORE = Math.floor(CONFIG.GAME_DURATION_MS / CYCLE_MS) * CONFIG.HIT_POINTS;
  const MOLE = '🐹';
  const HOLE = '🕳️';

  /* ---------- Phần tử giao diện ---------- */
  const $ = (id) => document.getElementById(id);
  const screens = { register: $('screen-register'), start: $('screen-start'), play: $('screen-play'), over: $('screen-over') };
  const els = {
    btnStart: $('btn-start'),
    btnAgain: $('btn-again'),
    bestStart: $('best-start'),
    bestOver: $('best-over'),
    score: $('score'),
    time: $('time'),
    grid: $('grid'),
    finalScore: $('final-score'),
    newBadge: $('new-badge')
  };
  const cells = Array.from(els.grid.querySelectorAll('.cell'));
  const flashTimers = new Array(CELL_COUNT).fill(0);

  /* ---------- Trạng thái (docs/04, mục "Dữ liệu trong lượt") ---------- */
  const state = {
    phase: 'idle',          // 'idle' | 'playing' | 'over'
    score: 0,
    startedAt: 0,
    cycleIndex: -1,         // chu kỳ 1000 ms hiện tại; chuột thứ k xuất hiện ở k × 1000 ms
    moleActive: false,
    activeCell: null,
    lastCell: null,         // ô của chuột trước, để chọn ô khác (G1)
    lastHitCell: null,
    lastHitAt: 0,
    remaining: CONFIG.GAME_DURATION_MS / 1000,
    raf: 0,
    sessionBest: 0          // dự phòng khi localStorage bị chặn
  };

  /* ---------- Kỷ lục (QT-10, QT-11) ---------- */
  function parseBest(raw) {
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return 0;
    const n = Number(raw);
    return n <= MAX_SCORE ? n : 0;
  }
  function loadBest() {
    try {
      return parseBest(window.localStorage.getItem(CONFIG.STORAGE_KEY));
    } catch (_) {
      return state.sessionBest;   // localStorage bị chặn: chỉ nhớ trong phiên hiện tại
    }
  }
  function saveBest(value) {
    state.sessionBest = value;
    try { window.localStorage.setItem(CONFIG.STORAGE_KEY, String(value)); } catch (_) { /* bị chặn */ }
  }

  /* ---------- Hiển thị ---------- */
  function showScreen(name, moveFocus) {
    Object.keys(screens).forEach((key) => { screens[key].hidden = key !== name; });
    if (moveFocus) {
      const heading = screens[name].querySelector('[tabindex="-1"]');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  function render() {
    for (let i = 0; i < CELL_COUNT; i += 1) {
      const hasMole = state.moleActive && state.activeCell === i;
      if (cells[i].classList.contains('has-mole') !== hasMole) {
        cells[i].classList.toggle('has-mole', hasMole);
        cells[i].textContent = hasMole ? MOLE : HOLE;
        cells[i].setAttribute('aria-label', hasMole ? `${cells[i].dataset.label}, có chuột` : cells[i].dataset.label);
      }
    }
    const scoreText = String(state.score);
    if (els.score.textContent !== scoreText) els.score.textContent = scoreText;
    const timeText = String(state.remaining);
    if (els.time.textContent !== timeText) els.time.textContent = timeText;
    els.time.classList.toggle('is-low', state.remaining <= CONFIG.LOW_TIME_SECONDS);
  }

  function flash(index, kind) {
    const cell = cells[index];
    clearTimeout(flashTimers[index]);
    cell.classList.remove('hit', 'miss');
    void cell.offsetWidth; // chạy lại hoạt ảnh nếu bấm liên tiếp
    cell.classList.add(kind);
    flashTimers[index] = setTimeout(() => cell.classList.remove(kind), CONFIG.FLASH_MS + 40);
  }

  function clearFlashes() {
    cells.forEach((cell, i) => { clearTimeout(flashTimers[i]); cell.classList.remove('hit', 'miss'); });
  }

  /* ---------- Chuột (CN-03, QT-03, QT-04) ---------- */
  function pickCell() {
    if (state.lastCell === null) return Math.floor(Math.random() * CELL_COUNT);
    const r = Math.floor(Math.random() * (CELL_COUNT - 1)); // 8 ô còn lại, chọn đều
    return r >= state.lastCell ? r + 1 : r;
  }
  function spawnMole() {
    const cell = pickCell();
    state.activeCell = cell;
    state.moleActive = true;
    state.lastCell = cell;
  }
  function despawnMole() {
    state.moleActive = false;
    state.activeCell = null;
  }

  /* ---------- Vòng lặp theo thời gian thực (QT-02, QT-08, QT-09) ----------
     Mọi trạng thái được tính từ mốc thời gian thực, không cộng dồn từng tick,
     nên đúng cả khi tab bị ẩn rồi hiện lại. Trả về false nếu lượt đã kết thúc. */
  function advance(now) {
    const elapsed = Math.max(0, now - state.startedAt);
    if (elapsed >= CONFIG.GAME_DURATION_MS) {
      endGame();
      return false;
    }
    const k = Math.floor(elapsed / CYCLE_MS);
    if (k > state.cycleIndex) {
      state.cycleIndex = k;
      spawnMole();
    }
    if (state.moleActive && elapsed - state.cycleIndex * CYCLE_MS >= CONFIG.MOLE_VISIBLE_MS) {
      despawnMole();
    }
    state.remaining = Math.ceil((CONFIG.GAME_DURATION_MS - elapsed) / 1000);
    return true;
  }

  function loop() {
    state.raf = 0;
    if (state.phase !== 'playing') return;
    if (advance(performance.now())) {
      render();
      state.raf = requestAnimationFrame(loop);
    }
  }

  function cancelLoop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  /* ---------- Bắt đầu / kết thúc (CN-01, CN-06, CN-07) ---------- */
  function startGame() {
    if (state.phase === 'playing') return;      // QT-01: chỉ bắt đầu từ trạng thái chờ/kết thúc
    cancelLoop();                               // QT-09: hủy bộ đếm cũ trước khi tạo mới
    clearFlashes();
    state.phase = 'playing';
    state.score = 0;
    state.cycleIndex = -1;
    state.moleActive = false;
    state.activeCell = null;
    state.lastCell = null;
    state.lastHitCell = null;
    state.lastHitAt = 0;
    state.remaining = CONFIG.GAME_DURATION_MS / 1000;
    state.startedAt = performance.now();
    showScreen('play', true);
    advance(state.startedAt);                   // chuột đầu tiên xuất hiện ngay
    render();
    state.raf = requestAnimationFrame(loop);
  }

  function endGame() {
    cancelLoop();
    state.phase = 'over';
    state.moleActive = false;
    state.activeCell = null;
    state.remaining = 0;
    render();

    const previous = loadBest();
    const isNewRecord = state.score > previous && state.score > 0;   // QT-10, G5
    if (isNewRecord) saveBest(state.score);

    els.finalScore.textContent = String(state.score);
    els.newBadge.hidden = !isNewRecord;
    els.bestOver.textContent = String(isNewRecord ? state.score : previous);
    showScreen('over', true);
  }

  /* ---------- Nhận thao tác bấm / chạm / phím và tính điểm (CN-04, CN-05, QT-05..QT-07) ---------- */
  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const cell = event.target.closest('.cell');
    if (!cell) return;
    event.preventDefault();
    registerTap(Number(cell.dataset.index));
  }

  // Bàn phím: Tab tới ô, Enter hoặc Space tính như một cú bấm. Giữ phím không lặp lại cú bấm.
  function onKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    const cell = event.target.closest('.cell');
    if (!cell) return;
    event.preventDefault();                      // không để trình duyệt tạo thêm sự kiện click
    if (event.repeat) return;
    registerTap(Number(cell.dataset.index));
  }

  function registerTap(index) {
    if (state.phase !== 'playing') return;

    const now = performance.now();
    if (!advance(now)) return;                  // đã hết giờ: bỏ qua thao tác (QT-08)

    if (state.moleActive && state.activeCell === index) {
      // Trúng
      state.score += CONFIG.HIT_POINTS;
      despawnMole();
      state.lastHitCell = index;
      state.lastHitAt = now;
      flash(index, 'hit');
    } else if (state.lastHitCell === index && now - state.lastHitAt <= CONFIG.DOUBLE_TAP_GRACE_MS) {
      // Nhấp đúp vào ô vừa đập trúng: bỏ qua (G3)
    } else {
      // Trượt
      state.score = Math.max(CONFIG.MIN_SCORE, state.score + CONFIG.MISS_POINTS);
      flash(index, 'miss');
    }
    render();
  }

  /* ---------- Đăng ký người chơi trước khi chơi (CN-10, CN-11, CN-12, M4) ----------
     Kiểm tra ở trình duyệt chỉ để báo lỗi nhanh; máy chủ luôn kiểm tra lại. */
  const REGISTER_MESSAGES = Object.freeze({
    fullName: 'Vui lòng nhập họ và tên (2 đến 100 ký tự).',
    email: 'Email không hợp lệ.',
    phone: 'Số điện thoại không hợp lệ. Ví dụ: 0912 345 678.',
    consent: 'Bạn cần đồng ý để tiếp tục.',
    server: 'Không thể đăng ký lúc này. Vui lòng thử lại.',
    rateLimited: 'Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.'
  });
  const FIELD_ORDER = ['fullName', 'email', 'phone', 'consent'];
  const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
  const registerForm = $('register-form');
  const registerButton = $('btn-register');
  const formError = $('form-error');
  let registering = false;

  const fieldInput = (name) => $(`f-${name}`);
  const fieldError = (name) => $(`e-${name}`);

  function setFieldError(name, message) {
    const input = fieldInput(name);
    const holder = fieldError(name);
    holder.textContent = message || '';
    holder.hidden = !message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function setFormError(message) {
    formError.textContent = message || '';
    formError.hidden = !message;
  }

  function readRegisterForm() {
    return {
      fullName: fieldInput('fullName').value.normalize('NFC').replace(/\s+/g, ' ').trim(),
      email: fieldInput('email').value.trim().toLowerCase(),
      phone: fieldInput('phone').value.trim(),
      consent: fieldInput('consent').checked
    };
  }

  function validateRegister(values) {
    const errors = {};
    const nameLength = [...values.fullName].length;
    if (nameLength < 2 || nameLength > 100 || !/\p{L}/u.test(values.fullName)) errors.fullName = REGISTER_MESSAGES.fullName;
    const local = values.email.slice(0, values.email.lastIndexOf('@'));
    if (values.email.length > 254 || !EMAIL_RE.test(values.email) || local.length > 64 ||
        local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      errors.email = REGISTER_MESSAGES.email;
    }
    let phone = values.phone.replace(/[\s.\-]/g, '');
    if (phone.startsWith('+84')) phone = `0${phone.slice(3)}`;
    else if (phone.startsWith('84')) phone = `0${phone.slice(2)}`;
    if (!/^0[35789]\d{8}$/.test(phone)) errors.phone = REGISTER_MESSAGES.phone;
    if (!values.consent) errors.consent = REGISTER_MESSAGES.consent;
    return errors;
  }

  function showRegisterErrors(errors) {
    FIELD_ORDER.forEach((name) => setFieldError(name, errors[name]));
    const first = FIELD_ORDER.find((name) => errors[name]);
    if (first) fieldInput(first).focus();
    return Boolean(first);
  }

  function validateOneField(name) {
    const errors = validateRegister(readRegisterForm());
    setFieldError(name, errors[name]);
  }

  async function onRegisterSubmit(event) {
    event.preventDefault();
    if (registering) return;                         // chống bấm đúp: chỉ gửi một lần
    setFormError('');
    const values = readRegisterForm();
    if (showRegisterErrors(validateRegister(values))) return;

    registering = true;
    registerButton.disabled = true;
    registerButton.textContent = 'Đang gửi…';
    try {
      const response = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (response.ok) {
        const greeting = $('greeting');
        greeting.textContent = `Xin chào, ${values.fullName}`;
        greeting.hidden = false;
        showScreen('start', true);
      } else if (response.status === 400) {
        const data = await response.json().catch(() => null);
        const fields = data && data.error && data.error.fields;
        if (!fields || !showRegisterErrors(fields)) setFormError(REGISTER_MESSAGES.server);
      } else if (response.status === 429) {
        setFormError(REGISTER_MESSAGES.rateLimited);
      } else {
        setFormError(REGISTER_MESSAGES.server);      // gồm cả trang tĩnh không có máy chủ (G9): không cho vào chơi
      }
    } catch (_) {
      setFormError(REGISTER_MESSAGES.server);
    } finally {
      registering = false;
      registerButton.disabled = false;
      registerButton.textContent = 'Tiếp tục';
    }
  }

  /* ---------- Khởi tạo ---------- */
  function init() {
    registerForm.addEventListener('submit', onRegisterSubmit);
    FIELD_ORDER.forEach((name) => {
      fieldInput(name).addEventListener('blur', () => {
        const input = fieldInput(name);
        // Chỉ báo lỗi khi người dùng đã nhập gì đó hoặc đã từng báo lỗi, tránh hiện lỗi ngay khi mới lướt qua ô.
        if ((input.type === 'checkbox' ? false : input.value !== '') || input.getAttribute('aria-invalid') === 'true') validateOneField(name);
      });
    });
    els.bestStart.textContent = String(loadBest());
    els.btnStart.addEventListener('click', startGame);
    els.btnAgain.addEventListener('click', startGame);
    els.grid.addEventListener('pointerdown', onPointerDown);
    els.grid.addEventListener('keydown', onKeyDown);
    cells.forEach((cell, i) => {
      cell.dataset.label = `Hàng ${Math.floor(i / CONFIG.GRID_SIZE) + 1}, cột ${(i % CONFIG.GRID_SIZE) + 1}`;
      cell.setAttribute('aria-label', cell.dataset.label);
    });
    els.grid.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.phase === 'playing') {
        if (advance(performance.now())) render();
      }
    });
    showScreen('register', false);                  // phải đăng ký xong mới sang màn hình bắt đầu (QT-13)
  }

  init();
})();
