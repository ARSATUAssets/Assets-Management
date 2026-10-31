let publicAssets = [];
let currentRequestCode = "";
let selectedItems = []; 
let generatedPdfBase64 = ""; // เก็บ Base64 ไว้ส่งตอนกดยืนยัน

window.onload = async () => {
    await fetchPublicAssets();
};

async function fetchPublicAssets() {
    const { data } = await supabaseClient.from('assets').select('*, departments(id, name)').eq('is_public_borrow', true).order('name');
    publicAssets = data || [];
    const tbody = document.getElementById('public-table-body');
    tbody.innerHTML = '';
    
    if(publicAssets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-gray-400">ยังไม่มีรายการสิ่งของที่เปิดให้ยืม</td></tr>`;
        return;
    }

    publicAssets.forEach(item => {
        let statusHtml = item.status === 'available' && item.qty_available > 0 ? `<span class="text-green-600 font-bold">พร้อมให้ยืม</span>` : `<span class="text-gray-400">ไม่ว่าง/หมด</span>`;
        tbody.innerHTML += `
            <tr class="border-b border-gray-50">
                <td class="p-4"><div class="font-medium">${item.name}</div><div class="text-xs text-indigo-600 font-mono">${item.asset_code}</div></td>
                <td class="p-4 text-sm text-gray-600">${item.departments?.name || '-'}</td>
                <td class="p-4 text-center text-sm">${statusHtml}</td>
                <td class="p-4 text-center font-bold text-gray-600">${item.qty_available}</td>
            </tr>`;
    });
}

function goToFormView() {
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-form').classList.remove('hidden');
    renderItemSelectionList();
}

function goToHomeView() {
    document.getElementById('borrow-form').reset();
    document.getElementById('view-form').classList.add('hidden');
    document.getElementById('view-home').classList.remove('hidden');
}

function closePreview() {
    document.getElementById('view-preview').classList.add('hidden');
    document.getElementById('view-preview').classList.remove('flex');
}

function renderItemSelectionList() {
    const listDiv = document.getElementById('item-selection-list');
    listDiv.innerHTML = '';
    selectedItems = [];

    const availableItems = publicAssets.filter(a => a.status === 'available' && a.qty_available > 0);
    if (availableItems.length === 0) {
        listDiv.innerHTML = `<div class="text-center text-gray-400 py-4">ไม่มีของที่พร้อมให้ยืมในขณะนี้</div>`;
        return;
    }

    availableItems.forEach(item => {
        const qtyInput = item.category === 'consumable' 
            ? `<input type="number" min="1" max="${item.qty_available}" value="1" id="qty-${item.id}" class="w-16 border rounded p-1 text-sm text-center ml-2">` 
            : `<span class="text-xs text-gray-500 ml-2">(1 ชิ้น)</span>`;

        // สังเกตว่ามีการเพิ่ม class "asset-item-row" และ "data-search" สำหรับใช้ค้นหา
        listDiv.innerHTML += `
            <div class="asset-item-row flex items-center justify-between bg-white border border-gray-200 p-3 rounded-lg hover:border-indigo-300 transition-colors" data-search="${item.name} ${item.asset_code}">
                <label class="flex items-center gap-3 cursor-pointer flex-1">
                    <input type="checkbox" value="${item.id}" class="item-checkbox w-5 h-5 text-indigo-600 rounded">
                    <div>
                        <div class="font-bold text-sm">${item.name}</div>
                        <div class="text-xs text-gray-500 font-mono">${item.asset_code}</div>
                    </div>
                </label>
                <div>${qtyInput}</div>
            </div>`;
    });
}

// -----------------------------------
// ฟังก์ชันสำหรับค้นหา (พิมพ์ปุ๊บ กรองปั๊บ)
// -----------------------------------
function filterUserAssets() {
    const searchText = document.getElementById('search-asset-user').value.toLowerCase().trim();
    const rows = document.querySelectorAll('.asset-item-row');
    
    rows.forEach(row => {
        const searchableText = row.getAttribute('data-search').toLowerCase();
        // ถ้าระบุคำค้นหา และตรงกับชื่อหรือรหัส ให้แสดง (ลบ hidden ใส่ flex) ถ้าไม่ตรงให้ซ่อน (ใส่ hidden)
        if (searchableText.includes(searchText)) {
            row.classList.remove('hidden');
            row.classList.add('flex');
        } else {
            row.classList.add('hidden');
            row.classList.remove('flex');
        }
    });
}

