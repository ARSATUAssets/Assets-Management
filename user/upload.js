const urlParams = new URLSearchParams(window.location.search);
const requestCode = urlParams.get('req');
let currentRequestId = null;

window.onload = async () => {
    if (!requestCode) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบรหัสคำขอใน URL', 'error');
        return;
    }

    // แสดงรหัสคำขอบนหน้าเว็บ
    document.getElementById('req-code-display').innerText = requestCode;

    // 1. ดึงข้อมูลคำขอจาก Database
    const { data, error } = await supabaseClient
        .from('borrow_requests')
        .select('id, project_name, status')
        .eq('request_code', requestCode)
        .single();

    if (error || !data) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลคำขอนี้ในระบบ', 'error');
        return;
    }

    currentRequestId = data.id;
    
    // 2. แสดงชื่อโครงการ
    document.getElementById('project-name-display').innerText = `โครงการ: ${data.project_name}`;

    const statusMsg = document.getElementById('status-message');
    const uploadSection = document.getElementById('upload-section');

    // 3. ตรวจสอบสถานะ ถ้าไม่ใช่ 'waiting_document' แปลว่าส่งเอกสารไปแล้ว
    if (data.status !== 'waiting_document') {
        // ซ่อนฟอร์มอัปโหลด ไม่ให้แก้ไขไฟล์ได้อีก
        uploadSection.classList.add('hidden'); 
        
        // แสดงข้อความว่าส่งแล้ว
        statusMsg.classList.remove('hidden');
        statusMsg.classList.add('bg-green-100', 'text-green-700', 'border', 'border-green-300');
        statusMsg.innerHTML = `
            <div class="text-lg mb-1">✅ คุณได้อัปโหลดเอกสารสำหรับคำขอนี้เรียบร้อยแล้ว</div>
            <div class="text-sm font-normal text-green-600">เอกสารอยู่ในขั้นตอนการพิจารณาอนุมัติ (ไม่สามารถแก้ไขไฟล์ได้)</div>
            <div class="text-xs font-normal text-gray-500 mt-2">หากต้องการแก้ไขข้อมูลหรือยกเลิกคำขอ กรุณาติดต่อสตาฟฟ์ผู้ประสานงาน</div>
        `;
    } else {
        // ถ้ายืมครั้งแรกและยังไม่ส่ง ให้เปิดฟอร์มอัปโหลดตามปกติ
        uploadSection.classList.remove('hidden');
        statusMsg.classList.add('hidden');
    }
};

document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = document.getElementById('pdf-file').files[0];
    if (!file) return;

    Swal.fire({ title: 'กำลังอัปโหลด...', didOpen: () => Swal.showLoading() });

    try {
        // 1. อัปโหลดไฟล์ไปที่ Storage bucket ชื่อ 'documents'
        const filePath = `borrow_requests/${requestCode}.pdf`;
        const { data: uploadData, error: uploadErr } = await supabaseClient.storage.from('documents').upload(filePath, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        // 2. ขอ URL สาธารณะของไฟล์
        const { data: publicUrlData } = supabaseClient.storage.from('documents').getPublicUrl(filePath);
        const fileUrl = publicUrlData.publicUrl;

        // 3. อัปเดตสถานะในฐานข้อมูล ให้ Head เห็น
        const { error: dbErr } = await supabaseClient.from('borrow_requests')
            .update({ status: 'pending_approval', document_url: fileUrl })
            .eq('request_code', requestCode);
        if (dbErr) throw dbErr;

        Swal.fire('สำเร็จ!', 'ส่งเอกสารเรียบร้อยแล้ว กรุณารอเจ้าหน้าที่อนุมัติ', 'success').then(() => {
            window.location.href = 'index.html';
        });
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});