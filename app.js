const STORAGE_KEY = 'gymlog_tracker_data_v1';

// Tiện ích định dạng ngày YYYY-MM-DD theo giờ địa phương
function toDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateParts(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m - 1, day: d }; // month: 0..11
}

function getMonthBounds(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return {
    firstDateStr: toDateStr(firstDay),
    lastDateStr: toDateStr(lastDay),
    daysInMonth: lastDay.getDate()
  };
}

function formatMonthYearLabel(year, month) {
  return `Tháng ${String(month + 1).padStart(2, '0')}/${year}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt);
}

function diffDays(startStr, currentStr) {
  if (!startStr || !currentStr) return null;
  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = currentStr.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

function getVietnameseWeekday(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return days[dt.getDay()];
}

function formatVNDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function uid() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
}

function createEmptyExercises(count = 4) {
  return Array.from({ length: count }, () => ({
    id: uid(),
    name: '',
    weight: '',
    sets: '',
    reps: '',
    restTime: ''
  }));
}

// Dữ liệu rỗng ban đầu (dữ liệu thật được tải từ Firestore)
function createDefaultState() {
  return {
    startDate: toDateStr(new Date()),
    days: []
  };
}

// Xóa bản lưu tạm cũ trên trình duyệt — Firestore là nguồn dữ liệu duy nhất
try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}

let state = createDefaultState();
let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth(); // 0-11
let hasUnsavedChanges = false;

// Tự động nhảy tới Tháng/Năm mới nhất có trong dữ liệu
function jumpToLatestMonth() {
  if (!state.days || state.days.length === 0) return;
  const sorted = [...state.days].sort((a, b) => a.date.localeCompare(b.date));
  const latestParts = parseDateParts(sorted[sorted.length - 1].date);
  if (latestParts) {
    currentCalYear = latestParts.year;
    currentCalMonth = latestParts.month;
  }
}
jumpToLatestMonth();

function saveState() {
  try {
    state.updatedAt = Date.now();
    markUnsavedChanges(true);
    scheduleCloudSave();
  } catch (e) {
    console.error('Lỗi lưu dữ liệu:', e);
  }
}

function formatTimeHMS(dateObj = new Date()) {
  const h = String(dateObj.getHours()).padStart(2, '0');
  const m = String(dateObj.getMinutes()).padStart(2, '0');
  const s = String(dateObj.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function markUnsavedChanges(isUnsaved, customMsg = '') {
  hasUnsavedChanges = isUnsaved;
  const badgeEl = document.getElementById('saveStateBadge');
  const btnMain = document.getElementById('btnSaveToDataFolder');
  const btnToolbar = document.getElementById('btnSaveTableToolbar');
  if (!badgeEl) return;

  if (isUnsaved) {
    badgeEl.className = 'save-state-badge unsaved';
    badgeEl.textContent = customMsg || '⚠️ Có thay đổi chưa lưu lên Firestore';
    if (btnMain) btnMain.classList.add('needs-save');
    if (btnToolbar) btnToolbar.classList.add('needs-save');
  } else {
    badgeEl.className = 'save-state-badge saved';
    badgeEl.textContent = customMsg || `☁️ Đã lưu lên Firestore (${formatTimeHMS()})`;
    if (btnMain) btnMain.classList.remove('needs-save');
    if (btnToolbar) btnToolbar.classList.remove('needs-save');
  }
}

// Lọc danh sách các ngày thuộc đúng Tháng & Năm chỉ định
function getDaysOfMonth(year, month) {
  return state.days
    .filter(d => {
      const parts = parseDateParts(d.date);
      return parts && parts.year === year && parts.month === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Chuyển sang Tháng + Năm khác (chú ý tự động lùi/tăng năm khi qua Tháng 1 hoặc Tháng 12)
function setActiveMonthYear(year, month) {
  let y = Number(year);
  let m = Number(month);
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  currentCalYear = y;
  currentCalMonth = m;
  renderAll();
}

// DOM Elements
const journeyStartDateEl = document.getElementById('journeyStartDate');
const journeyDaysBadgeEl = document.getElementById('journeyDaysBadge');
const statTotalDaysEl = document.getElementById('statTotalDays');
const statWorkoutDaysEl = document.getElementById('statWorkoutDays');
const statRestDaysEl = document.getElementById('statRestDays');
const statTotalExercisesEl = document.getElementById('statTotalExercises');

const calendarGridEl = document.getElementById('calendarGrid');
const currentMonthLabelEl = document.getElementById('currentMonthLabel');
const calendarWrapperEl = document.getElementById('calendarWrapper');
const btnToggleCalendar = document.getElementById('btnToggleCalendar');

const monthTabsListEl = document.getElementById('monthTabsList');
const selectTableMonthEl = document.getElementById('selectTableMonth');
const inputTableYearEl = document.getElementById('inputTableYear');
const monthlyBannerStatsEl = document.getElementById('monthlyBannerStats');
const thMonthYearHintEl = document.getElementById('thMonthYearHint');

const gymTableBodyEl = document.getElementById('gymTableBody');
const filterStatusEl = document.getElementById('filterStatus');
const sortOrderEl = document.getElementById('sortOrder');
const searchInputEl = document.getElementById('searchInput');

// Cập nhật Header & Thống kê toàn hành trình
function renderStatsAndHeader() {
  journeyStartDateEl.value = state.startDate || '';
  const todayStr = toDateStr(new Date());
  const offsetFromStart = diffDays(state.startDate, todayStr);
  if (offsetFromStart !== null && offsetFromStart >= 0) {
    journeyDaysBadgeEl.textContent = `Hành trình: Ngày thứ ${offsetFromStart + 1}`;
  } else if (offsetFromStart !== null && offsetFromStart < 0) {
    journeyDaysBadgeEl.textContent = `Bắt đầu sau ${Math.abs(offsetFromStart)} ngày`;
  } else {
    journeyDaysBadgeEl.textContent = 'Chưa chọn ngày';
  }

  const totalDays = state.days.length;
  const workoutDays = state.days.filter(d => d.status === 'workout').length;
  const restDays = state.days.filter(d => d.status === 'rest').length;
  let totalExercises = 0;
  state.days.forEach(d => {
    if (d.status === 'workout' && Array.isArray(d.exercises)) {
      totalExercises += d.exercises.filter(ex => ex.name && ex.name.trim() !== '').length;
    }
  });

  statTotalDaysEl.textContent = totalDays;
  statWorkoutDaysEl.textContent = workoutDays;
  statRestDaysEl.textContent = restDays;
  statTotalExercisesEl.textContent = totalExercises;
}

// Render các thẻ (Tabs) Tháng/Năm để nhảy nhanh giữa các bảng tháng
function renderMonthTabsAndBanner() {
  selectTableMonthEl.value = String(currentCalMonth);
  inputTableYearEl.value = String(currentCalYear);
  const myLabel = formatMonthYearLabel(currentCalYear, currentCalMonth);
  thMonthYearHintEl.textContent = `(${myLabel})`;

  // Tập hợp tất cả cặp YYYY-MM đã có dữ liệu + tháng đang mở
  const monthMap = new Map();
  const activeKey = `${currentCalYear}-${String(currentCalMonth + 1).padStart(2, '0')}`;
  monthMap.set(activeKey, { year: currentCalYear, month: currentCalMonth, count: 0 });

  state.days.forEach(d => {
    const p = parseDateParts(d.date);
    if (!p) return;
    const key = `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { year: p.year, month: p.month, count: 0 });
    }
    monthMap.get(key).count += 1;
  });

  const sortedKeys = Array.from(monthMap.keys()).sort();
  monthTabsListEl.innerHTML = '';
  sortedKeys.forEach(key => {
    const info = monthMap.get(key);
    const btn = document.createElement('button');
    btn.className = 'month-tab-btn';
    if (info.year === currentCalYear && info.month === currentCalMonth) {
      btn.classList.add('active');
    }
    btn.textContent = `Tháng ${String(info.month + 1).padStart(2, '0')}/${info.year} (${info.count} ngày)`;
    btn.addEventListener('click', () => {
      setActiveMonthYear(info.year, info.month);
    });
    monthTabsListEl.appendChild(btn);
  });

  // Thống kê riêng của Tháng/Năm đang mở
  const monthDays = getDaysOfMonth(currentCalYear, currentCalMonth);
  const { daysInMonth } = getMonthBounds(currentCalYear, currentCalMonth);
  const mWorkouts = monthDays.filter(d => d.status === 'workout').length;
  const mRests = monthDays.filter(d => d.status === 'rest').length;
  let mExercises = 0;
  monthDays.forEach(d => {
    if (d.status === 'workout' && Array.isArray(d.exercises)) {
      mExercises += d.exercises.filter(ex => ex.name && ex.name.trim() !== '').length;
    }
  });

  monthlyBannerStatsEl.innerHTML = `
    <span class="month-stat-pill">📅 Đã ghi: ${monthDays.length}/${daysInMonth} ngày</span>
    <span class="month-stat-pill">💪 Tập: ${mWorkouts} buổi</span>
    <span class="month-stat-pill">🛌 Nghỉ: ${mRests} ngày</span>
    <span class="month-stat-pill">🔥 Bài tập: ${mExercises}</span>
  `;
}

