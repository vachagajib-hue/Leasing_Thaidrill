const API_URL = 'https://script.google.com/macros/s/AKfycbx724bp87IzARRIsyvx5VEPXR7UXL7GaZ5nH_rZxS-q4MDv5WMYFpM74vx2e_7rZ0cKUA/exec';

let allData = [];
let charts = {};
let chartsRendered = false;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    initFilterListeners();
    initTabSwitching();
    initSearchAndUI();
    initFilterDrawer();
    initModal();
    initSwitchToDesktop();
    initPDFModal();
});

// ===== FETCH DATA =====
async function fetchData() {
    const cardsContainer = document.getElementById('cardsContainer');
    if (cardsContainer) cardsContainer.innerHTML = '<div class="m-loading"><i class="fas fa-spinner fa-spin"></i><span>กำลังโหลดข้อมูลจาก Google Sheets...</span></div>';

    try {
        const response = await fetch(API_URL, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const rawResponse = await response.json();

        let dataArray = [];
        if (Array.isArray(rawResponse)) {
            dataArray = rawResponse;
        } else if (rawResponse && typeof rawResponse === 'object') {
            if (Array.isArray(rawResponse.data)) dataArray = rawResponse.data;
            else if (Array.isArray(rawResponse.records)) dataArray = rawResponse.records;
            else if (Array.isArray(rawResponse.result)) dataArray = rawResponse.result;
            else if (Array.isArray(rawResponse.rows)) dataArray = rawResponse.rows;
            else {
                const firstArrayKey = Object.keys(rawResponse).find(k => Array.isArray(rawResponse[k]));
                if (firstArrayKey) dataArray = rawResponse[firstArrayKey];
            }
        }

        if (dataArray.length === 0) {
            if (cardsContainer) cardsContainer.innerHTML = '<div class="m-empty"><i class="fas fa-folder-open"></i><span>ไม่พบข้อมูล</span></div>';
            return;
        }

        let processedData = dataArray.filter(item =>
            item && (typeof item === 'object' || Array.isArray(item)) &&
            Object.values(item).some(v => v !== "" && v !== null && v !== undefined)
        );

        if (processedData.length > 0 && Array.isArray(processedData[0])) {
            const headers = processedData[0];
            allData = processedData.slice(1).map(row => {
                let obj = {};
                headers.forEach((h, i) => obj[h] = row[i]);
                return obj;
            });
        } else {
            allData = processedData;
        }

        if (allData.length > 0) {
            allData.sort((a, b) => {
                const dateA = new Date(getAnyValue(a, ['กำหนดชำระ', 'dueDate', 'วันที่']));
                const dateB = new Date(getAnyValue(b, ['กำหนดชำระ', 'dueDate', 'วันที่']));
                return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
            });
            initFilterOptions(allData);
            updateDashboard(allData);

            const lastUpdated = document.getElementById('lastUpdated');
            if (lastUpdated) {
                const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                lastUpdated.innerHTML = `<i class="fas fa-circle"></i> <span>อัปเดตล่าสุด ${now} น.</span>`;
            }
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        if (cardsContainer) cardsContainer.innerHTML = `<div class="m-empty"><i class="fas fa-circle-exclamation"></i><span>เกิดข้อผิดพลาด: ${error.message}</span></div>`;
    }
}

// ===== HELPERS =====
function getAnyValue(item, searchTerms) {
    if (!item || typeof item !== 'object') return "";
    const keys = Object.keys(item);
    for (let term of searchTerms) {
        const foundKey = keys.find(k => k && k.toString().replace(/\s/g, '').toLowerCase().includes(term.toString().replace(/\s/g, '').toLowerCase()));
        if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null) return item[foundKey];
    }
    return "";
}

function cleanNumber(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const cleaned = val.toString().replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    const date = new Date(dateStr);
    return isNaN(date) ? dateStr : date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCompact(val) {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
    return val.toLocaleString();
}

function animateNumber(el, start, end, duration, isCurrency) {
    if (!el) return;
    let t0 = null;
    const step = (t) => {
        if (!t0) t0 = t;
        const p = Math.min((t - t0) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const v = start + ease * (end - start);
        el.textContent = isCurrency ? formatCompact(v) : Math.floor(v).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = isCurrency ? formatCompact(end) : end.toLocaleString();
    };
    requestAnimationFrame(step);
}

// ===== KPI =====
function updateKPIs(data) {
    let totalAmount = 0;
    const vehicles = new Set();
    data.forEach(item => {
        totalAmount += cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด', 'ชำระ', 'เงิน', 'sum']));
        const plate = getAnyValue(item, ['ทะเบียนรถ', 'plate', 'ทะเบียน']);
        if (plate && plate !== "" && plate !== "-") vehicles.add(plate);
    });

    const totalEl = document.getElementById('total-amount');
    const countEl = document.getElementById('total-count');
    const vehicleEl = document.getElementById('vehicle-count');

    if (totalEl) {
        const start = parseFloat(totalEl.dataset.cv) || 0;
        animateNumber(totalEl, start, totalAmount, 800, true);
        totalEl.dataset.cv = totalAmount;
    }
    if (countEl) {
        const start = parseInt(countEl.dataset.cv) || 0;
        animateNumber(countEl, start, data.length, 800, false);
        countEl.dataset.cv = data.length;
    }
    if (vehicleEl) {
        const start = parseInt(vehicleEl.dataset.cv) || 0;
        animateNumber(vehicleEl, start, vehicles.size, 800, false);
        vehicleEl.dataset.cv = vehicles.size;
    }
}

// ===== CARDS =====
function renderCards(data) {
    const container = document.getElementById('cardsContainer');
    if (!container) return;
    container.innerHTML = '';

    const countBadge = document.getElementById('cardCount');
    if (countBadge) countBadge.textContent = data.length.toLocaleString();

    if (data.length === 0) {
        container.innerHTML = '<div class="m-empty"><i class="fas fa-folder-open"></i><span>ไม่พบข้อมูลที่ตรงกับเงื่อนไข</span></div>';
        return;
    }

    const displayData = data.slice(0, 100);
    displayData.forEach((item) => {
        const dueDate    = getAnyValue(item, ['กำหนดชำระ', 'dueDate', 'วันที่']);
        const leasing    = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท']);
        const contract   = getAnyValue(item, ['เลขสัญญา', 'contract', 'สัญญา']);
        const plate      = getAnyValue(item, ['ทะเบียนรถ', 'plate', 'ทะเบียน']);
        const installment = getAnyValue(item, ['งวดที่', 'installment', 'งวด']);
        const status     = getAnyValue(item, ['สถานะ', 'status']);
        const amount     = getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ']);

        let statusClass = 'm-status-default';
        const sStr = (status || "").toString();
        if (sStr.includes('โอนเงิน') || sStr.includes('จ่ายแล้ว')) statusClass = 'm-status-paid';
        if (sStr.includes('ยังไม่ถึงกำหนด') || sStr.includes('รอ')) statusClass = 'm-status-pending';

        const card = document.createElement('div');
        card.className = 'm-card';
        card.innerHTML = `
            <div class="m-card-top">
                <div class="m-card-title">
                    <div class="m-card-plate">${plate || '-'}</div>
                    <div class="m-card-leasing">${leasing || '-'}</div>
                    <div class="m-card-contract">สัญญา: ${contract || '-'}</div>
                </div>
                <span class="m-status-badge ${statusClass}">${status || '-'}</span>
            </div>
            <div class="m-card-amount">
                <span class="m-amount-label">ค่างวดประจำ</span>
                <span class="m-amount-value">${cleanNumber(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="m-card-meta">
                <div class="m-meta-item">
                    <span class="m-meta-label">กำหนดชำระ</span>
                    <span class="m-meta-value">${formatDate(dueDate)}</span>
                </div>
                <div class="m-meta-item">
                    <span class="m-meta-label">งวดที่</span>
                    <span class="m-meta-value">${installment || '-'}</span>
                </div>
            </div>
        `;
        card.addEventListener('click', () => showDetailModal(item));
        container.appendChild(card);
    });
}

// ===== MODAL =====
function showDetailModal(item) {
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('modalBody');
    if (!modal || !body) return;

    const fields = [
        { label: 'ทะเบียนรถ', keys: ['ทะเบียนรถ', 'plate'] },
        { label: 'ชื่อลิสซิ่ง', keys: ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท'] },
        { label: 'เลขสัญญา', keys: ['เลขสัญญา', 'contract'] },
        { label: 'Air Code', keys: ['Air Code', 'airCode'] },
        { label: 'Cost Center', keys: ['Cost center', 'costCenter', 'CostCenter'] },
        { label: 'งวดที่', keys: ['งวดที่', 'installment'] },
        { label: 'กำหนดชำระ', keys: ['กำหนดชำระ', 'dueDate'], isDate: true },
        { label: 'สถานะ', keys: ['สถานะ', 'status'] },
        { label: 'ค่างวดประจำ', keys: ['ค่างวดประจำ', 'amount', 'ยอดเงิน'], isAmount: true },
        { label: 'รายละเอียด/หมายเหตุ', keys: ['รายละเอียด', 'description', 'หมายเหตุ'] }
    ];

    body.innerHTML = '';
    fields.forEach(f => {
        let val = getAnyValue(item, f.keys);
        if (f.isDate) val = formatDate(val);
        if (f.isAmount) val = cleanNumber(val).toLocaleString(undefined, { minimumFractionDigits: 2 });
        const div = document.createElement('div');
        div.className = 'm-detail-item';
        div.innerHTML = `<span class="m-detail-label">${f.label}</span><span class="m-detail-value">${val || '-'}</span>`;
        body.appendChild(div);
    });

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function initModal() {
    const modal = document.getElementById('detailModal');
    const closeBtn = document.getElementById('closeModal');
    const close = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

// ===== FILTERS =====
function initFilterOptions(data) {
    const years = new Set();
    const leasings = new Set();
    const statuses = new Set();

    data.forEach(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        if (!isNaN(d)) years.add(d.getFullYear());
        const lease = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing']);
        if (lease) leasings.add(lease);
        const status = getAnyValue(item, ['สถานะ', 'status']);
        if (status) statuses.add(status);
    });

    const populate = (id, set) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<option value="">ทั้งหมด</option>';
        Array.from(set).sort().forEach(v => el.innerHTML += `<option value="${v}">${v}</option>`);
    };

    populate('filter-year', years);

    const monthSelect = document.getElementById('filter-month');
    if (monthSelect) {
        monthSelect.innerHTML = '<option value="">ทั้งหมด</option>';
        ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'].forEach((n, i) => {
            monthSelect.innerHTML += `<option value="${i}">${n}</option>`;
        });
    }

    const dateSelect = document.getElementById('filter-date');
    if (dateSelect) {
        dateSelect.innerHTML = '<option value="">ทั้งหมด</option>';
        for (let i = 1; i <= 31; i++) dateSelect.innerHTML += `<option value="${i}">${i}</option>`;
    }
    populate('filter-leasing', leasings);
    populate('filter-status', statuses);
}

function initFilterListeners() {
    const filters = ['filter-year', 'filter-month', 'filter-date', 'filter-leasing', 'filter-status'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { applyFilters(); updateFilterIndicator(); });
    });
    const resetBtn = document.getElementById('reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            filters.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            applyFilters();
            updateFilterIndicator();
        });
    }
}

