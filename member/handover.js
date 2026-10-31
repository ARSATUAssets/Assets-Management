let currentReq = null;
let mode = ""; // 'pickup' หรือ 'return'
let checklist = []; // เก็บสถานะของแต่ละชิ้นว่าสแกนเช็คแล้วหรือยัง
let html5QrCode = null;
let evidenceImageBase64 = null; // เก็บรูปถ่าย

window.onload = () => {
    fetchRequests();
    initSignaturePads();
    
    // พรีวิวรูปเมื่ออัปโหลด
    document.getElementById('evidence-photo').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            evidenceImageBase64 = event.target.result;
            const img = document.getElementById('photo-preview');
            img.src = evidenceImageBase64;
            img.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });
};

async function fetchRequests() {
    const { data } = await supabaseClient.from('borrow_requests')
        .select('*')
        .in('status', ['approved', 'borrowed'])
        .order('pickup_date', { ascending: true });
        
    const listApp = document.getElementById('list-approved');
    const listBorr = document.getElementById('list-borrowed');
    listApp.innerHTML = ''; listBorr.innerHTML = '';

    data.forEach(req => {
        const card = `
            <div class="flex justify-between items-center p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors bg-white">
                <div>
                    <div class="font-bold text-gray-800">${req.project_name}</div>
                    <div class="text-sm text-gray-500">
                        ผู้ประสานงาน: ${req.borrower_name} <br>
                        รับ: <span class="text-indigo-600 font-medium">${new Date(req.pickup_date).toLocaleDateString('th-TH')}</span> | 
                        คืน: <span class="text-orange-600 font-medium">${new Date(req.return_date).toLocaleDateString('th-TH')}</span>
                    </div>
                </div>
                <button onclick='openHandoverModal(${JSON.stringify(req)}, "${req.status === 'approved' ? 'pickup' : 'return'}")' 
                        class="${req.status === 'approved' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-orange-600 hover:bg-orange-700'} text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all">
                    ${req.status === 'approved' ? '🔼 จ่ายของ' : '🔽 รับคืน'}
                </button>
            </div>
        `;
        if(req.status === 'approved') listApp.innerHTML += card;
        else listBorr.innerHTML += card;
    });

    if(listApp.innerHTML === '') listApp.innerHTML = '<div class="text-gray-400 text-sm py-2">ไม่มีคิวจ่ายของ</div>';
    if(listBorr.innerHTML === '') listBorr.innerHTML = '<div class="text-gray-400 text-sm py-2">ไม่มีคิวรับคืน</div>';
}

// ==========================================
// 1. ระบบเช็คลิสต์และสแกน
// ==========================================
async function openHandoverModal(req, actionMode) {
    currentReq = req;
    mode = actionMode;
    document.getElementById('modal-title').innerText = mode === 'pickup' ? '🔼 กระบวนการส่งมอบพัสดุ' : '🔽 กระบวนการรับคืนพัสดุ';
    document.getElementById('sig-label-1').innerText = mode === 'pickup' ? 'ลายเซ็นผู้ส่งมอบ (สตาฟฟ์)' : 'ลายเซ็นผู้รับคืน (สตาฟฟ์)';
    document.getElementById('sig-label-2').innerText = mode === 'pickup' ? 'ลายเซ็นผู้รับมอบ (ผู้ยืม)' : 'ลายเซ็นผู้ส่งคืน (ผู้ยืม)';
    
    // ล้างข้อมูลเก่า
    clearSig(1); clearSig(2);
    document.getElementById('evidence-photo').value = "";
    document.getElementById('photo-preview').classList.add('hidden');
    evidenceImageBase64 = null;
    document.getElementById('manual-code').value = "";
    
    // ดึงรายการของที่ขอไว้
    const { data: items } = await supabaseClient.from('borrow_items').select('*, assets(*)').eq('request_id', req.id);
    checklist = items.map(item => ({ ...item, isChecked: false, actualCodeScanned: null }));
    renderChecklist();

    document.getElementById('handover-modal').classList.remove('hidden');
    document.getElementById('handover-modal').classList.add('flex');
}

function closeHandoverModal() {
    if(html5QrCode) { html5QrCode.stop().catch(()=>{}); }
    document.getElementById('handover-modal').classList.add('hidden');
    document.getElementById('handover-modal').classList.remove('flex');
}