// Render Lịch Tháng
function renderCalendar() {
  currentMonthLabelEl.textContent = `Tháng ${currentCalMonth + 1}, ${currentCalYear}`;
  calendarGridEl.innerHTML = '';

  const firstDayOfMonth = new Date(currentCalYear, currentCalMonth, 1);
  const lastDayOfMonth = new Date(currentCalYear, currentCalMonth + 1, 0);

  let startOffset = firstDayOfMonth.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const daysInMonth = lastDayOfMonth.getDate();
  const prevMonthLastDay = new Date(currentCalYear, currentCalMonth, 0).getDate();

  const dayMap = new Map();
  state.days.forEach(d => {
    dayMap.set(d.date, d);
  });

  const todayStr = toDateStr(new Date());
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let cellYear = currentCalYear;
    let cellMonth = currentCalMonth;
    let cellDayNum = 0;
    let isOtherMonth = false;

    if (i < startOffset) {
      isOtherMonth = true;
      cellDayNum = prevMonthLastDay - startOffset + 1 + i;
      const dObj = new Date(currentCalYear, currentCalMonth - 1, cellDayNum);
      cellYear = dObj.getFullYear();
      cellMonth = dObj.getMonth();
    } else if (i >= startOffset + daysInMonth) {
      isOtherMonth = true;
      cellDayNum = i - (startOffset + daysInMonth) + 1;
      const dObj = new Date(currentCalYear, currentCalMonth + 1, cellDayNum);
      cellYear = dObj.getFullYear();
      cellMonth = dObj.getMonth();
    } else {
      cellDayNum = i - startOffset + 1;
    }

    const dateStr = toDateStr(new Date(cellYear, cellMonth, cellDayNum));
    const record = dayMap.get(dateStr);
    const isStart = state.startDate === dateStr;
    const isToday = todayStr === dateStr;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (isOtherMonth) cell.classList.add('other-month');
    if (isToday) cell.classList.add('is-today');
    if (record) {
      cell.classList.add(record.status === 'workout' ? 'status-workout' : 'status-rest');
    }

    const topRow = document.createElement('div');
    topRow.className = 'cal-day-top';

    const numSpan = document.createElement('span');
    numSpan.className = 'cal-date-num';
    numSpan.textContent = isOtherMonth ? `${cellDayNum}/${cellMonth + 1}` : cellDayNum;
    topRow.appendChild(numSpan);

    if (isStart) {
      const startFlag = document.createElement('span');
      startFlag.className = 'cal-start-flag';
      startFlag.textContent = 'Bắt đầu';
      topRow.appendChild(startFlag);
    }

    cell.appendChild(topRow);

    const bottomRow = document.createElement('div');
    if (record) {
      const badge = document.createElement('div');
      badge.className = 'cal-status-badge';
      if (record.status === 'workout') {
        const filledCount = (record.exercises || []).filter(e => e.name.trim() !== '').length;
        badge.textContent = `🏋️ Tập (${filledCount} bài)`;
      } else {
        badge.textContent = '🛌 Ngày nghỉ';
      }
      bottomRow.appendChild(badge);

      if (record.status === 'workout') {
        const previewNames = (record.exercises || [])
          .map(e => e.name.trim())
          .filter(Boolean)
          .join(', ');
        if (previewNames) {
          const preview = document.createElement('div');
          preview.className = 'cal-exercises-preview';
          preview.textContent = previewNames;
          bottomRow.appendChild(preview);
        }
      } else if (record.restNote) {
        const preview = document.createElement('div');
        preview.className = 'cal-exercises-preview';
        preview.textContent = record.restNote;
        bottomRow.appendChild(preview);
      }
    }

    cell.appendChild(bottomRow);

    cell.addEventListener('click', () => {
      handleCalendarDayClick(dateStr, cellYear, cellMonth);
    });

    calendarGridEl.appendChild(cell);
  }
}

