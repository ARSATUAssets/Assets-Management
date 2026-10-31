let currentRequest = null;
let currentPdfBytes = null;
let pdfDocProxy = null;
let currentUser = null;
let allSystemUsers = []; 

// 💡 เพิ่มตัวแปรเช็คว่ามีการฝังลายเซ็นไปหรือยัง
let hasModifiedPdf = false; 

let drawCanvas, drawCtx, pdfCanvas, pdfCtx;
let isDrawing = false;
let scale = 1.5; 
let currentPageNum = 1;

let allRequests = [];

window.onload = async () => {
    const savedUser = localStorage.getItem('arsatu_user');
    if (!savedUser) return window.location.href = '../index.html';
    currentUser = JSON.parse(savedUser);

    await fetchRequests();
    await fetchAllUsers(); 
    initDrawLayer();
};

async function fetchAllUsers() {
    const { data } = await supabaseClient.from('users').select('id, display_name, phone, line_id');
    if (data) allSystemUsers = data;
}

async function fetchRequests() {
    // 💡 ดึงข้อมูลและเรียงลำดับจากวันที่ล่าสุด (order by created_at descending)
    const { data, error } = await supabaseClient.from('borrow_requests')
        .select('*, departments(name)')
        .neq('status', 'waiting_document')
        .order('created_at', { ascending: false });
        
    if(error || !data || data.length === 0) {
        document.getElementById('requests-list').innerHTML = '<div class="text-gray-400 text-center py-8">ไม่มีคำขอยืมในระบบ</div>';
        allRequests = [];
        return;
    }
    
    allRequests = data;
    applyFilters(); // นำไปเข้าฟิลเตอร์ก่อนวาดลงจอ
}

// 💡 ระบบกรองข้อมูลและค้นหา
function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase().trim();
    const status = document.getElementById('status-filter').value;
    
    const filtered = allRequests.filter(req => {
        const matchStatus = status === 'all' || req.status === status || (status === 'returned' && req.status === 'completed');
        const matchSearch = !search || 
            (req.project_name && req.project_name.toLowerCase().includes(search)) ||
            (req.request_code && req.request_code.toLowerCase().includes(search)) ||
            (req.borrower_name && req.borrower_name.toLowerCase().includes(search));
            
        return matchStatus && matchSearch;
    });
    
    renderRequestsList(filtered);
}

// 💡 ระบบวาดรายการ
function renderRequestsList(data) {
    const list = document.getElementById('requests-list');
    list.innerHTML = '';
    
    if(data.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-8">ไม่พบรายการที่ค้นหา</div>';
        return;
    }

    data.forEach(req => {
        let statusHtml = '';
        let isPending = req.status === 'pending_approval';
        let isActionRequired = isPending && (currentUser.role === 'admin' || (currentUser.camp_role === 'head' && currentUser.department_id === req.department_id));

        if(isPending) {
            if(isActionRequired) statusHtml = `<span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5"><span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span></span>รอคุณอนุมัติ</span>`;
            else statusHtml = `<span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold">⏳ รอ Head ฝ่ายอนุมัติ</span>`;
        }
        else if(req.status === 'approved') statusHtml = `<span class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">📦 รอจ่ายของ</span>`;
        else if(req.status === 'borrowed') statusHtml = `<span class="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold">🏃 กำลังยืม</span>`;
        else if(req.status === 'returned' || req.status === 'completed') statusHtml = `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">✅ คืนแล้ว</span>`;
        else statusHtml = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">❌ ปฏิเสธ/ยกเลิก</span>`;

        let coordCompact = req.coord_name ? `<span class="text-blue-600 font-medium">👤 ${req.coord_name}</span>` : `<span class="text-gray-400 text-xs">รอระบุ</span>`;

        list.innerHTML += `
            <div class="relative flex flex-col md:flex-row justify-between items-start md:items-center p-4 border ${isActionRequired ? 'border-yellow-300 bg-yellow-50/40 shadow-sm' : 'border-gray-100 bg-white'} rounded-xl hover:bg-gray-50 transition-colors gap-4">
                ${isActionRequired ? '<div class="absolute -top-2.5 -right-2.5 bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md animate-bounce border-2 border-white">🚨 รอดำเนินการ</div>' : ''}
                <div class="w-full">
                    <div class="font-bold text-gray-800 flex flex-wrap items-center gap-2 mb-1.5">${req.project_name} ${statusHtml}</div>
                    <div class="text-sm text-gray-500 leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <div><span class="font-mono text-indigo-600 font-semibold">${req.request_code}</span> | ผู้ขอ: <span class="font-medium text-gray-700">${req.borrower_name}</span></div>
                        <div>ฝ่าย: <span class="font-medium text-blue-600">${req.departments?.name || '-'}</span> | ประสานงาน: ${coordCompact}</div>
                    </div>
                </div>
                <button onclick='openDetailsModal(${JSON.stringify(req)})' class="bg-white border border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all text-sm w-full md:w-auto shrink-0">🔍 ดูรายละเอียด</button>
            </div>
        `;
    });
}

