const API_URL = '/api/transactions';

document.addEventListener('DOMContentLoaded', () => {
    // Defaults
    setDefaultDate();
    initTimeSlider();
    loadTransactions();
    loadRefData();

    // Event Listeners
    document.getElementById('generateBtn').addEventListener('click', handleTransactionSubmit);

    // Auto-calculate logic
    const calcInputs = ['amountBase', 'rate'];
    calcInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', calculateCounterAmount);
    });

    // Formatting Logic
    document.getElementById('rate').addEventListener('blur', formatRate);
    document.getElementById('amountBase').addEventListener('blur', formatAmount);

    // Filter Logic
    document.getElementById('searchInput').addEventListener('input', debounce(() => applyFiltersAndRender(), 300));
    document.getElementById('filterDirection').addEventListener('change', () => applyFiltersAndRender());
    document.getElementById('filterDate').addEventListener('change', () => applyFiltersAndRender());
});

/* --- UI Logic --- */

function switchTab(tabId) {
    // Nav Active State
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    // Find the clicked li (this function is called inline, so we look for the one with correct onclick or just by index)
    // Actually easier to just reset all and find matching logical flow. Use event delegation or just simple matching.

    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');

    // Update Sidebar highlight (simple hack for inline onclick)
    const links = document.querySelectorAll('.nav-links li');
    if (tabId === 'entry') {
        links[0].classList.add('active');
        loadRefData();
    } else if (tabId === 'history') {
        links[1].classList.add('active');
        loadTransactions();
    } else if (tabId === 'mismatch') {
        links[2].classList.add('active');
        loadMismatches();
    } else if (tabId === 'reference') {
        links[3].classList.add('active');
        loadRefData();
    }
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
}

function initTimeSlider() {
    const slider = document.getElementById('timeSlider');
    const display = document.getElementById('timeDisplay');
    const input = document.getElementById('timeInput');

    const updateTime = () => {
        const val = parseInt(slider.value);
        const hours = Math.floor(val / 60);
        const mins = val % 60;

        const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        display.textContent = timeStr;
        input.value = timeStr; // For form usage
    };

    slider.addEventListener('input', updateTime);

    // Set current time roughly
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    slider.value = currentMins;
    updateTime();
}

function calculateCounterAmount() {
    const base = parseFloat(document.getElementById('amountBase').value);
    const rate = parseFloat(document.getElementById('rate').value);

    if (!isNaN(base) && !isNaN(rate)) {
        const counter = base * rate;
        document.getElementById('amountCounter').value = counter.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } else {
        document.getElementById('amountCounter').value = '';
    }
}

/* --- Data Handling --- */

async function handleTransactionSubmit() {
    const form = document.getElementById('transactionForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const formData = {
        transaction_number: generateTransactionId(),
        date: document.getElementById('date').value,
        time: document.getElementById('timeInput').value,
        bank1: document.getElementById('bank1').value,
        bank2: document.getElementById('bank2').value,
        pair: document.getElementById('pair').value,
        rate: parseFloat(document.getElementById('rate').value),
        direction: document.querySelector('input[name="direction"]:checked').value,
        amount_base: parseFloat(document.getElementById('amountBase').value),
        amount_counter: parseFloat(document.getElementById('amountCounter').value.replace(/,/g, ''))
    };

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await res.json();

        if (res.ok) {
            showToast('Transaction saved successfully!', 'success');
            form.reset();
            setDefaultDate();
            initTimeSlider();
        } else {
            showToast(result.message || 'Error saving transaction', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Server error', 'error');
    }
}

// --- Client-Side State ---
let globalTransactions = [];
let sortState = { col: null, dir: 'asc' }; // 'asc' or 'desc'
let columnFilters = {}; // { 'bank1': 'value', 'pair': 'value' }

async function loadTransactions() {
    // Fetch ALL transactions for client-side sorting/filtering
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        globalTransactions = data;
        applyFiltersAndRender();
    } catch (err) {
        console.error(err);
        showToast('Error loading history', 'error');
    }
}