// Khi bấm vào 1 ngày trên Lịch: Nếu ngày đó thuộc tháng khác thì chuyển hẳn sang bảng của tháng đó!
function handleCalendarDayClick(dateStr, targetYear, targetMonth) {
  if (targetYear !== currentCalYear || targetMonth !== currentCalMonth) {
    currentCalYear = targetYear;
    currentCalMonth = targetMonth;
  }

  let existing = state.days.find(d => d.date === dateStr);
  if (!existing) {
    existing = {
      id: uid(),
      date: dateStr,
      status: 'workout',
      restNote: '',
      exercises: createEmptyExercises(4)
    };
    state.days.push(existing);
    saveState();
  }

  renderAll();

  const rowEl = document.querySelector(`tr[data-day-id="${existing.id}"]`);
  if (rowEl) {
    rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rowEl.classList.remove('day-highlight');
    void rowEl.offsetWidth;
    rowEl.classList.add('day-highlight');
  }
}

// Render Bảng Nhật Ký Tập Luyện Chi Tiết: CHỈ HIỂN THỊ CÁC NGÀY TRONG THÁNG & NĂM ĐANG XEM
function renderTable() {
  gymTableBodyEl.innerHTML = '';

  // Chỉ lấy đúng các ngày của Tháng & Năm hiện tại (2 tháng không bao giờ chung 1 bảng)
  const monthDaysAsc = getDaysOfMonth(currentCalYear, currentCalMonth);
  const sttMap = new Map();
  monthDaysAsc.forEach((d, idx) => {
    sttMap.set(d.id, idx + 1); // STT đánh từ 1..N riêng cho từng bảng tháng
  });

  const statusFilter = filterStatusEl.value;
  const sortOrder = sortOrderEl.value;
  const keyword = searchInputEl.value.trim().toLowerCase();

  let displayDays = [...monthDaysAsc];
  if (sortOrder === 'desc') {
    displayDays.reverse();
  }

  displayDays = displayDays.filter(day => {
    if (statusFilter !== 'all' && day.status !== statusFilter) return false;
    if (keyword) {
      const dateMatch = day.date.includes(keyword) || formatVNDate(day.date).includes(keyword);
      const restMatch = (day.restNote || '').toLowerCase().includes(keyword);
      const exMatch = (day.exercises || []).some(ex =>
        (ex.name || '').toLowerCase().includes(keyword) ||
        (ex.weight || '').toLowerCase().includes(keyword)
      );
      return dateMatch || restMatch || exMatch;
    }
    return true;
  });

  const myLabel = formatMonthYearLabel(currentCalYear, currentCalMonth);

  if (displayDays.length === 0) {
    const emptyTr = document.createElement('tr');
    emptyTr.innerHTML = `
      <td colspan="9" style="text-align:center; padding: 32px; color: #64748b;">
        Bảng <strong>${myLabel}</strong> hiện chưa có ngày nào được ghi.<br/>
        Hãy nhấn <strong>"+ Thêm Ngày Tập / Nghỉ (Trong tháng này)"</strong> hoặc nút <strong>"⚡ Tạo đủ ngày trong tháng"</strong>!
      </td>
    `;
    gymTableBodyEl.appendChild(emptyTr);
    return;
  }

  displayDays.forEach(day => {
    const stt = sttMap.get(day.id);
    const isWorkout = day.status === 'workout';

    if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
      day.exercises = createEmptyExercises(4);
    }

    const rowSpanCount = isWorkout ? day.exercises.length : 1;
    const dayOffset = diffDays(state.startDate, day.date);
    let offsetTagHtml = '';
    if (dayOffset !== null && dayOffset >= 0) {
      offsetTagHtml = `<span class="day-offset-tag" title="Tính từ ngày bắt đầu">Ngày thứ ${dayOffset + 1}</span>`;
    }

    if (isWorkout) {
      day.exercises.forEach((ex, exIndex) => {
        const tr = document.createElement('tr');
        if (exIndex === 0) {
          tr.classList.add('day-first-row');
          tr.dataset.dayId = day.id;

          const tdStt = createSttCell(stt, rowSpanCount);
          const tdDate = createDateCell(day, rowSpanCount, offsetTagHtml);
          const tdStatus = createStatusCell(day, rowSpanCount);

          tr.appendChild(tdStt);
          tr.appendChild(tdDate);
          tr.appendChild(tdStatus);
        }

        tr.appendChild(createExerciseNameCell(day, ex, exIndex));
        tr.appendChild(createExerciseInputCell(day, ex, 'weight', 'VD: 40 kg', true));
        tr.appendChild(createExerciseInputCell(day, ex, 'sets', 'VD: 4', true));
        tr.appendChild(createExerciseInputCell(day, ex, 'reps', 'VD: 10 - 12', true));
        tr.appendChild(createExerciseInputCell(day, ex, 'restTime', 'VD: 90 giây', true));
        tr.appendChild(createExerciseActionsCell(day, exIndex));

        gymTableBodyEl.appendChild(tr);
      });
    } else {
      const tr = document.createElement('tr');
      tr.classList.add('day-first-row');
      tr.dataset.dayId = day.id;

      tr.appendChild(createSttCell(stt, 1));
      tr.appendChild(createDateCell(day, 1, offsetTagHtml));
      tr.appendChild(createStatusCell(day, 1));

      const tdRestMerged = document.createElement('td');
      tdRestMerged.colSpan = 5;
      tdRestMerged.className = 'rest-day-merged';

      const wrap = document.createElement('div');
      wrap.className = 'rest-note-wrap';
      wrap.innerHTML = `<span>🛌 Ngày nghỉ ngơi / Phục hồi:</span>`;

      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'rest-note-input';
      noteInput.placeholder = 'Ghi chú ngày nghỉ (VD: Nghỉ phục hồi cơ, đi bộ nhẹ, giãn cơ...)';
      noteInput.value = day.restNote || '';
      noteInput.addEventListener('input', (e) => {
        day.restNote = e.target.value;
        saveState();
        renderCalendar();
      });

      wrap.appendChild(noteInput);
      tdRestMerged.appendChild(wrap);
      tr.appendChild(tdRestMerged);

      const tdAction = document.createElement('td');
      tdAction.style.textAlign = 'center';
      tdAction.style.background = '#fffbeb';
      const delDayBtn = document.createElement('button');
      delDayBtn.className = 'btn-row-action';
      delDayBtn.title = 'Xóa ngày này';
      delDayBtn.textContent = '🗑️';
      delDayBtn.addEventListener('click', () => deleteDay(day.id));
      tdAction.appendChild(delDayBtn);
      tr.appendChild(tdAction);

      gymTableBodyEl.appendChild(tr);
    }
  });
}

