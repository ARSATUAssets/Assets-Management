let currentRequest = null;
let currentPdfBytes = null;
let pdfDocProxy = null;
let currentUser = null;

let actionMode = 'handover'; 

let requestedItems = []; 
let extraItems = [];     
let html5QrcodeScanner = null;
let photoFile = null;

let drawCanvas, drawCtx, pdfCanvas, pdfCtx;
let isDrawing = false;
let scale = 1.5; 
let currentPageNum = 1;
let hasModifiedPdf = false; 

let allRequests = [];

window.onload = async () => {
    const savedUser = localStorage.getItem('arsatu_user');
    if (!savedUser) return window.location.href = '../index.html';
    currentUser = JSON.parse(savedUser);

    await fetchRequests();
    initDrawLayer();
};

async function fetchRequests() {
    // 💡 ดึงข้อมูลและเรียงลำดับจากวันที่ล่าสุด
    const { data, error } = await supabaseClient.from('borrow_requests')
        .select('*, departments(name)')
        .in('status', ['approved', 'borrowed'])
        .order('created_at', { ascending: false });
        
    if(error || !data || data.length === 0) {
        document.getElementById('requests-list').innerHTML = '<div class="text-gray-400 text-center py-8">ไม่มีคิวรอจ่ายของหรือรับคืนในขณะนี้</div>';
        allRequests = [];
        return;
    }

    allRequests = data;
    applyFilters(); 
}

// 💡 ระบบกรองข้อมูลและค้นหา
function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase().trim();
    const status = document.getElementById('status-filter').value;
    
    const filtered = allRequests.filter(req => {
        const matchStatus = status === 'all' || req.status === status;
        const matchSearch = !search || 
            (req.project_name && req.project_name.toLowerCase().includes(search)) ||
            (req.request_code && req.request_code.toLowerCase().includes(search)) ||
            (req.borrower_name && req.borrower_name.toLowerCase().includes(search));
            
        return matchStatus && matchSearch;
    });
    
    renderRequestsList(filtered);
}

// 💡 ระบบวาดรายการ (เพิ่มการแจ้งเตือนงานของตัวเอง)
function renderRequestsList(data) {
    const list = document.getElementById('requests-list');
    list.innerHTML = '';
    
    if(data.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-8">ไม่พบรายการที่ค้นหา</div>';
        return;
    }

    data.forEach(req => {
        let isHandover = req.status === 'approved';
        
        // 💡 เช็คว่า Account ปัจจุบัน เป็นผู้ประสานงานของคิวนี้หรือไม่
        let isMyTask = req.coord_name === currentUser.display_name;

        let statusBadge = isHandover 
            ? `<span class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">📦 รอจ่ายของ</span>`
            : `<span class="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-xs font-bold">🏃 กำลังยืม (รอรับคืน)</span>`;

        let btnClass = isHandover ? "bg-indigo-600 hover:bg-indigo-700" : "bg-teal-600 hover:bg-teal-700";
        let btnText = isHandover ? "📦 ดำเนินการจ่ายของ" : "📥 ดำเนินการรับคืน";
        let modeParam = isHandover ? 'handover' : 'return';

        // 💡 กำหนดสีกรอบ: ถ้าเป็นงานตัวเองให้ไฮไลท์สีเหลืองเด่นๆ 
        let borderClass = isHandover ? 'border-indigo-200 bg-indigo-50/30' : 'border-teal-200 bg-teal-50/30';
        if (isMyTask) {
            borderClass = 'border-yellow-400 bg-yellow-50/50 shadow-md'; // งานตัวเองเด่นสุด
        }

        list.innerHTML += `
            <div class="relative flex flex-col md:flex-row justify-between items-start md:items-center p-4 border ${borderClass} rounded-xl transition-colors gap-4">
                
                <!-- 💡 ป้ายแจ้งเตือน "งานของคุณ" เด้งกระพริบที่มุมขวาบน -->
                ${isMyTask ? '<div class="absolute -top-2.5 -right-2.5 bg-red-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md animate-bounce border-2 border-white">🚨 คิวของคุณ</div>' : ''}
                
                <div class="w-full">
                    <div class="font-bold text-gray-800 flex flex-wrap items-center gap-2 mb-1.5">${req.project_name} ${statusBadge}</div>
                    <div class="text-sm text-gray-500 leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <div><span class="font-mono text-indigo-600 font-semibold">${req.request_code}</span> | ผู้ขอ: <span class="font-medium text-gray-700">${req.borrower_name}</span></div>
                        <div>ฝ่าย: <span class="font-medium text-blue-600">${req.departments?.name || '-'}</span> | ประสานงาน: <span class="${isMyTask ? 'text-blue-700 font-bold' : ''}">👤 ${req.coord_name || '-'}</span></div>
                    </div>
                </div>
                <button onclick='startProcess(${JSON.stringify(req)}, "${modeParam}")' class="${btnClass} text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-all text-sm w-full md:w-auto shrink-0 flex items-center justify-center gap-2 z-10">
                    ${btnText}
                </button>
            </div>
        `;
    });
}

