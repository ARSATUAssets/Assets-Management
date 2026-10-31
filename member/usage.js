window.onload = async () => {
    // 1. เพิ่มโค้ด 4 บรรทัดนี้ เพื่อดักคนหน้าประตู
    const savedUser = localStorage.getItem('arsatu_user');
if (!savedUser) return window.location.href = '../index.html'; // ถ้าไม่มีข้อมูลเตะกลับหน้าแรก

currentUser = JSON.parse(savedUser); // ใช้งานตัวแปรนี้แทน session.user.id ได้เลย
// ตัวอย่าง: currentUser.id คือ LINE UID ของเขา
    if (!session) return window.location.href = '../index.html'; // ไม่ได้ล็อกอิน เตะไปหน้าแรก
    const { data: user } = await supabaseClient.from('users').select('role').eq('id', session.user.id).single();
    if (user.role !== 'staff' && user.role !== 'admin') return window.location.href = '../user/index.html'; // ไม่ใช่สตาฟฟ์ เตะไปหน้าคนนอก
    
    // โค้ดเดิมที่คุณมีอยู่แล้ว
    await fetchDepartments();
    await fetchLocations();
    await fetchAssets();
};

let currentEventId = null;
let allAvailableAssets = [];
let html5QrcodeScanner = null;
let currentScannedAsset = null; 
let currentUser = null; // เก็บ Session ของคนที่ล็อกอินอยู่

window.onload = async () => {
    await checkAuth(); // เช็คก่อนว่าใครล็อกอิน
    if(currentUser) {
        await fetchEvents();
    }
};

// 1. ดึงข้อมูล User ปัจจุบันที่ล็อกอินอยู่
async function checkAuth() {
    const savedUser = localStorage.getItem('arsatu_user');
if (!savedUser) return window.location.href = '../index.html'; // ถ้าไม่มีข้อมูลเตะกลับหน้าแรก

currentUser = JSON.parse(savedUser); // ใช้งานตัวแปรนี้แทน session.user.id ได้เลย
// ตัวอย่าง: currentUser.id คือ LINE UID ของเขา
    if (!session) {
        Swal.fire({
            title: 'กรุณาเข้าสู่ระบบ',
            text: 'ระบบนี้จำเป็นต้องล็อกอินเพื่อระบุตัวตน',
            icon: 'warning',
            confirmButtonText: 'กลับหน้าแรก',
            allowOutsideClick: false
        }).then(() => window.location.href = '../index.html');
        return;
    }
    
    // ดึงข้อมูลชื่อจากตาราง users
    const { data: userProfile } = await supabaseClient.from('users').select('id, display_name').eq('id', session.user.id).single();
    currentUser = userProfile || { id: session.user.id, display_name: session.user.email };
    document.getElementById('current-user-name').innerText = `(${currentUser.display_name})`;
}

// 2. ดึงข้อมูลค่าย (Supabase จะกรองตาม RLS ให้เฉพาะที่สร้างเองหรือโดน Invite มา)
async function fetchEvents() {
    const { data, error } = await supabaseClient.from('usage_events').select('*').order('created_at', { ascending: false });
    const list = document.getElementById('event-list');
    list.innerHTML = '';
    
    if (error || !data.length) { 
        list.innerHTML = '<div class="text-center p-8 text-gray-400 text-sm">ยังไม่มีกิจกรรมค่าย (กดปุ่ม + เพื่อสร้างค่ายแรกของคุณ)</div>'; 
        return; 
    }

    data.forEach(ev => {
        let statusColor = ev.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200';
        let statusText = ev.status === 'completed' ? 'จบค่ายแล้ว' : 'กำลังดำเนินการ';
        let ownerBadge = ev.created_by === currentUser.id ? '👑 เจ้าของ' : '👥 ทีมงาน';
        
        list.innerHTML += `
            <div onclick="selectEvent(${ev.id}, '${ev.name}', '${ev.event_date || '-'}', '${ev.created_by}')" class="p-4 border border-transparent hover:border-gray-200 hover:bg-gray-50 rounded-xl cursor-pointer transition-all ${currentEventId === ev.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-100'}">
                <div class="font-bold text-gray-800">${ev.name}</div>
                <div class="flex justify-between items-center mt-2.5">
                    <span class="text-xs text-gray-500 font-medium flex gap-2">
                        <span>📅 ${ev.event_date || 'ไม่ระบุ'}</span>
                        <span class="text-gray-400">|</span>
                        <span>${ownerBadge}</span>
                    </span>
                    <span class="text-[10px] font-bold px-2.5 py-1 rounded border ${statusColor}">${statusText}</span>
                </div>
            </div>
        `;
    });
}