function createSttCell(stt, rowSpan) {
  const td = document.createElement('td');
  td.className = 'cell-stt';
  td.rowSpan = rowSpan;
  td.textContent = stt;
  return td;
}

function createDateCell(day, rowSpan, offsetTagHtml) {
  const td = document.createElement('td');
  td.className = 'cell-date';
  td.rowSpan = rowSpan;

  const wrapper = document.createElement('div');
  wrapper.className = 'date-wrapper';

  // Khoá phạm vi chọn ngày nằm trong đúng Tháng & Năm của bảng đang mở
  const { firstDateStr, lastDateStr } = getMonthBounds(currentCalYear, currentCalMonth);

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'input-date';
  dateInput.min = firstDateStr;
  dateInput.max = lastDateStr;
  dateInput.value = day.date;
  dateInput.addEventListener('change', (e) => {
    if (!e.target.value) return;
    const newParts = parseDateParts(e.target.value);
    day.date = e.target.value;
    saveState();
    // Nếu người dùng gõ ngày thuộc tháng/năm khác thì tự chuyển sang bảng của tháng/năm đó
    if (newParts && (newParts.year !== currentCalYear || newParts.month !== currentCalMonth)) {
      alert(`Ngày ${formatVNDate(day.date)} thuộc ${formatMonthYearLabel(newParts.year, newParts.month)}. Hệ thống sẽ chuyển sang bảng của tháng đó!`);
      setActiveMonthYear(newParts.year, newParts.month);
      return;
    }
    renderAll();
  });

  const subRow = document.createElement('div');
  subRow.className = 'weekday-label';
  subRow.innerHTML = `<span>${getVietnameseWeekday(day.date)}</span> ${offsetTagHtml}`;

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-delete-day';
  delBtn.textContent = 'Xóa ngày này';
  delBtn.addEventListener('click', () => deleteDay(day.id));

  wrapper.appendChild(dateInput);
  wrapper.appendChild(subRow);
  wrapper.appendChild(delBtn);
  td.appendChild(wrapper);
  return td;
}