function updateFilterIndicator() {
    const filters = ['filter-year', 'filter-month', 'filter-date', 'filter-leasing', 'filter-status'];
    const hasActive = filters.some(id => {
        const el = document.getElementById(id);
        return el && el.value !== '';
    });
    const btn = document.getElementById('btnFilter');
    if (btn) btn.classList.toggle('active', hasActive);
}

function applyFilters() {
    const getVal = id => document.getElementById(id)?.value || '';
    const year = getVal('filter-year');
    const month = getVal('filter-month');
    const day = getVal('filter-date');
    const leasing = getVal('filter-leasing');
    const status = getVal('filter-status');
    const searchTerm = getVal('searchInput').toLowerCase();

    const filtered = allData.filter(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        const matchYear = !year || d.getFullYear().toString() === year;
        const matchMonth = !month || d.getMonth().toString() === month;
        const matchDay = !day || d.getDate().toString() === day;
        const matchLeasing = !leasing || getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing']) === leasing;
        const matchStatus = !status || getAnyValue(item, ['สถานะ', 'status']) === status;
        const matchSearch = !searchTerm || Object.values(item).some(v => v && v.toString().toLowerCase().includes(searchTerm));
        return matchYear && matchMonth && matchDay && matchLeasing && matchStatus && matchSearch;
    });
    updateDashboard(filtered);
}