async function startProcess(req, mode) {
    currentRequest = req;
    actionMode = mode; 
    requestedItems = [];
    extraItems = [];
    removePhoto();
    
    document.getElementById('prepare-title').innerText = mode === 'handover' ? 'ขั้นตอนการจ่ายของ' : 'ขั้นตอนการรับของคืน';
    document.getElementById('btn-confirm-action').innerHTML = mode === 'handover' ? '📦 ยืนยันการจ่ายของ' : '📥 ยืนยันการรับคืน';
    document.getElementById('sign-alert').innerHTML = mode === 'handover' 
        ? `กรุณาให้ <span class="text-yellow-300">"ผู้ส่งมอบ"</span> และ <span class="text-yellow-300">"ผู้รับของ"</span> เซ็นชื่อลงในเอกสาร`
        : `กรุณาให้ <span class="text-yellow-300">"ผู้รับคืน (สตาฟฟ์)"</span> และ <span class="text-yellow-300">"ผู้ส่งคืน"</span> เซ็นชื่อลงในเอกสาร`;

    document.getElementById('view-list').classList.add('hidden');
    document.getElementById('view-prepare').classList.remove('hidden');
    document.getElementById('view-prepare').classList.add('flex');
    
    Swal.fire({ title: 'กำลังดึงรายการสิ่งของ...', didOpen: () => Swal.showLoading() });
    
    const { data, error } = await supabaseClient.from('borrow_items')
        .select('id, asset_id, status, assets(asset_code, name)')
        .eq('request_id', req.id);

    if (data) {
        data.forEach(item => {
            let isTargetItem = false;
            if (mode === 'handover' && (item.status === 'pending' || item.status === 'approved' || item.status === null)) isTargetItem = true;
            if (mode === 'return' && item.status === 'picked_up') isTargetItem = true;

            if (isTargetItem) {
                requestedItems.push({
                    borrow_item_id: item.id, asset_id: item.asset_id, asset_code: item.assets.asset_code, name: item.assets.name, 
                    scanned: false, 
                    issue: null // 💡 เก็บสถานะแจ้งปัญหา (ชำรุด/สูญหาย)
                });
            }
        });
    }
    
    Swal.close();
    renderChecklist();
}

function toggleScanner() {
    const readerDiv = document.getElementById('qr-reader');
    const btn = document.getElementById('btn-toggle-scanner');
    
    if (readerDiv.classList.contains('hidden')) {
        readerDiv.classList.remove('hidden');
        btn.innerHTML = '🛑 ปิดกล้อง';
        btn.classList.replace('bg-indigo-100', 'bg-red-100');
        btn.classList.replace('text-indigo-700', 'text-red-700');
        
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
            html5QrcodeScanner.render((decodedText) => {
                document.getElementById('scan-input').value = decodedText;
                processScannedCode(decodedText);
            }, (error) => {});
        }
    } else {
        readerDiv.classList.add('hidden');
        btn.innerHTML = '📷 เปิดกล้องสแกน';
        btn.classList.replace('bg-red-100', 'bg-indigo-100');
        btn.classList.replace('text-red-700', 'text-indigo-700');
        if (html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; }
    }
}

function handleScanEnter(e) { if(e.key === 'Enter') handleAddManual(); }
function handleAddManual() { const input = document.getElementById('scan-input'); processScannedCode(input.value); input.value = ''; input.focus(); }