function createStatusCell(day, rowSpan) {
  const td = document.createElement('td');
  td.className = `cell-status ${day.status === 'workout' ? 'is-workout' : 'is-rest'}`;
  td.rowSpan = rowSpan;

  const select = document.createElement('select');
  select.className = `status-select ${day.status}`;
  select.innerHTML = `
    <option value="workout" ${day.status === 'workout' ? 'selected' : ''}>🏋️ Ngày tập</option>
    <option value="rest" ${day.status === 'rest' ? 'selected' : ''}>🛌 Ngày nghỉ</option>
  `;
  select.addEventListener('change', (e) => {
    day.status = e.target.value;
    if (day.status === 'workout' && (!day.exercises || day.exercises.length === 0)) {
      day.exercises = createEmptyExercises(4);
    }
    saveState();
    renderAll();
  });

  td.appendChild(select);

  if (day.status === 'workout') {
    const addExBtn = document.createElement('button');
    addExBtn.className = 'btn-add-exercise-inline';
    addExBtn.textContent = '+ Thêm ô bài tập';
    addExBtn.addEventListener('click', () => {
      day.exercises.push({
        id: uid(),
        name: '',
        weight: '',
        sets: '',
        reps: '',
        restTime: ''
      });
      saveState();
      renderAll();
    });
    td.appendChild(addExBtn);
  }

  return td;
}

function createExerciseNameCell(day, ex, exIndex) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'exercise-cell-wrap';

  const badge = document.createElement('span');
  badge.className = 'exercise-index-badge';
  badge.textContent = exIndex + 1;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-input';
  input.setAttribute('list', 'exerciseSuggestions');
  input.placeholder = `Nhập bài tập số ${exIndex + 1}...`;
  input.value = ex.name || '';
  input.addEventListener('input', (e) => {
    ex.name = e.target.value;
    saveState();
    renderStatsAndHeader();
    renderMonthTabsAndBanner();
    renderCalendar();
  });

  wrap.appendChild(badge);
  wrap.appendChild(input);
  td.appendChild(wrap);
  return td;
}

function createExerciseInputCell(day, ex, field, placeholder, isCentered = false) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `cell-input ${isCentered ? 'num-input' : ''}`;
  input.placeholder = placeholder;
  input.value = ex[field] || '';
  input.addEventListener('input', (e) => {
    ex[field] = e.target.value;
    saveState();
  });
  td.appendChild(input);
  return td;
}

function createExerciseActionsCell(day, exIndex) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'action-btns';

  const btnAddBelow = document.createElement('button');
  btnAddBelow.className = 'btn-row-action';
  btnAddBelow.title = 'Chèn thêm 1 ô bài tập ngay bên dưới';
  btnAddBelow.textContent = '➕';
  btnAddBelow.addEventListener('click', () => {
    day.exercises.splice(exIndex + 1, 0, {
      id: uid(),
      name: '',
      weight: '',
      sets: '',
      reps: '',
      restTime: ''
    });
    saveState();
    renderAll();
  });

  const btnRemove = document.createElement('button');
  btnRemove.className = 'btn-row-action';
  btnRemove.title = 'Xóa hàng bài tập này';
  btnRemove.textContent = '✕';
  btnRemove.addEventListener('click', () => {
    if (day.exercises.length <= 1) {
      day.exercises[0] = { id: uid(), name: '', weight: '', sets: '', reps: '', restTime: '' };
    } else {
      day.exercises.splice(exIndex, 1);
    }
    saveState();
    renderAll();
  });

  wrap.appendChild(btnAddBelow);
  wrap.appendChild(btnRemove);
  td.appendChild(wrap);
  return td;
}

function deleteDay(dayId) {
  const target = state.days.find(d => d.id === dayId);
  if (!target) return;
  if (!confirm(`Bạn có chắc muốn xóa dữ liệu ngày ${formatVNDate(target.date)} không?`)) return;
  state.days = state.days.filter(d => d.id !== dayId);
  saveState();
  renderAll();
}

function renderAll() {
  renderStatsAndHeader();
  renderMonthTabsAndBanner();
  renderCalendar();
  renderTable();
}

// SỰ KIỆN TƯƠNG TÁC ĐIỀU HƯỚNG THÁNG & NĂM (ĐỒNG BỘ CẢ LỊCH VÀ BẢNG)
journeyStartDateEl.addEventListener('change', (e) => {
  state.startDate = e.target.value;
  saveState();
  renderAll();
});

document.getElementById('btnPrevMonth').addEventListener('click', () => {
  setActiveMonthYear(currentCalYear, currentCalMonth - 1);
});

