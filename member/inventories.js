let allAssets = []; 
let currentDeptFilter = 'all';
let currentUser = null;

// ==========================================
// 1. โหลดข้อมูลเมื่อเปิดหน้าเว็บ (และเช็คสิทธิ์แบบรวดเร็ว)
// ==========================================
window.onload = async () => {
    // เช็คสิทธิ์จาก LocalStorage (ระบบ LIFF)
    const savedUser = localStorage.getItem('arsatu_user');
    if (!savedUser) return window.location.href = '../index.html';

    currentUser = JSON.parse(savedUser);
    
    // เตะคนนอกออก
    if (currentUser.role !== 'staff' && currentUser.role !== 'admin') {
        return window.location.href = '../user/index.html'; 
    }

    // ถ้าผ่านหมด ให้ดึงข้อมูลมาแสดง
    await fetchDepartments();
    await fetchLocations();
    await fetchAssets();
};

// ==========================================
// 2. ดึงข้อมูลจากฐานข้อมูล
// ==========================================
async function fetchAssets() {
    try {
        const { data, error } = await supabaseClient
            .from('assets')
            .select('*, departments(name), locations(name)') 
            .order('created_at', { ascending: false });

        if (error) throw error;
        allAssets = data || [];
        applyFilters(); 
    } catch (error) {
        document.getElementById('assets-table-body').innerHTML = `<tr><td colspan="6" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
    }
}

async function fetchDepartments() {
    const { data } = await supabaseClient.from('departments').select('*').order('id', { ascending: true });
    if (data) {
        const select = document.getElementById('department_id');
        const tabContainer = document.getElementById('dept-tabs');
        
        data.forEach(d => {
            select.insertAdjacentHTML('beforeend', `<option value="${d.id}">${d.name}</option>`);
            const btnHtml = `<button onclick="filterByDept(${d.id}, this)" class="tab-btn text-gray-500 hover:bg-gray-100 hover:text-gray-800 px-4 py-2 rounded-lg whitespace-nowrap font-medium transition-colors">${d.name}</button>`;
            tabContainer.insertAdjacentHTML('beforeend', btnHtml);
        });
    }
}

async function fetchLocations() {
    const { data } = await supabaseClient.from('locations').select('*').order('name', { ascending: true });
    if (data) {
        const select = document.getElementById('location_id');
        select.innerHTML = '<option value="">-- เลือกสถานที่ --</option>'; 
        data.forEach(l => select.insertAdjacentHTML('beforeend', `<option value="${l.id}">${l.name}</option>`));
    }
}

// ==========================================
// 3. ระบบค้นหาและตัวกรอง
// ==========================================
function applyFilters() {
    const statusFilter = document.getElementById('status-filter').value;
    
    // ดึงคำค้นหา (ถ้าระบบยังไม่มีช่องค้นหา โค้ดจะข้ามไปไม่ error)
    const searchInput = document.getElementById('search-input');
    const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const filtered = allAssets.filter(item => {
        const matchDept = currentDeptFilter === 'all' || item.department_id === currentDeptFilter;
        const matchStatus = statusFilter === 'all' || item.status === statusFilter;
        const matchSearch = !searchText || 
                            item.name.toLowerCase().includes(searchText) || 
                            item.asset_code.toLowerCase().includes(searchText);

        return matchDept && matchStatus && matchSearch;
    });

    renderAssetsTable(filtered);
}

function filterByDept(deptId, element) {
    currentDeptFilter = deptId;
    
    if (element) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('bg-blue-50', 'text-blue-700', 'font-semibold');
            btn.classList.add('text-gray-500', 'hover:bg-gray-100');
        });
        element.classList.remove('text-gray-500', 'hover:bg-gray-100');
        element.classList.add('bg-blue-50', 'text-blue-700', 'font-semibold');
    }
    applyFilters();
}

// ==========================================
// 4. วาดตาราง (แยก 6 คอลัมน์ + ป้ายสีฝ่าย)
// ==========================================
function renderAssetsTable(assets) {
    const tbody = document.getElementById('assets-table-body');
    tbody.innerHTML = ''; 

    if (assets.length === 0) {
        // แก้เป็น colspan="6" ให้ตรงกับหัวตารางใหม่
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-12 text-gray-400">ไม่พบรายการที่ค้นหา</td></tr>`;
        return;
    }

    // ชุดสีประจำฝ่าย
    const deptColors = [
        "bg-gray-50 border-gray-200 text-gray-700",       
        "bg-red-50 border-red-200 text-red-700",          
        "bg-blue-50 border-blue-200 text-blue-700",       
        "bg-green-50 border-green-200 text-green-700",    
        "bg-purple-50 border-purple-200 text-purple-700", 
        "bg-orange-50 border-orange-200 text-orange-700", 
        "bg-pink-50 border-pink-200 text-pink-700",       
        "bg-teal-50 border-teal-200 text-teal-700"        
    ];

    assets.forEach(item => {
        // Col 1: ชื่อและรหัส
        const nameHtml = `
            <div>
                <div class="font-medium text-gray-800">${item.name}</div>
                <div class="font-mono text-xs text-blue-600 mt-0.5">${item.asset_code}</div>
            </div>
        `;
        
        // Col 2: ฝ่าย (ป้ายสี)
        const deptId = item.department_id || 0;
        const colorClass = deptColors[deptId % deptColors.length];
        const deptName = item.departments?.name || '-';
        const deptHtml = `
            <div class="inline-flex items-center border px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide shadow-sm ${colorClass}">
                ${deptName}
            </div>
        `;

        // Col 3: สถานที่จัดเก็บ
        const locHtml = `
            <div class="text-sm text-gray-700 flex items-center gap-1.5">
                <span class="text-gray-400">📍</span> ${item.locations?.name || '-'}
            </div>
        `;

        // Col 4: ประเภท
        const catHtml = item.category === 'durable' 
            ? `<div class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-medium inline-block">คงทน</div>`
            : `<div class="bg-orange-50 text-orange-700 px-3 py-1 rounded-lg text-xs font-medium inline-block">สิ้นเปลือง</div>`;
        
        // Col 5: สถานะ และ จำนวน
        let statusHtml = '';
        if(item.status === 'available') statusHtml = `<div class="text-green-600 font-medium text-sm flex items-center justify-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500"></span> พร้อมใช้งาน</div>`;
        else if(item.status === 'borrowed') statusHtml = `<div class="text-yellow-600 font-medium text-sm flex items-center justify-center gap-1"><span class="w-2 h-2 rounded-full bg-yellow-500"></span> ถูกยืม</div>`;
        else if(item.status === 'damaged') statusHtml = `<div class="text-red-600 font-medium text-sm flex items-center justify-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span> ชำรุด</div>`;
        else if(item.status === 'lost') statusHtml = `<div class="text-gray-500 font-medium text-sm flex items-center justify-center gap-1"><span class="w-2 h-2 rounded-full bg-gray-400"></span> สูญหาย</div>`;

        const qtyHtml = item.category === 'consumable' 
            ? `<div class="text-xs text-gray-500 mt-1">เหลือ ${item.qty_available} ชิ้น</div>`
            : '';

        // Col 6: ปุ่มจัดการ
        const manageBtns = `
            <div class="flex justify-center gap-2">
                <button onclick='openUpdateModal(${JSON.stringify(item)})' class="bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition-all">⚡ อัปเดต</button>
                <button onclick='openEditModal(${JSON.stringify(item)})' class="bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-blue-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">แก้ไข</button>
            </div>
        `;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-blue-50/30 transition-colors";
        tr.innerHTML = `
            <td class="p-4">${nameHtml}</td>
            <td class="p-4">${deptHtml}</td>
            <td class="p-4">${locHtml}</td>
            <td class="p-4 text-center">${catHtml}</td>
            <td class="p-4 text-center">${statusHtml} ${qtyHtml}</td>
            <td class="p-4">${manageBtns}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 5. ระบบรหัสอัจฉริยะ (รูปแบบใหม่: ฝ่าย 2 หลัก + ลำดับ 3 หลัก)
// ==========================================
async function getNextSequence(deptId) {
    const deptStr = String(deptId).padStart(2, '0'); // รหัสฝ่าย 2 หลัก
    
    // ดึงข้อมูลรหัสของฝ่ายนี้ทั้งหมดมาเช็ค
    const { data } = await supabaseClient.from('assets')
        .select('asset_code')
        .like('asset_code', `${deptStr}%`);
        
    if (data && data.length > 0) {
        // 💡 กรองเอาเฉพาะรหัสที่มีความยาว "5 ตัวอักษร" เท่านั้น (ละทิ้งรหัสเก่าที่มีวันที่ทิ้งไป)
        const validCodes = data
            .map(item => item.asset_code)
            .filter(code => code.length === 5);
            
        if (validCodes.length > 0) {
            // ดึงเฉพาะเลข 3 ตัวหลังมาหาค่าที่มากที่สุด
            const maxSeq = Math.max(...validCodes.map(code => parseInt(code.substring(2))));
            return maxSeq;
        }
    }
    return 0; // ถ้ายังไม่มีรหัสรูปแบบ 5 หลักในฝ่ายนี้เลย ให้เริ่มที่ 0
}

async function generateAssetCodeBatch(deptId, count) {
    const deptStr = String(deptId).padStart(2, '0');
    let currentSeq = await getNextSequence(deptId); 
    
    let codes = [];
    for (let i = 0; i < count; i++) { 
        currentSeq++; 
        // สร้างรหัสใหม่: ฝ่าย 2 หลัก + ลำดับ 3 หลัก (เช่น 06001)
        codes.push(`${deptStr}${String(currentSeq).padStart(3, '0')}`); 
    }
    return codes;
}

// ==========================================
// 6. เพิ่มสถานที่ใหม่
// ==========================================
async function addNewLocation() {
    const { value: locName } = await Swal.fire({
        title: 'เพิ่มสถานที่เก็บใหม่',
        input: 'text',
        inputPlaceholder: 'พิมพ์ชื่อสถานที่ที่นี่...',
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#2563eb'
    });

    if (locName) {
        const { data, error } = await supabaseClient.from('locations').insert([{ name: locName }]).select();
        if (error) Swal.fire('ข้อผิดพลาด', 'เพิ่มสถานที่ไม่ได้ (อาจซ้ำ)', 'error');
        else if (data) {
            await fetchLocations(); 
            document.getElementById('location_id').value = data[0].id;
            Swal.fire({ icon: 'success', title: 'เพิ่มเรียบร้อย', timer: 1000, showConfirmButton: false });
        }
    }
}

// ==========================================
// 7. Modals: เพิ่ม / แก้ไข / อัปเดตสถานะ
// ==========================================
const updateModal = document.getElementById('update-modal');
const modal = document.getElementById('add-modal');
const form = document.getElementById('add-asset-form');

function openUpdateModal(item) {
    document.getElementById('update-asset-id').value = item.id;
    document.getElementById('update-asset-category').value = item.category;
    document.getElementById('update-asset-code').innerText = item.asset_code;
    document.getElementById('update-asset-name').innerText = item.name;
    document.getElementById('update-note').value = item.note || "";
    
    const durableZone = document.getElementById('durable-update-zone');
    const consumableZone = document.getElementById('consumable-update-zone');

    if (item.category === 'durable') {
        durableZone.classList.remove('hidden');
        consumableZone.classList.add('hidden');
        document.getElementById('update-status').value = item.status;
    } else {
        durableZone.classList.add('hidden');
        consumableZone.classList.remove('hidden');
        document.getElementById('current-qty').value = item.qty_available;
        document.getElementById('display-qty').innerText = item.qty_available;
        document.getElementById('adjust-amount').value = 1;
    }

    updateModal.classList.remove('hidden');
    updateModal.classList.add('flex');
}

function closeUpdateModal() {
    updateModal.classList.add('hidden'); updateModal.classList.remove('flex');
}

function adjustQty(multiplier) {
    const amount = parseInt(document.getElementById('adjust-amount').value) || 0;
    const current = parseInt(document.getElementById('current-qty').value);
    let newQty = current + (amount * multiplier);
    if (newQty < 0) newQty = 0; 
    document.getElementById('current-qty').value = newQty;
    document.getElementById('display-qty').innerText = newQty;
    document.getElementById('adjust-amount').value = 1; 
}

async function saveUpdate() {
    const id = document.getElementById('update-asset-id').value;
    const category = document.getElementById('update-asset-category').value;
    const note = document.getElementById('update-note').value;
    
    let updateData = { note: note };
    if (category === 'durable') updateData.status = document.getElementById('update-status').value;
    else updateData.qty_available = parseInt(document.getElementById('current-qty').value);

    try {
        const { error } = await supabaseClient.from('assets').update(updateData).eq('id', id);
        if (error) throw error;
        Swal.fire({ icon: 'success', title: 'อัปเดตเรียบร้อย', timer: 1000, showConfirmButton: false });
        closeUpdateModal();
        fetchAssets();
    } catch (error) {
        Swal.fire('ข้อผิดพลาด', error.message, 'error');
    }
}

function openModal() { 
    document.getElementById('modal-title').innerText = "ลงทะเบียนทรัพย์สินใหม่"; 
    document.getElementById('edit_asset_id').value = ""; 
    document.getElementById('qty-section').style.display = "block"; 
    
    // เพิ่มบรรทัดนี้: ให้ค่าเริ่มต้นคือเปิดให้ยืม
    document.getElementById('is_public_borrow').checked = true; 
    
    form.reset(); 
    modal.classList.remove('hidden'); modal.classList.add('flex'); 
}

function openEditModal(item) {
    document.getElementById('modal-title').innerText = "แก้ไขข้อมูล";
    document.getElementById('edit_asset_id').value = item.id;
    document.getElementById('asset_name').value = item.name;
    document.getElementById('department_id').value = item.department_id;
    document.getElementById('category').value = item.category;
    document.getElementById('location_id').value = item.location_id || "";
    document.getElementById('price').value = item.price;
    document.getElementById('qty-section').style.display = "none";
    
    // เพิ่มบรรทัดนี้: ดึงสถานะเดิมมาโชว์
    document.getElementById('is_public_borrow').checked = item.is_public_borrow;
    
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

function closeModal() { modal.classList.add('hidden'); modal.classList.remove('flex'); }

form.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const editId = document.getElementById('edit_asset_id').value;
    const deptId = parseInt(document.getElementById('department_id').value);
    
    // 💡 นำ status: 'available' ออกจากตรงนี้ เพื่อป้องกันการเซฟทับตอนแก้ไข
    const assetData = { 
        name: document.getElementById('asset_name').value, 
        department_id: deptId, 
        category: document.getElementById('category').value, 
        location_id: parseInt(document.getElementById('location_id').value) || null, 
        price: parseFloat(document.getElementById('price').value) || 0,
        is_public_borrow: document.getElementById('is_public_borrow').checked
    };
    
    try {
        if (editId) {
            // กรณี: แก้ไขข้อมูล (อัปเดตเฉพาะข้อมูล ไม่ยุ่งกับสถานะการยืม)
            const { error } = await supabaseClient.from('assets').update(assetData).eq('id', parseInt(editId));
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลสำเร็จ', timer: 1500, showConfirmButton: false });
        } else {
            // กรณี: เพิ่มของใหม่ (ใส่สถานะ available ให้เฉพาะตอนสร้างใหม่เท่านั้น)
            const qty = parseInt(document.getElementById('qty').value);
            let codes = await generateAssetCodeBatch(deptId, qty);
            let assetsToInsert = [];
            
            assetData.status = 'available'; // เติมสถานะตรงนี้แทน

            if (assetData.category === 'durable') {
                for (let i = 0; i < qty; i++) assetsToInsert.push({ ...assetData, asset_code: codes[i], qty_available: 1 });
            } else {
                assetsToInsert.push({ ...assetData, asset_code: codes[0], qty_available: qty });
            }
            const { error } = await supabaseClient.from('assets').insert(assetsToInsert);
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'เพิ่มของสำเร็จ', timer: 1500, showConfirmButton: false });
        }
        closeModal(); fetchAssets(); 
    } catch (error) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message }); }
});

// 💡 ปรับลำดับการ Reset ฟอร์มใน openModal เล็กน้อย เพื่อไม่ให้ค่าเช็คบ็อกซ์เพี้ยน
function openModal() { 
    document.getElementById('modal-title').innerText = "ลงทะเบียนทรัพย์สินใหม่"; 
    form.reset(); // เลื่อนการ reset มารอไว้ด้านบนสุด
    document.getElementById('edit_asset_id').value = ""; 
    document.getElementById('qty-section').style.display = "block"; 
    document.getElementById('is_public_borrow').checked = true; 
    modal.classList.remove('hidden'); modal.classList.add('flex'); 
}

// ==========================================
// 8. ระบบสร้าง QR Code
// ==========================================
const qrModal = document.getElementById('qr-modal');
function openQrModal() {
    qrModal.classList.remove('hidden'); qrModal.classList.add('flex');
    const listDiv = document.getElementById('qr-item-list'); listDiv.innerHTML = '';
    const durables = allAssets.filter(a => a.category === 'durable');
    durables.forEach(item => {
        listDiv.innerHTML += `
            <div class="flex items-center gap-3 p-2 border-b border-gray-100 hover:bg-blue-50 transition-colors rounded">
                <input type="checkbox" class="qr-checkbox w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" value="${item.asset_code}" data-name="${item.name}">
                <label class="cursor-pointer font-mono text-gray-700 flex-1">${item.asset_code} <span class="text-gray-500 font-sans ml-2 text-xs truncate block md:inline">- ${item.name}</span></label>
            </div>
        `;
    });
}
function closeQrModal() { qrModal.classList.add('hidden'); qrModal.classList.remove('flex'); }

function generateQrPreview() {
    const printArea = document.getElementById('print-area'); 
    printArea.innerHTML = ''; 
    const sizeVal = document.getElementById('qr-size').value;

    const checkboxes = document.querySelectorAll('.qr-checkbox:checked');
    if(checkboxes.length === 0) { 
        printArea.innerHTML = '<div class="text-gray-400 mt-20">กรุณาเลือกรายการด้านซ้าย</div>'; 
        return; 
    }

    checkboxes.forEach((cb, index) => {
        const wrapper = document.createElement('div');
        const qrDiv = document.createElement('div'); 
        qrDiv.id = `qr-${index}`;
        qrDiv.className = "shrink-0"; // ป้องกัน QR โดนบีบ

        let qrPixel = 64;

        if (sizeVal === 'landscape') {
            // --------------------------------
            // รูปแบบแนวนอน (Landscape)
            // --------------------------------
            wrapper.className = `flex flex-row items-center border border-gray-300 p-2.5 bg-white w-64 h-20 gap-3`;
            qrPixel = 56; // ย่อ QR ลงนิดนึงให้พอดีความสูง
            
            const textDiv = document.createElement('div');
            textDiv.className = "flex flex-col overflow-hidden text-left w-full";
            textDiv.innerHTML = `
                <div class="font-black text-gray-900 text-sm leading-none tracking-wider">ARSATU</div>
                <div class="font-bold font-mono text-gray-900 text-xs mt-1.5 leading-none">${cb.value}</div>
                <div class="font-sans font-normal text-gray-500 truncate w-full text-[10px] mt-0.5">${cb.dataset.name}</div>
            `;
            
            wrapper.appendChild(qrDiv);
            wrapper.appendChild(textDiv);

        } else {
            // --------------------------------
            // รูปแบบจตุรัส (Square)
            // --------------------------------
            let boxClass = "w-28 h-32"; let textSize = "text-[10px]"; qrPixel = 70;
            if (sizeVal === '5x5') { boxClass = "w-40 h-48"; qrPixel = 100; textSize = "text-sm"; }
            else if (sizeVal === '8x8') { boxClass = "w-56 h-64"; qrPixel = 160; textSize = "text-base"; }

            wrapper.className = `flex flex-col items-center justify-center border border-gray-300 p-2 bg-white ${boxClass}`;
            
            const header = document.createElement('div');
            header.className = `font-black text-gray-900 mb-1.5 tracking-widest ${textSize}`;
            header.innerText = "ARSATU";

            const footer = document.createElement('div');
            footer.className = `mt-2 font-bold font-mono text-center leading-tight text-gray-900 ${textSize}`;
            footer.innerHTML = `${cb.value}<br><span class="font-sans font-normal text-gray-500 truncate w-full block mt-1" style="font-size: 0.85em;">${cb.dataset.name}</span>`;

            wrapper.appendChild(header);
            wrapper.appendChild(qrDiv);
            wrapper.appendChild(footer);
        }

        printArea.appendChild(wrapper);
        // วาด QR Code
        new QRCode(qrDiv, { 
            text: cb.value, 
            width: qrPixel, 
            height: qrPixel, 
            colorDark : "#1f2937", 
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M 
        });
    });
}

// ==========================================
// 9. ระบบดาวน์โหลดไฟล์ Excel (Export to XLSX)
// ==========================================
function exportToExcel() {
    const statusFilter = document.getElementById('status-filter').value;
    const searchInput = document.getElementById('search-input');
    const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filteredAssets = allAssets.filter(item => {
        const matchDept = currentDeptFilter === 'all' || item.department_id === currentDeptFilter;
        const matchStatus = statusFilter === 'all' || item.status === statusFilter;
        const matchSearch = !searchText || item.name.toLowerCase().includes(searchText) || item.asset_code.toLowerCase().includes(searchText);
        return matchDept && matchStatus && matchSearch;
    });

    if (filteredAssets.length === 0) {
        Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลสำหรับส่งออก', 'warning');
        return;
    }

    const excelData = filteredAssets.map(item => {
        let statusText = 'พร้อมใช้งาน';
        if (item.category === 'consumable') {
            statusText = item.qty_available > 0 ? 'มีของ' : 'หมดสต็อก';
        } else {
            if(item.status === 'borrowed') statusText = 'ถูกยืม';
            else if(item.status === 'damaged') statusText = 'ชำรุด';
            else if(item.status === 'lost') statusText = 'สูญหาย';
        }

        return {
            'รหัสทรัพย์สิน': item.asset_code,
            'ชื่อรายการ': item.name,
            'ฝ่ายที่ดูแล': item.departments?.name || 'ไม่ระบุ',
            'สถานที่จัดเก็บ': item.locations?.name || 'ไม่ระบุ',
            'ประเภท': item.category === 'durable' ? 'คงทน' : 'สิ้นเปลือง',
            'จำนวนคงเหลือ': item.qty_available,
            'ราคา/หน่วย (บาท)': item.price,
            'มูลค่ารวม (บาท)': item.price * item.qty_available,
            'สถานะ': statusText,
            'หมายเหตุล่าสุด': item.note || '-',
            'อนุญาตให้คนนอกยืม': item.is_public_borrow ? 'ใช่' : 'ไม่ใช่',
            'วันที่ลงทะเบียน': new Date(item.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    
    let sheetName = "All_Assets";
    if (currentDeptFilter !== 'all') {
        const deptObj = filteredAssets[0]?.departments;
        if(deptObj) sheetName = deptObj.name;
    }
    
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31)); 
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Arsa_Asset_Report_${sheetName}_${dateStr}.xlsx`;

    XLSX.writeFile(workbook, fileName);
}