async function processScannedCode(code) {
    if(!code) return;
    code = code.trim().toUpperCase();
    
    let isAlreadyRequested = requestedItems.some(i => i.asset_code === code && (i.scanned || i.issue));
    let isAlreadyExtra = extraItems.some(i => i.asset_code === code);
    
    if (isAlreadyRequested || isAlreadyExtra) {
        return Swal.fire({title: 'ตรวจนับแล้ว', text: `รหัส ${code} ถูกเช็คไปแล้ว`, icon: 'info', timer: 1500});
    }

    let reqIndex = requestedItems.findIndex(i => i.asset_code === code);
    if (reqIndex > -1) {
        requestedItems[reqIndex].scanned = true;
        renderChecklist();
        return; 
    }

    if (actionMode === 'return') {
        return Swal.fire('ผิดรายการ', `รหัส ${code} ไม่ได้ถูกยืมไปในคำขอนี้ หรือเป็นของคนอื่น`, 'error');
    }

    Swal.fire({ title: 'ตรวจสอบรหัสนอกรายการ...', didOpen: () => Swal.showLoading() });
    const { data: asset, error } = await supabaseClient.from('assets').select('*').eq('asset_code', code).single();
    if (error || !asset) return Swal.fire('ไม่พบข้อมูล', `รหัส ${code} ไม่มีอยู่ในระบบ`, 'error');
    if (asset.status !== 'available') return Swal.fire('ยืมไม่ได้', `รหัส ${code} ไม่พร้อมใช้งาน (สถานะ: ${asset.status})`, 'warning');

    Swal.fire({
        title: '⚠️ ของนอกรายการขอ', html: `กำลังจ่ายของรหัส <b>${code}</b> (${asset.name})<br>ซึ่งผู้ยืมไม่ได้ขอไว้<br><br><span class="text-red-600 font-bold">ยืนยันจ่ายของชิ้นนี้ และกรุณาเขียนแก้ไขเพิ่มลงใน PDF ด้วย</span>`,
        icon: 'warning', showCancelButton: true, confirmButtonText: 'ยืนยันจ่ายของชิ้นนี้', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#eab308'
    }).then((res) => {
        if(res.isConfirmed) { extraItems.push({ asset_id: asset.id, asset_code: asset.asset_code, name: asset.name }); renderChecklist(); }
    });
}

