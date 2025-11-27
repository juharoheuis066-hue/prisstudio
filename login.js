document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'api.php';
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const loginAlert = document.getElementById('loginAlert');

    // --- LOGIKA TOKEN DINAMIS ---
    // Mendapatkan nama folder dari URL (misal: 'percobaan2' atau 'demo')
    // Jika di root, gunakan 'root'
    const pathSegment = window.location.pathname.split('/')[1] || 'root';
    // Membuat nama kunci token yang unik berdasarkan folder
    const TOKEN_KEY = `spp_auth_token_${pathSegment}`;
    
    document.getElementById('appLocationDisplay').textContent = `Instance: ${pathSegment}`;

    // Cek jika sudah ada token (sudah login), langsung redirect
    if (localStorage.getItem(TOKEN_KEY)) {
        window.location.href = 'index.html';
        return;
    }

    const showMessage = (message, type = 'danger') => {
        loginAlert.textContent = message;
        loginAlert.className = `alert alert-${type}`;
        loginAlert.style.display = 'block';
    };

    const callApi = async (method, endpoint, data = null) => {
        const url = `${API_URL}?entity=${endpoint}`;
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.message || `Login gagal. Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Kesalahan koneksi atau operasi API:", error);
            throw error;
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginAlert.style.display = 'none';
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';

        const username = usernameInput.value;
        const password = passwordInput.value;

        try {
            const result = await callApi('POST', 'auth', { username, password });

            if (result.success && result.token) {
                // Simpan token dengan nama kunci UNIK
                localStorage.setItem(TOKEN_KEY, result.token);
                showMessage('Login berhasil! Mengarahkan...', 'success');

                // Arahkan ke halaman utama
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);

            } else {
                showMessage(result.message || 'Login gagal. Coba lagi.');
            }

        } catch (error) {
            showMessage(error.message || 'Terjadi kesalahan saat mencoba login.');
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fa-solid fa-sign-in-alt"></i> Masuk';
        }
    });

    // Peringatan jika login.html diakses dari file://
    if (window.location.protocol === 'file:') {
        showMessage("Anda menjalankan aplikasi dari file lokal. Fitur Login/API mungkin tidak berfungsi sempurna karena batasan CORS/Keamanan browser. Untuk pengalaman terbaik, jalankan dengan server lokal (XAMPP/MAMP).", 'warning');
    }
});