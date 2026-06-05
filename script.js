const API_URL = 'https://script.google.com/macros/s/AKfycbx724bp87IzARRIsyvx5VEPXR7UXL7GaZ5nH_rZxS-q4MDv5WMYFpM74vx2e_7rZ0cKUA/exec';
const CACHE_KEY = 'erp_payment_cache_v1';
const CR_CACHE_KEY = 'erp_check_return_cache_v2';
const CR_SHEET_KEY = 'erp_check_return_sheet_name';

// debounce helper — รอให้ผู้ใช้หยุดคลิก/พิมพ์สักครู่ก่อนค่อยรัน เพื่อไม่ให้กราฟ/ตารางอัปเดตทุก ๆ คลิก
function debounce(fn, ms = 180) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

// ====== Multi-select checkbox filter (รองรับการเลือกหลายรายการ) ======
const __msStore = {}; // id -> Set ของค่าที่ถูกเลือก

function __escAttr(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function __escHtml(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function initMultiSelect(id, options, placeholderOverride) {
    const root = typeof id === 'string' ? document.getElementById(id) : id;
    if (!root || !root.classList.contains('multi-select')) return null;
    const key = root.id;
    const placeholder = placeholderOverride || root.dataset.placeholder || 'ทั้งหมด';
    if (!__msStore[key]) __msStore[key] = new Set();

    const items = options.map(o =>
        typeof o === 'object' ? { value: String(o.value), label: String(o.label) }
                              : { value: String(o), label: String(o) }
    );
    root.__msItems = items;
    root.__msPlaceholder = placeholder;

    root.innerHTML = `
        <button type="button" class="ms-btn">
            <span class="ms-label">${__escHtml(placeholder)}</span>
            <i class="fas fa-chevron-down ms-chevron"></i>
        </button>
        <div class="ms-panel" hidden>
            <div class="ms-search-wrap">
                <i class="fas fa-magnifying-glass"></i>
                <input type="text" class="ms-search" placeholder="ค้นหา..." />
            </div>
            <label class="ms-option ms-all">
                <input type="checkbox" class="ms-cb-all">
                <span>เลือกทั้งหมด</span>
            </label>
            <div class="ms-options">
                ${items.map(it => `
                    <label class="ms-option">
                        <input type="checkbox" value="${__escAttr(it.value)}" ${__msStore[key].has(it.value) ? 'checked' : ''}>
                        <span>${__escHtml(it.label)}</span>
                    </label>`).join('')}
            </div>
            <div class="ms-footer">
                <span class="ms-count"></span>
                <button type="button" class="ms-clear">ล้าง</button>
            </div>
        </div>`;

    const btn = root.querySelector('.ms-btn');
    const panel = root.querySelector('.ms-panel');
    const labelEl = root.querySelector('.ms-label');
    const searchEl = root.querySelector('.ms-search');
    const optionsEl = root.querySelector('.ms-options');
    const allCb = root.querySelector('.ms-cb-all');
    const clearBtn = root.querySelector('.ms-clear');
    const countEl = root.querySelector('.ms-count');

    const updateView = () => {
        const sel = __msStore[key];
        const total = items.length;
        if (sel.size === 0) {
            labelEl.textContent = placeholder;
            root.classList.remove('has-selection');
        } else if (sel.size === total && total > 0) {
            labelEl.textContent = `${placeholder} (ทั้งหมด)`;
            root.classList.add('has-selection');
        } else if (sel.size === 1) {
            const v = Array.from(sel)[0];
            const it = items.find(x => x.value === v);
            labelEl.textContent = it ? it.label : v;
            root.classList.add('has-selection');
        } else {
            labelEl.textContent = `${sel.size} รายการ`;
            root.classList.add('has-selection');
        }
        countEl.textContent = `เลือก ${sel.size} / ${total}`;
        const allChecked = sel.size === total && total > 0;
        const noneChecked = sel.size === 0;
        allCb.checked = allChecked;
        allCb.indeterminate = !allChecked && !noneChecked;
    };

    const fire = () => {
        updateView();
        root.dispatchEvent(new CustomEvent('ms-change', { bubbles: true, detail: { id: key, selected: new Set(__msStore[key]) } }));
        root.dispatchEvent(new Event('change', { bubbles: true }));
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = panel.hidden;
        document.querySelectorAll('.ms-panel:not([hidden])').forEach(p => { if (p !== panel) p.hidden = true; });
        document.querySelectorAll('.multi-select.is-open').forEach(ms => { if (ms !== root) ms.classList.remove('is-open'); });
        panel.hidden = !willOpen;
        root.classList.toggle('is-open', willOpen);
        if (willOpen) {
            searchEl.value = '';
            optionsEl.querySelectorAll('.ms-option').forEach(o => o.style.display = '');
            optionsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = __msStore[key].has(cb.value);
            });
            updateView();
            setTimeout(() => searchEl.focus(), 30);
        }
    });

    searchEl.addEventListener('input', () => {
        const q = searchEl.value.toLowerCase();
        optionsEl.querySelectorAll('.ms-option').forEach(opt => {
            const txt = opt.querySelector('span').textContent.toLowerCase();
            opt.style.display = txt.includes(q) ? '' : 'none';
        });
    });

    allCb.addEventListener('change', () => {
        if (allCb.checked) __msStore[key] = new Set(items.map(it => it.value));
        else __msStore[key] = new Set();
        optionsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = __msStore[key].has(cb.value);
        });
        fire();
    });

    optionsEl.addEventListener('change', (e) => {
        const cb = e.target;
        if (cb.tagName !== 'INPUT') return;
        if (cb.checked) __msStore[key].add(cb.value);
        else __msStore[key].delete(cb.value);
        fire();
    });

    clearBtn.addEventListener('click', () => {
        __msStore[key] = new Set();
        optionsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        fire();
    });

    panel.addEventListener('click', e => e.stopPropagation());

    updateView();
    return root;
}

function getMultiSelectSelected(id) {
    return __msStore[id] || new Set();
}

function resetMultiSelect(id) {
    __msStore[id] = new Set();
    const root = document.getElementById(id);
    if (!root) return;
    root.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    const labelEl = root.querySelector('.ms-label');
    if (labelEl) labelEl.textContent = root.__msPlaceholder || root.dataset.placeholder || 'ทั้งหมด';
    root.classList.remove('has-selection');
    const allCb = root.querySelector('.ms-cb-all');
    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
    const countEl = root.querySelector('.ms-count');
    if (countEl) countEl.textContent = `เลือก 0 / ${(root.__msItems || []).length}`;
}

// ปิด panel เมื่อคลิกข้างนอก
document.addEventListener('click', () => {
    document.querySelectorAll('.ms-panel:not([hidden])').forEach(p => p.hidden = true);
    document.querySelectorAll('.multi-select.is-open').forEach(ms => ms.classList.remove('is-open'));
});
// ====== /Multi-select ======


let allData = [];
let checkReturnData = [];
let charts = {};
let overdueData = [];
let pendingData = [];
let currentMonthData = [];
let paidData = [];

let _lastFilteredData = [];

function getCurrentFilteredData() { return _lastFilteredData; }

function initTableFilters(data) {
    const years = new Set();
    const leasings = new Set();
    const aircodes = new Set();
    const statuses = new Set();
    data.forEach(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        if (!isNaN(d)) years.add(d.getFullYear());
        const l = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท']);
        if (l && l !== '') leasings.add(l);
        const a = getAnyValue(item, ['Air Code', 'airCode', 'AirCode', 'air code']);
        if (a && a !== '') aircodes.add(String(a).trim());
        const s = getAnyValue(item, ['สถานะ', 'status']);
        if (s && s !== '') statuses.add(s);
    });
    const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

    initMultiSelect('table-filter-year', Array.from(years).sort().map(y => String(y)));
    initMultiSelect('table-filter-month', thaiMonths.map((m, i) => ({ value: String(i), label: m })));
    initMultiSelect('table-filter-leasing', Array.from(leasings).sort());
    initMultiSelect('table-filter-aircode', Array.from(aircodes).sort());
    initMultiSelect('table-filter-status', Array.from(statuses).sort());
}

// หัวเอกสาร ThaiDrill (ใช้ร่วมในทุก PDF)
function buildThaiDrillHeader(reportTitle, dateStr) {
    return `
        <div style="margin-bottom:14px;font-family:'Sarabun',sans-serif;">
            <div style="background:linear-gradient(180deg,#ef4444 0%,#e11d2e 55%,#b91c1c 100%);padding:4px 20px 10px;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
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
            ${reportTitle ? `<div style="text-align:center;font-size:14px;font-weight:700;color:#0f172a;padding:10px 32px 4px;letter-spacing:0.02em;">${reportTitle}${dateStr ? ` <span style="color:#9ca3af;font-weight:500;">·</span> <b style="color:#b91c1c;font-weight:800;">${dateStr}</b>` : ''}</div>` : ''}
        </div>
    `;
}