// 💡 3. ฟังก์ชันแจ้งปัญหา (สูญหาย/ชำรุด)
async function reportIssue(index) {
    const item = requestedItems[index];
    const { value: formValues } = await Swal.fire({
        title: 'แจ้งปัญหาอุปกรณ์',
        html: `
            <p class="text-sm font-bold text-gray-700 mb-3">${item.name} (${item.asset_code})</p>
            <select id="issue-type" class="swal2-select w-full mb-3 text-sm">
                <option value="damaged">💥 ชำรุด/พัง</option>
                <option value="lost">❓ สูญหาย</option>
            </select>
            <textarea id="issue-note" class="swal2-textarea w-full text-sm p-3 mt-1" placeholder="ระบุหมายเหตุ (เช่น ทำตกจอแตก, หาไม่เจอ)..."></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึกปัญหา',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            return { type: document.getElementById('issue-type').value, note: document.getElementById('issue-note').value }
        }
    });

    if (formValues) {
        item.issue = formValues;
        item.scanned = false; // ปลดการสแกนปกติออก ให้จำแต่สถานะมีปัญหา
        renderChecklist();
    }
}

function cancelIssue(index) {
    requestedItems[index].issue = null;
    requestedItems[index].scanned = false; // รีเซ็ตให้ต้องสแกนใหม่
    renderChecklist();
}

// 💡 4. ระบบ Render รายการ (เพิ่มป้ายแจ้งปัญหา)
function renderChecklist() {
    const reqList = document.getElementById('checklist-items');
    const extList = document.getElementById('extra-items');
    const extContainer = document.getElementById('extra-items-container');
    
    // นับยอดรวมทั้งที่สแกนปกติ และที่ติดสถานะปัญหา
    let checkedCount = requestedItems.filter(i => i.scanned || i.issue).length;
    document.getElementById('count-checked').innerText = checkedCount;
    document.getElementById('count-total').innerText = requestedItems.length;

    reqList.innerHTML = requestedItems.map((item, index) => {
        let isScanned = item.scanned;
        let isIssue = item.issue != null;
        
        let statusIcon = isScanned ? '<div class="w-6 h-6 rounded-full flex items-center justify-center bg-green-500 text-white">✓</div>' 
                       : (isIssue ? '<div class="w-6 h-6 rounded-full flex items-center justify-center bg-red-500 text-white font-bold">!</div>' 
                                  : '<div class="w-6 h-6 rounded-full flex items-center justify-center bg-gray-200 text-gray-400"></div>');
                                  
        let bgClass = isScanned ? 'bg-green-50 border-green-200' : (isIssue ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200');
        let textClass = isScanned ? 'text-green-800' : (isIssue ? 'text-red-800' : 'text-gray-700');
        let issueBadge = isIssue ? `<span class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-bold ml-2 shadow-sm border border-red-200">${item.issue.type === 'lost' ? 'สูญหาย' : 'ชำรุด'}</span>` : '';
        
        let btnReport = '';
        if (actionMode === 'return') {
            if (isIssue) {
                btnReport = `<button onclick="cancelIssue(${index})" class="text-xs text-gray-500 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 bg-white ml-2 transition-colors">ยกเลิก</button>`;
            } else {
                btnReport = `<button onclick="reportIssue(${index})" class="text-xs text-orange-500 hover:bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200 bg-white ml-2 transition-colors whitespace-nowrap">🚩 แจ้งปัญหา</button>`;
            }
        }

        return `
        <li class="flex justify-between items-center p-3 rounded-xl border ${bgClass} transition-colors">
            <div class="flex items-center gap-3 w-full">
                ${statusIcon}
                <div class="flex-1">
                    <p class="font-bold text-sm ${textClass} flex items-center">${item.name} ${issueBadge}</p>
                    <p class="text-xs font-mono text-gray-500">${item.asset_code}</p>
                    ${isIssue && item.issue.note ? `<p class="text-xs text-red-500 mt-1 max-w-[200px] md:max-w-full truncate">📝 ${item.issue.note}</p>` : ''}
                </div>
            </div>
            <div class="shrink-0">${btnReport}</div>
        </li>`;
    }).join('');

    if (extraItems.length > 0) {
        extContainer.classList.remove('hidden');
        extList.innerHTML = extraItems.map((item, index) => `
            <li class="flex justify-between items-center p-3 rounded-xl bg-orange-50 border border-orange-200"><div class="flex items-center gap-3"><div class="w-6 h-6 rounded-full flex items-center justify-center bg-orange-400 text-white">+</div><div><p class="font-bold text-sm text-orange-800">${item.name}</p><p class="text-xs font-mono text-orange-600">${item.asset_code}</p></div></div><button onclick="extraItems.splice(${index}, 1); renderChecklist();" class="text-xs bg-white text-red-500 hover:bg-red-50 px-2 py-1 rounded border border-red-200">ลบ</button></li>
        `).join('');
    } else {
        extContainer.classList.add('hidden');
    }
}

function previewPhoto(event) {
    const file = event.target.files[0];
    if (file) {
        photoFile = file;
        const reader = new FileReader();
        reader.onload = function(e) { document.getElementById('photo-preview').src = e.target.result; document.getElementById('photo-preview-container').classList.remove('hidden'); }
        reader.readAsDataURL(file);
    }
}
function removePhoto() { photoFile = null; document.getElementById('photo-input').value = ''; document.getElementById('photo-preview-container').classList.add('hidden'); document.getElementById('photo-preview').src = ''; }
function closePrepareView() { if (html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; } document.getElementById('view-prepare').classList.add('hidden'); document.getElementById('view-prepare').classList.remove('flex'); document.getElementById('view-list').classList.remove('hidden'); }