function updateDashboard(data) {
    updateKPIs(data);
    renderCards(data);
    if (chartsRendered) renderCharts(data);
}

// ===== TABS =====
function initTabSwitching() {
    document.querySelectorAll('.m-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.m-tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById('tab-' + tab.dataset.tab);
            if (target) target.classList.add('active');

            // Lazy-load charts on first overview tab open
            if (tab.dataset.tab === 'overview' && !chartsRendered) {
                chartsRendered = true;
                renderCharts(getCurrentFilteredData());
            }
        });
    });
}

function getCurrentFilteredData() {
    const getVal = id => document.getElementById(id)?.value || '';
    const year = getVal('filter-year');
    const month = getVal('filter-month');
    const day = getVal('filter-date');
    const leasing = getVal('filter-leasing');
    const status = getVal('filter-status');
    const searchTerm = getVal('searchInput').toLowerCase();
    return allData.filter(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        const matchYear = !year || d.getFullYear().toString() === year;
        const matchMonth = !month || d.getMonth().toString() === month;
        const matchDay = !day || d.getDate().toString() === day;
        const matchLeasing = !leasing || getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing']) === leasing;
        const matchStatus = !status || getAnyValue(item, ['สถานะ', 'status']) === status;
        const matchSearch = !searchTerm || Object.values(item).some(v => v && v.toString().toLowerCase().includes(searchTerm));
        return matchYear && matchMonth && matchDay && matchLeasing && matchStatus && matchSearch;
    });
}