function exportTablePDF() {
    const table = document.querySelector('.payment-table');
    if (!table) return;
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) { alert('กรุณาอนุญาต popup'); return; }
    const title = `รายการชำระเงิน — ${new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' })}`;

    // Clone table แล้วเอาคอลัมน์สุดท้าย (ปุ่มดูรายละเอียด) ออก พร้อมล้าง inline width
    const clone = table.cloneNode(true);
    clone.querySelectorAll('tr').forEach(tr => {
        const cells = tr.children;
        if (cells.length) tr.removeChild(cells[cells.length - 1]);
    });
    clone.querySelectorAll('th, td').forEach(el => {
        el.removeAttribute('width');
        el.style.width = '';
    });
    clone.querySelectorAll('button').forEach(b => b.remove());

    // คำนวณยอดรวมจากคอลัมน์ชำระเงิน (คอลัมน์ที่ 8 — index 7 หลังตัดคอลัมน์ปุ่มออก)
    let grandTotal = 0;
    let rowCount = 0;
    clone.querySelectorAll('tbody tr').forEach(tr => {
        const amountCell = tr.children[7];
        if (!amountCell) return;
        const num = parseFloat((amountCell.textContent || '').replace(/[^0-9.\-]/g, ''));
        if (!isNaN(num)) grandTotal += num;
        rowCount++;
    });
    const totalStr = `${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // เพิ่มแถวยอดรวมท้ายตาราง (tfoot — จะแสดงทุกหน้าตอนพิมพ์)
    let tfoot = clone.querySelector('tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        clone.appendChild(tfoot);
    }
    tfoot.innerHTML = `<tr class="total-row">
        <td colspan="7" style="text-align:right;font-weight:700;white-space:nowrap">ยอดรวม (${rowCount.toLocaleString()} รายการ)</td>
        <td style="text-align:right;font-weight:700;white-space:nowrap">${totalStr}</td>
    </tr>`;

    win.document.write(`<!DOCTYPE html><html lang="th"><head>
        <meta charset="UTF-8"><title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            @page { size: A4 portrait; margin: 10mm; }
            @media print {
                .toolbar { display:none!important; }
                body { background:#fff; }
                thead tr { background:#1d4ed8!important; }
                thead th { color:#fff!important; }
                body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
                thead { display: table-header-group; }
                tr { page-break-inside: avoid; }
            }
            * { box-sizing:border-box; margin:0; padding:0; }
            body { font-family:'Sarabun',sans-serif; background:#e5e7eb; }
            .toolbar { position:sticky; top:0; background:#1e293b; color:#fff; display:flex; align-items:center; justify-content:space-between; padding:10px 20px; z-index:10; }
            .toolbar-title { font-size:13px; color:#94a3b8; }
            .btn-print { background:#1d4ed8; color:#fff; border:none; padding:8px 18px; border-radius:7px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; }
            .body { padding:14px; max-width:210mm; margin:0 auto; background:#fff; }
            h2 { font-size:13px; font-weight:700; margin-bottom:10px; color:#0f172a; }
            table { width:100%; border-collapse:collapse; font-size:9px; table-layout:fixed; }
            th, td { border:1px solid #cbd5e1; padding:4px 5px; word-wrap:break-word; overflow-wrap:break-word; }
            th { background:#1d4ed8; color:#fff; text-align:center; border-color:#1e3a8a; font-weight:700; font-size:9px; }
            td { color:#111827; vertical-align:middle; }
            tbody tr:nth-child(even) td { background:#f8fafc; }
            tfoot tr.total-row td { background:#dbeafe!important; color:#0f172a; font-size:10px; border-top:2px solid #1d4ed8; }
            tfoot { display: table-row-group; }
            @media print { tfoot tr.total-row td { background:#dbeafe!important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
            /* กำหนดสัดส่วนคอลัมน์ให้พอดี A4 แนวตั้ง: # | กำหนดชำระ | ชื่อลิสซิ่ง | เลขสัญญา | Air Code | งวด | สถานะ | ชำระเงิน */
            colgroup col:nth-child(1) { width: 5%; }
            colgroup col:nth-child(2) { width: 10%; }
            colgroup col:nth-child(3) { width: 32%; }
            colgroup col:nth-child(4) { width: 15%; }
            colgroup col:nth-child(5) { width: 11%; }
            colgroup col:nth-child(6) { width: 6%; }
            colgroup col:nth-child(7) { width: 9%; }
            colgroup col:nth-child(8) { width: 12%; }
            td:nth-child(1), th:nth-child(1),
            td:nth-child(2), th:nth-child(2),
            td:nth-child(5), th:nth-child(5),
            td:nth-child(6), th:nth-child(6),
            td:nth-child(7), th:nth-child(7) { text-align:center; }
            td:nth-child(8), th:nth-child(8) { text-align:right; }
            /* บีบ badge สถานะให้ดูสะอาดในงานพิมพ์ */
            td .status-badge, td span[class*="status"] { display:inline-block; padding:2px 6px; border-radius:4px; font-size:8px; font-weight:600; }
        </style></head><body>
        <div class="toolbar">
            <span class="toolbar-title">${title}</span>
            <button class="btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
        </div>
        <div class="body">
        ${buildThaiDrillHeader(`รายการชำระเงิน <span style="color:#b91c1c;font-weight:800;font-style:italic;">ThaiDrill</span> ประจำวันที่ <b style="color:#b91c1c;font-weight:800;">${new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' })}</b>`, '')}
        <table>
            <colgroup>
                <col><col><col><col><col><col><col><col>
            </colgroup>
            ${clone.innerHTML}
        </table>
        </div></body></html>`);
    win.document.close();
}

// คลิก-เพื่อ-เปิดใช้งาน-เลื่อน:
//   ปกติ: overflow-y: hidden → wheel เลื่อนหน้าเว็บโดย native (ลื่นไม่กระตุก)
//   เมื่อคลิกในตาราง: เพิ่ม .table-active → overflow-y: auto → wheel เลื่อนภายในตาราง
//   คลิกที่อื่นนอกตาราง: ปิด active กลับเป็นปกติ
function enableClickToScroll(el) {
    if (!el || el.dataset.clickScrollAttached) return;
    el.dataset.clickScrollAttached = '1';

    el.addEventListener('click', () => {
        // ปิดทุกตารางก่อน แล้วเปิดตัวที่กด
        document.querySelectorAll('.table-wrapper.table-active').forEach(w => {
            if (w !== el) w.classList.remove('table-active');
        });
        el.classList.add('table-active');
    });

    // คลิกนอกตาราง → ปิด active
    document.addEventListener('click', (e) => {
        if (!el.contains(e.target)) el.classList.remove('table-active');
    });
    // ไม่ต้องใช้ wheel handler — CSS overflow toggle ทำงานเอง = native scroll = ลื่นกว่ามาก
}

document.addEventListener('DOMContentLoaded', () => {
    // ยิง 2 fetch พร้อมกัน — ไม่บล็อกกัน (ตารางหลัก + ตารางค่าธรรมเนียมเช็คคืน โหลดขนานกัน)
    fetchData();
    // เปิดใช้ click-to-scroll สำหรับทุกตาราง (.table-wrapper)
    setTimeout(() => {
        document.querySelectorAll('.table-wrapper').forEach(enableClickToScroll);
    }, 100);
    const filters = ['filter-year', 'filter-month', 'filter-date', 'filter-leasing', 'filter-aircode', 'filter-status'];
    const debouncedApplyFilters = debounce(applyFilters, 220);
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', debouncedApplyFilters);
    });
    const resetBtn = document.getElementById('reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            filters.forEach(id => resetMultiSelect(id));
            updateKPIs(allData);
        });
    }

    const refreshBtn = document.getElementById('btnRefresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            allData = [];
            checkReturnData = [];
            const cards = document.getElementById('cardsContainer');
            if (cards) cards.innerHTML = '<div style="text-align:center; padding: 40px; color: #94a3b8;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px;"></i><br>กำลังโหลดข้อมูลใหม่...</div>';
            fetchData(true);
        });
    }

    // PDF modal listeners
    const btnDailyPDF = document.getElementById('btnDailyPDF');
    if (btnDailyPDF) btnDailyPDF.addEventListener('click', openPDFModal);

    const closePdfModal = document.getElementById('closePdfModal');
    if (closePdfModal) closePdfModal.addEventListener('click', () => {
        document.getElementById('pdfModal').style.display = 'none';
    });

    const pdfModal = document.getElementById('pdfModal');
    if (pdfModal) pdfModal.addEventListener('click', (e) => {
        if (e.target === pdfModal) pdfModal.style.display = 'none';
    });

    const btnGeneratePdf = document.getElementById('btnGeneratePdf');
    if (btnGeneratePdf) btnGeneratePdf.addEventListener('click', generatePDFPreview);

    const btnDownloadPdf = document.getElementById('btnDownloadPdf');
    if (btnDownloadPdf) btnDownloadPdf.addEventListener('click', downloadDailyPDF);

    // Table inline filters — debounce ป้องกันการ re-render ตาราง 6,000+ แถว ทุก ๆ คลิก
    const debouncedRenderTable = debounce(() => renderTable(getCurrentFilteredData()), 220);
    const debouncedSearchRender = debounce(() => renderTable(getCurrentFilteredData()), 280);
    const tableFilterYear = document.getElementById('table-filter-year');
    const tableFilterMonth = document.getElementById('table-filter-month');
    if (tableFilterYear) tableFilterYear.addEventListener('change', debouncedRenderTable);
    if (tableFilterMonth) tableFilterMonth.addEventListener('change', debouncedRenderTable);
    const tableFilterLeasing = document.getElementById('table-filter-leasing');
    if (tableFilterLeasing) tableFilterLeasing.addEventListener('change', debouncedRenderTable);
    const tableFilterAircode = document.getElementById('table-filter-aircode');
    if (tableFilterAircode) tableFilterAircode.addEventListener('change', debouncedRenderTable);
    const tableFilterStatus = document.getElementById('table-filter-status');
    if (tableFilterStatus) tableFilterStatus.addEventListener('change', debouncedRenderTable);
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', debouncedSearchRender);

    // Export PDF ของตาราง
    const btnExportTablePdf = document.getElementById('btnExportTablePdf');
    if (btnExportTablePdf) btnExportTablePdf.addEventListener('click', exportTablePDF);

    // Check Return section listeners
    const debouncedRenderCR = debounce(() => renderCheckReturnTable(checkReturnData), 220);
    const crFilterYear = document.getElementById('cr-filter-year');
    const crFilterMonth = document.getElementById('cr-filter-month');
    const crFilterLeasing = document.getElementById('cr-filter-leasing');
    if (crFilterYear) crFilterYear.addEventListener('change', debouncedRenderCR);
    if (crFilterMonth) crFilterMonth.addEventListener('change', debouncedRenderCR);
    if (crFilterLeasing) crFilterLeasing.addEventListener('change', debouncedRenderCR);
    const crFilterBank = document.getElementById('cr-filter-bank');
    if (crFilterBank) crFilterBank.addEventListener('change', debouncedRenderCR);
    const crSearch = document.getElementById('checkReturnSearch');
    if (crSearch) crSearch.addEventListener('input', debounce(() => renderCheckReturnTable(checkReturnData), 280));
    const btnExportCheckReturnPdf = document.getElementById('btnExportCheckReturnPdf');
    if (btnExportCheckReturnPdf) btnExportCheckReturnPdf.addEventListener('click', exportCheckReturnPDF);

    // Near End Installment section
    const nearEndLimitSelect = document.getElementById('nearEndLimitSelect');
    if (nearEndLimitSelect) nearEndLimitSelect.addEventListener('change', () => renderNearEndTable(allData));
    const btnExportNearEndPdf = document.getElementById('btnExportNearEndPdf');
    if (btnExportNearEndPdf) btnExportNearEndPdf.addEventListener('click', exportNearEndPDF);

    // Status KPI detail buttons
    const btnOverdueDetail = document.getElementById('btnOverdueDetail');
    if (btnOverdueDetail) btnOverdueDetail.addEventListener('click', () => showStatusModal('overdue'));
    const btnPendingDetail = document.getElementById('btnPendingDetail');
    if (btnPendingDetail) btnPendingDetail.addEventListener('click', () => showStatusModal('pending'));
    const btnPaidDetail = document.getElementById('btnPaidDetail');
    if (btnPaidDetail) btnPaidDetail.addEventListener('click', () => showStatusModal('paid'));
    const btnCurrentMonthDetail = document.getElementById('btnCurrentMonthDetail');
    if (btnCurrentMonthDetail) btnCurrentMonthDetail.addEventListener('click', () => showStatusModal('currentMonth'));

    const statusModal = document.getElementById('statusModal');
    const closeStatusModal = document.getElementById('closeStatusModal');
    const btnCloseStatusModal = document.getElementById('btnCloseStatusModal');
    if (closeStatusModal) closeStatusModal.onclick = () => statusModal.style.display = 'none';
    if (btnCloseStatusModal) btnCloseStatusModal.onclick = () => statusModal.style.display = 'none';
    if (statusModal) statusModal.addEventListener('click', (e) => { if (e.target === statusModal) statusModal.style.display = 'none'; });

    // Modal close logic
    const modal = document.getElementById('detailModal');
    const closeBtn = document.querySelector('.close-modal');
    const closeBtnFooter = document.querySelector('.btn-close-modal');
    const closeModal = () => { modal.style.display = "none"; };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (closeBtnFooter) closeBtnFooter.onclick = closeModal;
    window.onclick = (event) => { if (event.target == modal) closeModal(); };
});

function applyDataset(data, fromCache) {
    if (!data || data.length === 0) return false;
    allData = data;
    allData.sort((a, b) => {
        const dateA = new Date(getAnyValue(a, ['กำหนดชำระ', 'dueDate', 'วันที่']));
        const dateB = new Date(getAnyValue(b, ['กำหนดชำระ', 'dueDate', 'วันที่']));
        return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
    });
    initFilterOptions(allData);
    initTableFilters(allData);
    updateDashboard(allData);
    buildCheckReturnFromPaymentLog();
    initCheckReturnFilters(checkReturnData);
    renderCheckReturnTable(checkReturnData);
    renderNearEndTable(allData);
    const lastUpdated = document.getElementById('lastUpdated');
    if (lastUpdated) {
        const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        lastUpdated.innerHTML = `<i class="fas fa-circle"></i> <span>${fromCache ? 'จากแคช · ' : ''}อัปเดตล่าสุด ${now} น.</span>`;
    }
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) debugPanel.style.display = 'none';
    return true;
}

// สร้าง checkReturnData จาก Payment_Log (allData) โดยตรง
function buildCheckReturnFromPaymentLog() {
    if (!allData.length) return;
    checkReturnData = allData.filter(item => {
        const fee = cleanNumber(getAnyValue(item, ['ค่าธรรมเนียมหักจากบัญชี']));
        return fee > 0;
    });
}
async function fetchData(forceRefresh = false) {
    const cardsContainer = document.getElementById('cardsContainer');

    // ลองโหลดจาก localStorage cache ก่อน เพื่อให้ UI ขึ้นทันที
    let hadCache = false;
    if (!forceRefresh) {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && Array.isArray(cached.data) && cached.data.length) {
                    hadCache = applyDataset(cached.data, true);
                }
            }
        } catch (e) { console.warn('Cache read failed:', e); }
    }

    if (!hadCache && cardsContainer) {
        cardsContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: #94a3b8;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px;"></i><br>กำลังโหลดข้อมูลจาก Google Sheets...</div>';
    }

    try {
        const response = await fetch(API_URL, { redirect: 'follow' });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const rawResponse = await response.json();
        console.log('=== RAW API RESPONSE ===', rawResponse);
        console.log('Response type:', typeof rawResponse, 'IsArray:', Array.isArray(rawResponse));

        // รองรับทุกรูปแบบ response ที่ Apps Script อาจจะส่งมา
        let dataArray = [];
        if (Array.isArray(rawResponse)) {
            // กรณีส่ง array มาตรงๆ
            dataArray = rawResponse;
        } else if (rawResponse && typeof rawResponse === 'object') {
            // กรณีห่อ array ไว้ใน object เช่น {data: [...]} หรือ {success: true, data: [...]}
            if (Array.isArray(rawResponse.data)) {
                dataArray = rawResponse.data;
            } else if (Array.isArray(rawResponse.records)) {
                dataArray = rawResponse.records;
            } else if (Array.isArray(rawResponse.result)) {
                dataArray = rawResponse.result;
            } else if (Array.isArray(rawResponse.rows)) {
                dataArray = rawResponse.rows;
            } else {
                // ลองหา property แรกที่เป็น array
                const firstArrayKey = Object.keys(rawResponse).find(k => Array.isArray(rawResponse[k]));
                if (firstArrayKey) {
                    console.log(`Found array under key: "${firstArrayKey}"`);
                    dataArray = rawResponse[firstArrayKey];
                }
            }
        }

        console.log(`=== Extracted ${dataArray.length} rows ===`);
        if (dataArray.length > 0) {
            console.log('Detected Column Names:', Object.keys(dataArray[0]));
            // แจ้งเตือนใน Console เพื่อให้ผู้ใช้ตรวจสอบชื่อคอลัมน์
            console.warn('หากยอดเงินไม่ขึ้น ให้ตรวจสอบว่าชื่อคอลัมน์ใน Sheet ตรงกับที่โปรแกรมค้นหาหรือไม่');
        }

        if (dataArray.length === 0) {
            if (cardsContainer) {
                cardsContainer.innerHTML = `<div style="text-align:center; color:#f59e0b; padding: 20px;">
                    ไม่พบข้อมูลใน response<br>
                    <small style="color:#94a3b8;">กด F12 → แท็บ Console เพื่อดู response ที่ได้รับจริง</small>
                </div>`;
            }
            return;
        }

        // กรองแถวว่างออก
        let processedData = dataArray.filter(item =>
            item && (typeof item === 'object' || Array.isArray(item)) &&
            Object.values(item).some(v => v !== "" && v !== null && v !== undefined)
        );

        // กรณีข้อมูลมาเป็น Array ของ Array (เช่น [["หัวข้อ", "หัวข้อ"], ["ข้อมูล", "ข้อมูล"]])
        if (processedData.length > 0 && Array.isArray(processedData[0])) {
            console.log('Detect Array-of-Arrays format, converting to objects...');
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
            applyDataset(allData, false);
            // บันทึก cache สำหรับการโหลดครั้งถัดไป
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: allData }));
            } catch (e) { console.warn('Cache write failed:', e); }
        } else {
            if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding: 20px;">ไม่พบข้อมูล (ทุกแถวว่าง)</div>';
            showDebugInfo(rawResponse);
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        // ถ้ามีแคชแสดงอยู่แล้ว ไม่ต้องทับ UI ด้วย error
        if (!hadCache && cardsContainer) {
            cardsContainer.innerHTML = `<div style="text-align:center; color:#f43f5e; padding: 20px;">
                เกิดข้อผิดพลาด: ${error.message}<br>
                <small style="color:#94a3b8;">ลองตรวจสอบ Apps Script หรือสิทธิ์การเข้าถึง URL</small>
            </div>`;
            showDebugInfo(error.message);
        } else {
            const lastUpdated = document.getElementById('lastUpdated');
            if (lastUpdated) lastUpdated.innerHTML = `<i class="fas fa-circle" style="color:#f59e0b"></i> <span>โหลดสด ๆ ไม่สำเร็จ · ใช้ข้อมูลแคช</span>`;
        }
    }
}

function showDebugInfo(info) {
    const debugPanel = document.getElementById('debug-panel');
    const debugContent = document.getElementById('debug-content');
    if (debugPanel && debugContent) {
        debugPanel.style.display = 'block';
        debugContent.textContent = typeof info === 'object' ? JSON.stringify(info, null, 2) : info;
    }
}

// ฟังก์ชันไม้ตาย: ค้นหาค่าจากคอลัมน์แบบยืดหยุ่นสูง
function getAnyValue(item, searchTerms) {
    if (!item || typeof item !== 'object') return "";
    const keys = Object.keys(item);

    // 1. ค้นหาจากชื่อคอลัมน์ที่ระบุ
    for (let term of searchTerms) {
        const foundKey = keys.find(k => k && k.toString().replace(/\s/g, '').toLowerCase().includes(term.toString().replace(/\s/g, '').toLowerCase()));
        if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null) {
            return item[foundKey];
        }
    }

    // 2. ถ้าหาไม่เจอ และเป็นแบบ Array ให้ลองดึงตามลำดับ (เผื่อกรณีไม่มีหัวข้อ)
    if (Array.isArray(item)) {
        const indexMap = {
            'date': 0, 'leasing': 1, 'contract': 2, 'plate': 3, 'air': 4, 'desc': 5, 'inst': 6, 'status': 7, 'amt': 8
        };
        for (let term of searchTerms) {
            if (indexMap[term] !== undefined) return item[indexMap[term]];
        }
    }

    return "";
}

function parseDueDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val) ? null : val;
    const s = val.toString().trim();
    // ISO: 2026-05-15 or 2026-05-15T...
    let d = new Date(s);
    if (!isNaN(d)) return d;
    // DD/MM/YYYY (Thai display format)
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        d = new Date(+m[3], +m[2] - 1, +m[1]);
        if (!isNaN(d)) return d;
    }
    return null;
}

function cleanNumber(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // ตัดคอมม่าและสัญลักษณ์เงินออก
    const cleaned = val.toString().replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
}

// แสดงตัวเลขเต็มจำนวน สำหรับ KPI
function fmtKPIValue(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function animateNumber(element, start, end, duration, isCurrency) {
    if (!element) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const currentVal = start + easeProgress * (end - start);

        if (isCurrency) {
            element.textContent = fmtKPIValue(currentVal);
        } else {
            element.textContent = Math.floor(currentVal).toLocaleString();
        }

        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            if (isCurrency) {
                element.textContent = fmtKPIValue(end);
            } else {
                element.textContent = end.toLocaleString();
            }
        }
    };
    window.requestAnimationFrame(step);
}

function updateKPIs(data) {
    let totalAmount = 0;
    let overdueAmt = 0, pendingAmt = 0, paidAmt = 0;

    overdueData = [];
    pendingData = [];
    currentMonthData = [];
    paidData = [];

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    data.forEach(item => {
        const amt = getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด', 'ชำระ', 'เงิน', 'sum']);
        const numAmt = cleanNumber(amt);
        totalAmount += numAmt;

        const status = (getAnyValue(item, ['สถานะ', 'status', 'state']) || '').toString();
        if (status.includes('เกินกำหนด')) {
            overdueAmt += numAmt;
            overdueData.push(item);
        }
        if (status.includes('ยังไม่ถึงกำหนด')) {
            pendingAmt += numAmt;
            pendingData.push(item);
        }
        if (status.includes('โอนเงิน') || status.includes('จ่ายแล้ว') || status.includes('ตัดเช็คผ่าน') || status.includes('หักบัญชี') || status.includes('ชำระแล้ว')) {
            paidAmt += numAmt;
            paidData.push(item);
        }

        const dueDate = parseDueDate(getAnyValue(item, ['กำหนดชำระ']));
        if (dueDate && dueDate.getFullYear() === curYear && dueDate.getMonth() === curMonth) {
            currentMonthData.push(item);
        }
    });

    const totalEl = document.getElementById('total-amount');
    if (totalEl) {
        animateNumber(totalEl, parseFloat(totalEl.dataset.currentValue) || 0, totalAmount, 1000, true);
        totalEl.dataset.currentValue = totalAmount;
    }

    const overdueAmtEl = document.getElementById('overdue-amount');
    if (overdueAmtEl) {
        animateNumber(overdueAmtEl, parseFloat(overdueAmtEl.dataset.currentValue) || 0, overdueAmt, 800, true);
        overdueAmtEl.dataset.currentValue = overdueAmt;
    }
    const overdueCountEl = document.getElementById('overdue-count');
    if (overdueCountEl) overdueCountEl.innerHTML = `<i class="fas fa-list"></i> ${overdueData.length.toLocaleString()} รายการ`;

    const pendingAmtEl = document.getElementById('pending-amount');
    if (pendingAmtEl) {
        animateNumber(pendingAmtEl, parseFloat(pendingAmtEl.dataset.currentValue) || 0, pendingAmt, 800, true);
        pendingAmtEl.dataset.currentValue = pendingAmt;
    }
    const pendingCountEl = document.getElementById('pending-count');
    if (pendingCountEl) pendingCountEl.innerHTML = `<i class="fas fa-list"></i> ${pendingData.length.toLocaleString()} รายการ`;

    const paidAmtEl = document.getElementById('paid-amount');
    if (paidAmtEl) {
        animateNumber(paidAmtEl, parseFloat(paidAmtEl.dataset.currentValue) || 0, paidAmt, 800, true);
        paidAmtEl.dataset.currentValue = paidAmt;
    }
    const paidCountEl = document.getElementById('paid-count');
    if (paidCountEl) paidCountEl.innerHTML = `<i class="fas fa-list"></i> ${paidData.length.toLocaleString()} รายการ`;

    const curMonthAmt = currentMonthData.reduce((s, item) => s + cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด', 'ชำระ', 'เงิน', 'sum'])), 0);
    const curMonthAmtEl = document.getElementById('current-month-amount');
    if (curMonthAmtEl) {
        animateNumber(curMonthAmtEl, parseFloat(curMonthAmtEl.dataset.currentValue) || 0, curMonthAmt, 1000, true);
        curMonthAmtEl.dataset.currentValue = curMonthAmt;
    }
    const curMonthCountEl = document.getElementById('current-month-count');
    if (curMonthCountEl) curMonthCountEl.innerHTML = `<i class="fas fa-list-check"></i> ${currentMonthData.length.toLocaleString()} รายการ`;

    console.log(`[currentMonth] เดือนปัจจุบัน: ${curYear}-${curMonth + 1} | พบ ${currentMonthData.length} รายการ`);
    if (currentMonthData.length > 0) {
        console.log('[currentMonth] ตัวอย่างวันที่ใน column A:', currentMonthData.slice(0, 3).map(d => getAnyValue(d, ['กำหนดชำระ'])));
    } else {
        console.warn('[currentMonth] ไม่พบรายการ — ตรวจสอบรูปแบบวันที่ใน column A:', data.slice(0, 3).map(d => getAnyValue(d, ['กำหนดชำระ'])));
    }

    if (data.length > 0 && totalAmount === 0) {
        showDebugInfo({
            message: "ตรวจพบข้อมูลแต่ไม่สามารถดึงยอดเงินได้",
            columnNames: Object.keys(data[0]),
            firstRow: data[0]
        });
    }
}

function showStatusModal(statusType) {
    const modal = document.getElementById('statusModal');
    const titleEl = document.getElementById('statusModalTitle');
    const bodyEl = document.getElementById('statusModalBody');
    if (!modal || !titleEl || !bodyEl) return;

    const dataMap = { overdue: overdueData, pending: pendingData, currentMonth: currentMonthData, paid: paidData };
    const data = dataMap[statusType] || [];
    const thaiMonth = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const titleMap = {
        overdue: 'ค่างวดเกินกำหนด',
        pending: 'ยังไม่ถึงกำหนดชำระ',
        currentMonth: `ยอดค่างวดเดือนปัจจุบัน (${thaiMonth})`,
        paid: 'ยอดที่ชำระแล้ว'
    };
    const iconMap = {
        overdue: 'fas fa-triangle-exclamation',
        pending: 'fas fa-hourglass-half',
        currentMonth: 'fas fa-calendar-check',
        paid: 'fas fa-circle-check'
    };
    const colorMap = {
        overdue: 'color:var(--danger)',
        pending: 'color:var(--warning)',
        currentMonth: 'color:var(--accent-teal)',
        paid: 'color:var(--success)'
    };
    const title = titleMap[statusType];
    const iconClass = iconMap[statusType];
    const iconColor = colorMap[statusType];
    const isOverdue = statusType === 'overdue';

    titleEl.innerHTML = `<i class="${iconClass}" style="${iconColor}"></i> ${title} <span style="font-size:0.75rem;font-weight:400;color:var(--text-dim);margin-left:8px;">${data.length} รายการ</span>`;

    const totalAmt = data.reduce((s, item) => s + cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด'])), 0);
    const fmtMoney = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = n => totalAmt ? ((n / totalAmt) * 100).toFixed(1) + '%' : '0%';

    // เตรียม cols + helper สร้างแถวรายการ ใช้ร่วมกันทั้งหน้ารายการและหน้าหมวดหมู่
    const cols = [
        { label: 'กำหนดชำระ', keys: ['กำหนดชำระ', 'dueDate'], isDate: true, w: '100px' },
        { label: 'ชื่อลิสซิ่ง', keys: ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท'], w: '' },
        { label: 'เลขสัญญา', keys: ['เลขสัญญา', 'contract', 'สัญญา'], w: '130px' },
        { label: 'Air Code', keys: ['Air Code', 'airCode', 'AirCode'], center: true, w: '90px' },
        { label: 'งวดที่', keys: ['งวดที่', 'installment', 'งวด'], center: true, w: '60px' },
        { label: 'ค่างวดประจำ', keys: ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด'], isAmount: true, w: '120px' },
        { label: 'สถานะ', keys: ['สถานะ', 'status'], isStatus: true, w: '110px' },
    ];
    const headerCells = cols.map(c =>
        `<th style="text-align:${c.isDate || c.center || c.isStatus ? 'center' : c.isAmount ? 'right' : 'left'};${c.w ? 'width:' + c.w : ''}">${c.label}</th>`
    ).join('');
    const headerRowHtml = `<th style="width:50px;text-align:center">ลำดับ</th>${headerCells}`;

    const buildCells = (item) => cols.map(col => {
        const val = getAnyValue(item, col.keys);
        if (col.isDate) {
            const d = parseDueDate(val);
            const display = d ? d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : (val || '-');
            return `<td style="text-align:center;white-space:nowrap">${display}</td>`;
        }
        if (col.isAmount) {
            const num = cleanNumber(val);
            return `<td style="text-align:right;font-weight:700;color:var(--accent)">${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>`;
        }
        if (col.isStatus) {
            const s = (val || '-').toString();
            const sc = s.includes('เกินกำหนด') ? 'color:var(--danger)'
                : s.includes('ยังไม่ถึงกำหนด') ? 'color:var(--warning)'
                : s.includes('โอนเงิน') ? 'color:var(--success)'
                : 'color:var(--text-dim)';
            return `<td style="text-align:center;font-weight:700;${sc}">${s}</td>`;
        }
        return `<td style="text-align:${col.center ? 'center' : 'left'}">${val || '-'}</td>`;
    }).join('');
    const buildRow = (item, idx) => `<tr><td style="text-align:center;color:var(--text-muted)">${idx + 1}</td>${buildCells(item)}</tr>`;

    // หน้า "รายการทั้งหมด"
    const listRowsHtml = data.length === 0
        ? `<tr><td colspan="${cols.length + 1}" style="text-align:center;padding:40px;color:var(--text-muted);">ไม่พบข้อมูล</td></tr>`
        : data.map((item, i) => buildRow(item, i)).join('');

    const listViewHtml = `
        <div class="status-modal-scroll" data-view-pane="list">
            <table class="status-modal-table">
                <thead><tr>${headerRowHtml}</tr></thead>
                <tbody>${listRowsHtml}</tbody>
            </table>
        </div>`;

    // หน้า "สรุปหมวดหมู่" — group ตามชื่อลิสซิ่ง
    const groupMap = {};
    data.forEach(item => {
        const name = (getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท']) || '(ไม่ระบุ)').toString().trim() || '(ไม่ระบุ)';
        const amt = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด']));
        if (!groupMap[name]) groupMap[name] = { count: 0, sum: 0, items: [] };
        groupMap[name].count += 1;
        groupMap[name].sum += amt;
        groupMap[name].items.push(item);
    });
    const groups = Object.entries(groupMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.sum - a.sum);

    const categoryCardsHtml = groups.length === 0
        ? '<div style="text-align:center;padding:40px;color:var(--text-muted);">ไม่พบข้อมูล</div>'
        : groups.map((g, idx) => {
            const itemRows = g.items.map((item, i) => buildRow(item, i)).join('');
            return `
                <div class="cat-accordion" data-cat-idx="${idx}">
                    <button type="button" class="cat-accordion-head">
                        <span class="cat-accordion-toggle"><i class="fas fa-plus"></i></span>
                        <span class="cat-accordion-name" title="${g.name}">${g.name}</span>
                        <span class="cat-accordion-count">${g.count.toLocaleString()} รายการ</span>
                        <span class="cat-accordion-pct">${pct(g.sum)}</span>
                        <span class="cat-accordion-amt">${fmtMoney(g.sum)}</span>
                    </button>
                    <div class="cat-accordion-body">
                        <table class="status-modal-table cat-accordion-table">
                            <thead><tr>${headerRowHtml}</tr></thead>
                            <tbody>${itemRows}</tbody>
                        </table>
                    </div>
                </div>`;
        }).join('');

    const categoryViewHtml = `
        <div class="status-modal-scroll" data-view-pane="category" hidden>
            <div class="cat-accordion-list">${categoryCardsHtml}</div>
        </div>`;

    // สร้าง contractGroupMap: ลิสซิ่ง → สัญญา → items
    const contractGroupMap = {};
    data.forEach(item => {
        const lname = (getAnyValue(item, ['ชื่อลิสซิ่ง','leasing','บริษัท']) || '(ไม่ระบุ)').toString().trim();
        const cname = (getAnyValue(item, ['เลขสัญญา','contract','สัญญา']) || '(ไม่ระบุ)').toString().trim();
        const amt   = cleanNumber(getAnyValue(item, ['ค่างวดประจำ','amount','ยอดเงิน','ยอดชำระ','ยอด']));
        if (!contractGroupMap[lname]) contractGroupMap[lname] = { sum: 0, contracts: {} };
        contractGroupMap[lname].sum += amt;
        if (!contractGroupMap[lname].contracts[cname]) contractGroupMap[lname].contracts[cname] = { sum: 0, items: [] };
        contractGroupMap[lname].contracts[cname].sum += amt;
        contractGroupMap[lname].contracts[cname].items.push(item);
    });
    const contractLeasings = Object.entries(contractGroupMap).sort((a, b) => b[1].sum - a[1].sum);
    const contractCardsHtml = contractLeasings.length === 0
        ? '<div style="text-align:center;padding:40px;color:var(--text-muted);">ไม่พบข้อมูล</div>'
        : contractLeasings.map(([lname, ldata], li) => {
            const contracts = Object.entries(ldata.contracts).sort((a, b) => b[1].sum - a[1].sum);
            const contractAccordions = contracts.map(([cname, cdata], ci) => {
                const itemRows = cdata.items.map((item, ii) => {
                    const d = parseDueDate(getAnyValue(item, ['กำหนดชำระ','dueDate']));
                    const dateDisp = d ? d.toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '-';
                    const air  = getAnyValue(item, ['Air Code','airCode','AirCode','air code']) || '-';
                    const inst = getAnyValue(item, ['งวดที่','installment','งวด']) || '-';
                    const amt2 = cleanNumber(getAnyValue(item, ['ค่างวดประจำ','amount','ยอดเงิน','ยอดชำระ','ยอด']));
                    const st   = (getAnyValue(item, ['สถานะ','status']) || '-').toString();
                    const sc   = st.includes('เกินกำหนด') ? 'color:var(--danger)' : st.includes('ยังไม่ถึงกำหนด') ? 'color:var(--warning)' : 'color:var(--success)';
                    return `<tr style="${ii%2===1?'background:rgba(255,255,255,0.03)':''}">
                        <td style="padding:4px 8px;text-align:center;color:var(--text-muted)">${ii+1}</td>
                        <td style="padding:4px 8px;text-align:center;white-space:nowrap">${dateDisp}</td>
                        <td style="padding:4px 8px;text-align:center;color:var(--text-dim)">${air}</td>
                        <td style="padding:4px 8px;text-align:center">${inst}</td>
                        <td style="padding:4px 8px;text-align:right;font-weight:700;color:var(--accent)">${amt2.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                        <td style="padding:4px 8px;text-align:center;font-weight:700;font-size:11px;${sc}">${st}</td>
                    </tr>`;
                }).join('');
                const subtotal = `<tr style="border-top:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.07)">
                    <td colspan="4" style="padding:4px 8px;text-align:right;font-size:11px;color:var(--text-dim)">รวมสัญญานี้</td>
                    <td style="padding:4px 8px;text-align:right;font-weight:700;color:var(--accent)">${cdata.sum.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                    <td></td>
                </tr>`;
                return `<div class="ctr-acc">
                    <button type="button" class="ctr-acc-head">
                        <span class="ctr-toggle"><i class="fas fa-plus"></i></span>
                        <span class="ctr-cname">${cname}</span>
                        <span class="ctr-meta">${cdata.items.length} งวด</span>
                        <span class="ctr-amt">${cdata.sum.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                    </button>
                    <div class="ctr-acc-body">
                        <table class="status-modal-table" style="font-size:11px;">
                            <thead><tr>
                                <th style="width:40px;text-align:center">#</th>
                                <th style="text-align:center">กำหนดชำระ</th>
                                <th style="text-align:center">Air Code</th>
                                <th style="text-align:center;width:60px">งวดที่</th>
                                <th style="text-align:right">ค่างวดประจำ</th>
                                <th style="text-align:center">สถานะ</th>
                            </tr></thead>
                            <tbody>${itemRows}${subtotal}</tbody>
                        </table>
                    </div>
                </div>`;
            }).join('');
            return `<div class="cat-accordion" data-cat-idx="${li}">
                <button type="button" class="cat-accordion-head">
                    <span class="cat-accordion-toggle"><i class="fas fa-plus"></i></span>
                    <span class="cat-accordion-name" title="${lname}">${lname}</span>
                    <span class="cat-accordion-count">${Object.keys(ldata.contracts).length} สัญญา</span>
                    <span class="cat-accordion-pct">${pct(ldata.sum)}</span>
                    <span class="cat-accordion-amt">${fmtMoney(ldata.sum)}</span>
                </button>
                <div class="cat-accordion-body">
                    <div class="ctr-acc-list">${contractAccordions}</div>
                </div>
            </div>`;
        }).join('');
    const contractViewHtml = `
        <div class="status-modal-scroll" data-view-pane="contract" hidden>
            <style>
                .ctr-acc-head{width:100%;display:flex;align-items:center;gap:8px;padding:7px 12px;background:transparent;border:none;cursor:pointer;font-family:inherit;color:inherit;border-top:1px solid rgba(255,255,255,0.06);}
                .ctr-acc-head:hover{background:rgba(99,102,241,0.08);}
                .ctr-toggle{font-size:11px;color:var(--accent);min-width:14px;}
                .ctr-cname{flex:1;font-size:12px;font-weight:600;text-align:left;color:var(--accent);}
                .ctr-meta{font-size:11px;color:var(--text-dim);}
                .ctr-amt{font-size:12px;font-weight:700;color:var(--accent);margin-left:auto;}
                .ctr-acc-body{display:none;padding:0 0 4px 0;}
                .ctr-acc.expanded .ctr-acc-body{display:block;}
                .ctr-acc-list{padding:4px 8px 4px 24px;}
            </style>
            <div class="cat-accordion-list">${contractCardsHtml}</div>
        </div>`;

    bodyEl.innerHTML = `
        <div class="status-modal-summary">
            <span>รายการทั้งหมด: <b>${data.length} รายการ</b></span>
            <span>ยอดรวม: <b>${fmtMoney(totalAmt)}</b></span>
            <div class="status-modal-view-toggle">
                <button type="button" class="view-toggle-btn active" data-view="list"><i class="fas fa-list"></i> รายการ</button>
                <button type="button" class="view-toggle-btn" data-view="category"><i class="fas fa-layer-group"></i> สรุปหมวดหมู่</button>
                <button type="button" class="view-toggle-btn" data-view="contract"><i class="fas fa-folder-open"></i> รวมกลุ่มสัญญา</button>
            </div>
            <button type="button" class="btn-export-status-pdf"><i class="fas fa-file-pdf"></i> Export PDF</button>
        </div>
        ${listViewHtml}
        ${categoryViewHtml}
        ${contractViewHtml}`;

    // สลับ view
    bodyEl.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            bodyEl.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
            bodyEl.querySelectorAll('[data-view-pane]').forEach(p => { p.hidden = p.dataset.viewPane !== view; });
        });
    });

    // ปุ่ม + เพื่อกาง/พับ รายการในแต่ละหมวด
    bodyEl.querySelectorAll('.cat-accordion-head').forEach(head => {
        head.addEventListener('click', () => {
            const wrap = head.closest('.cat-accordion');
            const expanded = wrap.classList.toggle('expanded');
            const icon = head.querySelector('.cat-accordion-toggle i');
            if (icon) icon.className = expanded ? 'fas fa-minus' : 'fas fa-plus';
        });
    });
    bodyEl.querySelectorAll('.ctr-acc-head').forEach(head => {
        head.addEventListener('click', () => {
            const wrap = head.closest('.ctr-acc');
            const expanded = wrap.classList.toggle('expanded');
            const icon = head.querySelector('.ctr-toggle i');
            if (icon) icon.className = expanded ? 'fas fa-minus' : 'fas fa-plus';
        });
    });

    // ปุ่ม Export PDF — ส่งออกตาม view ที่กำลังเปิดอยู่
    const btnExportPdf = bodyEl.querySelector('.btn-export-status-pdf');
    if (btnExportPdf) {
        btnExportPdf.addEventListener('click', () => {
            const activeView = bodyEl.querySelector('.view-toggle-btn.active')?.dataset.view || 'list';
            exportStatusPDF({
                title, data, totalAmt, cols, groups, view: activeView,
                fmtMoney, pct, headerRowHtml, buildRow, contractGroupMap
            });
        });
    }

    modal.style.display = 'flex';
}

function exportStatusPDF({ title, data, totalAmt, cols, groups, view, fmtMoney, pct, headerRowHtml, buildRow, contractGroupMap }) {
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) { alert('กรุณาอนุญาต popup'); return; }

    // ตัด inline width ออกเพื่อให้ตารางยืดพอดี A4 portrait
    const stripWidth = html => html.replace(/width:\s*[^;"']+;?/gi, '');

    let bodyContent = '';
    if (view === 'contract') {
        const cgMap = contractGroupMap || {};
        const cgEntries = Object.entries(cgMap).sort((a, b) => b[1].sum - a[1].sum);
        if (cgEntries.length === 0) {
            bodyContent = '<div class="empty">ไม่พบข้อมูล</div>';
        } else {
            bodyContent = cgEntries.map(([lname, ldata], li) => {
                const contracts = Object.entries(ldata.contracts).sort((a, b) => b[1].sum - a[1].sum);
                const contractSections = contracts.map(([cname, cdata], ci) => {
                    const itemRows = cdata.items.map((item, ii) => {
                        const rawDate = getAnyValue(item, ['กำหนดชำระ', 'dueDate']);
                        const d = parseDueDate(rawDate);
                        const dateDisp = d ? d.toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : (rawDate || '-');
                        const air = getAnyValue(item, ['Air Code', 'airCode', 'AirCode', 'air code']) || '-';
                        const inst = getAnyValue(item, ['งวดที่', 'installment', 'งวด']) || '-';
                        const amt2 = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด']));
                        const st = getAnyValue(item, ['สถานะ', 'status']) || '-';
                        const sc = st.includes('เกินกำหนด') ? 'color:#dc2626' : st.includes('ยังไม่ถึงกำหนด') ? 'color:#d97706' : 'color:#059669';
                        return `<tr style="${ii%2===1?'background:#f8fafc':''}">
                            <td style="text-align:center;color:#9ca3af">${ii+1}</td>
                            <td style="text-align:center;white-space:nowrap">${dateDisp}</td>
                            <td style="text-align:center;color:#6b7280">${air}</td>
                            <td style="text-align:center">${inst}</td>
                            <td style="text-align:right;font-weight:700;color:#1d4ed8">${amt2.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                            <td style="text-align:center;font-weight:700;font-size:10px;${sc}">${st}</td>
                        </tr>`;
                    }).join('');
                    const subtotal = `<tr style="background:#eff6ff;border-top:1px solid #bfdbfe">
                        <td colspan="4" style="text-align:right;font-size:10px;color:#6b7280;padding:4px 6px">รวมสัญญานี้</td>
                        <td style="text-align:right;font-weight:700;color:#1d4ed8;padding:4px 6px">${cdata.sum.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                        <td></td>
                    </tr>`;
                    return `<section class="ctr-section">
                        <div class="ctr-head">
                            <span class="ctr-num">${li+1}.${ci+1}</span>
                            <span class="ctr-name">${cname}</span>
                            <span class="ctr-meta">${cdata.items.length} งวด · <b>${cdata.sum.toLocaleString(undefined,{minimumFractionDigits:2})}</b></span>
                        </div>
                        <table>
                            <colgroup>
                                <col style="width:5%"><col style="width:12%"><col style="width:12%">
                                <col style="width:8%"><col style="width:14%"><col style="width:12%">
                            </colgroup>
                            <thead><tr>
                                <th>#</th><th>กำหนดชำระ</th><th>Air Code</th>
                                <th>งวดที่</th><th style="text-align:right">ค่างวดประจำ</th><th>สถานะ</th>
                            </tr></thead>
                            <tbody>${itemRows}${subtotal}</tbody>
                        </table>
                    </section>`;
                }).join('');
                return `<section class="cat-section">
                    <div class="cat-section-head">
                        <span class="cat-section-num">${li+1}.</span>
                        <span class="cat-section-name">${lname}</span>
                        <span class="cat-section-meta">${Object.keys(ldata.contracts).length} สัญญา · <b>${ldata.sum.toLocaleString(undefined,{minimumFractionDigits:2})}</b></span>
                    </div>
                    ${contractSections}
                </section>`;
            }).join('');
        }
    } else if (view === 'category') {
        if (groups.length === 0) {
            bodyContent = '<div class="empty">ไม่พบข้อมูล</div>';
        } else {
            bodyContent = groups.map((g, idx) => {
                const itemRows = g.items.map((item, i) => buildRow(item, i)).join('');
                return `
                    <section class="cat-section">
                        <div class="cat-section-head">
                            <span class="cat-section-num">${idx + 1}.</span>
                            <span class="cat-section-name">${g.name}</span>
                            <span class="cat-section-meta">${g.count.toLocaleString()} รายการ · ${pct(g.sum)} · <b>${fmtMoney(g.sum)}</b></span>
                        </div>
                        <table>
                            <colgroup>
                                <col style="width:5%"><col style="width:10%"><col style="width:31%"><col style="width:15%">
                                <col style="width:10%"><col style="width:6%"><col style="width:12%"><col style="width:11%">
                            </colgroup>
                            <thead><tr>${stripWidth(headerRowHtml)}</tr></thead>
                            <tbody>${stripWidth(itemRows)}</tbody>
                        </table>
                    </section>`;
            }).join('');
        }
    } else {
        const itemRows = data.length === 0
            ? `<tr><td colspan="${cols.length + 1}" class="empty">ไม่พบข้อมูล</td></tr>`
            : data.map((item, i) => buildRow(item, i)).join('');
        bodyContent = `
            <table>
                <colgroup>
                    <col style="width:5%"><col style="width:10%"><col style="width:31%"><col style="width:15%">
                    <col style="width:10%"><col style="width:6%"><col style="width:12%"><col style="width:11%">
                </colgroup>
                <thead><tr>${stripWidth(headerRowHtml)}</tr></thead>
                <tbody>${stripWidth(itemRows)}</tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="${cols.length}" style="text-align:right;font-weight:700;white-space:nowrap">ยอดรวม (${data.length.toLocaleString()} รายการ)</td>
                        <td style="text-align:right;font-weight:700;white-space:nowrap">${fmtMoney(totalAmt)}</td>
                    </tr>
                </tfoot>
            </table>`;
    }

    const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    win.document.write(`<!DOCTYPE html><html lang="th"><head>
        <meta charset="UTF-8"><title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --accent: #1d4ed8;
                --accent-teal: #14b8a6;
                --danger: #dc2626;
                --warning: #d97706;
                --success: #059669;
                --text-dim: #6b7280;
                --text-muted: #9ca3af;
            }
            @page { size: A4 portrait; margin: 10mm; }
            @media print {
                .toolbar { display: none !important; }
                body { background: #fff; }
                thead tr { background: #1d4ed8 !important; }
                thead th { color: #fff !important; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                thead { display: table-header-group; }
                tr { page-break-inside: avoid; }
                .cat-section { page-break-inside: auto; }
                .cat-section-head { page-break-after: avoid; }
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Sarabun', sans-serif; background: #e5e7eb; color: #111827; }
            .toolbar {
                position: sticky; top: 0; z-index: 10;
                background: #1e293b; color: #fff;
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 20px;
            }
            .toolbar-title { font-size: 13px; color: #94a3b8; }
            .btn-print { background: #1d4ed8; color: #fff; border: none; padding: 8px 18px; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
            .doc { padding: 14px; max-width: 210mm; margin: 0 auto; background: #fff; }
            h1 { font-size: 14px; font-weight: 700; margin-bottom: 4px; color: #0f172a; }
            .doc-meta { font-size: 10px; color: #6b7280; margin-bottom: 12px; }
            .doc-meta b { color: #0f172a; }

            table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; margin-bottom: 8px; }
            th, td { border: 1px solid #cbd5e1; padding: 4px 5px; word-wrap: break-word; overflow-wrap: break-word; }
            th { background: #1d4ed8; color: #fff; text-align: center; border-color: #1e3a8a; font-weight: 700; font-size: 9px; }
            td { color: #111827; vertical-align: middle; }
            tbody tr:nth-child(even) td { background: #f8fafc; }
            tfoot tr.total-row td { background: #dbeafe !important; color: #0f172a; font-size: 10px; border-top: 2px solid #1d4ed8; }

            .cat-section { margin-bottom: 14px; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; }
            .cat-section-head {
                background: #eff6ff; padding: 6px 10px;
                display: flex; align-items: center; gap: 8px;
                border-bottom: 1px solid #cbd5e1;
                font-size: 10px;
            }
            .cat-section-num { color: #6b7280; font-weight: 700; }
            .cat-section-name { color: #0f172a; font-weight: 700; flex: 1; }
            .cat-section-meta { color: #1d4ed8; font-weight: 600; white-space: nowrap; }
            .cat-section-meta b { color: #0f172a; }
            .cat-section table { margin-bottom: 0; border: none; }
            .cat-section table th { background: #1d4ed8; }
            .ctr-section { margin: 0 0 8px 16px; border: 1px solid #dbeafe; border-radius: 3px; overflow: hidden; }
            .ctr-head { background: #dbeafe; padding: 4px 8px; display: flex; align-items: center; gap: 6px; font-size: 9px; border-bottom: 1px solid #bfdbfe; }
            .ctr-num { color: #1d4ed8; font-weight: 700; }
            .ctr-name { color: #1e3a8a; font-weight: 700; flex: 1; }
            .ctr-meta { color: #1d4ed8; white-space: nowrap; }
            .ctr-section table { font-size: 8px; }
            .ctr-section table th { background: #1d4ed8; font-size: 8px; }

            .empty { text-align: center; padding: 40px; color: #6b7280; font-size: 11px; }
        </style></head><body>
        <div class="toolbar">
            <span class="toolbar-title">${title} — ${dateStr}</span>
            <button class="btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
        </div>
        <div class="doc">
            ${buildThaiDrillHeader(title, dateStr)}
            <div class="doc-meta">
                จำนวน <b>${data.length.toLocaleString()} รายการ</b>
                · ยอดรวม <b>${fmtMoney(totalAmt)}</b>
                ${view === 'category' ? ` · <b>${groups.length}</b> หมวดหมู่ (ตามชื่อลิสซิ่ง)` : ''}
            </div>
            ${bodyContent}
        </div>
        </body></html>`);
    win.document.close();
}

function renderTable(data) {
    const wrapper = document.getElementById('paymentTableWrapper');
    if (!wrapper) return;

    const countBadge = document.getElementById('cardCount');
    if (countBadge) countBadge.textContent = `${data.length.toLocaleString()} รายการ`;

    if (data.length === 0) {
        wrapper.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><span>ไม่พบข้อมูลที่ตรงกับเงื่อนไข</span></div>`;
        return;
    }

    // กรองตาม table filter (ปี/เดือน/ลิสซิ่ง/สถานะ/search ของตาราง — รองรับเลือกหลายค่า)
    const tYears = getMultiSelectSelected('table-filter-year');
    const tMonths = getMultiSelectSelected('table-filter-month');
    const tLeasings = getMultiSelectSelected('table-filter-leasing');
    const tAircodes = getMultiSelectSelected('table-filter-aircode');
    const tStatuses = getMultiSelectSelected('table-filter-status');
    const tSearch = (document.getElementById('searchInput')?.value || '').toLowerCase();

    const filtered = data.filter(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        const matchY = !tYears.size || (!isNaN(d) && tYears.has(d.getFullYear().toString()));
        const matchM = !tMonths.size || (!isNaN(d) && tMonths.has(d.getMonth().toString()));
        const matchL = !tLeasings.size || tLeasings.has(String(getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท'])));
        const matchAir = !tAircodes.size || tAircodes.has(String(getAnyValue(item, ['Air Code', 'airCode', 'AirCode', 'air code'])));
        const matchSt = !tStatuses.size || tStatuses.has(String(getAnyValue(item, ['สถานะ', 'status'])));
        const matchS = !tSearch || Object.values(item).some(v => v && v.toString().toLowerCase().includes(tSearch));
        return matchY && matchM && matchL && matchAir && matchSt && matchS;
    });

    if (countBadge) countBadge.textContent = `${filtered.length.toLocaleString()} รายการ`;

    let rows = '';
    filtered.forEach((item, i) => {
        const dueDate = formatDate(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        const plate    = getAnyValue(item, ['ทะเบียนรถ', 'plate', 'ทะเบียน']) || '-';
        const leasing  = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท']) || '-';
        const contract = getAnyValue(item, ['เลขสัญญา', 'contract', 'สัญญา']) || '-';
        const aircode  = getAnyValue(item, ['Air Code', 'airCode', 'AirCode', 'air code']) || '-';
        const inst     = getAnyValue(item, ['งวดที่', 'installment', 'งวด']) || '-';
        const amount   = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด']));
        const status   = getAnyValue(item, ['สถานะ', 'status']) || '-';

        let badgeClass = 'status-default';
        if (status.includes('โอนเงิน') || status.includes('จ่ายแล้ว')) badgeClass = 'status-paid';
        else if (status.includes('ยังไม่ถึงกำหนด')) badgeClass = 'status-pending';
        else if (status.includes('เกินกำหนด')) badgeClass = 'status-overdue';

        rows += `<tr>
            <td class="col-num">${i + 1}</td>
            <td class="col-center">${dueDate}</td>
            <td>${leasing}</td>
            <td style="color:var(--text-dim)">${contract}</td>
            <td class="col-center">${aircode}</td>
            <td class="col-center">${inst}</td>
            <td class="col-center"><span class="status-badge ${badgeClass}">${status}</span></td>
            <td class="col-amount">${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td class="col-center"><button class="btn-view-details" style="width:auto;padding:5px 12px;" data-idx="${i}"><i class="fas fa-eye"></i></button></td>
        </tr>`;
    });

    wrapper.innerHTML = `<table class="payment-table">
        <thead><tr>
            <th style="text-align:center;width:50px">ลำดับ</th>
            <th style="text-align:center;width:110px">กำหนดชำระ</th>
            <th style="width:220px">ชื่อลิสซิ่ง</th>
            <th style="width:160px">เลขสัญญา</th>
            <th style="text-align:center;width:160px">Air Code</th>
            <th style="text-align:center;width:70px">งวดที่</th>
            <th style="text-align:center;width:120px">สถานะ</th>
            <th style="text-align:right;width:140px">ชำระเงิน</th>
            <th style="text-align:center;width:60px"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;

    wrapper.querySelectorAll('.btn-view-details').forEach((btn, i) => {
        btn.addEventListener('click', () => showDetailModal(filtered[i]));
    });
}

function showDetailModal(item) {
    const modal = document.getElementById('detailModal');
    const modalBody = document.getElementById('modalBody');
    if (!modal || !modalBody) return;

    const fields = [
        { label: 'กำหนดชำระ', keys: ['กำหนดชำระ', 'dueDate'], isDate: true },
        { label: 'ชื่อลิสซิ่ง', keys: ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท'] },
        { label: 'เลขสัญญา', keys: ['เลขสัญญา', 'contract', 'สัญญา'] },
        { label: 'ทะเบียนรถ', keys: ['ทะเบียนรถ', 'plate', 'ทะเบียน'] },
        { label: 'Air Code', keys: ['Air Code', 'airCode'] },
        { label: 'งวดที่', keys: ['งวดที่', 'installment', 'งวด'] },
        { label: 'สถานะ', keys: ['สถานะ', 'status', 'state'] },
        { label: 'ค่างวดประจำ', keys: ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด', 'ชำระ', 'เงิน', 'sum'], isAmount: true },
        { label: 'รายละเอียด/หมายเหตุ', keys: ['รายละเอียด', 'description', 'คำอธิบาย', 'Description', 'หมายเหตุ'] }
    ];

    modalBody.innerHTML = '';
    fields.forEach(f => {
        let val = getAnyValue(item, f.keys);
        if (f.isDate) val = formatDate(val);
        if (f.isAmount) val = `${cleanNumber(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        const div = document.createElement('div');
        div.className = 'detail-item';
        if (f.label === 'รายละเอียด/หมายเหตุ') {
            div.classList.add('full-width');
        }
        div.innerHTML = `
            <span class="detail-label">${f.label}</span>
            <span class="detail-value">${val || '-'}</span>
        `;
        modalBody.appendChild(div);
    });

    modal.style.display = "flex";
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    const date = new Date(dateStr);
    return isNaN(date) ? dateStr : date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function initFilterOptions(data) {
    const years = new Set();
    const leasings = new Set();
    const statuses = new Set();

    const aircodes = new Set();

    data.forEach(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        if (!isNaN(d)) years.add(d.getFullYear());
        const lease = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing']);
        if (lease && lease !== "") leasings.add(lease);
        const status = getAnyValue(item, ['สถานะ', 'status']);
        if (status && status !== "") statuses.add(status);
        const aircode = getAnyValue(item, ['Air Code', 'airCode', 'AirCode', 'air code']);
        if (aircode && aircode !== "") aircodes.add(aircode);
    });

    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    initMultiSelect('filter-year', Array.from(years).sort().map(y => String(y)));
    initMultiSelect('filter-month', thaiMonths.map((m, i) => ({ value: String(i), label: m })));
    initMultiSelect('filter-date', Array.from({length: 31}, (_, i) => String(i + 1)));
    initMultiSelect('filter-leasing', Array.from(leasings).sort());
    initMultiSelect('filter-aircode', Array.from(aircodes).sort());
    initMultiSelect('filter-status', Array.from(statuses).sort());
    initMultiSelect('trend-filter-year', Array.from(years).sort().map(y => String(y)));
    initMultiSelect('trend-filter-leasing', Array.from(leasings).sort());
    initMultiSelect('trend-filter-status', Array.from(statuses).sort());
    initMultiSelect('step-filter-year', Array.from(years).sort().map(y => String(y)));
    initMultiSelect('step-filter-month', thaiMonths.map((m, i) => ({ value: String(i), label: m })));
    initMultiSelect('step-filter-status', Array.from(statuses).sort());
    initChartFilterListeners();
}

function _applyChartLocalFilter(src, ids) {
    const y = ids.year    ? getMultiSelectSelected(ids.year)    : new Set();
    const m = ids.month   ? getMultiSelectSelected(ids.month)   : new Set();
    const l = ids.leasing ? getMultiSelectSelected(ids.leasing) : new Set();
    const s = ids.status  ? getMultiSelectSelected(ids.status)  : new Set();
    if (!y.size && !m.size && !l.size && !s.size) return src;
    return src.filter(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        return (!y.size || (!isNaN(d) && y.has(d.getFullYear().toString())))
            && (!m.size || (!isNaN(d) && m.has(d.getMonth().toString())))
            && (!l.size || l.has(String(getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing']))))
            && (!s.size || s.has(String(getAnyValue(item, ['สถานะ', 'status']))));
    });
}
function applyTrendChartFilter() {
    const ids = { year:'trend-filter-year', leasing:'trend-filter-leasing', status:'trend-filter-status' };
    const base = _lastFilteredData.length > 0 ? _lastFilteredData : allData;
    renderTrendChart(_applyChartLocalFilter(base, ids));
}
function applyStepChartFilter() {
    const ids = { year:'step-filter-year', month:'step-filter-month', status:'step-filter-status' };
    const base = _lastFilteredData.length > 0 ? _lastFilteredData : allData;
    renderStepLineChart(_applyChartLocalFilter(base, ids));
}
function initChartFilterListeners() {
    const dT = debounce(applyTrendChartFilter, 200);
    const dS = debounce(applyStepChartFilter, 200);
    ['trend-filter-year','trend-filter-leasing','trend-filter-status'].forEach(id => {
        const el = document.getElementById(id); if (el) el.addEventListener('change', dT);
    });
    ['step-filter-year','step-filter-month','step-filter-status'].forEach(id => {
        const el = document.getElementById(id); if (el) el.addEventListener('change', dS);
    });
    const tR = document.getElementById('trend-filter-reset');
    if (tR) tR.addEventListener('click', () => {
        ['trend-filter-year','trend-filter-leasing','trend-filter-status'].forEach(id => resetMultiSelect(id));
        applyTrendChartFilter();
    });
    const sR = document.getElementById('step-filter-reset');
    if (sR) sR.addEventListener('click', () => {
        ['step-filter-year','step-filter-month','step-filter-status'].forEach(id => resetMultiSelect(id));
        applyStepChartFilter();
    });
}
function applyFilters() {
    // ตัวกรองบนหัวเว็บใช้กรองเฉพาะกราฟ "แนวโน้มยอดชำระรายเดือน" + "ยอดค่างวดตามชื่อรหัส"
    // รองรับการเลือกหลายค่า ถ้า Set ว่าง = ผ่านทุกค่า
    const years = getMultiSelectSelected('filter-year');
    const months = getMultiSelectSelected('filter-month');
    const days = getMultiSelectSelected('filter-date');
    const leasings = getMultiSelectSelected('filter-leasing');
    const aircodes = getMultiSelectSelected('filter-aircode');
    const statuses = getMultiSelectSelected('filter-status');

    const filtered = allData.filter(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        const matchYear = !years.size || (!isNaN(d) && years.has(d.getFullYear().toString()));
        const matchMonth = !months.size || (!isNaN(d) && months.has(d.getMonth().toString()));
        const matchDay = !days.size || (!isNaN(d) && days.has(d.getDate().toString()));
        const matchLeasing = !leasings.size || leasings.has(String(getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing'])));
        const matchAircode = !aircodes.size || aircodes.has(String(getAnyValue(item, ['Air Code', 'airCode', 'AirCode', 'air code'])));
        const matchStatus = !statuses.size || statuses.has(String(getAnyValue(item, ['สถานะ', 'status'])));
        return matchYear && matchMonth && matchDay && matchLeasing && matchAircode && matchStatus;
    });
    updateKPIs(filtered);
}

function updateDashboard(data) {
    _lastFilteredData = data;
    updateKPIs(data);
    renderTable(data);
    renderCharts(data);
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;
    applyTrendChartFilter();
    applyStepChartFilter();
}

function renderTrendChart(data) {
    const canvas = document.getElementById('monthlyTrendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const monthlyData = {};
    if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
    data.forEach(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate']));
        if (!isNaN(d)) {
            const m = d.toLocaleDateString('th-TH', { month: 'short' });
            const amt = getAnyValue(item, ['ค่างวดประจำ', 'amount']);
            monthlyData[m] = (monthlyData[m] || 0) + (parseFloat(amt) || 0);
        }
    });
    const labels = Object.keys(monthlyData);
    const values = Object.values(monthlyData);

    // ถ้ามีกราฟอยู่แล้ว — อัปเดตในที่เพื่อให้ Chart.js ทำ animation ระหว่างค่าเก่า→ใหม่
    if (charts.trend) {
        charts.trend.data.labels = labels;
        charts.trend.data.datasets[0].data = values;
        // ลด animation duration ตอน update เพื่อให้ไม่หน่วงเวลากรอง
        if (charts.trend.options.animation) charts.trend.options.animation.duration = 300;
        charts.trend.update();
        // เพิ่ม pulse สั้น ๆ ที่ card เพื่อ feedback ว่าฟิลเตอร์เปลี่ยน
        const card = canvas.closest('.chart-card') || canvas.parentElement;
        if (card) {
            card.classList.remove('filter-pulse');
            void card.offsetWidth;
            card.classList.add('filter-pulse');
        }
        return;
    }

    const isMobile = window.innerWidth <= 700;
    charts.trend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'ยอดชำระ', data: values, backgroundColor: '#3b82f6', borderRadius: 6 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutCubic' },
            animations: {
                y: { duration: 800, easing: 'easeOutCubic', from: (ctx) => ctx.chart.scales.y.getPixelForValue(0) },
                numbers: { duration: 800, easing: 'easeOutCubic' }
            },
            transitions: {
                active: { animation: { duration: 400 } }
            },
            layout: { padding: { top: 40, right: 10 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ctx.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2 })
                    }
                },
                datalabels: {
                    display: !isMobile,
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    rotation: 0,
                    color: '#e2e8f0',
                    font: { family: 'Sarabun, sans-serif', weight: '800', size: 14 },
                    textStrokeColor: 'rgba(15,23,42,0.95)',
                    textStrokeWidth: 3,
                    clamp: true,
                    clip: false,
                    formatter: (value) => {
                        if (value >= 1000000) return (value / 1000000).toFixed(0) + 'M';
                        if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
                        return value.toLocaleString();
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: isMobile ? 9 : 11 },
                        callback: (value) => value >= 1000000 ? (value / 1000000).toFixed(0) + 'M' : value.toLocaleString()
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    beginAtZero: true
                },
                x: {
                    ticks: { color: '#94a3b8', font: { size: isMobile ? 9 : 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}

// ===== DAILY PDF REPORT =====

let deskSelectedDates = new Set();
let deskCalYear = new Date().getFullYear();
let deskCalMonth = new Date().getMonth();

function deskToDateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function deskGetDatesWithData() {
    const keys = new Set();
    allData.forEach(item => {
        const raw = getAnyValue(item, ['กำหนดชำระ', 'dueDate', 'วันที่']);
        const d = new Date(raw);
        if (!isNaN(d)) keys.add(deskToDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    });
    return keys;
}

function populateDeskCalSelects() {
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const mSel = document.getElementById('deskCalMonthSel');
    const ySel = document.getElementById('deskCalYearSel');
    if (!mSel || !ySel) return;

    if (mSel.options.length === 0) {
        thaiMonths.forEach((m, i) => {
            const o = document.createElement('option'); o.value = i; o.textContent = m; mSel.appendChild(o);
        });
        for (let y = 2020; y <= 2035; y++) {
            const o = document.createElement('option'); o.value = y; o.textContent = y + 543; ySel.appendChild(o);
        }
        mSel.addEventListener('change', () => { deskCalMonth = +mSel.value; renderDeskCalendar(); });
        ySel.addEventListener('change', () => { deskCalYear = +ySel.value; renderDeskCalendar(); });
    }
    mSel.value = deskCalMonth;
    ySel.value = deskCalYear;
}

function renderDeskCalendar() {
    const grid = document.getElementById('deskCalGrid');
    if (!grid) return;
    populateDeskCalSelects();

    const hasData = deskGetDatesWithData();
    const today = new Date();
    const todayKey = deskToDateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const firstDay = new Date(deskCalYear, deskCalMonth, 1).getDay();
    const daysInMonth = new Date(deskCalYear, deskCalMonth + 1, 0).getDate();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<div class="pdf-cal-day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const key = deskToDateKey(deskCalYear, deskCalMonth, d);
        const cls = ['pdf-cal-day',
            hasData.has(key) ? 'has-data' : '',
            deskSelectedDates.has(key) ? 'selected' : '',
            key === todayKey ? 'today' : '',
        ].filter(Boolean).join(' ');
        html += `<div class="${cls}" data-key="${key}">${d}</div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.pdf-cal-day:not(.empty)').forEach(el => {
        el.addEventListener('click', () => {
            const k = el.dataset.key;
            if (deskSelectedDates.has(k)) { deskSelectedDates.delete(k); el.classList.remove('selected'); }
            else { deskSelectedDates.add(k); el.classList.add('selected'); }
            updateDeskCalBar();
        });
    });

    updateDeskCalBar();
}

function updateDeskCalBar() {
    const bar = document.getElementById('deskCalBar');
    if (!bar) return;
    const count = deskSelectedDates.size;
    bar.textContent = count === 0 ? 'ยังไม่ได้เลือกวันที่' : `เลือกแล้ว ${count} วัน`;
    bar.style.color = count > 0 ? 'var(--accent)' : 'var(--text-dim)';
}

function openPDFModal() {
    const modal = document.getElementById('pdfModal');
    if (!modal) return;
    const today = new Date();
    deskCalYear = today.getFullYear();
    deskCalMonth = today.getMonth();
    deskSelectedDates.clear();
    document.getElementById('pdfPreviewArea').style.display = 'none';
    modal.style.display = 'flex';
    renderDeskCalendar();

    document.getElementById('deskCalPrev').onclick = () => {
        deskCalMonth--; if (deskCalMonth < 0) { deskCalMonth = 11; deskCalYear--; }
        renderDeskCalendar();
    };
    document.getElementById('deskCalNext').onclick = () => {
        deskCalMonth++; if (deskCalMonth > 11) { deskCalMonth = 0; deskCalYear++; }
        renderDeskCalendar();
    };
    document.getElementById('deskCalSelAll').onclick = () => {
        const hasData = deskGetDatesWithData();
        const days = new Date(deskCalYear, deskCalMonth + 1, 0).getDate();
        for (let d = 1; d <= days; d++) {
            const k = deskToDateKey(deskCalYear, deskCalMonth, d);
            if (hasData.has(k)) deskSelectedDates.add(k);
        }
        renderDeskCalendar();
    };
    document.getElementById('deskCalClear').onclick = () => {
        deskSelectedDates.clear();
        renderDeskCalendar();
    };
}

function buildReportHTML(selectedDatesArr, dayData) {
    const dateStr = selectedDatesArr.length === 1
        ? selectedDatesArr[0].toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
        : selectedDatesArr.map(d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })).join(', ');
    const printedAt = new Date().toLocaleString('th-TH');

    let totalAmount = 0;
    let paidCount = 0;
    dayData.forEach(item => {
        totalAmount += cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด']));
        const st = getAnyValue(item, ['สถานะ', 'status']) || '';
        if (st.includes('โอนเงิน') || st.includes('จ่ายแล้ว')) paidCount++;
    });

    let tableRows = '';
    dayData.forEach((item, i) => {
        const rawDue = getAnyValue(item, ['กำหนดชำระ', 'dueDate', 'วันที่']) || '';
        const dueObj = new Date(rawDue);
        const dateDisplay = !isNaN(dueObj) ? `${String(dueObj.getDate()).padStart(2, '0')}/${String(dueObj.getMonth() + 1).padStart(2, '0')}/${dueObj.getFullYear() + 543}` : (rawDue || '-');
        const plate = getAnyValue(item, ['ทะเบียนรถ', 'plate', 'ทะเบียน']) || '-';
        const leasing = getAnyValue(item, ['ชื่อลิสซิ่ง', 'leasing', 'บริษัท']) || '-';
        const contract = getAnyValue(item, ['เลขสัญญา', 'contract', 'สัญญา']) || '-';
        const installment = getAnyValue(item, ['งวดที่', 'installment', 'งวด']) || '-';
        const amount = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ']));
        const status = getAnyValue(item, ['สถานะ', 'status']) || '-';
        const isPaid = status.includes('โอนเงิน') || status.includes('จ่ายแล้ว');
        const sColor = isPaid ? '#16a34a' : status.includes('ยังไม่ถึงกำหนด') || status.includes('รอ') ? '#b45309' : '#374151';
        const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';

        tableRows += `
            <tr style="background:${rowBg};">
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#6b7280;">${i + 1}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#374151;white-space:nowrap;">${dateDisplay}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:10px;font-weight:700;color:#111827;line-height:1.4;">${plate}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;color:#374151;line-height:1.4;">${leasing}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:10px;color:#6b7280;line-height:1.4;">${contract}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:11px;color:#374151;white-space:nowrap;">${installment}</td>
                <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-size:11px;font-weight:700;color:#1d4ed8;white-space:nowrap;">${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
                <td style="padding:10px;text-align:right;font-size:15px;font-weight:800;color:#1d4ed8;border:1px solid #cbd5e1;">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style="border:1px solid #cbd5e1;"></td>
            </tr>
        </tfoot>` : '';

    const pendingCount = dayData.length - paidCount;

    // สรุปยอดตามลิสซิ่ง (Group by leasing company)
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
                <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:700;color:#1d4ed8;font-size:12px;">${info.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
                        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:right;font-weight:800;color:#1d4ed8;font-size:13px;">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>
        </div>` : '';

    const summary = dayData.length > 0 ? `
        <div style="display:flex;gap:12px;margin-top:16px;">
            <div style="flex:1;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;">
                <div style="font-size:10px;font-weight:700;color:#3b82f6;margin-bottom:4px;">ยอดชำระรวม</div>
                <div style="font-size:16px;font-weight:800;color:#1d4ed8;">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
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
            <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;">
                <div style="font-size:10px;color:#9ca3af;">ระบบฐานข้อมูลลิสซิ่ง รถเจาะไทย 2026</div>
                <div style="font-size:10px;color:#9ca3af;">เอกสารนี้สร้างโดยระบบอัตโนมัติ — ห้ามแก้ไข</div>
            </div>
            </div>
        </div>`;
}

function generatePDFPreview() {
    if (deskSelectedDates.size === 0) { alert('กรุณาเลือกวันที่อย่างน้อย 1 วัน'); return; }

    const selectedDatesArr = Array.from(deskSelectedDates).sort().map(k => new Date(k + 'T00:00:00'));
    const keySet = new Set(deskSelectedDates);

    const dayData = allData.filter(item => {
        const d = new Date(getAnyValue(item, ['กำหนดชำระ', 'dueDate', 'วันที่']));
        if (isNaN(d)) return false;
        return keySet.has(deskToDateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    });

    dayData.sort((a, b) =>
        new Date(getAnyValue(a, ['กำหนดชำระ', 'dueDate', 'วันที่'])) -
        new Date(getAnyValue(b, ['กำหนดชำระ', 'dueDate', 'วันที่']))
    );

    const reportHTML = buildReportHTML(selectedDatesArr, dayData);
    const dateVal = Array.from(deskSelectedDates).sort()[0] || 'report';
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
        cursor: pointer; transition: background 0.2s;
    }
    .btn-print:hover { background: #2563eb; }
    .preview-body { padding: 24px; display: flex; justify-content: center; }
    table { page-break-inside: auto; } tr { page-break-inside: avoid; }
    thead { display: table-header-group; } tfoot { display: table-footer-group; }
</style></head>
<body>
<div class="preview-toolbar">
    <div class="preview-toolbar-info">
        <b>${deskSelectedDates.size} วัน · ${dayData.length} รายการ</b> &nbsp;·&nbsp; ยอดรวม ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    </div>
    <button class="btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
</div>
<div class="preview-body">${reportHTML}</div>
</body></html>`);
    previewWin.document.close();
    document.getElementById('pdfModal').style.display = 'none';
}

function downloadDailyPDF() { generatePDFPreview(); }

function renderStepLineChart(data) {
    const canvas = document.getElementById('stepLineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // จัดกลุ่มตามชื่อรหัส (คอลัมน์ B) แล้วรวมยอดค่างวด
    const grouped = {};
    data.forEach(item => {
        const code = (getAnyValue(item, ['ชื่อรหัส', 'รหัส', 'code']) || 'ไม่ระบุ').toString().trim();
        const amt = cleanNumber(getAnyValue(item, ['ค่างวดประจำ', 'amount', 'ยอดเงิน', 'ยอดชำระ', 'ยอด']));
        grouped[code] = (grouped[code] || 0) + amt;
    });

    // เรียงจากน้อยไปมาก เพื่อให้กราฟบันไดขึ้นซ้ายไปขวา
    const sorted = Object.entries(grouped).sort((a, b) => a[1] - b[1]);
    const labels = sorted.map(([k]) => k);
    const values = sorted.map(([, v]) => v);
    const isMobile = window.innerWidth <= 700;

    // เคสข้อมูลเบาบาง — line+stepped ไม่มีเส้นเชื่อม จะดูเหมือนกราฟหายไป
    // ถ้ามี ≤ 2 จุด → render เป็น bar ให้เห็นยอดชัด, ≥ 3 ใช้ stepped line ตามเดิม
    const useBar = labels.length <= 2;
    const pointRadius = labels.length === 1 ? 9 : (isMobile ? 3 : 5);
    // โชว์ยอดเงินทุกจุด — ปรับขนาดฟอนต์ตามจำนวนจุดให้ไม่ทับกัน
    const showLabels = !(isMobile && labels.length > 8);
    const labelsRotated = labels.length > 8;
    const labelFontSize = labels.length > 20 ? 10 : (labels.length > 14 ? 12 : (labels.length > 8 ? 13 : 15));

    const card = canvas.closest('.chart-card') || canvas.parentElement;

    // empty state เมื่อไม่มีข้อมูลเลย
    let emptyEl = card?.querySelector('.chart-empty-state');
    if (labels.length === 0) {
        if (charts.stepLine) { charts.stepLine.destroy(); charts.stepLine = null; }
        canvas.style.display = 'none';
        if (!emptyEl && card) {
            emptyEl = document.createElement('div');
            emptyEl.className = 'chart-empty-state';
            emptyEl.innerHTML = '<i class="fas fa-folder-open"></i><span>ไม่พบข้อมูลที่ตรงกับเงื่อนไข</span>';
            card.querySelector('.chart-wrapper')?.appendChild(emptyEl) || card.appendChild(emptyEl);
        }
        return;
    } else {
        canvas.style.display = '';
        if (emptyEl) emptyEl.remove();
    }

    const datasetCfg = {
        label: 'ยอดค่างวด',
        data: values,
        stepped: !useBar,
        borderColor: '#14b8a6',
        backgroundColor: useBar ? '#14b8a6' : 'rgba(20,184,166,0.08)',
        pointBackgroundColor: '#14b8a6',
        pointBorderColor: '#0f172a',
        pointRadius,
        pointHoverRadius: 9,
        borderWidth: 2,
        borderRadius: useBar ? 6 : undefined,
        fill: !useBar,
        tension: 0
    };

    // ถ้าประเภทกราฟต้องเปลี่ยน → destroy แล้วสร้างใหม่; ไม่งั้นอัปเดตในที่เพื่อแอนิเมท
    if (charts.stepLine && charts.stepLine.config.type === (useBar ? 'bar' : 'line')) {
        charts.stepLine.data.labels = labels;
        Object.assign(charts.stepLine.data.datasets[0], datasetCfg);
        if (charts.stepLine.options?.plugins?.datalabels) {
            const dl = charts.stepLine.options.plugins.datalabels;
            dl.display = showLabels;
            dl.rotation = labelsRotated ? -38 : 0;
            dl.font = { family: 'Sarabun, sans-serif', weight: '700', size: labelFontSize };
            dl.offset = labelsRotated ? 8 : 6;
        }
        if (charts.stepLine.options.animation) charts.stepLine.options.animation.duration = 300;
        charts.stepLine.update();
        if (card) {
            card.classList.remove('filter-pulse');
            void card.offsetWidth;
            card.classList.add('filter-pulse');
        }
        return;
    }
    if (charts.stepLine) { charts.stepLine.destroy(); charts.stepLine = null; }

    charts.stepLine = new Chart(ctx, {
        type: useBar ? 'bar' : 'line',
        data: { labels, datasets: [datasetCfg] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutCubic' },
            transitions: { active: { animation: { duration: 400 } } },
            layout: { padding: { top: labelsRotated ? 56 : 38, right: 16, left: 8 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ctx.parsed.y.toLocaleString(undefined, { minimumFractionDigits: 2 })
                    }
                },
                datalabels: {
                    display: showLabels,
                    anchor: 'end',
                    align: 'top',
                    offset: labelsRotated ? 8 : 6,
                    rotation: labelsRotated ? -38 : 0,
                    color: '#a7f3d0',
                    font: { family: 'Sarabun, sans-serif', weight: '800', size: labelFontSize },
                    textStrokeColor: 'rgba(15,23,42,0.95)',
                    textStrokeWidth: 3,
                    clamp: true,
                    clip: false,
                    formatter: (v) => {
                        if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
                        if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
                        return v.toLocaleString();
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: isMobile ? 8 : 10 },
                        maxRotation: 45,
                        minRotation: 30
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: {
                        color: '#94a3b8',
                        font: { size: isMobile ? 9 : 11 },
                        callback: (v) => v >= 1000000 ? (v / 1000000).toFixed(0) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v.toLocaleString()
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    beginAtZero: true
                }
            }
        }
    });
}

// ===== CHECK RETURN FEE SECTION =====

function initCheckReturnFilters(data) {
    const years = new Set();
    const leasings = new Set();
    const banks = new Set(['BBL', 'TTB', 'โอนเงิน', 'หักบัญชี']);
    const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
        'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

    data.forEach(item => {
        const raw = getAnyValue(item, ['กำหนดชำระ']);
        const d = new Date(raw);
        if (!isNaN(d)) years.add(d.getFullYear());
        const l = getAnyValue(item, ['ชื่อลิสซิ่ง']);
        if (l && l !== '') leasings.add(String(l).trim());
        const b = getAnyValue(item, ['เช็คธนาคาร', 'ธนาคาร', 'Bank']);
        if (b && String(b).trim() !== '') banks.add(String(b).trim());
    });

    initMultiSelect('cr-filter-year', Array.from(years).sort().map(y => String(y)));
    initMultiSelect('cr-filter-month', thaiMonths.map((m, i) => ({ value: String(i), label: m })));
    initMultiSelect('cr-filter-leasing', Array.from(leasings).sort());
    initMultiSelect('cr-filter-bank', Array.from(banks).sort());
}

function renderCheckReturnTable(data) {
    const wrapper = document.getElementById('checkReturnTableWrapper');
    if (!wrapper) return;

    const countBadge = document.getElementById('checkReturnCount');

    if (!data || data.length === 0) {
        if (countBadge) countBadge.textContent = '0 รายการ';
        wrapper.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><span>ไม่พบข้อมูลค่าธรรมเนียมเช็คคืน</span></div>`;
        return;
    }

    // กรองตาม cr filter + search
    const crYears    = getMultiSelectSelected('cr-filter-year');
    const crMonths   = getMultiSelectSelected('cr-filter-month');
    const crLeasings = getMultiSelectSelected('cr-filter-leasing');
    const crBanks    = getMultiSelectSelected('cr-filter-bank');
    const crSearch   = (document.getElementById('checkReturnSearch')?.value || '').toLowerCase();

    // ต้นฉบับ Payment_Log mapping (ตามคอลัมน์จริง):
    // A=กำหนดชำระ, B=ชื่อลิสซิ่ง, C=เลขสัญญา, H=งวดที่, I=ค่างวดประจำเดือน (faceAmt),
    // L=เลขที่เช็ค, N=ธนาคาร, O=ค่าธรรมเนียมเช็คคืน
    const DATE_KEYS    = ['วันที่เช็คคืน'];
    const LEASING_KEYS = ['ชื่อลิสซิ่ง'];

    const getBank = (item) => {
        const b = getAnyValue(item, ['เช็คธนาคาร', 'ธนาคาร', 'Bank']);
        return String(b || '').trim();
    };

    const filtered = data.filter(item => {
        const raw = getAnyValue(item, DATE_KEYS);
        const d = new Date(raw);
        const matchY = !crYears.size    || (!isNaN(d) && crYears.has(d.getFullYear().toString()));
        const matchM = !crMonths.size   || (!isNaN(d) && crMonths.has(d.getMonth().toString()));
        const matchL = !crLeasings.size || crLeasings.has(String(getAnyValue(item, LEASING_KEYS) || '').trim());
        const matchB = !crBanks.size    || crBanks.has(getBank(item));
        const matchS = !crSearch        || Object.values(item).some(v => v && v.toString().toLowerCase().includes(crSearch));
        
        return matchY && matchM && matchL && matchB && matchS;
    });

    if (countBadge) countBadge.textContent = `${filtered.length.toLocaleString()} รายการ`;

    const subtitleEl = document.getElementById('checkReturnSubtitle');
    let subtitleText = '';
    if (crBanks.size === 1) {
        const bankName = Array.from(crBanks)[0];
        if (bankName === 'BBL') {
            subtitleText = 'ธ.กรุงเทพ เลขที่บัญชี <b>249-3-01015-7</b>';
        } else if (bankName === 'TTB') {
            subtitleText = 'ธ.ทหารไทยธนชาต เลขที่บัญชี <b>242-1-00749-9</b>';
        } else {
            subtitleText = `${bankName}`;
        }
    } else {
        subtitleText = 'ทุกธนาคาร';
    }
    if (subtitleEl) subtitleEl.innerHTML = subtitleText;

    let totalFaceAmt = 0;
    let totalFee     = 0;
    let rows = '';

    filtered.forEach((item, i) => {
        const dateVal  = formatDate(getAnyValue(item, DATE_KEYS));
        const leasing  = getAnyValue(item, LEASING_KEYS) || '-';
        const contract = getAnyValue(item, ['เลขสัญญา', 'contract', 'สัญญา']) || '-';
        const inst     = getAnyValue(item, ['งวดที่', 'installment', 'งวด']) || '-';
        // ใช้ _checkNo ถ้ามี (จาก Payment_Log enrich) ไม่งั้น fallback ค่าใน ต้นฉบับ
        const checkNo  = getAnyValue(item, ['เลขที่เช็ค', 'เช็ค']) || '-';
        const bank     = getBank(item) || '-';
        const faceAmt  = cleanNumber(getAnyValue(item, ['ค่างวดประจำเดือน']));
        const fee      = cleanNumber(getAnyValue(item, ['ค่าธรรมเนียมหักจากบัญชี']));

        totalFaceAmt += faceAmt;
        totalFee     += fee;

        rows += `<tr>
            <td class="col-num">${i + 1}</td>
            <td class="col-center">${dateVal}</td>
            <td>${leasing}</td>
            <td style="color:var(--text-dim)">${contract}</td>
            <td class="col-center">${inst}</td>
            <td class="col-center">${checkNo}</td>
            <td class="col-center"><span class="bank-tag">${bank}</span></td>
            <td class="col-amount">${faceAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td class="col-amount" style="color:#ef4444;font-weight:700;">${fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>`;
    });

    const tfoot = filtered.length > 0 ? `
        <tfoot>
            <tr class="total-row">
                <td colspan="7" style="text-align:right;font-weight:700;">ยอดรวม (${filtered.length.toLocaleString()} รายการ)</td>
                <td class="col-amount" style="font-weight:700;text-align:right;">${totalFaceAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td class="col-amount" style="font-weight:700;color:#ef4444;text-align:right;">${totalFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
        </tfoot>` : '';

    wrapper.innerHTML = `<table class="payment-table check-return-table">
        <thead><tr>
            <th style="text-align:center;width:50px">ลำดับ</th>
            <th style="text-align:center;width:95px">วันที่</th>
            <th style="width:230px">ชื่อลิสซิ่ง</th>
            <th style="width:130px">เลขสัญญา</th>
            <th style="text-align:center;width:60px">งวดที่</th>
            <th style="text-align:center;width:120px">เลขที่เช็ค</th>
            <th style="text-align:center;width:90px">ธนาคาร</th>
            <th style="text-align:right;width:125px">จำนวนเงินหน้าเช็ค</th>
            <th style="text-align:right;width:125px">ค่าธรรมเนียม 0.20%</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        ${tfoot}
    </table>`;
}

// ===== NEAR END INSTALLMENT SECTION =====

function buildNearEndData(limit) {
    // limit=0 หมายถึง "ทั้งหมด" — คำนวณทุกสัญญาแบบไม่มี cap
    var contractMap = {};
    allData.forEach(function(item) {
        var lname = (getAnyValue(item, ['ชื่อลิสซิ่ง','leasing','บริษัท']) || '(ไม่ระบุ)').toString().trim();
        var cname = (getAnyValue(item, ['เลขสัญญา','contract','สัญญา']) || '(ไม่ระบุ)').toString().trim();
        var key = lname + '|||' + cname;
        if (!contractMap[key]) contractMap[key] = { lname: lname, cname: cname, items: [] };
        contractMap[key].items.push(item);
    });

    function parseInst(v) {
        var s = String(v || '').trim();
        var m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
        return m ? { num: parseInt(m[1]), total: parseInt(m[2]), raw: s } : { num: 0, total: 0, raw: s };
    }

    var qualified = {}; // lname -> { sum, rows: [{cname,rows,total,instRange,lastInst}] }

    Object.values(contractMap).forEach(function(grp) {
        var lname = grp.lname, cname = grp.cname, items = grp.items;
        var sorted = items.slice().sort(function(a, b) {
            var ia = parseInst(getAnyValue(a, ['งวดที่','installment','งวด']));
            var ib = parseInst(getAnyValue(b, ['งวดที่','installment','งวด']));
            return (ib.num - ia.num) || (ib.total - ia.total);
        });
        var acc = 0, rows = [];
        for (var i = 0; i < sorted.length; i++) {
            var amt = cleanNumber(getAnyValue(sorted[i], ['ค่างวดประจำ','amount','ยอดเงิน','ยอดชำระ','ยอด']));
            if (limit > 0 && acc + amt > limit) break;
            acc += amt;
            rows.push({ item: sorted[i], amt: amt, acc: acc });
        }
        if (rows.length === 0) return;
        rows.reverse();
        var instNums = rows.map(function(r) { return parseInst(getAnyValue(r.item, ['งวดที่','installment','งวด'])); });
        // rows ถูก reverse แล้ว: [0]=งวดน้อยสุด, [last]=งวดมากสุด (งวดสุดท้ายจริง)
        var firstP = instNums[0];
        var lastP  = instNums[instNums.length-1];
        var instRange;
        if (firstP && lastP && firstP.num !== lastP.num) {
            instRange = firstP.num + ' – ' + lastP.raw;
        } else if (lastP) {
            instRange = lastP.raw;
        } else { instRange = '-'; }
        var lastInst = lastP ? lastP.raw : '-';
        var perAmt = rows.length > 0 ? rows[0].amt : 0;
        // ใช้ชื่อลิสซิ่งจริงจาก item แรกของกลุ่มนี้ เป็น group key
        var lnameReal = (getAnyValue(rows[0].item, ['ชื่อลิสซิ่ง','leasing','บริษัท']) || lname).toString().trim();
        if (!qualified[lnameReal]) qualified[lnameReal] = { sum: 0, rows: [], lnameDisplay: lnameReal };
        qualified[lnameReal].sum += acc;
        // เก็บ Air Code จากทุก item ในสัญญา (unique, กรองค่าว่าง)
        var airSet = {};
        rows.forEach(function(r) {
            var a = (getAnyValue(r.item, ['Air Code','airCode','AirCode','air code']) || '').toString().trim();
            if (a && a !== '-') airSet[a] = 1;
        });
        var airCodes = Object.keys(airSet).join(', ') || '-';
        qualified[lnameReal].rows.push({ cname: cname, rows: rows, total: acc, instRange: instRange, lastInst: lastInst, perAmt: perAmt, count: rows.length, lnameReal: lnameReal, airCodes: airCodes });
    });
    return qualified;
}

function renderNearEndTable(data) {
    var wrapper = document.getElementById('nearEndTableWrapper');
    if (!wrapper) return;
    var countBadge = document.getElementById('nearEndCount');
    var sel = document.getElementById('nearEndLimitSelect');
    var limit = sel ? parseInt(sel.value) || 0 : 200000;

    if (!allData.length) {
        wrapper.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><span>ยังไม่มีข้อมูล</span></div>';
        return;
    }

    var qualified = buildNearEndData(limit);
    var leasingEntries = Object.entries(qualified).sort(function(a,b){ return b[1].sum - a[1].sum; });
    var totalContracts = leasingEntries.reduce(function(s,e){ return s + e[1].rows.length; }, 0);
    if (countBadge) countBadge.textContent = totalContracts.toLocaleString() + ' สัญญา';

    if (leasingEntries.length === 0) {
        wrapper.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><span>ไม่พบสัญญาในช่วงที่เลือก</span></div>';
        return;
    }

    var limitLabel = limit === 0 ? 'ทั้งหมด' : '\u2264 ' + limit.toLocaleString() + ' บาท';
    var fmtN = function(n) { return n.toLocaleString(undefined, {minimumFractionDigits:2}); };

    var rowNum = 0;
    var bodyRows = '';
    var grandTotal = 0;

    leasingEntries.forEach(function(entry, li) {
        var lname = entry[0], ldata = entry[1];
        var groupLabel = ldata.lnameDisplay || lname;
        bodyRows += '<tr class="near-end-group-row">' +
            '<td colspan="9" class="near-end-group-cell">' +
            '<span class="near-end-group-num">' + (li+1) + '.</span> ' + groupLabel +
            ' <span class="near-end-group-meta">· ' + ldata.rows.length + ' สัญญา</span>' +
            '</td></tr>';
        ldata.rows.sort(function(a,b){ return b.total - a.total; }).forEach(function(c) {
            rowNum++;
            grandTotal += c.total;
            var lastItem = c.rows[c.rows.length-1].item;
            var realLname = c.lnameReal || (getAnyValue(lastItem, ['ชื่อลิสซิ่ง','leasing','บริษัท']) || lname).toString().trim();
            var st = (getAnyValue(lastItem, ['สถานะ','status']) || '-').toString();
            var scls = st.indexOf('เกินกำหนด') >= 0 ? 'status-overdue' : st.indexOf('ยังไม่ถึงกำหนด') >= 0 ? 'status-pending' : 'status-paid';
            var bg = rowNum % 2 === 0 ? 'style="background:var(--bg2)"' : '';
            bodyRows += '<tr ' + bg + '>' +
                '<td class="col-num">' + rowNum + '</td>' +
                '<td>' + realLname + '</td>' +
                '<td style="color:var(--text-dim)">' + c.cname + '</td>' +
                '<td class="col-center" style="color:var(--accent-teal,#14b8a6);font-size:0.78rem">' + c.airCodes + '</td>' +
                '<td class="col-center">' + c.instRange + '</td>' +
                '<td class="col-center" style="color:var(--accent)">' + c.count + ' งวด</td>' +
                '<td class="col-amount">' + fmtN(c.perAmt) + '</td>' +
                '<td class="col-amount" style="color:var(--success);font-weight:700">' + fmtN(c.total) + '</td>' +
                '<td class="col-center"><span class="status-badge ' + scls + '">' + st + '</span></td>' +
                '</tr>';
        });
    });

    wrapper.innerHTML = '<div style="padding:6px 12px 8px;font-size:0.75rem;color:var(--text-dim);">' +
        'คำนวณจากงวดสุดท้ายย้อนขึ้น &nbsp;·&nbsp; ช่วงยอด: <b style="color:var(--accent)">' + limitLabel + '</b>' +
        '</div>' +
        '<table class="payment-table near-end-table">' +
        '<thead><tr>' +
        '<th style="text-align:center;width:45px">ลำดับ</th>' +
        '<th style="width:190px">ชื่อลิสซิ่ง</th>' +
        '<th style="width:140px">เลขสัญญา</th>' +
        '<th style="text-align:center;width:100px">Air Code</th>' +
        '<th style="text-align:center;width:110px">งวดที่เหลือ</th>' +
        '<th style="text-align:center;width:75px">จำนวนงวด</th>' +
        '<th style="text-align:right;width:115px">ค่างวด/เดือน</th>' +
        '<th style="text-align:right;width:115px">ยอดสะสม</th>' +
        '<th style="text-align:center;width:110px">สถานะ</th>' +
        '</tr></thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
        '<tfoot><tr class="total-row">' +
        '<td colspan="7" style="text-align:right;font-weight:700;">ยอดรวม (' + totalContracts.toLocaleString() + ' สัญญา)</td>' +
        '<td class="col-amount" style="font-weight:700;text-align:right;">' + fmtN(grandTotal) + '</td>' +
        '<td></td>' +
        '</tr></tfoot>' +
        '</table>';
}

function exportNearEndPDF() {
    if (!allData.length) { alert('ยังไม่มีข้อมูล'); return; }
    var sel = document.getElementById('nearEndLimitSelect');
    var limit = sel ? parseInt(sel.value) || 0 : 200000;
    var limitLabel = limit === 0 ? 'ทั้งหมด' : '\u2264 ' + limit.toLocaleString() + ' บาท';
    var qualified = buildNearEndData(limit);
    var leasingEntries = Object.entries(qualified).sort(function(a,b){ return b[1].sum - a[1].sum; });
    if (leasingEntries.length === 0) { alert('ไม่พบสัญญาในช่วงที่เลือก'); return; }
    var dateStr = new Date().toLocaleDateString('th-TH', {year:'numeric', month:'long', day:'numeric'});
    var fmtN = function(n) { return n.toLocaleString(undefined, {minimumFractionDigits:2}); };
    var totalContracts = leasingEntries.reduce(function(s,e){ return s + e[1].rows.length; }, 0);
    var grandTotal = leasingEntries.reduce(function(s,e){ return s + e[1].sum; }, 0);
    var rowNum = 0;
    var bodyContent = leasingEntries.map(function(entry, li) {
        var lnameKey = entry[0], ldata = entry[1];
        var groupLabel = ldata.lnameDisplay || lnameKey;
        var rows = ldata.rows.slice().sort(function(a,b){ return b.total - a.total; }).map(function(c) {
            rowNum++;
            var st = (getAnyValue(c.rows[c.rows.length-1].item, ['สถานะ','status']) || '-').toString();
            var sc = st.indexOf('เกินกำหนด') >= 0 ? 'color:#dc2626' :
                     st.indexOf('ทับบัญชี') >= 0 ? 'color:#7c3aed' :
                     st.indexOf('ยังไม่') >= 0 ? 'color:#d97706' : 'color:#059669';
            var bg = rowNum % 2 === 0 ? 'background:#fafafa' : '';
            return '<tr style="' + bg + '">' +
                '<td style="text-align:center;color:#9ca3af">' + rowNum + '</td>' +
                '<td>' + (c.lnameReal || groupLabel) + '</td>' +
                '<td style="color:#374151">' + c.cname + '</td>' +
                '<td style="text-align:center;color:#0d9488;font-weight:700">' + (c.airCodes || '-') + '</td>' +
                '<td style="text-align:center">' + c.instRange + '</td>' +
                '<td style="text-align:center;color:#1d4ed8">' + c.count + ' งวด</td>' +
                '<td style="text-align:right">' + fmtN(c.perAmt) + '</td>' +
                '<td style="text-align:right;font-weight:700;color:#059669">' + fmtN(c.total) + '</td>' +
                '<td style="text-align:center;font-weight:700;font-size:8px;' + sc + '">' + st + '</td>' +
                '</tr>';
        }).join('');
        var subtotal = '<tr style="background:#fffbeb;border-top:1px solid #fde68a">' +
            '<td colspan="7" style="text-align:right;font-size:8px;color:#92400e">รวม ' + ldata.rows.length + ' สัญญา</td>' +
            '<td style="text-align:right;font-weight:700;color:#b45309">' + fmtN(ldata.sum) + '</td>' +
            '<td></td></tr>';
        return '<section class="cs">' +
            '<div class="csh"><span class="cn">' + (li+1) + '.</span>' +
            '<span class="cnm">' + groupLabel + '</span>' +
            '<span class="cm">' + ldata.rows.length + ' สัญญา &nbsp;·&nbsp; <b>' + fmtN(ldata.sum) + '</b></span></div>' +
            '<table><colgroup>' +
            '<col style="width:4%"><col style="width:18%"><col style="width:13%">' +
            '<col style="width:9%"><col style="width:11%"><col style="width:8%">' +
            '<col style="width:12%"><col style="width:12%"><col style="width:13%">' +
            '</colgroup><thead><tr>' +
            '<th>#</th><th style="text-align:left">ชื่อลิสซิ่ง</th>' +
            '<th style="text-align:left">เลขสัญญา</th>' +
            '<th>Air Code</th><th>งวดที่เหลือ</th><th>จำนวน</th>' +
            '<th style="text-align:right">ค่างวด/เดือน</th>' +
            '<th style="text-align:right">ยอดสะสม</th><th>สถานะ</th>' +
            '</tr></thead><tbody>' + rows + subtotal + '</tbody></table></section>';
    }).join('');
    var win = window.open('', '_blank', 'width=1000,height=1200');
    if (!win) { alert('กรุณาอนุญาต popup'); return; }
    var css = '@page{size:A4 landscape;margin:8mm 10mm}' +
        '@media print{.toolbar{display:none!important}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}thead tr{background:#f59e0b!important}thead th{color:#fff!important}thead{display:table-header-group}tr{page-break-inside:avoid}.cs{page-break-inside:auto}.csh{page-break-after:avoid}}' +
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:"Sarabun",sans-serif;background:#e5e7eb;color:#111827}' +
        '.toolbar{position:sticky;top:0;z-index:10;background:#1e293b;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:8px 20px}' +
        '.toolbar-title{font-size:12px;color:#94a3b8}' +
        '.btn-print{background:#f59e0b;color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}' +
        '.doc{padding:12px 14px;background:#fff}' +
        '.doc-meta{font-size:9px;color:#6b7280;margin-bottom:10px}.doc-meta b{color:#0f172a}' +
        'table{width:100%;border-collapse:collapse;font-size:8.5px;table-layout:fixed;margin-bottom:0}' +
        'th,td{border:1px solid #e2e8f0;padding:3px 4px;word-wrap:break-word;vertical-align:middle}' +
        'th{background:#f59e0b;color:#fff;text-align:center;border-color:#d97706;font-weight:700;font-size:8.5px;white-space:nowrap}' +
        'td{color:#111827}tbody tr:nth-child(even) td{background:#fafafa}' +
        '.cs{margin-bottom:10px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden}' +
        '.csh{background:#fffbeb;padding:5px 10px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #fde68a;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        '.cn{color:#92400e;font-weight:700;min-width:18px;font-size:10px}' +
        '.cnm{color:#0f172a;font-weight:700;flex:1;font-size:10px}' +
        '.cm{color:#b45309;font-weight:600;white-space:nowrap;font-size:9px}.cm b{color:#0f172a}' +
        '.cs table{margin-bottom:0;border:none}.cs table th{background:#f59e0b}' +
        '.gt{background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:8px 14px;margin-top:10px;display:flex;justify-content:space-between;align-items:center}';
    win.document.write('<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
        '<title>สัญญาใกล้หมด — ' + dateStr + '</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
        '<style>' + css + '</style></head><body>' +
        '<div class="toolbar"><span class="toolbar-title">สัญญาใกล้หมดลิสซิ่ง ThaiDrill &nbsp;·&nbsp; ' + limitLabel + ' &nbsp;·&nbsp; ' + dateStr + '</span>' +
        '<button class="btn-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button></div>' +
        '<div class="doc">' +
        buildThaiDrillHeader('สัญญาใกล้หมดลิสซิ่ง <span style="color:#f59e0b;font-weight:800;font-style:italic;">ThaiDrill</span>', dateStr) +
        '<div class="doc-meta">ช่วงยอด: <b style="color:#b45309">' + limitLabel + '</b>' +
        ' &nbsp;·&nbsp; พบ <b>' + leasingEntries.length + ' ลิสซิ่ง</b> &nbsp;·&nbsp; <b>' + totalContracts + ' สัญญา</b>' +
        ' &nbsp;·&nbsp; ยอดรวม <b>' + fmtN(grandTotal) + ' บาท</b></div>' +
        bodyContent +
        '<div class="gt"><span style="font-weight:700;color:#92400e;font-size:11px">ยอดรวมทั้งสิ้น (' + totalContracts + ' สัญญา)</span>' +
        '<span style="font-size:14px;font-weight:700;color:#b45309">' + fmtN(grandTotal) + ' บาท</span></div>' +
        '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:8px;color:#9ca3af;">' +
        '<span>ระบบฐานข้อมูลลิสซิ่ง รถเจาะไทย 2026</span>' +
        '<span>เอกสารนี้สร้างโดยระบบอัตโนมัติ — ห้ามแก้ไข</span>' +
        '</div></div></body></html>');
    win.document.close();
}