// 3. จัดการค่าย และ Collaborator
function selectEvent(id, name, date, createdBy) {
    currentEventId = id;
    document.getElementById('current-event-name').innerText = name;
    document.getElementById('current-event-date').innerText = `วันที่: ${date}`;
    document.getElementById('event-details-panel').classList.remove('hidden');
    document.getElementById('no-selection-panel').classList.add('hidden');
    
    // ซ่อนปุ่มเพิ่มคนถ้าไม่ใช่เจ้าของ
    const btnAddCollab = document.getElementById('btn-add-collab');
    if(createdBy === currentUser.id) {
        btnAddCollab.classList.remove('hidden');
    } else {
        btnAddCollab.classList.add('hidden');
    }

    fetchEvents(); // รีเฟรชแถบไฮไลท์สี
    fetchEventItems(id);
    fetchCollaborators(id, createdBy); // โหลดรูปคนในทีม
}

// --------------------------------------------------
// ระบบจัดการสมาชิก (Collaborator System)
// --------------------------------------------------
async function fetchCollaborators(eventId, createdBy) {
    // ดึงคนสร้างก่อน
    const { data: owner } = await supabaseClient.from('users').select('display_name').eq('id', createdBy).single();
    
    // ดึง Collaborators
    const { data: collabs } = await supabaseClient.from('usage_event_collaborators').select('user_id, users(display_name)').eq('event_id', eventId);
    
    let collabHtml = `<div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold border-2 border-white" title="เจ้าของ: ${owner?.display_name}">${owner?.display_name?.charAt(0).toUpperCase()}</div>`;
    
    if(collabs) {
        collabs.forEach(c => {
            collabHtml += `<div class="w-6 h-6 rounded-full bg-indigo-400 text-white flex items-center justify-center text-[10px] font-bold border-2 border-white" title="${c.users.display_name}">${c.users.display_name.charAt(0).toUpperCase()}</div>`;
        });
    }
    document.getElementById('current-event-collab').innerHTML = collabHtml;
}

async function openCollabModal() {
    document.getElementById('collab-modal').classList.remove('hidden');
    document.getElementById('collab-modal').classList.add('flex');
    
    // ดึงรายชื่อสตาฟฟ์ทั้งหมดมาใส่ Dropdown
    const { data: users } = await supabaseClient.from('users').select('id, display_name').eq('role', 'staff').neq('id', currentUser.id);
    const select = document.getElementById('user-selector');
    select.innerHTML = '<option value="">-- เลือกสมาชิกสตาฟฟ์ --</option>';
    if(users) {
        users.forEach(u => select.innerHTML += `<option value="${u.id}">${u.display_name}</option>`);
    }
    
    reloadCollabList();
}

function closeCollabModal() {
    document.getElementById('collab-modal').classList.add('hidden');
    document.getElementById('collab-modal').classList.remove('flex');
}

async function reloadCollabList() {
    const { data: collabs } = await supabaseClient.from('usage_event_collaborators').select('id, users(display_name)').eq('event_id', currentEventId);
    const list = document.getElementById('collab-list');
    list.innerHTML = '';
    
    if(!collabs || collabs.length === 0) {
        list.innerHTML = '<div class="text-sm text-gray-400">ยังไม่มีผู้ร่วมทีม</div>';
        return;
    }
    
    collabs.forEach(c => {
        list.innerHTML += `
            <div class="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                <div class="font-medium text-gray-800 text-sm">👤 ${c.users.display_name}</div>
                <button onclick="removeCollaborator(${c.id})" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded text-xs font-bold transition-colors">เตะออก</button>
            </div>
        `;
    });
}