// -----------------------------------
// กด Preview PDF (สร้าง PDF จาก Template)
// -----------------------------------
document.getElementById('borrow-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    selectedItems = [];
    const checkboxes = document.querySelectorAll('.item-checkbox:checked');
    checkboxes.forEach(cb => {
        const item = publicAssets.find(a => a.id === parseInt(cb.value));
        const qtyBox = document.getElementById(`qty-${item.id}`);
        const qty = qtyBox ? parseInt(qtyBox.value) : 1;
        selectedItems.push({ ...item, borrow_qty: qty });
    });

    if (selectedItems.length === 0) {
        Swal.fire('แจ้งเตือน', 'กรุณาเลือกสิ่งของอย่างน้อย 1 ชิ้น', 'warning');
        return;
    }

    const deptIds = [...new Set(selectedItems.map(i => i.department_id))];
    if (deptIds.length > 1) {
        Swal.fire('ไม่สามารถรวมใบคำขอได้', 'คุณเลือกของจากหลายฝ่าย กรุณาเลือกของจากฝ่ายเดียวกันครับ', 'error');
        return;
    }

    // จำลองรหัสคำขอไว้เพื่อโชว์ในพรีวิว
    currentRequestCode = `REQ-PREVIEW-XXX`; 

    Swal.fire({ title: 'กำลังดึง Template และสร้างเอกสาร...', didOpen: () => Swal.showLoading() });
    
    try {
        const dataUrl = await fillPdfTemplate(selectedItems, currentRequestCode);
        generatedPdfBase64 = dataUrl.split(',')[1]; // เก็บ Base64 ไว้ส่ง Backend
        document.getElementById('pdf-preview-frame').src = dataUrl;
        
        Swal.close();
        document.getElementById('view-preview').classList.remove('hidden');
        document.getElementById('view-preview').classList.add('flex');
    } catch (error) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถสร้าง PDF ได้: ' + error.message, 'error');
    }
});

