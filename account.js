let currentUser = null;
let isNewUser = false; // เช็คว่าเป็นเด็กใหม่ไหม

window.onload = async () => {
    await checkAuth();
    await fetchDepartments();
    loadProfileData();
};

async function checkAuth() {
    const savedUser = localStorage.getItem('arsatu_user');
if (!savedUser) return window.location.href = '../index.html'; // ถ้าไม่มีข้อมูลเตะกลับหน้าแรก

currentUser = JSON.parse(savedUser); // ใช้งานตัวแปรนี้แทน session.user.id ได้เลย
// ตัวอย่าง: currentUser.id คือ LINE UID ของเขา
    if (!session) {
        window.location.href = 'index.html'; // ถ้าไม่ได้ล็อกอิน เตะกลับหน้าแรก
        return;
    }
    
    // ดึงข้อมูลตัวเองจากฐานข้อมูล
    const { data } = await supabaseClient.from('users').select('*').eq('id', session.user.id).single();
    currentUser = data;
    
    // ถ้า role เป็น outsider แปลว่าเพิ่งล็อกอินเข้ามาครั้งแรก!
    if (currentUser.role === 'outsider') {
        isNewUser = true;
        document.getElementById('pin-section').classList.remove('hidden');
        document.getElementById('pin_code').required = true;
    }
}

async function fetchDepartments() {
    const { data } = await supabaseClient.from('departments').select('*').order('id', { ascending: true });
    const select = document.getElementById('department_id');
    if (data) {
        data.forEach(d => select.insertAdjacentHTML('beforeend', `<option value="${d.id}">${d.name}</option>`));
    }
}

function loadProfileData() {
    if (!currentUser) return;
    
    // เอาชื่อที่ดึงจาก LINE มาแสดงให้แก้ได้
    document.getElementById('display_name').value = currentUser.display_name || '';
    document.getElementById('phone').value = currentUser.phone || '';
    
    if (currentUser.department_id) {
        document.getElementById('department_id').value = currentUser.department_id;
    }
    
    // โชว์ตำแหน่งว่า Head หรือ Member
    const roleText = currentUser.camp_role === 'head' ? 'หัวหน้าฝ่าย (Head)' : 'สมาชิกฝ่าย (Member)';
    document.getElementById('camp_role').value = roleText;
}

// กดบันทึกข้อมูล
document.getElementById('account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let updateData = {
        display_name: document.getElementById('display_name').value,
        phone: document.getElementById('phone').value,
        department_id: parseInt(document.getElementById('department_id').value)
    };

    // ถ้าเป็นคนใหม่ ต้องเช็ค PIN ให้ชัวร์ก่อนอัปเกรดเป็น Staff
    if (isNewUser) {
        const pin = document.getElementById('pin_code').value;
        if (pin !== '255200') {
            Swal.fire('ข้อผิดพลาด', 'รหัส PIN ไม่ถูกต้อง', 'error');
            return;
        }
        updateData.role = 'staff'; // ถ้า PIN ถูก ปรับยศให้เข้าหลังบ้านได้เลย!
    }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
    
    const { error } = await supabaseClient.from('users').update(updateData).eq('id', currentUser.id);
    
    if (error) {
        Swal.fire('ข้อผิดพลาด', error.message, 'error');
    } else {
        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ!',
            text: 'ยินดีต้อนรับเข้าสู่ระบบจัดการคลัง',
            timer: 2000,
            showConfirmButton: false
        }).then(() => {
            window.location.href = 'member/inventories.html'; // ส่งเข้าหลังบ้าน
        });
    }
});

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}