function openDetailsModal(req) {
    currentRequest = req;
    const content = document.getElementById('details-content');
    const actions = document.getElementById('details-actions');
    
    let coordDetailHtml = req.coord_name 
        ? `<div class="col-span-2 mt-2 pt-3 border-t border-gray-100"><p class="text-gray-500 text-xs mb-2 font-bold uppercase tracking-wider">🤝 ผู้ประสานงานชุมนุม</p><div class="grid grid-cols-1 md:grid-cols-3 gap-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100"><div><p class="text-gray-400 text-xs">ชื่อ-สกุล</p><p class="font-medium text-blue-800">${req.coord_name}</p></div><div><p class="text-gray-400 text-xs">เบอร์โทร</p><p class="font-medium text-blue-800">${req.coord_phone || '-'}</p></div><div><p class="text-gray-400 text-xs">Line ID</p><p class="font-medium text-blue-800">${req.coord_line || '-'}</p></div></div></div>` 
        : `<div class="col-span-2 mt-2 pt-3 border-t border-gray-100"><p class="text-gray-500 text-xs mb-2 font-bold uppercase tracking-wider">🤝 ผู้ประสานงานชุมนุม</p><div class="p-3 bg-gray-50 rounded-xl border border-gray-200 text-gray-400 text-sm text-center">ยังไม่มีการระบุผู้ประสานงาน (รอการอนุมัติ)</div></div>`;

    // 💡 สร้างลิงก์ PDF ล่าสุดแบบข้าม Cache ของเบราว์เซอร์
    const latestPdfUrl = req.document_url + (req.document_url.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`);

    content.innerHTML = `
        <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100"><p class="text-gray-500 text-xs mb-1">รหัสคำขอ</p><p class="font-mono font-bold text-indigo-600 text-lg">${req.request_code}</p></div>
            <div><p class="text-gray-500 text-xs">โครงการ/กิจกรรม</p><p class="font-medium">${req.project_name}</p></div>
            <div><p class="text-gray-500 text-xs">ฝ่ายที่รับผิดชอบ</p><p class="font-medium text-blue-600">${req.departments?.name || '-'}</p></div>
            <div><p class="text-gray-500 text-xs">ผู้ขอยืม</p><p class="font-medium">${req.borrower_name}</p></div>
            <div><p class="text-gray-500 text-xs">เบอร์โทรผู้ยืม</p><p class="font-medium">${req.borrower_phone || '-'}</p></div>
            <div class="col-span-2"><p class="text-gray-500 text-xs">Line ID ผู้ยืม</p><p class="font-medium">${req.borrower_line || '-'}</p></div>
            ${coordDetailHtml}
        </div>
        <div class="mt-4 pt-4 border-t border-gray-100 text-center md:text-left">
            <a href="${latestPdfUrl}" target="_blank" class="inline-flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-6 py-3 rounded-xl font-bold text-sm transition-colors border border-indigo-200 w-full md:w-auto shadow-sm">
                📄 กดดูไฟล์ PDF ล่าสุด (ตรวจสอบลายเซ็น)
            </a>
        </div>
    `;

    let isAuthorizedHead = req.status === 'pending_approval' && (currentUser.role === 'admin' || (currentUser.camp_role === 'head' && currentUser.department_id === req.department_id));

    if (isAuthorizedHead) {
        actions.innerHTML = `
            <button onclick="closeDetailsModal()" class="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-medium transition-colors">ปิด</button>
            <button onclick="startApprovalProcess()" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all">✍️ เปิดหน้าต่างอนุมัติ (Head)</button>
        `;
    } else {
        actions.innerHTML = `<button onclick="closeDetailsModal()" class="w-full md:w-auto px-8 py-2.5 bg-gray-800 hover:bg-black text-white rounded-xl font-bold transition-colors">ปิดหน้าต่าง</button>`;
    }

    document.getElementById('details-modal').classList.remove('hidden');
    document.getElementById('details-modal').classList.add('flex');
}

function closeDetailsModal() { document.getElementById('details-modal').classList.add('hidden'); document.getElementById('details-modal').classList.remove('flex'); }

async function startApprovalProcess() {
    closeDetailsModal();
    document.getElementById('view-list').classList.add('hidden');
    document.getElementById('view-draw').classList.remove('hidden');
    document.getElementById('view-draw').classList.add('flex');
    
    currentPageNum = 1; 
    hasModifiedPdf = false; // รีเซ็ตสถานะการวาดใหม่ทุกครั้งที่เปิดเอกสาร
    Swal.fire({ title: 'กำลังกางเอกสาร...', didOpen: () => Swal.showLoading() });

    try {
        const res = await fetch(currentRequest.document_url);
        currentPdfBytes = await res.arrayBuffer();
        pdfDocProxy = await pdfjsLib.getDocument({ data: currentPdfBytes }).promise;
        renderPage(currentPageNum, true);
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', 'โหลด PDF ไม่สำเร็จ: ' + err.message, 'error');
        closeDrawView();
    }
}

// 💡 1. ฟังก์ชัน "บันทึกและฝังลายเซ็นลงหน้าปัจจุบัน"
async function saveCurrentPageDrawing() {
    if (isCanvasBlank()) {
        return Swal.fire('ไม่มีลายเซ็น', 'กรุณาเซ็นชื่อหรือขีดเขียนก่อนกดบันทึกหน้านี้', 'warning');
    }

    Swal.fire({ title: 'กำลังฝังลายเซ็นลงหน้านี้...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(currentPdfBytes);
        
        const targetPage = pdfDoc.getPages()[currentPageNum - 1]; 
        const drawnImageBase64 = drawCanvas.toDataURL('image/png');
        const embeddedImage = await pdfDoc.embedPng(drawnImageBase64);
        
        const { width, height } = targetPage.getSize();
        targetPage.drawImage(embeddedImage, { x: 0, y: 0, width: width, height: height });

        // เซฟทับตัวแปรในหน่วยความจำ 
        currentPdfBytes = await pdfDoc.save();
        hasModifiedPdf = true; // จำไว้ว่ามีการแก้ไข PDF แล้ว
        
        // โหลด PDF ใหม่ให้แสดงผลเป็นพื้นหลัง
        pdfDocProxy = await pdfjsLib.getDocument({ data: currentPdfBytes }).promise;
        clearDrawing();
        renderPage(currentPageNum, false); 
        
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
        Toast.fire({ icon: 'success', title: 'ฝังลายเซ็นเรียบร้อย สามารถเปลี่ยนหน้าได้เลย' });

    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}

function changePage(step) {
    let newPage = currentPageNum + step;
    if (newPage >= 1 && newPage <= pdfDocProxy.numPages) {
        // แจ้งเตือนถ้าจะเปลี่ยนหน้าแต่ยังไม่ได้ฝังลายเซ็น
        if (!isCanvasBlank()) {
            Swal.fire({
                title: 'ยังไม่ได้บันทึกหน้านี้',
                text: 'คุณมีลายเซ็นที่ยังไม่ได้ฝังลงหน้านี้ หากเปลี่ยนหน้า ลายเซ็นจะหายไป ต้องการเปลี่ยนหน้าใช่หรือไม่?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'ทิ้งลายเซ็นแล้วเปลี่ยนหน้า',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if(result.isConfirmed) {
                    currentPageNum = newPage;
                    clearDrawing(); 
                    renderPage(currentPageNum, false);
                }
            });
        } else {
            currentPageNum = newPage;
            clearDrawing(); 
            renderPage(currentPageNum, false);
        }
    }
}

function renderPage(pageNum, isFirstLoad = false) {
    document.getElementById('page-num-display').innerText = `${pageNum} / ${pdfDocProxy.numPages}`;
    
    pdfDocProxy.getPage(pageNum).then(page => {
        const viewport = page.getViewport({ scale: scale });
        pdfCanvas = document.getElementById('pdf-render');
        pdfCtx = pdfCanvas.getContext('2d');
        pdfCanvas.height = viewport.height;
        pdfCanvas.width = viewport.width;

        drawCanvas = document.getElementById('draw-layer');
        drawCanvas.height = viewport.height;
        drawCanvas.width = viewport.width;
        drawCtx = drawCanvas.getContext('2d');
        drawCtx.lineWidth = 2.5; drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round'; drawCtx.strokeStyle = '#000080';

        const renderContext = { canvasContext: pdfCtx, viewport: viewport };
        page.render(renderContext).promise.then(() => { 
            if (isFirstLoad) {
                let alertText = pdfDocProxy.numPages > 1 
                    ? `หากเอกสารมีหลายหน้า คุณสามารถเซ็นแล้วกด <b class="text-blue-600">"ฝังลายเซ็นหน้านี้"</b> ทีละหน้าได้<br>เมื่อครบแล้วจึงค่อยกด <b class="text-green-600">"อนุมัติคำขอ"</b>`
                    : `กรุณาเซ็นชื่อแล้วกด <b class="text-green-600">"อนุมัติคำขอ"</b>`;
                Swal.fire({ title: 'คำแนะนำการอนุมัติ 📌', html: alertText, icon: 'info', confirmButtonText: 'รับทราบ', confirmButtonColor: '#4f46e5', allowOutsideClick: false });
            } else {
                Swal.close(); 
            }
        });
    });
}

function closeDrawView() {
    document.getElementById('view-draw').classList.add('hidden');
    document.getElementById('view-draw').classList.remove('flex');
    document.getElementById('view-list').classList.remove('hidden');
}

function initDrawLayer() {
    drawCanvas = document.getElementById('draw-layer');
    const getPos = (e) => {
        const rect = drawCanvas.getBoundingClientRect();
        const scaleX = drawCanvas.width / rect.width;
        const scaleY = drawCanvas.height / rect.height;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };
    const startDraw = (e) => { e.preventDefault(); isDrawing = true; const pos = getPos(e); drawCtx.beginPath(); drawCtx.moveTo(pos.x, pos.y); };
    const draw = (e) => { if (!isDrawing) return; e.preventDefault(); const pos = getPos(e); drawCtx.lineTo(pos.x, pos.y); drawCtx.stroke(); };
    const stopDraw = (e) => { if (isDrawing) { e.preventDefault(); isDrawing = false; } };

    drawCanvas.addEventListener('mousedown', startDraw); drawCanvas.addEventListener('mousemove', draw);
    drawCanvas.addEventListener('mouseup', stopDraw); drawCanvas.addEventListener('mouseout', stopDraw);
    drawCanvas.addEventListener('touchstart', startDraw, {passive: false}); drawCanvas.addEventListener('touchmove', draw, {passive: false});
    drawCanvas.addEventListener('touchend', stopDraw, {passive: false});
}

function clearDrawing() { if(drawCtx && drawCanvas) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); }
function isCanvasBlank() { const blank = document.createElement('canvas'); blank.width = drawCanvas.width; blank.height = drawCanvas.height; return drawCanvas.toDataURL() === blank.toDataURL(); }

// 💡 2. ปรับลอจิกตอนกดยืนยัน (เช็ค hasModifiedPdf)
async function confirmAndApprove() {
    // ถ้าหน้าจอว่างเปล่า และไม่เคยฝังลายเซ็นหน้าอื่นไว้เลย = เตือน
    if (isCanvasBlank() && !hasModifiedPdf) {
        const warn = await Swal.fire({ title: 'ยังไม่ได้เซ็นชื่อ', text: 'แน่ใจหรือไม่ที่จะอนุมัติโดยไม่มีลายเซ็นในเอกสารเลย?', icon: 'warning', showCancelButton: true, confirmButtonText: 'ดำเนินการต่อ', cancelButtonText: 'กลับไปเขียน' });
        if (!warn.isConfirmed) return;
    }

    let userOptionsHtml = `<select id="swal-coord-select" class="swal2-select w-full max-w-full text-sm">`;
    userOptionsHtml += `<option value='{"name":"${currentUser.display_name}","phone":"${currentUser.phone || '-'}","line":"${currentUser.line_id || '-'}"}'>👑 ตัวฉันเอง (${currentUser.display_name})</option>`;
    
    allSystemUsers.forEach(u => {
        if (u.id !== currentUser.id) { userOptionsHtml += `<option value='{"name":"${u.display_name}","phone":"${u.phone || '-'}","line":"${u.line_id || '-'}"}'>👥 ${u.display_name}</option>`; }
    });
    userOptionsHtml += `</select>`;

    const { value: selectedCoord, isConfirmed } = await Swal.fire({
        title: 'เลือกผู้ประสานงาน',
        html: `<div class="text-sm text-gray-500 mb-2">เลือกสตาฟฟ์รับผิดชอบ (ข้อมูลจะโชว์ใน Card และอีเมล)</div>` + userOptionsHtml,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันอนุมัติคำขอ',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => { return JSON.parse(document.getElementById('swal-coord-select').value); }
    });

    if (isConfirmed && selectedCoord) saveAndApprove(selectedCoord);
}

async function saveAndApprove(coordInfo) {
    Swal.fire({ title: 'กำลังประมวลผลและส่งอีเมล...', didOpen: () => Swal.showLoading() });

    try {
        let finalPdfBytes = currentPdfBytes;

        // 💡 3. ถ้ายังมีลายเซ็นค้างอยู่ในหน้าจอปัจจุบันที่ยังไม่ได้กดฝัง ก็ให้ฝังเพิ่มเข้าไปก่อนส่ง
        if (!isCanvasBlank()) {
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.load(currentPdfBytes);
            const targetPage = pdfDoc.getPages()[currentPageNum - 1]; 
            const drawnImageBase64 = drawCanvas.toDataURL('image/png');
            const embeddedImage = await pdfDoc.embedPng(drawnImageBase64);
            const { width, height } = targetPage.getSize();
            targetPage.drawImage(embeddedImage, { x: 0, y: 0, width: width, height: height });
            finalPdfBytes = await pdfDoc.save();
        }

        const filePath = `borrow_requests/${currentRequest.request_code}.pdf`;
        await supabaseClient.storage.from('documents').upload(filePath, new Blob([finalPdfBytes], { type: 'application/pdf' }), { upsert: true });

        await supabaseClient.from('borrow_requests').update({ 
            status: 'approved', coord_name: coordInfo.name, coord_phone: coordInfo.phone, coord_line: coordInfo.line 
        }).eq('id', currentRequest.id);

        await fetch('http://localhost:3000/api/send-approved-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: currentRequest.borrower_email, name: currentRequest.borrower_name, requestCode: currentRequest.request_code,
                coordName: coordInfo.name, coordPhone: coordInfo.phone, coordLine: coordInfo.line
            })
        });

        Swal.fire('สำเร็จ', 'อนุมัติคำขอและบันทึกข้อมูลเรียบร้อย', 'success').then(() => {
            closeDrawView(); fetchRequests(); 
            if(typeof updateApprovalBadge === 'function') updateApprovalBadge(currentUser);
        });

    } catch (err) { Swal.fire('ข้อผิดพลาด', err.message, 'error'); }
}