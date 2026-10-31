let currentRequest = null;
let currentPdfBytes = null;
let pdfDocProxy = null;
let currentUser = null;
let allSystemUsers = []; // เก็บรายชื่อสมาชิกทั้งหมด

// ตัวแปรสำหรับวาด และเปลี่ยนหน้า
let drawCanvas, drawCtx, pdfCanvas, pdfCtx;
let isDrawing = false;
let scale = 1.5; 
let currentPageNum = 1;

window.onload = async () => {
    const savedUser = localStorage.getItem('arsatu_user');
    if (!savedUser) return window.location.href = '../index.html';
    currentUser = JSON.parse(savedUser);

    await fetchRequests();
    await fetchAllUsers(); // โหลดรายชื่อสตาฟฟ์มารอไว้
    initDrawLayer();
};

// ดึงรายชื่อสมาชิกทั้งหมดในระบบมาเก็บไว้ (ใช้ตอนเลือกผู้ประสานงาน)
async function fetchAllUsers() {
    const { data } = await supabaseClient.from('users').select('id, display_name, phone, line_id');
    if (data) allSystemUsers = data;
}

async function fetchRequests() {
    const { data, error } = await supabaseClient.from('borrow_requests')
        .select('*, departments(name)')
        .neq('status', 'waiting_document')
        .order('created_at', { ascending: false });
        
    const list = document.getElementById('requests-list');
    list.innerHTML = '';
    
    if(error || !data || data.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-8">ไม่มีคำขอยืมในระบบ</div>';
        return;
    }

    data.forEach(req => {
        let statusHtml = '';
        if(req.status === 'pending_approval') statusHtml = `<span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold">⏳ รอ Head อนุมัติ</span>`;
        else if(req.status === 'approved') statusHtml = `<span class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">📦 รอจ่ายของ</span>`;
        else if(req.status === 'borrowed') statusHtml = `<span class="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold">🏃 กำลังยืม</span>`;
        else if(req.status === 'returned' || req.status === 'completed') statusHtml = `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">✅ คืนแล้ว</span>`;
        else statusHtml = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">❌ ปฏิเสธ/ยกเลิก</span>`;

        list.innerHTML += `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors bg-white gap-4">
                <div>
                    <div class="font-bold text-gray-800 flex items-center gap-2">${req.project_name} ${statusHtml}</div>
                    <div class="text-sm text-gray-500 mt-1">
                        <span class="font-mono text-indigo-600">${req.request_code}</span> | 
                        ผู้ขอ: <span class="font-medium text-gray-700">${req.borrower_name}</span> |
                        ฝ่าย: <span class="font-medium text-blue-600">${req.departments?.name || '-'}</span>
                    </div>
                </div>
                <button onclick='openDetailsModal(${JSON.stringify(req)})' class="bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all text-sm w-full md:w-auto">
                    🔍 ดูรายละเอียด
                </button>
            </div>
        `;
    });
}