async function goToSignDocument() {
    let checkedTotal = requestedItems.filter(i => i.scanned || i.issue).length + extraItems.length;
    if (checkedTotal === 0) return Swal.fire('ไม่ได้ตรวจของเลย', 'กรุณาสแกนหรือแจ้งปัญหาอย่างน้อย 1 ชิ้น', 'warning');
    if (!photoFile) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาถ่ายภาพเก็บไว้เป็นหลักฐานด้วยครับ', 'warning');

    if (requestedItems.filter(i => !i.scanned && !i.issue).length > 0) {
        let warnText = actionMode === 'handover' ? 'มีของในคำขอที่ยังไม่ได้ถูกสแกน ยืนยันที่จะไปเซ็นเอกสารหรือไม่?' : 'มีของที่ยังสแกนรับคืนไม่ครบ ยืนยันที่จะเซ็นรับคืนเพียงเท่านี้หรือไม่?';
        const warn = await Swal.fire({title: 'ของไม่ครบ!', text: warnText, icon: 'warning', showCancelButton: true, confirmButtonText: 'ยืนยันไปต่อ', cancelButtonText: 'กลับไปตรวจเพิ่ม'});
        if(!warn.isConfirmed) return;
    }

    if (html5QrcodeScanner) { html5QrcodeScanner.clear(); html5QrcodeScanner = null; }
    document.getElementById('view-prepare').classList.add('hidden'); document.getElementById('view-prepare').classList.remove('flex');
    document.getElementById('view-draw').classList.remove('hidden'); document.getElementById('view-draw').classList.add('flex');
    
    currentPageNum = 1; hasModifiedPdf = false;
    Swal.fire({ title: 'กำลังกางเอกสารล่าสุด...', didOpen: () => Swal.showLoading() });
    try {
        // 💡 5. แก้บัค PDF Caching โดยเติม Timestamp เข้าไปหลัง URL เพื่อหลอกเบราว์เซอร์ให้โหลดไฟล์ใหม่ล่าสุด!
        const timestamp = new Date().getTime();
        const docUrl = currentRequest.document_url + (currentRequest.document_url.includes('?') ? `&t=${timestamp}` : `?t=${timestamp}`);
        
        const res = await fetch(docUrl);
        currentPdfBytes = await res.arrayBuffer();
        pdfDocProxy = await pdfjsLib.getDocument({ data: currentPdfBytes }).promise;
        renderPage(currentPageNum);
    } catch (err) { Swal.fire('ข้อผิดพลาด', 'โหลด PDF ไม่สำเร็จ: ' + err.message, 'error'); backToPrepareView(); }
}

function backToPrepareView() { document.getElementById('view-draw').classList.add('hidden'); document.getElementById('view-draw').classList.remove('flex'); document.getElementById('view-prepare').classList.remove('hidden'); document.getElementById('view-prepare').classList.add('flex'); document.getElementById('btn-toggle-scanner').innerHTML = '📷 เปิดกล้องสแกน'; document.getElementById('btn-toggle-scanner').classList.replace('bg-red-100', 'bg-indigo-100'); document.getElementById('btn-toggle-scanner').classList.replace('text-red-700', 'text-indigo-700'); }

async function saveCurrentPageDrawing() {
    if (isCanvasBlank()) return Swal.fire('ไม่มีลายเซ็น', 'กรุณาเซ็นชื่อก่อนกดบันทึกหน้านี้', 'warning');
    Swal.fire({ title: 'กำลังฝังลายเซ็น...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { PDFDocument } = PDFLib; const pdfDoc = await PDFDocument.load(currentPdfBytes);
        const targetPage = pdfDoc.getPages()[currentPageNum - 1]; 
        const drawnImageBase64 = drawCanvas.toDataURL('image/png');
        const embeddedImage = await pdfDoc.embedPng(drawnImageBase64);
        const { width, height } = targetPage.getSize();
        targetPage.drawImage(embeddedImage, { x: 0, y: 0, width: width, height: height });
        currentPdfBytes = await pdfDoc.save(); hasModifiedPdf = true;
        pdfDocProxy = await pdfjsLib.getDocument({ data: currentPdfBytes }).promise;
        clearDrawing(); renderPage(currentPageNum); 
        Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 }).fire({ icon: 'success', title: 'ฝังลายเซ็นแล้ว เปลี่ยนหน้าได้เลย' });
    } catch (err) { Swal.fire('ข้อผิดพลาด', err.message, 'error'); }
}