async function addCollaborator() {
    const userId = document.getElementById('user-selector').value;
    if(!userId) return;
    
    const { error } = await supabaseClient.from('usage_event_collaborators').insert({ event_id: currentEventId, user_id: userId });
    
    if(error) {
        Swal.fire('เพิ่มไม่ได้', 'บุคคลนี้อยู่ในทีมอยู่แล้ว หรือเกิดข้อผิดพลาด', 'error');
    } else {
        reloadCollabList();
        fetchCollaborators(currentEventId, currentUser.id); // โหลดรูปไอคอนข้างบนใหม่
        document.getElementById('user-selector').value = '';
    }
}

async function removeCollaborator(collabId) {
    await supabaseClient.from('usage_event_collaborators').delete().eq('id', collabId);
    reloadCollabList();
    fetchCollaborators(currentEventId, currentUser.id);
}

async function createNewEvent() {
    const { value: formValues } = await Swal.fire({
        title: 'สร้างกิจกรรมค่ายใหม่',
        html: `<input id="swal-ev-name" class="swal2-input" placeholder="ชื่อกิจกรรม เช่น ค่ายอาสา #34" style="border-radius: 10px;"><input id="swal-ev-date" type="date" class="swal2-input" style="border-radius: 10px;">`,
        focusConfirm: false, showCancelButton: true, confirmButtonText: 'สร้างค่าย', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#4f46e5',
        preConfirm: () => { return { name: document.getElementById('swal-ev-name').value, date: document.getElementById('swal-ev-date').value } }
    });

    if (formValues && formValues.name) {
        await supabaseClient.from('usage_events').insert([{ name: formValues.name, event_date: formValues.date || null }]);
        fetchEvents(); Swal.fire({ icon: 'success', title: 'สร้างเรียบร้อย', timer: 1000, showConfirmButton: false });
    }
}

function selectEvent(id, name, date) {
    currentEventId = id;
    document.getElementById('current-event-name').innerText = name;
    document.getElementById('current-event-date').innerText = `วันที่: ${date}`;
    document.getElementById('event-details-panel').classList.remove('hidden');
    document.getElementById('no-selection-panel').classList.add('hidden');
    fetchEvents(); fetchEventItems(id);
}

async function fetchEventItems(eventId) {
    const tbody = document.getElementById('usage-items-body');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-12 text-gray-400">กำลังโหลดรายการ...</td></tr>';

    const { data, error } = await supabaseClient.from('usage_items').select('*, assets(asset_code, name, category, qty_available)').eq('event_id', eventId).order('id', { ascending: true });
    if (error || !data.length) { tbody.innerHTML = '<tr><td colspan="3" class="text-center p-12 text-gray-400 bg-gray-50/50">ยังไม่มีรายการสิ่งของในเช็คลิสต์</td></tr>'; return; }

    tbody.innerHTML = '';
    data.forEach(item => {
        const asset = item.assets;
        let statusFlow = '';
        if (item.status === 'listed') {
            statusFlow = `<button onclick="updateItemStatus(${item.id}, ${item.asset_id}, 'loaded', '${asset.category}', ${item.qty})" class="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors shadow-sm w-full md:w-auto">🔼 เอาขึ้นรถ</button>`;
        } else if (item.status === 'loaded') {
            statusFlow = `<div class="flex justify-center gap-1.5 flex-wrap md:flex-nowrap"><button onclick="updateItemStatus(${item.id}, ${item.asset_id}, 'returned', '${asset.category}', ${item.qty})" class="bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors shadow-sm flex-1 md:flex-none">✅ คืนคลังครบ</button><button onclick="updateItemStatus(${item.id}, ${item.asset_id}, 'issue', '${asset.category}', ${item.qty})" class="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors shadow-sm flex-1 md:flex-none">⚠️ มีปัญหา</button></div>`;
        } else if (item.status === 'returned') {
            statusFlow = `<span class="bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-bold text-xs">✔️ กลับเข้าคลังแล้ว</span>`;
        } else {
            statusFlow = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full font-bold text-xs">❌ แจ้งสูญหาย/ชำรุด</span>`;
        }

        tbody.innerHTML += `<tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"><td class="p-4"><div class="font-medium text-gray-800">${asset.name}</div><div class="font-mono text-xs text-blue-600 mt-0.5">${asset.asset_code}</div></td><td class="p-4 text-center font-bold text-gray-700 bg-gray-50/30">${item.qty}</td><td class="p-4 text-center">${statusFlow}</td></tr>`;
    });
}