// ===== SEARCH + REFRESH =====
function initSearchAndUI() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', applyFilters);

    const refreshBtn = document.getElementById('btnRefresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            allData = [];
            chartsRendered = false;
            fetchData();
        });
    }
}

// ===== FILTER DRAWER =====
function initFilterDrawer() {
    const btn = document.getElementById('btnFilter');
    const drawer = document.getElementById('filterDrawer');
    const backdrop = document.getElementById('filterBackdrop');
    const closeBtn = document.getElementById('closeFilter');
    const applyBtn = document.getElementById('applyFilters');

    const open = () => {
        drawer.classList.add('active');
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    const close = () => {
        drawer.classList.remove('active');
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    };

    if (btn) btn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    if (applyBtn) applyBtn.addEventListener('click', close);
}

// ===== SWITCH TO DESKTOP =====
function initSwitchToDesktop() {
    const btn = document.getElementById('btnSwitchDesktop');
    if (btn) {
        btn.addEventListener('click', () => {
            localStorage.setItem('viewMode', 'desktop');
            window.location.replace('index.html');
        });
    }
}

// ===== PDF REPORT =====

// ===== PDF Calendar State =====
let selectedDates = new Set(); // keys: 'YYYY-MM-DD'
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based

function toDateKey(y, m, d) {
    return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function getDatesWithData() {
    const keys = new Set();
    allData.forEach(item => {
        const raw = getAnyValue(item, ['กำหนดชำระ', 'dueDate', 'วันที่']);
        const d = new Date(raw);
        if (!isNaN(d)) keys.add(toDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    });
    return keys;
}

function populateCalSelects() {
    const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                        'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const mSel = document.getElementById('calMonthSel');
    const ySel = document.getElementById('calYearSel');
    if (!mSel || !ySel) return;

    if (mSel.options.length === 0) {
        thaiMonths.forEach((m, i) => {
            const o = document.createElement('option'); o.value = i; o.textContent = m; mSel.appendChild(o);
        });
        for (let y = 2020; y <= 2035; y++) {
            const o = document.createElement('option'); o.value = y; o.textContent = y + 543; ySel.appendChild(o);
        }
        mSel.addEventListener('change', () => { calMonth = +mSel.value; renderPDFCalendar(); });
        ySel.addEventListener('change', () => { calYear  = +ySel.value; renderPDFCalendar(); });
    }
    mSel.value = calMonth;
    ySel.value = calYear;
}

function renderPDFCalendar() {
    const grid = document.getElementById('pdfCalGrid');
    if (!grid) return;
    populateCalSelects();

    const hasData   = getDatesWithData();
    const today     = new Date();
    const todayKey  = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

    const firstDay  = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<div class="m-cal-day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const key = toDateKey(calYear, calMonth, d);
        const cls = [
            'm-cal-day',
            hasData.has(key)      ? 'has-data'  : '',
            selectedDates.has(key) ? 'selected'  : '',
            key === todayKey       ? 'today'     : '',
        ].filter(Boolean).join(' ');
        html += `<div class="${cls}" data-key="${key}">${d}</div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.m-cal-day:not(.empty)').forEach(el => {
        el.addEventListener('click', () => {
            const k = el.dataset.key;
            if (selectedDates.has(k)) { selectedDates.delete(k); el.classList.remove('selected'); }
            else { selectedDates.add(k); el.classList.add('selected'); }
            updateCalBar();
        });
    });

    updateCalBar();
}

function updateCalBar() {
    const bar = document.getElementById('calSelectedBar');
    if (!bar) return;
    const count = selectedDates.size;
    bar.textContent = count === 0
        ? 'ยังไม่ได้เลือกวันที่'
        : `เลือกแล้ว ${count} วัน`;
    bar.style.color = count > 0 ? 'var(--accent)' : 'var(--text-dim)';
}

function initPDFModal() {
    const btnOpen   = document.getElementById('btnDailyPDF');
    const btnClose  = document.getElementById('closePdfModal');
    const overlay   = document.getElementById('pdfModal');
    const btnGen    = document.getElementById('btnGeneratePdf');
    const btnDl     = document.getElementById('btnDownloadPdf');
    const btnPrev   = document.getElementById('calPrev');
    const btnNext   = document.getElementById('calNext');
    const btnSelAll = document.getElementById('calSelAll');
    const btnClear  = document.getElementById('calClear');

    if (btnOpen)   btnOpen.addEventListener('click', openPDFModal);
    if (btnClose)  btnClose.addEventListener('click', closePDFModal);
    if (overlay)   overlay.addEventListener('click', (e) => { if (e.target === overlay) closePDFModal(); });
    if (btnGen)    btnGen.addEventListener('click', generatePDFPreview);
    if (btnDl)     btnDl.addEventListener('click', downloadDailyPDF);
    if (btnPrev)   btnPrev.addEventListener('click', () => {
        calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
        renderPDFCalendar();
    });
    if (btnNext)   btnNext.addEventListener('click', () => {
        calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
        renderPDFCalendar();
    });
    if (btnSelAll) btnSelAll.addEventListener('click', () => {
        const hasData = getDatesWithData();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const k = toDateKey(calYear, calMonth, d);
            if (hasData.has(k)) selectedDates.add(k);
        }
        renderPDFCalendar();
    });
    if (btnClear) btnClear.addEventListener('click', () => {
        selectedDates.clear();
        renderPDFCalendar();
    });
}

function openPDFModal() {
    const modal = document.getElementById('pdfModal');
    if (!modal) return;
    const today = new Date();
    calYear  = today.getFullYear();
    calMonth = today.getMonth();
    selectedDates.clear();
    document.getElementById('pdfPreviewArea').style.display = 'none';
    renderPDFCalendar();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePDFModal() {
    const modal = document.getElementById('pdfModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

function buildReportHTML(selectedDatesArr, dayData) {
    const printedAt = new Date().toLocaleString('th-TH');
    const dateStr = selectedDatesArr.length === 1
        ? selectedDatesArr[0].toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
        : selectedDatesArr.map(d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })).join(', ');

    let totalAmount = 0;
    dayData.forEach(item => {
        totalAmount += cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด']));
    });

    let tableRows = '';
    let paidCount = 0;
    dayData.forEach((item, i) => {
        const rawDue      = getAnyValue(item, ['กำหนดชำระ', 'dueDate', 'วันที่']) || '';
        const dueObj      = new Date(rawDue);
        const dateDisplay = !isNaN(dueObj) ? `${String(dueObj.getDate()).padStart(2,'0')}/${String(dueObj.getMonth()+1).padStart(2,'0')}/${dueObj.getFullYear()+543}` : (rawDue || '-');
        const plate       = getAnyValue(item, ['ทะเบียนรถ', 'plate', 'ทะเบียน']) || '-';
        const leasing     = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท']) || '-';
        const contract    = getAnyValue(item, ['เลขสัญญา', 'contract', 'สัญญา']) || '-';
        const installment = getAnyValue(item, ['งวดที่', 'installment', 'งวด']) || '-';
        const amount      = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ']));
        const status      = getAnyValue(item, ['สถานะ', 'status']) || '-';
        const isPaid      = status.includes('โอนเงิน') || status.includes('จ่ายแล้ว');
        if (isPaid) paidCount++;
        const sColor      = isPaid ? '#16a34a'
                          : status.includes('ยังไม่ถึงกำหนด') || status.includes('รอ') ? '#b45309'
                          : '#374151';
        const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';

        tableRows += `
            <tr style="background:${rowBg};">
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#6b7280;">${i + 1}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#374151;white-space:nowrap;">${dateDisplay}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:10px;font-weight:700;color:#111827;line-height:1.4;">${plate}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;color:#374151;line-height:1.4;">${leasing}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:10px;color:#6b7280;line-height:1.4;">${contract}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#374151;white-space:nowrap;">${installment}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-size:11px;font-weight:700;color:#1d4ed8;white-space:nowrap;">${amount.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;font-weight:700;color:${sColor};line-height:1.4;">${status}</td>
            </tr>`;
    });

    if (dayData.length === 0) {
        tableRows = `<tr><td colspan="8" style="padding:40px;text-align:center;color:#9ca3af;font-size:14px;">ไม่พบข้อมูลในวันที่นี้</td></tr>`;
    }

    const tfoot = dayData.length > 0 ? `
        <tfoot>
            <tr style="background:#eff6ff;">
                <td colspan="6" style="padding:10px;text-align:right;font-size:13px;font-weight:700;color:#374151;border:1px solid #cbd5e1;">รวมทั้งหมด</td>
                <td style="padding:10px;text-align:right;font-size:15px;font-weight:800;color:#1d4ed8;border:1px solid #cbd5e1;">${totalAmount.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                <td style="border:1px solid #cbd5e1;"></td>
            </tr>
        </tfoot>` : '';

    const pendingCount = dayData.length - paidCount;

    // สรุปยอดตามลิสซิ่ง
    const leasingTotals = {};
    dayData.forEach(item => {
        const leasing = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท']) || 'ไม่ระบุ';
        const amt = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด']));
        if (!leasingTotals[leasing]) leasingTotals[leasing] = { count: 0, total: 0 };
        leasingTotals[leasing].count++;
        leasingTotals[leasing].total += amt;
    });
    const leasingSummaryRows = Object.entries(leasingTotals)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, info]) => `
            <tr>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;color:#374151;font-size:12px;">${name}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;color:#6b7280;font-size:12px;">${info.count}</td>
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:700;color:#1d4ed8;font-size:12px;">${info.total.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
            </tr>`).join('');

    const leasingSummary = dayData.length > 0 ? `
        <div style="margin-top:18px;">
            <div style="font-size:13px;font-weight:700;color:#1e3a8a;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">📊 สรุปยอดตามลิสซิ่ง</div>
            <table style="width:60%;min-width:380px;border-collapse:collapse;">
                <thead>
                    <tr style="background:#1d4ed8;color:#fff;">
                        <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:left;font-size:12px;font-weight:700;">ชื่อลิสซิ่ง</th>
                        <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-size:12px;font-weight:700;width:80px;">จำนวน</th>
                        <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;font-size:12px;font-weight:700;width:160px;">ยอดรวม</th>
                    </tr>
                </thead>
                <tbody>${leasingSummaryRows}</tbody>
                <tfoot>
                    <tr style="background:#eff6ff;">
                        <td style="padding:8px 10px;border:1px solid #cbd5e1;font-weight:800;color:#1e3a8a;font-size:12px;">รวมทั้งสิ้น</td>
                        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center;font-weight:800;color:#1e3a8a;font-size:12px;">${dayData.length}</td>
                        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:800;color:#1d4ed8;font-size:13px;">${totalAmount.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                    </tr>
                </tfoot>
            </table>
        </div>` : '';

    const summary = dayData.length > 0 ? `
        <div style="display:flex;gap:12px;margin-top:16px;">
            <div style="flex:1;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;">
                <div style="font-size:10px;font-weight:700;color:#3b82f6;margin-bottom:4px;">ยอดชำระรวม</div>
                <div style="font-size:16px;font-weight:800;color:#1d4ed8;">${totalAmount.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
            </div>
            <div style="flex:1;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;">
                <div style="font-size:10px;font-weight:700;color:#16a34a;margin-bottom:4px;">ชำระแล้ว</div>
                <div style="font-size:16px;font-weight:800;color:#15803d;">${paidCount} รายการ</div>
            </div>
            <div style="flex:1;background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 14px;">
                <div style="font-size:10px;font-weight:700;color:#b45309;margin-bottom:4px;">รอชำระ</div>
                <div style="font-size:16px;font-weight:800;color:#92400e;">${pendingCount} รายการ</div>
            </div>
        </div>${leasingSummary}` : '';

    return `
        <div style="font-family:'Sarabun','TH Sarabun New',Arial,sans-serif;background:#fff;padding:0 0 24px;width:100%;max-width:100%;color:#111827;box-sizing:border-box;">
            <!-- ThaiDrill Signboard Header -->
            <div style="margin-bottom:14px;">
                <div style="background:#e11d2e;background:linear-gradient(180deg,#ef4444 0%,#e11d2e 55%,#b91c1c 100%);padding:4px 20px 10px;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                    <div style="text-align:right;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.18em;text-shadow:1px 1px 0 rgba(127,29,29,0.6);margin-bottom:2px;">บริษัท รถเจาะไทย จำกัด</div>
                    <div style="display:flex;align-items:center;justify-content:center;gap:18px;padding:2px 0;">
                        <div style="flex:1;height:4px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.2),inset 0 -1px 0 rgba(203,213,225,0.6);border-radius:1px;"></div>
                        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                            <div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:0.01em;line-height:1;font-style:italic;white-space:nowrap;text-shadow:-1px 0 0 #cbd5e1,1px 0 0 #94a3b8,0 1px 0 #94a3b8,0 2px 0 #64748b,0 3px 3px rgba(0,0,0,0.4);">ThaiDrill</div>
                            <div style="width:90%;height:3px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.25),inset 0 -1px 0 rgba(203,213,225,0.6);border-radius:1px;"></div>
                        </div>
                        <div style="flex:1;height:4px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.2),inset 0 -1px 0 rgba(203,213,225,0.6);border-radius:1px;"></div>
                    </div>
                    <div style="position:absolute;right:20px;bottom:6px;font-size:11px;font-weight:700;color:#fff;letter-spacing:0.25em;text-transform:uppercase;font-style:italic;text-shadow:1px 1px 0 rgba(127,29,29,0.55);opacity:0.95;">Finance</div>
                </div>
                <div style="height:8px;background:linear-gradient(180deg,#cbd5e1 0%,#94a3b8 100%);-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
                <div style="height:4px;background:linear-gradient(180deg,#64748b 0%,#334155 100%);-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
                <div style="text-align:center;font-size:17px;font-weight:700;color:#0f172a;padding:12px 32px 4px;letter-spacing:0.02em;">รายงานการชำระเงิน <span style="color:#b91c1c;font-weight:800;font-style:italic;">ThaiDrill</span> ประจำวันที่ <b style="color:#b91c1c;font-weight:800;">${dateStr}</b></div>
                <div style="text-align:center;font-size:10px;color:#9ca3af;padding:0 32px;">พิมพ์เมื่อ: ${printedAt}</div>
            </div>
            <div style="padding:0 36px;">
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
                <thead>
                    <tr style="background:#1d4ed8;color:#fff;">
                        <th style="padding:8px 6px;text-align:center;font-size:11px;font-weight:700;width:5%;border:1px solid #1e3a8a;">ลำดับ</th>
                        <th style="padding:8px 6px;text-align:center;font-size:11px;font-weight:700;width:9%;border:1px solid #1e3a8a;">วันที่</th>
                        <th style="padding:8px 6px;text-align:left;font-size:11px;font-weight:700;width:14%;border:1px solid #1e3a8a;">ทะเบียนรถ</th>
                        <th style="padding:8px 6px;text-align:left;font-size:11px;font-weight:700;width:27%;border:1px solid #1e3a8a;">ชื่อลิสซิ่ง</th>
                        <th style="padding:8px 6px;text-align:left;font-size:11px;font-weight:700;width:15%;border:1px solid #1e3a8a;">เลขสัญญา</th>
                        <th style="padding:8px 6px;text-align:center;font-size:11px;font-weight:700;width:6%;border:1px solid #1e3a8a;">งวดที่</th>
                        <th style="padding:8px 6px;text-align:right;font-size:11px;font-weight:700;width:14%;border:1px solid #1e3a8a;">ค่างวด</th>
                        <th style="padding:8px 6px;text-align:center;font-size:11px;font-weight:700;width:10%;border:1px solid #1e3a8a;">สถานะ</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
                ${tfoot}
            </table>
            ${summary}
            <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;">
                <div style="font-size:10px;color:#9ca3af;">ระบบฐานข้อมูลลิสซิ่ง รถเจาะไทย 2026</div>
                <div style="font-size:10px;color:#9ca3af;">เอกสารนี้สร้างโดยระบบอัตโนมัติ — ห้ามแก้ไข</div>
            </div>
            </div>
        </div>`;
}

function generatePDFPreview() {
    if (selectedDates.size === 0) { alert('กรุณาเลือกวันที่อย่างน้อย 1 วัน'); return; }

    const selectedDatesArr = Array.from(selectedDates).sort().map(k => new Date(k + 'T00:00:00'));
    const keySet = new Set(selectedDates);

    const dayData = allData.filter(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate', 'วันที่']));
        if (isNaN(d)) return false;
        return keySet.has(toDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    });

    dayData.sort((a, b) =>
        new Date(getAnyValue(a, ['กำหนดชำระ', 'dueDate', 'วันที่'])) -
        new Date(getAnyValue(b, ['กำหนดชำระ', 'dueDate', 'วันที่']))
    );

    const reportHTML = buildReportHTML(selectedDatesArr, dayData);
    const dateVal = Array.from(selectedDates).sort()[0] || 'report';
    const total = dayData.reduce((s, item) => s + cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด'])), 0);

    const previewWin = window.open('', '_blank', 'width=1200,height=850');
    if (!previewWin) { alert('เบราว์เซอร์บล็อก popup กรุณาอนุญาต popup สำหรับหน้านี้'); return; }

    previewWin.document.open();
    previewWin.document.write(`<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title>รายงาน_รถเจาะไทย_${dateVal}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
    @page { size: A4 portrait; margin: 10mm 8mm; }
    @media print {
        .preview-toolbar { display: none !important; }
        body { background: #fff !important; padding: 0 !important; }
        thead tr { background: #1d4ed8 !important; }
        thead th { color: #ffffff !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; background: #e5e7eb; min-height: 100vh; }
    .preview-toolbar {
        position: sticky; top: 0; z-index: 99;
        background: #1e293b; color: #fff;
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 20px; gap: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .preview-toolbar-info { font-size: 13px; color: #94a3b8; }
    .preview-toolbar-info b { color: #fff; }
    .btn-print {
        display: flex; align-items: center; gap: 8px;
        background: #1d4ed8; color: #fff; border: none;
        padding: 9px 20px; border-radius: 8px;
        font-size: 14px; font-weight: 700; font-family: inherit;
        cursor: pointer;
    }
    .preview-body { padding: 24px; display: flex; justify-content: center; }
    table { page-break-inside: auto; } tr { page-break-inside: avoid; }
    thead { display: table-header-group; } tfoot { display: table-footer-group; }
</style></head>
<body>
<div class="preview-toolbar">
    <div class="preview-toolbar-info">
        <b>${selectedDates.size} วัน · ${dayData.length} รายการ</b> &nbsp;·&nbsp; ยอดรวม ${total.toLocaleString(undefined,{minimumFractionDigits:2})}
    </div>
    <button class="btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
</div>
<div class="preview-body">${reportHTML}</div>
</body></html>`);
    previewWin.document.close();
    closePDFModal();
}

function downloadDailyPDF() { generatePDFPreview(); }

// ===== CHARTS =====
function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    renderTrendChart(data);
    renderDonutChart(data);
}

function renderTrendChart(data) {
    const canvas = document.getElementById('monthlyTrendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const monthlyData = {};
    data.forEach(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        if (!isNaN(d)) {
            const m = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
            const amt = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount']));
            monthlyData[m] = (monthlyData[m] || 0) + amt;
        }
    });

    // Set inner width: each bar gets ~50px, scroll horizontally if too wide
    const monthCount = Object.keys(monthlyData).length;
    const inner = document.getElementById('trendChartInner');
    if (inner) {
        const scrollContainer = inner.parentElement;
        const containerWidth = scrollContainer ? scrollContainer.clientWidth : 320;
        const neededWidth = monthCount * 52 + 50;
        inner.style.width = Math.max(containerWidth, neededWidth) + 'px';
    }

    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(monthlyData),
            datasets: [{
                label: 'ยอดชำระ',
                data: Object.values(monthlyData),
                backgroundColor: '#3b82f6',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 36, right: 8 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => ctx.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2 }) }
                },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'end',
                    offset: 4,
                    rotation: -45,
                    color: '#dde6f0',
                    font: { weight: '700', size: 9 },
                    formatter: (v) => {
                        if (v >= 1000000) return Math.round(v / 1000000) + 'M';
                        if (v >= 1000) return Math.round(v / 1000) + 'K';
                        return v.toLocaleString();
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 9 },
                        callback: (v) => formatCompact(v)
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    beginAtZero: true
                },
                x: {
                    ticks: { color: '#94a3b8', font: { size: 9 }, autoSkip: false },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderDonutChart(data) {
    const canvas = document.getElementById('leasingDonutChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const leasingData = {};
    data.forEach(item => {
        const name = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing']) || 'อื่นๆ';
        const amt = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount']));
        leasingData[name] = (leasingData[name] || 0) + amt;
    });

    const COLORS = ['#3b82f6','#8b5cf6','#14b8a6','#f59e0b','#ef4444','#ec4899',
                    '#06b6d4','#10b981','#f97316','#6366f1','#84cc16','#a855f7',
                    '#0ea5e9','#e11d48','#d97706','#059669'];
    const labels = Object.keys(leasingData);
    const colors = labels.map((_, i) => COLORS[i % COLORS.length]);

    if (charts.donut) charts.donut.destroy();
    charts.donut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: Object.values(leasingData), backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => ctx.label + ': ' + ctx.parsed.toLocaleString(undefined, { minimumFractionDigits: 2 }) }
                },
                datalabels: { display: false }
            }
        }
    });

    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        legendEl.innerHTML = labels.map((label, i) => `
            <div class="m-donut-legend-item">
                <div class="m-donut-legend-dot" style="background:${colors[i]};"></div>
                <span>${label}</span>
            </div>`).join('');
    }
}