document.getElementById('btnNextMonth').addEventListener('click', () => {
  setActiveMonthYear(currentCalYear, currentCalMonth + 1);
});

document.getElementById('btnTablePrevMonth').addEventListener('click', () => {
  setActiveMonthYear(currentCalYear, currentCalMonth - 1);
});

document.getElementById('btnTableNextMonth').addEventListener('click', () => {
  setActiveMonthYear(currentCalYear, currentCalMonth + 1);
});

selectTableMonthEl.addEventListener('change', (e) => {
  setActiveMonthYear(currentCalYear, Number(e.target.value));
});

inputTableYearEl.addEventListener('change', (e) => {
  const yr = parseInt(e.target.value, 10);
  if (!isNaN(yr) && yr >= 2000 && yr <= 2100) {
    setActiveMonthYear(yr, currentCalMonth);
  } else {
    inputTableYearEl.value = String(currentCalYear);
  }
});

document.getElementById('btnToday').addEventListener('click', () => {
  const now = new Date();
  setActiveMonthYear(now.getFullYear(), now.getMonth());
});

btnToggleCalendar.addEventListener('click', () => {
  const isCollapsed = calendarWrapperEl.classList.toggle('collapsed');
  btnToggleCalendar.textContent = isCollapsed ? 'Mở rộng lịch' : 'Thu gọn lịch';
});

// Chuyển sang bảng tháng tiếp theo và tạo ngày đầu tháng mới nếu chưa có
function advanceToNextMonthTable() {
  let nextMonth = currentCalMonth + 1;
  let nextYear = currentCalYear;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }

  currentCalYear = nextYear;
  currentCalMonth = nextMonth;

  const nextMonthDays = getDaysOfMonth(nextYear, nextMonth);
  let targetDay = nextMonthDays[0];
  if (!targetDay) {
    const { firstDateStr } = getMonthBounds(nextYear, nextMonth);
    targetDay = {
      id: uid(),
      date: firstDateStr,
      status: 'workout',
      restNote: '',
      exercises: createEmptyExercises(4)
    };
    state.days.push(targetDay);
    saveState();
  }

  renderAll();
  const rowEl = document.querySelector(`tr[data-day-id="${targetDay.id}"]`);
  if (rowEl) {
    rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rowEl.classList.add('day-highlight');
  }
}

// NÚT "+ THÊM NGÀY TẬP / NGHỈ (TRONG THÁNG NÀY)"
document.getElementById('btnAddDay').addEventListener('click', () => {
  const monthDays = getDaysOfMonth(currentCalYear, currentCalMonth);
  const { firstDateStr, lastDateStr } = getMonthBounds(currentCalYear, currentCalMonth);
  const myLabel = formatMonthYearLabel(currentCalYear, currentCalMonth);

  let nextDateStr = firstDateStr;

  if (monthDays.length === 0) {
    // Nếu tháng này chưa có ngày nào: nếu Ngày bắt đầu nằm trong tháng này thì lấy Ngày bắt đầu, ngược lại lấy mùng 1 đầu tháng
    const startParts = parseDateParts(state.startDate);
    if (startParts && startParts.year === currentCalYear && startParts.month === currentCalMonth) {
      nextDateStr = state.startDate;
    } else {
      nextDateStr = firstDateStr;
    }
  } else {
    const lastDayInMonth = monthDays[monthDays.length - 1].date;
    if (lastDayInMonth < lastDateStr) {
      // Vẫn còn ngày tiếp theo trong tháng hiện tại
      nextDateStr = addDays(lastDayInMonth, 1);
    } else {
      // Đã chạm ngày cuối cùng của tháng hiện tại -> Tháng nào hết tháng đó, chuyển sang tháng sau!
      let nextM = currentCalMonth + 1;
      let nextY = currentCalYear;
      if (nextM > 11) {
        nextM = 0;
        nextY += 1;
      }
      const nextLabel = formatMonthYearLabel(nextY, nextM);
      const ok = confirm(
        `Bảng ${myLabel} đã đến ngày cuối cùng của tháng (${formatVNDate(lastDateStr)}).\n\n` +
        `Tháng nào hết tháng đó — bạn có muốn chuyển sang bảng mới của ${nextLabel} (bắt đầu từ ngày 01/${String(nextM + 1).padStart(2, '0')}/${nextY}) không?`
      );
      if (ok) {
        advanceToNextMonthTable();
      }
      return;
    }
  }

  const newDay = {
    id: uid(),
    date: nextDateStr,
    status: 'workout',
    restNote: '',
    exercises: createEmptyExercises(4)
  };
  state.days.push(newDay);
  saveState();
  renderAll();

  const rowEl = document.querySelector(`tr[data-day-id="${newDay.id}"]`);
  if (rowEl) {
    rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rowEl.classList.add('day-highlight');
  }
});

// NÚT "⏭️ HẾT THÁNG NÀY → SANG THÁNG SAU"
document.getElementById('btnFinishMonthNext').addEventListener('click', () => {
  advanceToNextMonthTable();
});

filterStatusEl.addEventListener('change', renderTable);
sortOrderEl.addEventListener('change', renderTable);
searchInputEl.addEventListener('input', renderTable);