async function updateItemStatus(usageItemId, assetId, newStatus, category, qty) {
    await supabaseClient.from('usage_items').update({ status: newStatus }).eq('id', usageItemId);
    if (newStatus === 'loaded') {
        if (category === 'durable') await supabaseClient.from('assets').update({ status: 'borrowed' }).eq('id', assetId);
        else {
            const { data } = await supabaseClient.from('assets').select('qty_available').eq('id', assetId).single();
            await supabaseClient.from('assets').update({ qty_available: Math.max(0, data.qty_available - qty) }).eq('id', assetId);
        }
    } else if (newStatus === 'returned') {
        if (category === 'durable') await supabaseClient.from('assets').update({ status: 'available' }).eq('id', assetId);
        else {
            const { data } = await supabaseClient.from('assets').select('qty_available').eq('id', assetId).single();
            await supabaseClient.from('assets').update({ qty_available: data.qty_available + qty }).eq('id', assetId);
        }
    } else if (newStatus === 'issue') {
        if (category === 'durable') await supabaseClient.from('assets').update({ status: 'lost' }).eq('id', assetId);
    }
    fetchEventItems(currentEventId);
}

// ==========================================
// ระบบ Modal ของต่างๆ (เพิ่มปกติ)
// ==========================================
async function openItemPickerModal() {
    document.getElementById('item-picker-modal').classList.remove('hidden'); document.getElementById('item-picker-modal').classList.add('flex');
    document.getElementById('search-asset').value = ''; 
    const { data } = await supabaseClient.from('assets').select('*').eq('status', 'available').gt('qty_available', 0).order('category', { ascending: true });
    allAvailableAssets = data || []; renderPickerList(allAvailableAssets);
}
function closeItemPicker() { document.getElementById('item-picker-modal').classList.add('hidden'); document.getElementById('item-picker-modal').classList.remove('flex'); }

function renderPickerList(assets) {
    const list = document.getElementById('asset-picker-list'); list.innerHTML = '';
    assets.forEach(asset => {
        const catBadge = asset.category === 'durable' ? 'คงทน' : 'สิ้นเปลือง';
        list.innerHTML += `<div class="flex items-center justify-between p-3 border-b border-gray-100 hover:bg-indigo-50/50 rounded-xl transition-colors mb-1 bg-white"><label class="flex items-center gap-3 cursor-pointer w-full" for="cb-${asset.id}"><input type="checkbox" id="cb-${asset.id}" class="asset-checkbox w-4 h-4 text-indigo-600 rounded border-gray-300" value="${asset.id}" data-category="${asset.category}" data-code="${asset.asset_code}"><div><div class="font-medium text-gray-800 text-sm">${asset.name}</div><div class="font-mono text-xs text-indigo-600 mt-0.5">${asset.asset_code} <span class="text-gray-400">| ${catBadge} | มี: ${asset.qty_available}</span></div></div></label>${asset.category === 'consumable' ? `<input type="number" id="qty-${asset.id}" value="1" min="1" max="${asset.qty_available}" class="w-16 bg-gray-50 border border-gray-200 rounded-lg p-1 text-sm text-center outline-none">` : `<span class="text-gray-400 text-xs font-bold px-3">1 ชิ้น</span>`}</div>`;
    });
}
function filterAssets() { const text = document.getElementById('search-asset').value.toLowerCase(); const filtered = allAvailableAssets.filter(a => a.name.toLowerCase().includes(text) || a.asset_code.toLowerCase().includes(text)); renderPickerList(filtered); }
async function addSelectedItems() {
    const checkboxes = document.querySelectorAll('.asset-checkbox:checked');
    if (checkboxes.length === 0) return;
    let itemsToInsert = [];
    checkboxes.forEach(cb => {
        const assetId = parseInt(cb.value); const category = cb.dataset.category; const qty = category === 'consumable' ? parseInt(document.getElementById(`qty-${assetId}`).value) : 1;
        itemsToInsert.push({ event_id: currentEventId, asset_id: assetId, qty: qty, status: 'listed' });
    });
    await supabaseClient.from('usage_items').insert(itemsToInsert);
    closeItemPicker(); fetchEventItems(currentEventId); Swal.fire({ icon: 'success', title: 'เพิ่มของเรียบร้อย', timer: 1000, showConfirmButton: false });
}
async function markEventCompleted() {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันปิดค่าย', text: "เมื่อปิดแล้วจะถือว่าค่ายเสร็จสมบูรณ์", icon: 'warning', showCancelButton: true, confirmButtonText: 'ตกลง', confirmButtonColor: '#16a34a' });
    if (isConfirmed) { await supabaseClient.from('usage_events').update({ status: 'completed' }).eq('id', currentEventId); fetchEvents(); document.getElementById('event-details-panel').classList.add('hidden'); document.getElementById('no-selection-panel').classList.remove('hidden'); Swal.fire('สำเร็จ', 'บันทึกการจบค่ายเรียบร้อย', 'success'); }
}

