async function renderSidebar() {
    const savedUser = localStorage.getItem('arsatu_user');
    if (!savedUser) return window.location.href = '../index.html';
    const currentUser = JSON.parse(savedUser);

    const sidebarHtml = `
        <aside class="w-64 bg-gray-900 text-white min-h-screen flex flex-col shrink-0 hidden md:flex">
            <div class="p-6 border-b border-gray-800">
                <h1 class="text-2xl font-black tracking-wider text-white">ARSATU<span class="text-indigo-500">.</span></h1>
                <p class="text-xs text-gray-400 mt-1 uppercase tracking-widest font-semibold">Asset Management</p>
            </div>

            <div class="p-4 border-b border-gray-800 bg-gray-800/50">
                <div class="font-bold text-sm text-gray-200">👤 ${currentUser.display_name}</div>
                <div class="text-xs text-indigo-400 mt-1 font-mono">${currentUser.role === 'admin' ? '⭐ Admin' : (currentUser.camp_role === 'head' ? '👑 Head' : '👥 Staff')}</div>
            </div>

            <nav class="flex-1 p-4 space-y-2">
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-2">จัดการคลัง (Inventory)</p>
                <a href="inventories.html" class="nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors" data-page="inventories.html">
                    📦 คลังสิ่งของรวม
                </a>
                
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-6 ml-2">ปฏิบัติงาน (Operation)</p>
                <a href="approvals.html" class="nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors" data-page="approvals.html">
                    📑 ติดตามคำขอยืม 
                    <span id="badge-approval" class="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full hidden">0</span>
                </a>
                <a href="usage.html" class="nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors" data-page="usage.html">
                    🚛 จัดของขึ้นค่าย
                </a>
                <a href="handover.html" class="nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors" data-page="handover.html">
                    🤝 จ่ายของ / รับคืน
                </a>
            </nav>

            <div class="p-4 border-t border-gray-800">
                <button onclick="logout()" class="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm font-bold transition-colors">
                    🚪 ออกจากระบบ
                </button>
            </div>
        </aside>

        <!-- Mobile Topbar -->
        <div class="md:hidden bg-gray-900 text-white p-4 flex justify-between items-center shrink-0">
            <h1 class="text-xl font-black tracking-wider">ARSATU<span class="text-indigo-500">.</span></h1>
            <button onclick="toggleMobileMenu()" class="text-gray-300 p-2">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
        </div>
        
        <div id="mobile-menu" class="hidden md:hidden bg-gray-800 text-white p-4 space-y-2 shrink-0">
            <a href="inventories.html" class="block px-4 py-2 rounded-lg hover:bg-gray-700">📦 คลังสิ่งของ</a>
            <a href="approvals.html" class="flex justify-between items-center px-4 py-2 rounded-lg hover:bg-gray-700">
                📑 ติดตามคำขอยืม <span id="badge-approval-mobile" class="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full hidden">0</span>
            </a>
            <a href="usage.html" class="block px-4 py-2 rounded-lg hover:bg-gray-700">🚛 จัดของขึ้นค่าย</a>
            <a href="handover.html" class="block px-4 py-2 rounded-lg hover:bg-gray-700">🤝 จ่ายของ / รับคืน</a>
            <button onclick="logout()" class="block w-full text-left px-4 py-2 mt-2 border-t border-gray-700 text-red-400 hover:bg-gray-700">🚪 ออกจากระบบ</button>
        </div>
    `;

    document.getElementById('app-layout').insertAdjacentHTML('afterbegin', sidebarHtml);

    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item').forEach(link => {
        if (link.dataset.page === currentPage) {
            link.classList.remove('text-gray-300', 'hover:bg-gray-800');
            link.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-900/50');
        }
    });

    // 💡 ระบบแจ้งเตือน (เช็คเฉพาะคนที่เป็น Head หรือ Admin)
    if (currentUser.camp_role === 'head' || currentUser.role === 'admin') {
        updateApprovalBadge(currentUser);
    }
}

async function updateApprovalBadge(user) {
    let query = supabaseClient.from('borrow_requests').select('id', { count: 'exact' }).eq('status', 'pending_approval');
    if (user.role !== 'admin') query = query.eq('department_id', user.department_id); // Admin เห็นของทุกฝ่าย, Head เห็นแค่ฝ่ายตัวเอง

    const { count, error } = await query;
    if (!error && count > 0) {
        const desktopBadge = document.getElementById('badge-approval');
        const mobileBadge = document.getElementById('badge-approval-mobile');
        if(desktopBadge) { desktopBadge.innerText = count; desktopBadge.classList.remove('hidden'); }
        if(mobileBadge) { mobileBadge.innerText = count; mobileBadge.classList.remove('hidden'); }
    }
}

function toggleMobileMenu() { document.getElementById('mobile-menu').classList.toggle('hidden'); }
function logout() { localStorage.removeItem('arsatu_user'); window.location.href = '../index.html'; }
document.addEventListener('DOMContentLoaded', renderSidebar);