// MODAL TẠO ĐỦ CÁC NGÀY TRONG THÁNG ĐANG XEM (KHÔNG TRÀN SANG THÁNG SAU)
const modalGenerate = document.getElementById('modalGenerate');
const modalGenTitleEl = document.getElementById('modalGenTitle');
const genFromDateEl = document.getElementById('genFromDate');
const genToDateEl = document.getElementById('genToDate');
const genDefaultRowsEl = document.getElementById('genDefaultRows');

document.getElementById('btnGenerateRange').addEventListener('click', () => {
  const { firstDateStr, lastDateStr } = getMonthBounds(currentCalYear, currentCalMonth);
  const monthDays = getDaysOfMonth(currentCalYear, currentCalMonth);
  const myLabel = formatMonthYearLabel(currentCalYear, currentCalMonth);

  modalGenTitleEl.textContent = `⚡ Tạo các ngày trong ${myLabel}`;

  let defaultFrom = firstDateStr;
  if (monthDays.length > 0) {
    const lastInMonth = monthDays[monthDays.length - 1].date;
    defaultFrom = lastInMonth < lastDateStr ? addDays(lastInMonth, 1) : firstDateStr;
  } else {
    const startParts = parseDateParts(state.startDate);
    if (startParts && startParts.year === currentCalYear && startParts.month === currentCalMonth) {
      defaultFrom = state.startDate;
    }
  }

  genFromDateEl.min = firstDateStr;
  genFromDateEl.max = lastDateStr;
  genFromDateEl.value = defaultFrom;

  genToDateEl.min = firstDateStr;
  genToDateEl.max = lastDateStr;
  genToDateEl.value = lastDateStr;

  modalGenerate.classList.remove('hidden');
});

document.getElementById('btnCancelModal').addEventListener('click', () => {
  modalGenerate.classList.add('hidden');
});

document.getElementById('btnConfirmGenerate').addEventListener('click', () => {
  const { firstDateStr, lastDateStr } = getMonthBounds(currentCalYear, currentCalMonth);
  let fromDate = genFromDateEl.value;
  let toDate = genToDateEl.value;
  const numRows = Math.min(15, Math.max(1, parseInt(genDefaultRowsEl.value, 10) || 4));

  if (!fromDate || !toDate) return;
  // Ép chặt trong phạm vi của tháng đang mở (không bao giờ tràn sang tháng khác)
  if (fromDate < firstDateStr) fromDate = firstDateStr;
  if (toDate > lastDateStr) toDate = lastDateStr;
  if (fromDate > toDate) {
    alert('Ngày bắt đầu tạo phải nhỏ hơn hoặc bằng ngày kết thúc trong tháng!');
    return;
  }

  const existingDates = new Set(state.days.map(d => d.date));
  let cur = fromDate;
  while (cur <= toDate) {
    if (!existingDates.has(cur)) {
      state.days.push({
        id: uid(),
        date: cur,
        status: 'workout',
        restNote: '',
        exercises: createEmptyExercises(numRows)
      });
      existingDates.add(cur);
    }
    cur = addDays(cur, 1);
  }

  saveState();
  modalGenerate.classList.add('hidden');
  renderAll();
});