// ==========================================
// ระบบสแกน QR Code เพื่อจัดการของทันที (Smart Scan)
// ==========================================
function openScannerModal() {
    if (!currentEventId) { Swal.fire('แจ้งเตือน', 'กรุณาเลือกค่ายก่อนสแกน', 'warning'); return; }
    document.getElementById('scanner-modal').classList.remove('hidden'); document.getElementById('scanner-modal').classList.add('flex');
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decodedText) => { handleScanSuccess(decodedText); }, (err) => {}).catch(err => { Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเปิดกล้องได้', 'error'); closeScannerModal(); });
}

function closeScannerModal() {
    if (html5QrCode) { html5QrCode.stop().then(() => { html5QrCode.clear(); }).catch(e => console.log(e)); }
    document.getElementById('scanner-modal').classList.add('hidden'); document.getElementById('scanner-modal').classList.remove('flex');
}

// ตรรกะอัจฉริยะหลังจากสแกนเจอ QR
async function handleScanSuccess(scannedCode) {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); audio.play().catch(e=>{});
    closeScannerModal(); // ปิดกล้อง

    // 1. ค้นหาว่าของชิ้นนี้คืออะไรในฐานข้อมูล
    const { data: assetData, error: assetErr } = await supabaseClient.from('assets').select('*').eq('asset_code', scannedCode).single();
    if (assetErr || !assetData) { Swal.fire('ไม่พบทรัพย์สิน', `ไม่มีรหัส ${scannedCode} ในคลัง`, 'error'); return; }

    currentScannedAsset = assetData; // เก็บไว้ใช้
    const assetName = assetData.name;
    const assetId = assetData.id;
    const cat = assetData.category;

    // 2. เช็คว่าของชิ้นนี้อยู่ในค่ายที่เรากำลังจัดอยู่ไหม
    const { data: usageData } = await supabaseClient.from('usage_items').select('*').eq('event_id', currentEventId).eq('asset_id', assetId).single();

    const actionArea = document.getElementById('scan-action-area');
    document.getElementById('scan-asset-code').innerText = scannedCode;
    document.getElementById('scan-asset-name').innerText = assetName;
    document.getElementById('scan-icon').innerText = "📦";

    if (!usageData) {
        // กรณีที่ 1: ยังไม่มีในเช็คลิสต์เลย -> แสดงปุ่ม "เพิ่มเข้ารายการ"
        if (assetData.status !== 'available' || assetData.qty_available === 0) {
            document.getElementById('scan-asset-status-text').innerHTML = `<span class="text-red-500 font-bold">ไม่สามารถเพิ่มได้: ของไม่ได้พร้อมใช้งาน (สถานะ: ${assetData.status})</span>`;
            actionArea.innerHTML = `<button onclick="closeScannedActionModal()" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-xl font-bold">ปิดหน้าต่าง</button>`;
        } else {
            document.getElementById('scan-asset-status-text').innerText = "ยังไม่ได้อยู่ในรายการของค่ายนี้";
            actionArea.innerHTML = `
                <button onclick="smartAction_AddToList(${assetId})" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-md shadow-blue-200 mb-2">➕ เพิ่มเข้ารายการค่าย</button>
                <button onclick="closeScannedActionModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-xl font-bold">ยกเลิก</button>
            `;
        }
    } else {
        const usageId = usageData.id;
        const currentUsageStatus = usageData.status;

        // กรณีที่ 2: อยู่ในรายการแล้ว เช็คสเตตัส
        if (currentUsageStatus === 'listed') {
            document.getElementById('scan-asset-status-text').innerText = "สถานะ: อยู่ในเช็คลิสต์ (เตรียมขึ้นรถ)";
            actionArea.innerHTML = `
                <button onclick="smartAction_UpdateStatus(${usageId}, ${assetId}, 'loaded', '${cat}', 1)" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-md shadow-indigo-200 mb-2">🔼 ยืนยันเอาขึ้นรถ</button>
                <button onclick="closeScannedActionModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-xl font-bold">ยกเลิก</button>
            `;
        } else if (currentUsageStatus === 'loaded') {
            document.getElementById('scan-asset-status-text').innerText = "สถานะ: กำลังใช้งานอยู่ (รอคืน)";
            actionArea.innerHTML = `
                <button onclick="smartAction_UpdateStatus(${usageId}, ${assetId}, 'returned', '${cat}', 1)" class="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-md shadow-green-200 mb-2">✅ ยืนยันรับคืนเข้าคลัง</button>
                <button onclick="smartAction_UpdateStatus(${usageId}, ${assetId}, 'issue', '${cat}', 1)" class="w-full bg-red-100 hover:bg-red-200 text-red-700 py-3 rounded-xl font-bold mb-2">⚠️ แจ้งชำรุด/สูญหาย</button>
                <button onclick="closeScannedActionModal()" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-xl font-bold">ยกเลิก</button>
            `;
        } else if (currentUsageStatus === 'returned') {
            document.getElementById('scan-icon').innerText = "✔️";
            document.getElementById('scan-asset-status-text').innerText = "ของชิ้นนี้ถูกรับคืนเรียบร้อยแล้ว";
            actionArea.innerHTML = `<button onclick="closeScannedActionModal()" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 rounded-xl font-bold">ปิดหน้าต่าง</button>`;
        }
    }

    // เปิด Modal ให้เลือก Action
    document.getElementById('scanned-action-modal').classList.remove('hidden');
    document.getElementById('scanned-action-modal').classList.add('flex');
}

function closeScannedActionModal() {
    document.getElementById('scanned-action-modal').classList.add('hidden');
    document.getElementById('scanned-action-modal').classList.remove('flex');
}

// -------------------------------------
// ฟังก์ชันสำหรับทำงานจากปุ่ม Smart Action
// -------------------------------------
async function smartAction_AddToList(assetId) {
    closeScannedActionModal();
    // 1 ชิ้นเสมอเพราะ QR สแกนเฉพาะของคงทนทีละชิ้น
    await supabaseClient.from('usage_items').insert([{ event_id: currentEventId, asset_id: assetId, qty: 1, status: 'listed' }]);
    fetchEventItems(currentEventId);
    Swal.fire({ icon: 'success', title: 'เพิ่มเข้ารายการแล้ว!', timer: 1000, showConfirmButton: false, toast: true, position: 'top-end' });
}

async function smartAction_UpdateStatus(usageItemId, assetId, newStatus, category, qty) {
    closeScannedActionModal();
    await updateItemStatus(usageItemId, assetId, newStatus, category, qty);
    Swal.fire({ icon: 'success', title: 'อัปเดตเรียบร้อย!', timer: 1000, showConfirmButton: false, toast: true, position: 'top-end' });
}