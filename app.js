// 1. ตั้งค่าเชื่อมต่อ Supabase
const SUPABASE_URL = 'https://ijqqluybdltnjkuggyrq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqcXFsdXliZGx0bmprdWdneXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMjE3NDIsImV4cCI6MjEwODc5Nzc0Mn0.9OYd0jyjb1-weJtnlmpBpe36JelDZ39jPIxwXK0ITsY';

// สร้างตัวเชื่อมต่อ (Client) โดยใช้ window.supabase จาก CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. ฟังก์ชันดึงข้อมูลฝ่ายจากฐานข้อมูล
async function fetchDepartments() {
    try {
        // ดึงข้อมูลจากตาราง departments เรียงตาม id
        const { data, error } = await supabaseClient
            .from('departments')
            .select('*')
            .order('id', { ascending: true });

        // ถ้ามี Error จากฐานข้อมูล
        if (error) throw error;

        // ถ้าสำเร็จ ให้เอาข้อมูลไปแสดงบนหน้าเว็บ
        renderDepartments(data);

    } catch (error) {
        console.error('Error:', error);
        // แสดงแจ้งเตือนด้วย SweetAlert2
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถดึงข้อมูลได้: ' + error.message,
        });
        document.getElementById('loading').innerText = 'โหลดข้อมูลล้มเหลว';
    }
}

// 3. ฟังก์ชันเอาข้อมูลมาวาดลง HTML
function renderDepartments(departments) {
    const listContainer = document.getElementById('department-list');
    const loadingText = document.getElementById('loading');

    // ซ่อนข้อความโหลด และแสดงคอนเทนเนอร์รายการ
    loadingText.classList.add('hidden');
    listContainer.classList.remove('hidden');

    // วนลูปสร้างกล่อง (li) สำหรับแต่ละฝ่าย
    departments.forEach(dept => {
        const li = document.createElement('li');
        li.className = 'bg-blue-50 border border-blue-200 rounded-lg p-4 text-center font-medium shadow-sm';
        li.innerText = dept.name;
        listContainer.appendChild(li);
    });
}

// 4. สั่งให้ทำงานทันทีเมื่อเปิดหน้าเว็บ
window.onload = () => {
    fetchDepartments();
};