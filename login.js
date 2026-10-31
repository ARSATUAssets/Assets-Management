// ใส่ LIFF ID ของคุณตรงนี้
const MY_LIFF_ID = "2012291858-l1QxDPDM"; 

window.onload = async () => {
    document.getElementById('loading-zone').classList.remove('hidden');
    document.getElementById('loading-zone').innerText = 'กำลังเตรียมระบบ LINE...';
    
    // เริ่มต้นระบบ LIFF
    await liff.init({ liffId: MY_LIFF_ID }).catch(err => {
        console.error(err);
        Swal.fire('Error', 'ไม่สามารถเชื่อมต่อ LINE LIFF ได้', 'error');
    });

    if (liff.isLoggedIn()) {
        processLiffLogin();
    } else {
        // ยังไม่ได้ล็อกอิน ก็ซ่อนข้อความโหลด ให้กดปุ่มเอาเอง
        document.getElementById('loading-zone').classList.add('hidden');
        
        // เช็คเผื่อกรณีทดสอบบนคอมแล้วแอบเก็บ LocalStorage ไว้
        const savedUser = localStorage.getItem('arsatu_user');
        if (savedUser) {
            checkUserRoleAndRedirect(JSON.parse(savedUser));
        }
    }
};

async function loginWithLiff() {
    if (!liff.isLoggedIn()) {
        // เด้งหน้าจอให้ล็อกอิน LINE
        liff.login();
    } else {
        processLiffLogin();
    }
}

async function processLiffLogin() {
    document.getElementById('loading-zone').classList.remove('hidden');
    document.getElementById('loading-zone').innerText = 'กำลังตรวจสอบข้อมูลสมาชิก...';

    // ดึงข้อมูลโปรไฟล์จาก LINE ทันที (ไม่ต้องพึ่ง Supabase Auth แล้ว!)
    const profile = await liff.getProfile();
    const lineUid = profile.userId;
    const lineName = profile.displayName;

    // ไปเช็คในตาราง users ของเราตรงๆ ว่าเคยมีคนนี้ไหม
    let { data: userData, error } = await supabaseClient.from('users').select('*').eq('id', lineUid).single();

    if (!userData) {
        // กรณี: คนแปลกหน้า ไม่เคยมีชื่อในฐานข้อมูล
        document.getElementById('loading-zone').classList.add('hidden');
        
        const { value: pin } = await Swal.fire({
            title: '🔒 ยืนยันตัวตนสมาชิกค่าย',
            text: `ยินดีต้อนรับคุณ ${lineName} (กรุณากรอก PIN เพื่อเปิดใช้งาน)`,
            input: 'password',
            inputPlaceholder: 'รหัส 6 หลัก',
            allowOutsideClick: false,
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5'
        });

        if (pin === '255200') {
            Swal.fire({ title: 'กำลังสร้างบัญชี...', didOpen: () => Swal.showLoading() });
            
            // แอบสร้างบัญชีให้ในฐานข้อมูลแบบเนียนๆ
            const newUser = { id: lineUid, display_name: lineName, role: 'staff', camp_role: 'member' };
            const { error: insertErr } = await supabaseClient.from('users').insert([newUser]);
            
            if (insertErr) {
                Swal.fire('Error', insertErr.message, 'error');
            } else {
                // บันทึก Session จำลองลงเบราว์เซอร์
                localStorage.setItem('arsatu_user', JSON.stringify(newUser));
                Swal.fire({ icon: 'success', title: 'สำเร็จ', timer: 1500, showConfirmButton: false });
                setTimeout(() => window.location.href = 'account.html', 1500); // ส่งไปกรอกโปรไฟล์ต่อ
            }
        } else {
            liff.logout(); // เตะออกจาก LINE Session
            Swal.fire('ปฏิเสธการเข้าถึง', 'รหัสไม่ถูกต้อง', 'error');
        }
    } else {
        // กรณี: เคยล็อกอินแล้ว มีข้อมูลในฐานข้อมูล
        localStorage.setItem('arsatu_user', JSON.stringify(userData));
        checkUserRoleAndRedirect(userData);
    }
}

function checkUserRoleAndRedirect(userData) {
    if (userData.role === 'staff' || userData.role === 'admin') {
        if (!userData.phone || !userData.department_id) {
            window.location.href = 'account.html';
        } else if (userData.role === 'admin') {
            window.location.href = 'admin/index.html';
        } else {
            window.location.href = 'member/inventories.html';
        }
    } else {
        window.location.href = 'user/index.html';
    }
}

// ==========================================
// 🚨 ระบบจำลองการเข้าสู่ระบบ (Mock Login) สำหรับทดสอบ
// ==========================================
function mockLogin(type) {
    let mockUser = {
        id: "DEV_MOCK_USER", 
        phone: "0888888888",
        department_id: 6 // สมมติว่า ID 1 คือ ฝ่ายสถานที่ (เปลี่ยนเลขได้ตามตาราง departments ของคุณ)
    };

    if (type === 'admin') {
        mockUser.display_name = "แอดมิน (ประธานชุมนุม)";
        mockUser.role = "admin";
        mockUser.camp_role = "head"; 
    } 
    else if (type === 'head_location') {
        mockUser.display_name = "หัวหน้าฝ่ายสถานที่ (Head)";
        mockUser.role = "staff";
        mockUser.camp_role = "head"; 
    } 
    else if (type === 'member_location') {
        mockUser.display_name = "สตาฟฟ์ฝ่ายสถานที่ (Member)";
        mockUser.role = "staff";
        mockUser.camp_role = "member"; 
    }

    Swal.fire({
        title: 'กำลังเข้าสู่ระบบ',
        text: `จำลองสิทธิ์เป็น: ${mockUser.display_name}`,
        icon: 'info',
        timer: 1500,
        showConfirmButton: false
    });

    // บันทึก Session จำลองลงเบราว์เซอร์
    localStorage.setItem('arsatu_user', JSON.stringify(mockUser));

    // ส่งทุกคนไปหน้าคลังสิ่งของก่อน (เพราะหน้า Admin เรายังไม่ได้สร้าง)
    setTimeout(() => {
        window.location.href = 'member/inventories.html';
    }, 1500);
}