function renderChecklist() {
    const list = document.getElementById('items-checklist');
    list.innerHTML = '';
    checklist.forEach((item, index) => {
        const bg = item.isChecked ? 'bg-green-900/40 border-green-500' : 'bg-gray-800 border-gray-700';
        const icon = item.isChecked ? '✅' : '⏳';
        const subtext = item.actualCodeScanned && item.actualCodeScanned !== item.assets.asset_code 
                        ? `<div class="text-xs text-yellow-400 mt-1">⚠️ เปลี่ยนจ่ายรหัส: ${item.actualCodeScanned}</div>` 
                        : '';

        list.innerHTML += `
            <div class="flex items-center gap-3 p-3 border rounded-xl ${bg}">
                <div class="text-xl">${icon}</div>
                <div>
                    <div class="text-sm text-gray-300 font-bold">${item.assets.name}</div>
                    <div class="text-xs text-gray-500 font-mono">ขอไว้: ${item.assets.asset_code}</div>
                    ${subtext}
                </div>
            </div>
        `;
    });
}

function startScanner() {
    document.getElementById('reader').classList.remove('hidden');
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decodedText) => { 
        document.getElementById('manual-code').value = decodedText;
        checkItemCode();
        html5QrCode.stop().then(() => { document.getElementById('reader').classList.add('hidden'); });
    }, (err) => {}).catch(err => { Swal.fire('Error', 'เปิดกล้องไม่ได้', 'error'); });
}