function openDetailsModal(req) {
    currentRequest = req;
    const content = document.getElementById('details-content');
    const actions = document.getElementById('details-actions');
    
    content.innerHTML = `
        <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <p class="text-gray-500 text-xs mb-1">รหัสคำขอ</p>
                <p class="font-mono font-bold text-indigo-600 text-lg">${req.request_code}</p>
            </div>
            <div><p class="text-gray-500 text-xs">โครงการ/กิจกรรม</p><p class="font-medium">${req.project_name}</p></div>
            <div><p class="text-gray-500 text-xs">ฝ่ายที่รับผิดชอบ</p><p class="font-medium text-blue-600">${req.departments?.name || '-'}</p></div>
            <div><p class="text-gray-500 text-xs">ผู้ขอยืม</p><p class="font-medium">${req.borrower_name}</p></div>
            <div><p class="text-gray-500 text-xs">เบอร์โทรผู้ยืม</p><p class="font-medium">${req.borrower_phone || '-'}</p></div>
        </div>
        <div class="mt-4 pt-4 border-t border-gray-100">
            <p class="text-gray-500 text-xs mb-2">เอกสารแนบ (คลิกเพื่อดู)</p>
            <a href="${req.document_url}" target="_blank" class="inline-flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-blue-200">
                📄 เปิดดูไฟล์ PDF ปัจจุบัน
            </a>
        </div>
    `;

    let isAuthorizedHead = false;
    if (req.status === 'pending_approval') {
        if (currentUser.role === 'admin' || (currentUser.camp_role === 'head' && currentUser.department_id === req.department_id)) {
            isAuthorizedHead = true; 
        }
    }

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

function closeDetailsModal() {
    document.getElementById('details-modal').classList.add('hidden');
    document.getElementById('details-modal').classList.remove('flex');
}

async function startApprovalProcess() {
    closeDetailsModal();
    document.getElementById('view-list').classList.add('hidden');
    document.getElementById('view-draw').classList.remove('hidden');
    document.getElementById('view-draw').classList.add('flex');
    
    currentPageNum = 1; // เริ่มที่หน้าแรกเสมอ
    Swal.fire({ title: 'กำลังกางเอกสาร...', didOpen: () => Swal.showLoading() });

    try {
        const res = await fetch(currentRequest.document_url);
        currentPdfBytes = await res.arrayBuffer();
        pdfDocProxy = await pdfjsLib.getDocument({ data: currentPdfBytes }).promise;
        
        renderPage(currentPageNum);
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', 'โหลด PDF ไม่สำเร็จ: ' + err.message, 'error');
        closeDrawView();
    }
}

// 💡 ระบบเปลี่ยนหน้า PDF
function changePage(step) {
    let newPage = currentPageNum + step;
    if (newPage >= 1 && newPage <= pdfDocProxy.numPages) {
        currentPageNum = newPage;
        clearDrawing(); // ล้างลายเซ็นเก่าออกเมื่อเปลี่ยนหน้า (เพื่อไม่ให้ลายเซ็นซ้อนหน้าอื่น)
        renderPage(currentPageNum);
    }
}

function renderPage(pageNum) {
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
            Swal.close();
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

// 💡 3. ระบบยืนยัน + เลือกผู้ประสานงาน ก่อนบันทึกอนุมัติ
async function confirmAndApprove() {
    if (isCanvasBlank()) {
        const warn = await Swal.fire({ title: 'ยังไม่ได้เซ็นชื่อ', text: 'แน่ใจหรือไม่ที่จะอนุมัติโดยไม่มีลายเซ็น?', icon: 'warning', showCancelButton: true, confirmButtonText: 'ดำเนินการต่อ', cancelButtonText: 'กลับไปเขียน' });
        if (!warn.isConfirmed) return;
    }

    // สร้าง Dropdown สมาชิกให้เลือกใน SweetAlert
    let userOptionsHtml = `<select id="swal-coord-select" class="swal2-select w-full max-w-full text-sm">`;
    // ใส่ชื่อตัวเอง (Head) เป็นตัวเลือกแรก
    userOptionsHtml += `<option value='{"name":"${currentUser.display_name}","phone":"${currentUser.phone || '-'}","line":"${currentUser.line_id || '-'}"}'>👑 ตัวฉันเอง (${currentUser.display_name})</option>`;
    
    // ใส่ชื่อสมาชิกคนอื่นๆ ในระบบ
    allSystemUsers.forEach(u => {
        if (u.id !== currentUser.id) {
            userOptionsHtml += `<option value='{"name":"${u.display_name}","phone":"${u.phone || '-'}","line":"${u.line_id || '-'}"}'>👥 ${u.display_name}</option>`;
        }
    });
    userOptionsHtml += `</select>`;

    const { value: selectedCoord, isConfirmed } = await Swal.fire({
        title: 'เลือกผู้ประสานงาน',
        html: `<div class="text-sm text-gray-500 mb-2">เลือกสตาฟฟ์ที่จะแนบข้อมูลการติดต่อลงในอีเมลแจ้งเตือนผู้ยืม</div>` + userOptionsHtml,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันอนุมัติคำขอ',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            return JSON.parse(document.getElementById('swal-coord-select').value);
        }
    });

    if (isConfirmed && selectedCoord) {
        saveAndApprove(selectedCoord);
    }
}

// กระบวนการประทับตราและส่งข้อมูล
async function saveAndApprove(coordInfo) {
    Swal.fire({ title: 'กำลังประทับรอยขีดเขียนและส่งอีเมล...', didOpen: () => Swal.showLoading() });

    try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.load(currentPdfBytes);
        
        // 💡 ประทับลายเซ็นลงในหน้าที่เปิดอยู่ปัจจุบันเท่านั้น
        const targetPage = pdfDoc.getPages()[currentPageNum - 1]; 
        const drawnImageBase64 = drawCanvas.toDataURL('image/png');
        const embeddedImage = await pdfDoc.embedPng(drawnImageBase64);
        
        const { width, height } = targetPage.getSize();
        targetPage.drawImage(embeddedImage, { x: 0, y: 0, width: width, height: height });

        const finalPdfBytes = await pdfDoc.save();
        const filePath = `borrow_requests/${currentRequest.request_code}.pdf`;
        await supabaseClient.storage.from('documents').upload(filePath, new Blob([finalPdfBytes], { type: 'application/pdf' }), { upsert: true });

        await supabaseClient.from('borrow_requests').update({ status: 'approved' }).eq('id', currentRequest.id);

        // ยิง API ส่งอีเมล พร้อมข้อมูลผู้ประสานงานที่เลือก
        await fetch('http://localhost:3000/api/send-approved-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: currentRequest.borrower_email,
                name: currentRequest.borrower_name,
                requestCode: currentRequest.request_code,
                coordName: coordInfo.name,
                coordPhone: coordInfo.phone,
                coordLine: coordInfo.line
            })
        });

        Swal.fire('สำเร็จ', 'อนุมัติคำขอและส่งอีเมลแจ้งผู้ยืมเรียบร้อย', 'success').then(() => {
            closeDrawView();
            fetchRequests(); 
            // อัปเดตตัวเลขแจ้งเตือนที่เมนู
            updateApprovalBadge(currentUser);
        });

    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}