function changePage(step) {
    let newPage = currentPageNum + step;
    if (newPage >= 1 && newPage <= pdfDocProxy.numPages) {
        if (!isCanvasBlank()) {
            Swal.fire({ title: 'ยังไม่ได้บันทึกหน้านี้', text: 'หากเปลี่ยนหน้า ลายเซ็นจะหายไป เปลี่ยนเลยไหม?', icon: 'warning', showCancelButton: true, confirmButtonText: 'ทิ้งลายเซ็นแล้วเปลี่ยน', cancelButtonText: 'ยกเลิก' }).then((r) => { if(r.isConfirmed) { currentPageNum = newPage; clearDrawing(); renderPage(currentPageNum); } });
        } else { currentPageNum = newPage; clearDrawing(); renderPage(currentPageNum); }
    }
}

function renderPage(pageNum) {
    document.getElementById('page-num-display').innerText = `${pageNum} / ${pdfDocProxy.numPages}`;
    pdfDocProxy.getPage(pageNum).then(page => {
        const viewport = page.getViewport({ scale: scale });
        pdfCanvas = document.getElementById('pdf-render'); pdfCtx = pdfCanvas.getContext('2d');
        pdfCanvas.height = viewport.height; pdfCanvas.width = viewport.width;
        drawCanvas = document.getElementById('draw-layer'); drawCtx = drawCanvas.getContext('2d');
        drawCanvas.height = viewport.height; drawCanvas.width = viewport.width;
        
        drawCtx.lineWidth = 2.5; drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round'; 
        drawCtx.strokeStyle = actionMode === 'handover' ? '#000080' : '#b91c1c'; 

        page.render({ canvasContext: pdfCtx, viewport: viewport }).promise.then(() => { Swal.close(); });
    });
}

function initDrawLayer() {
    drawCanvas = document.getElementById('draw-layer');
    const getPos = (e) => {
        const rect = drawCanvas.getBoundingClientRect(); const scaleX = drawCanvas.width / rect.width; const scaleY = drawCanvas.height / rect.height;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX); const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };
    const startDraw = (e) => { e.preventDefault(); isDrawing = true; const pos = getPos(e); drawCtx.beginPath(); drawCtx.moveTo(pos.x, pos.y); };
    const draw = (e) => { if (!isDrawing) return; e.preventDefault(); const pos = getPos(e); drawCtx.lineTo(pos.x, pos.y); drawCtx.stroke(); };
    const stopDraw = (e) => { if (isDrawing) { e.preventDefault(); isDrawing = false; } };
    drawCanvas.addEventListener('mousedown', startDraw); drawCanvas.addEventListener('mousemove', draw); drawCanvas.addEventListener('mouseup', stopDraw); drawCanvas.addEventListener('mouseout', stopDraw); drawCanvas.addEventListener('touchstart', startDraw, {passive: false}); drawCanvas.addEventListener('touchmove', draw, {passive: false}); drawCanvas.addEventListener('touchend', stopDraw, {passive: false});
}
function clearDrawing() { if(drawCtx && drawCanvas) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); }
function isCanvasBlank() { const blank = document.createElement('canvas'); blank.width = drawCanvas.width; blank.height = drawCanvas.height; return drawCanvas.toDataURL() === blank.toDataURL(); }