// 👉 💡 ระบบอัจฉริยะ: เช็ครหัสตรง / ไม่ตรง
async function checkItemCode() {
    const code = document.getElementById('manual-code').value.trim();
    if(!code) return;

    // หาว่ารหัสที่สแกนมา ตรงกับของในบิลไหม?
    let targetItem = checklist.find(i => i.assets.asset_code === code && !i.isChecked);
    
    if (targetItem) {
        // ตรงเป๊ะ! ติ๊กถูกได้เลย
        targetItem.isChecked = true;
        targetItem.actualCodeScanned = code;
        new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(()=>{});
        renderChecklist();
        document.getElementById('manual-code').value = "";
    } else {
        // ⚠️ รหัสไม่ตรงบิล! ถามยืนยันก่อน
        const confirm = await Swal.fire({
            title: 'รหัสไม่ตรงกับที่ขอ!',
            text: `สแกนได้รหัส ${code} แต่มันไม่มีในรายการ หรือสแกนไปแล้ว. ยืนยันจะทำรายการชิ้นนี้แทนหรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#eab308',
            confirmButtonText: 'ยืนยันจ่ายรหัสนี้',
            cancelButtonText: 'ยกเลิก'
        });

        if (confirm.isConfirmed) {
            // ให้เลือกในบิลว่าจะเอาของชิ้นไหนไปแทนที่ (เช่น เลือกของที่ยังไม่ได้เช็ค)
            const unchecked = checklist.filter(i => !i.isChecked);
            if(unchecked.length > 0) {
                // สมมติว่าแทนที่ชิ้นแรกที่ยังไม่เช็คเลย
                unchecked[0].isChecked = true;
                unchecked[0].actualCodeScanned = code;
                renderChecklist();
                document.getElementById('manual-code').value = "";
                Swal.fire('เปลี่ยนรหัสสำเร็จ', 'บันทึกการจ่ายของแทนเรียบร้อย', 'success');
            } else {
                Swal.fire('แจ้งเตือน', 'คุณเช็คของครบหมดแล้ว ไม่สามารถเพิ่มได้อีก', 'error');
            }
        }
    }
}

// ==========================================
// 2. ระบบลายเซ็นและ PDF-LIB (เพิ่มหน้า 3, 4)
// ==========================================
let ctx1, ctx2;
function initSignaturePads() {
    ctx1 = setupCanvas('sig-pad-1');
    ctx2 = setupCanvas('sig-pad-2');
}
function setupCanvas(id) {
    const canvas = document.getElementById(id);
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#000080';
    let drawing = false;
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left, y: (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top };
    };
    canvas.addEventListener('mousedown', (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(getPos(e).x, getPos(e).y); });
    canvas.addEventListener('mousemove', (e) => { if(drawing) { e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); } });
    const stop = () => { drawing = false; };
    canvas.addEventListener('mouseup', stop); canvas.addEventListener('mouseout', stop);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; ctx.beginPath(); ctx.moveTo(getPos(e).x, getPos(e).y); }, {passive: false});
    canvas.addEventListener('touchmove', (e) => { if(drawing) { e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); } }, {passive: false});
    canvas.addEventListener('touchend', stop);
    return ctx;
}
function clearSig(num) {
    const canvas = document.getElementById(`sig-pad-${num}`);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}
function isCanvasBlank(canvas) {
    const blank = document.createElement('canvas');
    blank.width = canvas.width; blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
}

// 👉 💡 ฟังก์ชันปิดจบกระบวนการ (เพิ่มหน้าหลักฐานลง PDF)
async function finalizeHandover() {
    // 1. ตรวจสอบความครบถ้วน
    const allChecked = checklist.every(i => i.isChecked);
    if (!allChecked) return Swal.fire('แจ้งเตือน', 'กรุณาสแกนตรวจสอบของให้ครบทุกชิ้นก่อน', 'warning');
    if (!evidenceImageBase64) return Swal.fire('แจ้งเตือน', 'กรุณาแนบรูปถ่ายสภาพสิ่งของ', 'warning');
    if (isCanvasBlank(document.getElementById('sig-pad-1')) || isCanvasBlank(document.getElementById('sig-pad-2'))) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเซ็นชื่อให้ครบทั้ง 2 ฝ่าย', 'warning');
    }

    Swal.fire({ title: 'กำลังประมวลผลเอกสาร...', html: 'ระบบกำลังแนบรูปถ่ายและลายเซ็น<br>ลงในเอกสาร PDF...', didOpen: () => Swal.showLoading() });

    try {
        const { PDFDocument, rgb } = PDFLib;
        
        // โหลด PDF ใบเดิม (ใบคำขอที่ Head อนุมัติแล้ว) จากเซิร์ฟเวอร์
        const existingPdfBytes = await fetch(currentReq.document_url).then(res => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        pdfDoc.registerFontkit(fontkit);
        const fontBytes = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf').then(res => res.arrayBuffer());
        const customFont = await pdfDoc.embedFont(fontBytes);

        // 🟢 เพิ่มหน้าใหม่ 1 หน้า ต่อท้าย (A4)
        const newPage = pdfDoc.addPage([595.28, 841.89]);
        
        // เขียนหัวข้อหน้าใหม่
        const headerText = mode === 'pickup' ? 'หลักฐานการส่งมอบพัสดุอุปกรณ์ (รับของ)' : 'หลักฐานการส่งคืนพัสดุอุปกรณ์ (คืนของ)';
        newPage.drawText(headerText, { x: 50, y: 780, size: 20, font: customFont, color: rgb(0,0,0) });
        newPage.drawText(`รหัสคำขอ: ${currentReq.request_code} | วันที่บันทึก: ${new Date().toLocaleString('th-TH')}`, { x: 50, y: 750, size: 14, font: customFont, color: rgb(0.3,0.3,0.3) });

        // ฝังรูปถ่ายหลักฐาน
        const evImage = await (evidenceImageBase64.includes('image/png') ? pdfDoc.embedPng(evidenceImageBase64) : pdfDoc.embedJpg(evidenceImageBase64));
        const evDims = evImage.scaleToFit(495, 400); // จัดรูปไม่ให้ล้นจอ
        newPage.drawImage(evImage, { x: 50, y: 320, width: evDims.width, height: evDims.height });

        // ฝังลายเซ็น 2 ฝ่าย ด้านล่างรูปภาพ
        const sig1Img = await pdfDoc.embedPng(document.getElementById('sig-pad-1').toDataURL('image/png'));
        const sig2Img = await pdfDoc.embedPng(document.getElementById('sig-pad-2').toDataURL('image/png'));
        
        // พิกัดลายเซ็นสตาฟฟ์ (ซ้าย)
        newPage.drawImage(sig1Img, { x: 80, y: 150, width: 150, height: 50 });
        newPage.drawText(mode === 'pickup' ? '( ผู้ส่งมอบ )' : '( ผู้รับคืน )', { x: 120, y: 130, size: 14, font: customFont, color: rgb(0,0,0) });
        
        // พิกัดลายเซ็นผู้ยืม (ขวา)
        newPage.drawImage(sig2Img, { x: 360, y: 150, width: 150, height: 50 });
        newPage.drawText(mode === 'pickup' ? '( ผู้รับมอบ )' : '( ผู้ส่งคืน )', { x: 400, y: 130, size: 14, font: customFont, color: rgb(0,0,0) });

        // เซฟ PDF ทับไฟล์เดิมบน Supabase
        const finalPdfBytes = await pdfDoc.save();
        const filePath = `borrow_requests/${currentReq.request_code}.pdf`;
        await supabaseClient.storage.from('documents').upload(filePath, new Blob([finalPdfBytes], { type: 'application/pdf' }), { upsert: true });

        // อัปเดตสถานะใน DB (ถ้าส่งมอบเปลี่ยนเป็น borrowed, ถ้าคืนเปลี่ยนเป็น returned)
        const nextStatus = mode === 'pickup' ? 'borrowed' : 'returned';
        await supabaseClient.from('borrow_requests').update({ status: nextStatus }).eq('id', currentReq.id);

        Swal.fire('สำเร็จ', mode === 'pickup' ? 'บันทึกการส่งมอบเรียบร้อย' : 'บันทึกการรับคืนเรียบร้อย', 'success').then(() => {
            closeHandoverModal();
            fetchRequests();
        });

    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}