// -----------------------------------
// กดยืนยัน (ส่งข้อมูลลง DB และยิง API ส่งอีเมล)
// -----------------------------------
async function submitFinalRequest() {
    const btn = document.getElementById('btn-final-submit');
    btn.disabled = true;
    btn.innerHTML = "กำลังบันทึกและส่งอีเมล...";

    try {
        const email = document.getElementById('req-email').value;
        const name = document.getElementById('req-name').value;
        const targetDeptId = selectedItems[0].department_id;

        const today = new Date();
        const dateStr = `${today.getFullYear().toString().slice(-2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
        const { count } = await supabaseClient.from('borrow_requests').select('*', { count: 'exact', head: true }).like('request_code', `REQ-${dateStr}-%`);
        const nextNum = String((count || 0) + 1).padStart(3, '0');
        currentRequestCode = `REQ-${dateStr}-${nextNum}`;

        // บันทึกลง Supabase
        const { data: request, error: reqErr } = await supabaseClient.from('borrow_requests').insert([{
            request_code: currentRequestCode,
            borrower_email: email,
            borrower_name: name,
            borrower_phone: document.getElementById('req-phone').value,
            project_name: document.getElementById('req-project').value,
            pickup_date: document.getElementById('req-pickup').value,
            return_date: document.getElementById('req-return').value,
            department_id: targetDeptId,
            status: 'waiting_document'
        }]).select().single();
        if (reqErr) throw new Error("บันทึกคำขอไม่สำเร็จ: " + reqErr.message);

        const itemsToInsert = selectedItems.map(item => ({ request_id: request.id, asset_id: item.id, qty: item.borrow_qty }));
        await supabaseClient.from('borrow_items').insert(itemsToInsert);

        // สร้าง PDF ใบจริงด้วยเลข REQ จริง
        const finalDataUrl = await fillPdfTemplate(selectedItems, currentRequestCode);
        const finalBase64 = finalDataUrl.split(',')[1];
        
        // ดึงที่อยู่เว็บปัจจุบัน แล้วเปลี่ยนแค่ชื่อไฟล์ต่อท้าย จะได้ลิงก์ที่ถูก 100% ไม่ว่าจะรันในคอมหรืออัปขึ้นโฮสต์จริง
const uploadLink = window.location.href.replace('index.html', `upload.html?req=${currentRequestCode}`);
        
        // ยิง API ส่งอีเมล
        const response = await fetch('http://localhost:3000/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, name: name, requestCode: currentRequestCode, pdfBase64: finalBase64, uploadLink: uploadLink })
        });

        const resData = await response.json();
        if (!resData.success) throw new Error(resData.error);

        Swal.fire({
            icon: 'success',
            title: 'ส่งคำขอสำเร็จ!',
            html: `รหัสคำขอ: <b class="text-indigo-600">${currentRequestCode}</b><br><br>ระบบได้ส่งเอกสาร PDF พร้อมลิงก์ส่งงานไปที่กล่องอีเมลของคุณเรียบร้อยแล้ว`,
            confirmButtonText: 'รับทราบ',
            confirmButtonColor: '#4f46e5'
        }).then(() => window.location.reload());

    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = "✅ ยืนยันคำขอ และส่งเข้าอีเมล";
    }
}

// -----------------------------------
// ฟังก์ชันหลัก: เปิด Template เดิม และเขียนข้อมูลทับ (pdf-lib)
// -----------------------------------
async function fillPdfTemplate(items, requestCode) {
    const { PDFDocument, rgb } = PDFLib;

    const templateBytes = await fetch('template.pdf').then(res => {
        if (!res.ok) throw new Error("ไม่พบไฟล์ template.pdf");
        return res.arrayBuffer();
    });
    
    const fontBytes = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf').then(res => res.arrayBuffer());

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const pages = pdfDoc.getPages();
    const page1 = pages[0]; // หน้า 1 (แบบขออนุญาต)
    const page2 = pages[1]; // หน้า 2 (รายการ)

    const textSize = 10;
    const textColor = rgb(0.1, 0.1, 0.7); // สีน้ำเงินเข้ม

    // ฟังก์ชันช่วยแปลงวันที่เป็นชื่อเดือนไทย
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return {
            day: d.getDate().toString(),
            month: thaiMonths[d.getMonth()],
            year: (d.getFullYear() + 543).toString()
        };
    };

    // ดึงข้อมูล
    const bName = document.getElementById('req-name').value;
    const bPos = document.getElementById('req-position').value;
    const bOrg = document.getElementById('req-organization').value;
    const bProject = document.getElementById('req-project').value;
    const bLocation = document.getElementById('req-location').value;
    const bTime = document.getElementById('req-time').value;
    const bPhone = document.getElementById('req-phone').value;
    
    const today = formatDate(new Date());
    const startDate = formatDate(document.getElementById('req-start-date').value);
    const endDate = formatDate(document.getElementById('req-end-date').value);
    const pickupDate = formatDate(document.getElementById('req-pickup').value);
    const returnDate = formatDate(document.getElementById('req-return').value);

    // ==========================================
    // 📍 เขียนลงหน้า 1: แบบขออนุญาตยืมวัสดุ-อุปกรณ์
    // ==========================================
    
    // วันที่เขียนใบขอ (ขวาบน)
    page1.drawText(today.day, { x: 403, y: 699, size: textSize, font: customFont, color: textColor });
    page1.drawText(today.month, { x: 458, y: 699, size: textSize, font: customFont, color: textColor });
    page1.drawText(today.year, { x: 514, y: 699, size: textSize, font: customFont, color: textColor });

    // ชื่อโครงการ
    page1.drawText(bProject, { x: 229, y: 653, size: textSize, font: customFont, color: textColor });

    // ข้อมูลผู้ยืม
    page1.drawText(bName, { x: 127, y: 622, size: textSize, font: customFont, color: textColor });
    page1.drawText(bPos, { x: 87, y: 604, size: textSize, font: customFont, color: textColor });
    page1.drawText(bOrg, { x: 374, y: 622, size: textSize, font: customFont, color: textColor });
    page1.drawText(bPhone, { x: 329, y: 604, size: textSize, font: customFont, color: textColor });

    // วันที่เริ่มยืม
    page1.drawText(pickupDate.day, { x: 121, y: 566, size: textSize, font: customFont, color: textColor });
    page1.drawText(pickupDate.month, { x: 178, y: 566, size: textSize, font: customFont, color: textColor });
    page1.drawText(pickupDate.year, { x: 241, y: 566, size: textSize, font: customFont, color: textColor });
    
    // วันที่คืนของ
    page1.drawText(returnDate.day, { x: 318, y: 566, size: textSize, font: customFont, color: textColor });
    page1.drawText(returnDate.month, { x: 373, y: 566, size: textSize, font: customFont, color: textColor });
    page1.drawText(returnDate.year, { x: 437, y: 566, size: textSize, font: customFont, color: textColor });

    // ระยะเวลาใช้งาน (บรรทัด: ในระหว่างวันที่... เดือน... พ.ศ... ถึง วันที่...)
    page1.drawText(startDate.day, { x: 365, y: 548, size: textSize, font: customFont, color: textColor });
    page1.drawText(startDate.month, { x: 422, y: 548, size: textSize, font: customFont, color: textColor });
    page1.drawText(startDate.year, { x: 490, y: 548, size: textSize, font: customFont, color: textColor });
    
    page1.drawText(endDate.day, { x: 74, y: 530, size: textSize, font: customFont, color: textColor });
    page1.drawText(endDate.month, { x: 130, y: 530, size: textSize, font: customFont, color: textColor });
    page1.drawText(endDate.year, { x: 191, y: 530, size: textSize, font: customFont, color: textColor });

    // เพื่อใช้ในกิจกรรม / โครงการ
    page1.drawText(bProject, { x: 91, y: 548, size: textSize, font: customFont, color: textColor });
    
    // สถานที่ และ เวลา
    page1.drawText(bLocation, { x: 58, y: 513, size: textSize, font: customFont, color: textColor });
    page1.drawText(bTime, { x: 274, y: 530, size: textSize, font: customFont, color: textColor });

    // วันที่รับของ
    page1.drawText(pickupDate.day, { x: 199, y: 493, size: textSize, font: customFont, color: textColor });
    page1.drawText(pickupDate.month, { x: 253, y: 493, size: textSize, font: customFont, color: textColor });
    page1.drawText(pickupDate.year, { x: 326, y: 493, size: textSize, font: customFont, color: textColor });
    
    // วันที่คืนของ
    page1.drawText(returnDate.day, { x: 425, y: 493, size: textSize, font: customFont, color: textColor });
    page1.drawText(returnDate.month, { x: 484, y: 493, size: textSize, font: customFont, color: textColor });
    page1.drawText(returnDate.year, { x: 70, y: 474, size: textSize, font: customFont, color: textColor });


    // ==========================================
    // 📍 เขียนลงหน้า 2: รายการยืมวัสดุ
    // ==========================================
    if (page2) {
        // ชื่อองค์กรหัวกระดาษหน้า 2
        page2.drawText(bOrg, { x: 185, y: 698, size: textSize, font: customFont, color: textColor });

        // พิมพ์รายการสิ่งของลงตาราง
        let currentY = 614; // สมมติว่าบรรทัดแรกตารางเริ่มที่ Y=620
        items.forEach((item, index) => {
            if (index < 15) { // กรอกได้สูงสุด 15 บรรทัดตามฟอร์ม
                page2.drawText(item.asset_code, { x: 89, y: currentY, size: 10, font: customFont, color: textColor });
                page2.drawText(item.name, { x: 170, y: currentY, size: 10, font: customFont, color: textColor });
                page2.drawText(item.borrow_qty.toString(), { x: 393, y: currentY, size: 10, font: customFont, color: textColor });
                currentY -= 23; // ระยะห่างแต่ละบรรทัด (ลด Y ลง 25pt)
            }
        });
    }

    const pdfBytes = await pdfDoc.saveAsBase64({ dataUri: true });
    return pdfBytes;
}