// 💡 6. จัดการ DB (แยกบันทึกของปกติ กับ ของชำรุด/สูญหาย)
async function confirmAndSubmit() {
    if (isCanvasBlank() && !hasModifiedPdf) {
        const warn = await Swal.fire({ title: 'ยังไม่ได้เซ็นชื่อ', text: 'ต้องให้ทั้งสองฝ่ายเซ็นชื่อก่อนกดยืนยัน', icon: 'warning', showCancelButton: true, confirmButtonText: 'ดำเนินการต่อ', cancelButtonText: 'กลับไปเซ็น' });
        if (!warn.isConfirmed) return;
    }

    Swal.fire({ title: 'กำลังประมวลผลระบบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const photoExt = photoFile.name.split('.').pop();
        const photoPrefix = actionMode === 'handover' ? 'handover' : 'return';
        const photoPath = `${photoPrefix}_photos/${currentRequest.request_code}_${Date.now()}.${photoExt}`;
        await supabaseClient.storage.from('documents').upload(photoPath, photoFile);
        const { data: photoData } = supabaseClient.storage.from('documents').getPublicUrl(photoPath);

        let finalPdfBytes = currentPdfBytes;
        if (!isCanvasBlank()) {
            const { PDFDocument } = PDFLib; const pdfDoc = await PDFDocument.load(currentPdfBytes);
            const targetPage = pdfDoc.getPages()[currentPageNum - 1]; 
            const drawnImageBase64 = drawCanvas.toDataURL('image/png'); const embeddedImage = await pdfDoc.embedPng(drawnImageBase64);
            const { width, height } = targetPage.getSize(); targetPage.drawImage(embeddedImage, { x: 0, y: 0, width: width, height: height });
            finalPdfBytes = await pdfDoc.save();
        }

        const pdfPath = `borrow_requests/${currentRequest.request_code}.pdf`;
        await supabaseClient.storage.from('documents').upload(pdfPath, new Blob([finalPdfBytes], { type: 'application/pdf' }), { upsert: true });

        let newRequestStatus = actionMode === 'handover' ? 'borrowed' : 'returned';
        let newItemStatus = actionMode === 'handover' ? 'picked_up' : 'returned';
        let newAssetStatus = actionMode === 'handover' ? 'borrowed' : 'available';
        
        let updateReqData = { status: newRequestStatus };
        if (actionMode === 'handover') updateReqData.handover_photo_url = photoData.publicUrl;
        else updateReqData.return_photo_url = photoData.publicUrl;

        await supabaseClient.from('borrow_requests').update(updateReqData).eq('id', currentRequest.id);

        // ของที่ปกติ
        let normalReqItemIds = requestedItems.filter(i => i.scanned && !i.issue).map(i => i.borrow_item_id);
        if(normalReqItemIds.length > 0) { await supabaseClient.from('borrow_items').update({ status: newItemStatus }).in('id', normalReqItemIds); }

        // ของที่หยิบเพิ่ม
        if(actionMode === 'handover' && extraItems.length > 0) {
            let inserts = extraItems.map(item => ({ request_id: currentRequest.id, asset_id: item.asset_id, qty: 1, status: newItemStatus }));
            await supabaseClient.from('borrow_items').insert(inserts);
        }

        let normalAssetIds = actionMode === 'handover' 
            ? [...requestedItems.filter(i => i.scanned && !i.issue).map(i => i.asset_id), ...extraItems.map(i => i.asset_id)]
            : requestedItems.filter(i => i.scanned && !i.issue).map(i => i.asset_id);
            
        if (normalAssetIds.length > 0) { await supabaseClient.from('assets').update({ status: newAssetStatus }).in('id', normalAssetIds); }

        // 💡 บันทึกของที่มีปัญหา (ชำรุด/สูญหาย)
        let issueReqItems = requestedItems.filter(i => i.issue);
        for (let iItem of issueReqItems) {
            // อัปเดตรายการยืมให้เป็น 'issue' พร้อมใส่โน้ต
            await supabaseClient.from('borrow_items').update({ 
                status: 'issue',
                return_note: `[${iItem.issue.type === 'lost' ? 'สูญหาย' : 'ชำรุด'}] ${iItem.issue.note}`
            }).eq('id', iItem.borrow_item_id);

            // อัปเดตคลังให้ของชิ้นนี้เป็น damaged หรือ lost
            let astStatus = iItem.issue.type === 'lost' ? 'lost' : 'damaged';
            await supabaseClient.from('assets').update({ status: astStatus }).eq('id', iItem.asset_id);
        }

        let successMsg = actionMode === 'handover' ? 'จ่ายของให้ผู้ยืมเรียบร้อยแล้ว' : 'รับของคืนเข้าคลังเรียบร้อยแล้ว';
        Swal.fire('สำเร็จ!', successMsg, 'success').then(() => {
            document.getElementById('view-draw').classList.add('hidden');
            document.getElementById('view-draw').classList.remove('flex');
            document.getElementById('view-list').classList.remove('hidden');
            fetchRequests(); 
        });

    } catch (err) { Swal.fire('ข้อผิดพลาด', err.message, 'error'); }
}