// XUẤT CSV (Mở bằng Excel có tiếng Việt — Tách rõ từng Bảng Tháng/Năm)
document.getElementById('btnExportCSV').addEventListener('click', () => {
  const sortedAsc = [...state.days].sort((a, b) => a.date.localeCompare(b.date));
  const rows = [
    ['Ngày bắt đầu hành trình:', formatVNDate(state.startDate)],
    []
  ];

  // Nhóm theo từng Tháng/Năm
  const groups = new Map();
  sortedAsc.forEach(d => {
    const p = parseDateParts(d.date);
    if (!p) return;
    const key = `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
    if (!groups.has(key)) {
      groups.set(key, { year: p.year, month: p.month, days: [] });
    }
    groups.get(key).days.push(d);
  });

  groups.forEach((grp) => {
    rows.push([`=== BẢNG LỊCH TẬP ${formatMonthYearLabel(grp.year, grp.month).toUpperCase()} ===`]);
    rows.push(['STT Trong Tháng', 'Ngày tháng năm', 'Thứ', 'Trạng thái', 'STT Bài', 'Tên bài tập / Ghi chú nghỉ', 'Cân nặng tạ', 'Số hiệp (Sets)', 'Số lần/hiệp (Reps)', 'Nghỉ giữa hiệp']);

    grp.days.forEach((day, idx) => {
      const stt = idx + 1;
      const vnDate = formatVNDate(day.date);
      const weekday = getVietnameseWeekday(day.date);
      if (day.status === 'rest') {
        rows.push([stt, vnDate, weekday, 'Ngày nghỉ', '-', day.restNote || 'Nghỉ ngơi', '-', '-', '-', '-']);
      } else {
        const exList = day.exercises && day.exercises.length ? day.exercises : [{ name: '', weight: '', sets: '', reps: '', restTime: '' }];
        exList.forEach((ex, exIdx) => {
          rows.push([
            exIdx === 0 ? stt : '',
            exIdx === 0 ? vnDate : '',
            exIdx === 0 ? weekday : '',
            exIdx === 0 ? 'Ngày tập' : '',
            exIdx + 1,
            ex.name || '',
            ex.weight || '',
            ex.sets || '',
            ex.reps || '',
            ex.restTime || ''
          ]);
        });
      }
    });

    rows.push([]);
  });

  const csvContent = '\uFEFF' + rows.map(r =>
    r.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lich-su-tap-gym-${toDateStr(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// SAO LƯU & KHÔI PHỤC JSON
document.getElementById('btnBackupJSON').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gymlog-backup-${toDateStr(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('inputRestoreJSON').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported && Array.isArray(imported.days)) {
        // Chỉ giữ đúng các trường GymLog dùng (Firestore Rules từ chối trường lạ)
        state = {
          startDate: typeof imported.startDate === 'string' ? imported.startDate : toDateStr(new Date()),
          days: imported.days
        };
        saveState();
        renderAll();
        alert('Đã khôi phục dữ liệu lịch tập thành công!');
      } else {
        alert('File JSON không đúng định dạng.');
      }
    } catch (err) {
      alert('Không thể đọc file JSON.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// =========================================================================
// ĐỒNG BỘ DỮ LIỆU VỚI FIREBASE FIRESTORE (document gymlog/main)
// =========================================================================
const FIRESTORE_COLLECTION = 'gymlog';
const FIRESTORE_DOC_ID = 'main';
const CLOUD_SAVE_DELAY_MS = 1000; // Gom các lần gõ liên tiếp thành 1 lần ghi
const NO_FIREBASE_MSG = '⚠️ Chưa cấu hình Firebase (firebase-config.js) — thay đổi sẽ KHÔNG được lưu';
const LOAD_FAILED_MSG = '⚠️ Không kết nối được Firestore — thay đổi sẽ KHÔNG được lưu, hãy tải lại trang';

let dataDocRef = null;
let cloudSaveTimer = null;

function isFirebaseConfigured() {
  const cfg = window.FIREBASE_CONFIG;
  return !!(window.firebase && cfg && cfg.apiKey && cfg.projectId);
}

function getFirestoreDocRef() {
  if (!isFirebaseConfigured()) return null;
  try {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
    return app.firestore().collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID);
  } catch (e) {
    console.error('Lỗi khởi tạo Firebase:', e);
    return null;
  }
}

// Tự động lưu ngầm lên Firestore sau khi ngừng gõ
function scheduleCloudSave() {
  if (!dataDocRef) return saveToFirestore(); // Hiện cảnh báo chưa kết nối Firestore
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(saveToFirestore, CLOUD_SAVE_DELAY_MS);
}

// Hàm chính khi bấm "💾 LƯU DỮ LIỆU" (hoặc Ctrl + S)
async function saveToFirestore() {
  clearTimeout(cloudSaveTimer);

  if (!dataDocRef) {
    markUnsavedChanges(true, isFirebaseConfigured() ? LOAD_FAILED_MSG : NO_FIREBASE_MSG);
    return;
  }

  const savingVersion = state.updatedAt;
  try {
    await dataDocRef.set(JSON.parse(JSON.stringify(state)));
    // Chỉ báo "Đã lưu" nếu không có thay đổi mới phát sinh trong lúc đang ghi
    if (state.updatedAt === savingVersion) {
      markUnsavedChanges(false, `☁️ Đã lưu lên Firestore (${formatTimeHMS()})`);
    }
  } catch (e) {
    console.error('Lỗi lưu Firestore:', e);
    markUnsavedChanges(true, '⚠️ Lưu lên Firestore thất bại — bấm "💾 LƯU DỮ LIỆU" để thử lại');
  }
}

// Khi mở App: lấy dữ liệu từ Firestore
async function loadFromFirestore() {
  const ref = getFirestoreDocRef();
  if (!ref) {
    markUnsavedChanges(true, NO_FIREBASE_MSG);
    return;
  }

  // Khoá thao tác trong lúc tải để không bị dữ liệu từ Firestore ghi đè lên những gì vừa nhập
  document.body.classList.add('app-loading');
  markUnsavedChanges(false, '⏳ Đang tải dữ liệu từ Firestore...');
  try {
    const snap = await ref.get();
    dataDocRef = ref;
    const remote = snap.exists ? snap.data() : null;

    if (remote && Array.isArray(remote.days)) {
      state = remote;
      jumpToLatestMonth();
      renderAll();
      markUnsavedChanges(false, `☁️ Đã tải dữ liệu từ Firestore (${formatTimeHMS()})`);
    } else {
      markUnsavedChanges(false, '☁️ Đã kết nối Firestore — chưa có dữ liệu, hãy thêm ngày tập đầu tiên');
    }
  } catch (e) {
    console.error('Lỗi đọc Firestore:', e);
    markUnsavedChanges(true, LOAD_FAILED_MSG);
  } finally {
    document.body.classList.remove('app-loading');
  }
}

// Cảnh báo khi đóng tab lúc còn thay đổi chưa lưu xong
window.addEventListener('beforeunload', (e) => {
  if (!hasUnsavedChanges || !dataDocRef) return;
  saveToFirestore();
  e.preventDefault();
  e.returnValue = '';
});

document.getElementById('btnSaveToDataFolder').addEventListener('click', saveToFirestore);
document.getElementById('btnSaveTableToolbar').addEventListener('click', saveToFirestore);

// Hỗ trợ phím tắt Ctrl + S để lưu nhanh lên Firestore
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveToFirestore();
  }
});

// Khởi chạy lần đầu (hiển thị ngay bản trên trình duyệt, rồi đồng bộ với Firestore)
renderAll();
loadFromFirestore();