function applyFiltersAndRender() {
    let filtered = [...globalTransactions];

    // 1. Global Search
    const search = document.getElementById('searchInput').value.toLowerCase();
    if (search) {
        filtered = filtered.filter(tx =>
            tx.pair.toLowerCase().includes(search) ||
            tx.bank1.toLowerCase().includes(search) ||
            tx.bank2.toLowerCase().includes(search) ||
            tx.transaction_number.toLowerCase().includes(search)
        );
    }

    // 2. Date Filter
    const dateVal = document.getElementById('filterDate').value;
    if (dateVal) {
        filtered = filtered.filter(tx => tx.date === dateVal);
    }

    // 3. Direction Filter
    const dirVal = document.getElementById('filterDirection').value;
    if (dirVal !== 'All') {
        filtered = filtered.filter(tx => tx.direction === dirVal);
    }

    // 4. Column Filters
    Object.keys(columnFilters).forEach(col => {
        const val = columnFilters[col].toLowerCase();
        if (val) {
            filtered = filtered.filter(tx => String(tx[col]).toLowerCase().includes(val));
        }
    });

    // 5. Sorting
    if (sortState.col) {
        filtered.sort((a, b) => {
            let valA = a[sortState.col];
            let valB = b[sortState.col];

            // Handle numbers
            if (sortState.col === 'rate' || sortState.col.startsWith('amount')) {
                valA = parseFloat(valA);
                valB = parseFloat(valB);
            }
            // Handle strings
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortState.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.dir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    renderTable(filtered);
    updateHeaderUI();
}

function handleSort(column) {
    if (sortState.col === column) {
        // Toggle direction
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.col = column;
        sortState.dir = 'asc'; // Default new sort to asc
    }
    applyFiltersAndRender();
}

function updateHeaderUI() {
    // Reset all headers
    document.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });

    if (sortState.col) {
        const th = document.querySelector(`th[data-col="${sortState.col}"]`);
        if (th) {
            th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    }

    // Highlight active filters
    document.querySelectorAll('.th-filter-btn').forEach(btn => {
        const col = btn.parentElement.parentElement.dataset.col;
        if (columnFilters[col]) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function toggleColumnFilter(btn, column) {
    // Check if popover already exists
    const existing = document.querySelector('.filter-popover');
    if (existing) {
        existing.remove();
        // If clicking same button, just close it
        if (existing.dataset.trigger === column) return;
    }

    const popover = document.createElement('div');
    popover.className = 'filter-popover';
    popover.dataset.trigger = column;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Filter ${column}...`;
    input.value = columnFilters[column] || '';

    input.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val) columnFilters[column] = val;
        else delete columnFilters[column];
        applyFiltersAndRender();
    });

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
    closeBtn.onclick = () => popover.remove();
    closeBtn.style.padding = '4px';

    popover.appendChild(input);
    popover.appendChild(closeBtn);

    // Position it
    const rect = btn.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
    popover.style.left = `${rect.left + window.scrollX - 100}px`;

    document.body.appendChild(popover);
    input.focus();

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function close(e) {
            if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                popover.remove();
                document.removeEventListener('click', close);
            }
        });
    }, 0);
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterDate').value = '';
    document.getElementById('filterDirection').value = 'All';
    columnFilters = {};
    sortState = { col: null, dir: 'asc' };
    applyFiltersAndRender();
}

async function loadMismatches() {
    try {
        const res = await fetch('/api/mismatches');
        const data = await res.json();
        renderMismatchTable(data);
    } catch (err) {
        console.error(err);
    }
}

async function fixMismatch(id) {
    try {
        const res = await fetch('/api/fix-mismatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });

        const result = await res.json();
        if (res.ok) {
            showToast('Mismatch fixed successfully!', 'success');
            loadMismatches(); // Refresh to remove it from list
        } else {
            showToast(result.message || 'Error fixing mismatch', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Server error', 'error');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--text-secondary);">No transactions found</td></tr>';
        return;
    }

    data.forEach(tx => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-family: monospace; color: var(--accent-color);">${tx.transaction_number}</td>
            <td>${tx.date}</td>
            <td>${tx.time}</td>
            <td style="font-weight:bold;">${tx.pair}</td>
            <td class="${tx.direction === 'Buy' ? 'status-buy' : 'status-sell'}">${tx.direction}</td>
            <td>${tx.rate.toFixed(5)}</td>
            <td>${tx.amount_base.toLocaleString()}</td>
            <td>${tx.amount_counter.toLocaleString()}</td>
            <td>${tx.bank1}</td>
            <td>${tx.bank2}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderMismatchTable(data) {
    const tbody = document.getElementById('mismatchTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--success-color);"><i class="fa-solid fa-circle-check"></i> All trades are balanced!</td></tr>';
        return;
    }

    data.forEach(tx => {
        const tr = document.createElement('tr');
        const typeClass = tx.direction === 'Buy' ? 'status-buy' : 'status-sell';
        const missingDir = tx.direction === 'Buy' ? 'Sell' : 'Buy';
        const missingTypeClass = missingDir === 'Buy' ? 'status-buy' : 'status-sell';

        tr.innerHTML = `
            <td style="font-family: monospace; color: var(--accent-color);">${tx.transaction_number}</td>
            <td>${tx.date} <span style="color:var(--text-secondary)">at</span> ${tx.time}</td>
            <td>
                <div><span class="${typeClass}">${tx.direction}</span> ${tx.pair}</div>
                <div style="font-size:0.85em; color:var(--text-secondary)">${tx.bank1} -> ${tx.bank2}</div>
                <div style="font-size:0.85em; color:var(--text-secondary)">Amt: ${tx.amount_base.toLocaleString()} @ ${tx.rate}</div>
            </td>
            <td>
                Missing <span class="${missingTypeClass}">${missingDir}</span> from <br>${tx.bank2} -> ${tx.bank1}
            </td>
            <td>
                <button onclick="fixMismatch(${tx.id})" class="btn-primary" style="padding: 6px 16px; font-size: 0.85rem; width: auto;">
                    <i class="fa-solid fa-wrench"></i> Fix
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/* --- Helpers --- */

function generateTransactionId() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `TRX-${timestamp}-${random}`;
}

function formatRate() {
    const input = document.getElementById('rate');
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
        input.value = val.toFixed(5);
        calculateCounterAmount();
    }
}

function formatAmount() {
    // Just formatting needed for display? 
    // Usually input type=number doesn't like commas. We'll leave it clean.
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderLeftColor = type === 'success' ? 'var(--success-color)' : 'var(--danger-color)';

    toast.innerHTML = `
        <i class="fa-solid fa-${type === 'success' ? 'circle-check' : 'circle-exclamation'}" 
           style="color: ${type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* --- Reference Data Logic --- */

async function loadRefData() {
    await Promise.all([
        fetchAndPopulate('banks'),
        fetchAndPopulate('pairs')
    ]);
}

async function fetchAndPopulate(type) {
    try {
        const res = await fetch(`/api/${type}`);
        const data = await res.json();

        // Populate Lists in Reference Tab
        const listEl = document.getElementById(`${type}List`);
        if (listEl) {
            listEl.innerHTML = '';
            data.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${item.name}</span>
                    <button class="delete-btn" onclick="deleteRefData('${type}', ${item.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                `;
                listEl.appendChild(li);
            });
        }

        // Populate Dropdowns in Entry Tab
        if (type === 'banks') {
            const b1 = document.getElementById('bank1');
            const b2 = document.getElementById('bank2');
            if (b1 && b2) {
                const sel1 = b1.value;
                const sel2 = b2.value;

                const opts = '<option value="" disabled selected>Select Bank</option>' +
                    data.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
                b1.innerHTML = opts;
                b2.innerHTML = opts;

                if (sel1 && data.some(i => i.name === sel1)) b1.value = sel1;
                if (sel2 && data.some(i => i.name === sel2)) b2.value = sel2;
            }
        } else if (type === 'pairs') {
            const p = document.getElementById('pair');
            if (p) {
                const sel = p.value;
                p.innerHTML = '<option value="" disabled selected>Select Pair</option>' +
                    data.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
                if (sel && data.some(i => i.name === sel)) p.value = sel;
            }
        }

    } catch (err) {
        console.error(`Error loading ${type}:`, err);
    }
}

async function addRefData(type) {
    const inputId = type === 'banks' ? 'newBankName' : 'newPairName';
    const input = document.getElementById(inputId);
    const name = input.value.trim();

    if (!name) return;

    try {
        const res = await fetch(`/api/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (res.ok) {
            showToast(`${type === 'banks' ? 'Bank' : 'Pair'} added!`, 'success');
            input.value = '';
            loadRefData();
        } else {
            const d = await res.json();
            showToast(d.message || 'Error adding item', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Server error', 'error');
    }
}

async function deleteRefData(type, id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        const res = await fetch(`/api/${type}?id=${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            showToast('Item deleted', 'success');
            loadRefData();
        } else {
            showToast('Error deleting item', 'error');
        }
    } catch (err) {
        console.error(err);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
