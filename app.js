document.addEventListener('DOMContentLoaded', () => {

    const pathSegment = window.location.pathname.split('/')[1] || 'root';
    const TOKEN_KEY = `spp_auth_token_${pathSegment}`;

        // =========================================================================
        // PENGATURAN OTENTIKASI (FITUR TAMBAHAN 2)
        // =========================================================================
        const AUTH_TOKEN = localStorage.getItem(TOKEN_KEY);
        const unauthorizedOverlay = document.getElementById('unauthorizedOverlay');
        const redirectToLogin = document.getElementById('redirectToLogin');

        const checkAuth = () => {
            if (!AUTH_TOKEN) {
                unauthorizedOverlay.style.display = 'flex';
                // Hindari load data/init app jika belum login
                return false; 
            }
            unauthorizedOverlay.style.display = 'none';
            return true;
        };

        redirectToLogin.addEventListener('click', () => {
            window.location.href = 'login.html';
        });

        const handleLogout = () => {
            if (confirm('Apakah Anda yakin ingin Logout?')) {
                // Hapus token dan redirect
                localStorage.removeItem(TOKEN_KEY);
                showToast('Logout berhasil.', 'info');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 500);
            }
        };

        // Pasang event listener logout
        document.getElementById('sidebarLogoutBtn').addEventListener('click', handleLogout);
        document.getElementById('headerLogoutBtn').addEventListener('click', handleLogout);
        // =========================================================================
        // AKHIR PENGATURAN OTENTIKASI
        // =========================================================================


        // Lanjutkan inisialisasi hanya jika otentikasi sukses
        if (!checkAuth()) {
            return;
        }


        // =========================================================================
        // Inisialisasi Pustaka & API Konfigurasi
        // =========================================================================
        const { jsPDF } = window.jspdf;
        Chart.register(ChartDataLabels);
        const Papa = window.Papa;
        const API_URL = 'api.php';

        // Struktur data utama (hanya untuk referensi, akan diisi dari API)
        let db = {
            identitas: {}, jurusan: [], kelas: [], spp: { biaya: {} },
            siswa: [], pembayaran: [], pemasukanLain: [], pengeluaran: []
        };

        // Variabel UI & State
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const mainContent = document.getElementById('mainContent');
        const sidebarNav = document.getElementById('sidebarNav');
        const pages = document.querySelectorAll('.page');
        const sidebarLogo = document.getElementById('sidebarLogo');
        const sidebarTitle = document.getElementById('sidebarTitle');
        const toast = document.getElementById('toastNotification');
        const toastMessage = document.getElementById('toastMessage');
        const breadcrumbs = document.getElementById('breadcrumbs');

        let chartStatusPembayaran = null;
        let chartGender = null;
        let currentPageSiswa = 1;
        const rowsPerHalamanSiswa = 10;
        const TODAY_MONTH_YEAR = new Date().toISOString().substring(0, 7);


        // REVISI 2: State Sorting Siswa
        let sortColumn = 'nama';
        let sortDirection = 'asc';

        // REVISI 1: State Siswa yang dipilih
        let selectedSiswaIds = new Set();
        
        // State Filter Dashboard
        let dashFilter = {
            jurusan: '',
            kelas: '',
            status: '' // 'lunas', 'belum-lunas', ''
        };

        // =========================================================================
        // Fungsi Komunikasi API
        // =========================================================================

        /**
         * Melakukan panggilan Fetch API ke backend.
         * @param {string} method - Metode HTTP (GET, POST, PUT, DELETE).
         * @param {string} endpoint - Endpoint data (e.g., 'siswa', 'identitas').
         * @param {object} [data=null] - Data yang akan dikirim (untuk POST/PUT/DELETE).
         * @returns {Promise<object>} - Data respons dari server.
         */
        const callApi = async (method, endpoint, data = null) => {
        const url = `${API_URL}?entity=${endpoint}`;
        const options = {
            method: method,
            headers: {
                // HAPUS Content-Type default, biarkan browser mengaturnya jika data adalah FormData
                'Authorization': `Bearer ${AUTH_TOKEN}` 
            },
        };

        if (data) {
            if (data instanceof FormData) {
                // Jika data adalah FormData, jangan set Content-Type (browser akan set multipart/form-data otomatis)
                options.body = data;
            } else if ((method === 'POST' || method === 'PUT' || method === 'DELETE')) {
                // Jika data JSON biasa, set header JSON manual
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(data);
            }
        }

        try {
            const response = await fetch(url, options);

            if (response.status === 401 || response.status === 403) {
                 handleLogout();
                 throw new Error("Sesi berakhir atau tidak valid.");
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API Error - ${method} ${endpoint}: ${response.status} ${response.statusText}`, errorText);
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || errorJson.message || `Gagal memuat data dari API. Status: ${response.status}.`);
                } catch (e) {
                     throw new Error(`Gagal memuat data dari API. Status: ${response.status}.`);
                }
            }

            if (response.status === 204) { return { success: true, message: "Operasi berhasil" }; }
            
            if (method === 'DELETE') {
                try {
                    const result = await response.json();
                    return result;
                } catch (e) {
                     return { success: true, message: "Operasi berhasil" };
                }
            }

            const result = await response.json();
            return result;

        } catch (error) {
            console.error("Kesalahan koneksi atau operasi API:", error);
            if (error.message && !error.message.includes("Sesi berakhir")) {
                showToast(`Operasi Gagal: ${error.message}`, 'danger');
            }
            throw error;
        }
    };


        // Muat data dari API
        const loadData = async () => {
            try {
                // Endpoint kosong ('') akan mengembalikan seluruh data kecuali 'users'
                const data = await callApi('GET', '');

                if (!data) {
                    throw new Error("API mengembalikan data kosong atau tidak terstruktur.");
                }

                db = data;
                // Pastikan semua properti ada
                db.identitas = db.identitas || {};
                db.jurusan = db.jurusan || [];
                db.kelas = db.kelas || [];
                db.spp = db.spp || { biaya: {} };
                db.siswa = db.siswa || [];
                db.pembayaran = db.pembayaran || [];
                db.pemasukanLain = db.pemasukanLain || [];
                db.pengeluaran = db.pengeluaran || [];

            } catch (e) {
                console.error("Gagal memuat semua data dari server:", e);
                // Hanya tampilkan toast jika bukan masalah otentikasi
                if (!e.message.includes("Sesi berakhir")) {
                     showToast('Gagal memuat data, menggunakan struktur data kosong.', 'danger');
                }
            }
        };

        /**
         * Fungsi terpusat untuk sinkronisasi data setelah operasi berhasil
         * @param {string} message Pesan sukses yang akan ditampilkan.
         */
        const handleSuccessfulOperation = async (message) => {
            showToast(message, 'success');
            await loadData();
            // Panggil navigate untuk merender ulang halaman yang sedang aktif
            navigate(window.location.hash || '#dashboard');
        };

        // Fungsi save tidak lagi menyimpan ke LocalStorage, melainkan memanggil API
        const saveData = async (entity, data) => {
             // Dihapus karena fungsi ini tidak lagi relevan, diganti dengan callApi langsung
             // Namun dipertahankan untuk kompatibilitas code lama jika ada yang masih memanggilnya
            let result;
            try {
                result = await callApi('PUT', entity, data);
                if (result.success) {
                    await handleSuccessfulOperation(result.message || `Berhasil menyimpan ${entity}.`);
                    return true;
                } else {
                    showToast(result.message || `Gagal menyimpan ${entity}.`, 'danger');
                    return false;
                }
            } catch (e) {
                return false;
            }
        };

        // =========================================================================
        // Fungsi Utilitas
        // =========================================================================

        // --- FUNGSI KEAMANAN (DEFINISIKAN DI SINI AGAR GLOBAL) ---
        // Fungsi ini wajib ada di scope global agar bisa dipanggil oleh renderSiswa, renderKelas, dll.
        const escapeHtml = (unsafe) => {
            if (typeof unsafe !== 'string') return unsafe;
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        };
        // ---------------------------------------------------------

        const getCssVar = (varName) => {
            try {
                return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            } catch (e) {
                const fallbacks = {
                    '--primary-color': '#0d6efd', '--success-color': '#198754',
                    '--danger-color': '#dc3545', '--warning-color': '#ffc107',
                    '--card-bg': '#FFFFFF', '--text-light': '#FFFFFF', 
                    '--stat-blue-bg': '#3B82F6', '--stat-red-bg': '#EF4444'
                };
                return fallbacks[varName] || '#000000';
            }
        };

        const uuid = () => crypto.randomUUID();

        const formatRupiah = (angka) => {
            if (isNaN(angka) || angka === null || typeof angka === 'undefined') return "Rp 0";
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(angka);
        };

        const formatRupiahShort = (angka) => {
            if (isNaN(angka) || angka === null || typeof angka === 'undefined') return "0";
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                notation: 'compact',
                compactDisplay: 'short',
                minimumFractionDigits: 0
            }).format(angka);
        };

        const formatTanggal = (dateStr) => {
            if (!dateStr) return "-";
            const date = new Date(dateStr);
            if (isNaN(date)) return "-";
            return new Intl.DateTimeFormat('id-ID', {
                day: '2-digit', month: 'long', year: 'numeric'
            }).format(date);
        };

        const formatBulanTahun = (bulanStr) => {
            if (!bulanStr || bulanStr.length !== 7) return "-";
            try {
                const [year, month] = bulanStr.split('-');
                const date = new Date(`${year}-${month}-01T12:00:00Z`);
                return new Intl.DateTimeFormat('id-ID', {
                    month: 'long', year: 'numeric', timeZone: 'UTC'
                }).format(date);
            } catch (e) { return "-"; }
        };

        const showToast = (message, type = 'success') => {
            toastMessage.textContent = message;
            let colorMap = {
                'success': getCssVar('--success-color'),
                'danger': getCssVar('--danger-color'),
                'warning': getCssVar('--warning-color'),
                'info': getCssVar('--primary-color')
            };

            toast.style.backgroundColor = colorMap[type] || colorMap['info'];
            toast.style.color = (type === 'warning') ? '#333' : '#FFFFFF';
            toast.style.display = 'block';
            setTimeout(() => {
                toast.style.display = 'none';
            }, 3000);
        };
        
        // =========================================================================
        // FUNGSI BARU: Download CSV Contoh
        // =========================================================================
        const downloadExampleCsv = () => {
            const header = "NIS,Nama,Nama_Kelas,Nama_Jurusan,Jenis_Kelamin,No_WhatsApp,Email,Kesanggupan_Bayar";
            // Contoh data yang mudah dimengerti
            const exampleData = [
                "1011001,Fulan bin Fulanah,TAMHIDI,BAHASA ARAB,Laki-laki,6281234567890,fulan@gmail.com,cicil",
                "1011002,Fulanah binti Fulan,DIRASAH HADITS 1,HADITS,Perempuan,6281234567891,fulanah@gmail.com,sekaligus"
            ];
            
            const csvContent = header + "\n" + exampleData.join("\n");

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            
            link.setAttribute("href", url);
            link.setAttribute("download", "contoh_import_siswa.csv");
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Contoh CSV berhasil diunduh.', 'success');
        };
        
        // =========================================================================


        // =========================================================================
        // Helper Data (Diperbarui untuk Multi-Kelas dan Multi-Biaya)
        // =========================================================================

        const getJurusanNama = (idJurusan) => {
            const jurusan = db.jurusan.find(j => j.id === idJurusan);
            return jurusan ? jurusan.nama : "N/A";
        };

        const getJurusanByNama = (namaJurusan) => {
             return db.jurusan.find(j => j.nama.toLowerCase() === namaJurusan.toLowerCase());
        };

        const getKelasNama = (idKelas) => {
            const kelas = db.kelas.find(k => k.id === idKelas);
            return kelas ? kelas.nama : "N/A";
        };
        
        // New: Mendapatkan nama semua kelas siswa (untuk ditampilkan)
        const getSiswaKelasNames = (idKelasArray) => {
            if (!idKelasArray || idKelasArray.length === 0) return 'N/A';
            return idKelasArray.map(id => {
                const kls = db.kelas.find(k => k.id === id);
                return kls ? kls.nama : null;
            }).filter(Boolean).join(', ');
        };
        
        const getKelas = (idKelas) => {
            return db.kelas.find(k => k.id === idKelas);
        };

        // Revised: Mendapatkan daftar semua kelas aktif siswa beserta info SPP
        const getStudentActiveClasses = (idSiswa) => {
            const siswa = db.siswa.find(s => s.id === idSiswa);
            if (!siswa || !siswa.idKelas || siswa.idKelas.length === 0) return [];
            
            return siswa.idKelas.map(idKelas => {
                const kls = getKelas(idKelas);
                const sppInfo = db.spp?.biaya[idKelas] || { biaya: 0, mulai: '', selesai: '' };
                
                // Hanya kelas yang ada SPP aktif yang dikembalikan
                if (kls && sppInfo.biaya > 0 && sppInfo.mulai && sppInfo.selesai) {
                    return {
                        idKelas: kls.id,
                        namaKelas: kls.nama,
                        biayaPerBulan: sppInfo.biaya,
                        mulai: sppInfo.mulai,
                        selesai: sppInfo.selesai
                    };
                }
                return null;
            }).filter(Boolean);
        };

        // Revised: Menghitung total biaya SPP bulanan untuk semua kelas siswa (Aggregat)
        const getBiayaSPPSiswa = (idSiswa) => {
            const activeClasses = getStudentActiveClasses(idSiswa);
            return activeClasses.reduce((total, cls) => total + cls.biayaPerBulan, 0);
        };
        
        /**
         * REVISI LOGIKA STATUS (MASALAH 2):
         * - Status 'lunas' HANYA jika total bulan wajib (requiredMonthsCount) sudah terbayar.
         * - Menghitung persentase lunas.
         */
        const getStudentPaymentStatus = (idSiswa) => {
            const activeClasses = getStudentActiveClasses(idSiswa);
            const todayMonthYear = TODAY_MONTH_YEAR;
            
            const status = {
                classStatus: {}, 
                totalTunggakan: 0, 
                totalKewajibanSPP: 0, 
                requiredMonthsCount: 0, // NEW: Total bulan wajib (Semua kelas, semua periode)
                paidMonthsCount: 0, // NEW: Total bulan yang sudah dibayar (Semua kelas, semua periode)
                isFullyPaidPast: true, // Status Lunas Jatuh Tempo (untuk Dashboard)
                allPayments: [] 
            };

            // 1. Kumpulkan semua pembayaran yang sudah tercatat
            const paymentsSiswa = db.pembayaran.filter(p => p.idSiswa === idSiswa);
            status.allPayments = paymentsSiswa; 
            
            // Set of "idKelas|bulan" yang sudah lunas
            const paidPaymentsSet = new Set(); 
            paymentsSiswa.forEach(p => {
                const idKelas = p.idKelasSPP || p.idKelas; 
                paidPaymentsSet.add(`${idKelas}|${p.bulan}`);
            });

            // 2. Proses per kelas aktif
            activeClasses.forEach(cls => {
                const { mulai, selesai, idKelas, namaKelas, biayaPerBulan } = cls;

                // Inisialisasi status kelas
                status.classStatus[idKelas] = {
                    namaKelas,
                    biaya: biayaPerBulan,
                    requiredMonths: [], 
                    paidMonths: [], 
                    owedMonths: [], 
                    allOwedMonths: [], 
                    totalTunggakan: 0,
                    totalKewajibanSPP: 0
                };
                const classStat = status.classStatus[idKelas];

                if (mulai.length !== 7 || selesai.length !== 7) return;

                try {
                    // Start date is calculated from `mulai`
                    let tglMulai = new Date(mulai + "-01T12:00:00Z");
                    const tglSelesai = new Date(selesai + "-01T12:00:00Z");
                    let tglIterasi = new Date(tglMulai.getTime());

                    while (tglIterasi <= tglSelesai) {
                        const year = tglIterasi.getUTCFullYear();
                        const month = (tglIterasi.getUTCMonth() + 1).toString().padStart(2, '0');
                        const bulan = `${year}-${month}`;
                        const paymentKey = `${idKelas}|${bulan}`;
                        const isPaid = paidPaymentsSet.has(paymentKey);
                        const isPastDue = bulan <= todayMonthYear;
                        
                        // 1. Tambahkan ke Total Kewajiban SPP (Semua Periode)
                        classStat.totalKewajibanSPP += biayaPerBulan;
                        status.totalKewajibanSPP += biayaPerBulan;

                        // 2. Tambahkan ke Total Bulan Wajib (NEW)
                        classStat.requiredMonths.push(bulan);
                        status.requiredMonthsCount++;

                        // 3. Klasifikasikan pembayaran
                        if (isPaid) {
                            classStat.paidMonths.push(bulan);
                            status.paidMonthsCount++; // NEW
                        } else {
                            classStat.allOwedMonths.push(bulan); 
                            
                            if (isPastDue) {
                                // Tunggakan: Belum bayar DAN jatuh tempo (<= bulan ini)
                                classStat.owedMonths.push(bulan);
                                classStat.totalTunggakan += biayaPerBulan;
                                status.isFullyPaidPast = false; // Jika ada tunggakan jatuh tempo
                            }
                        }

                        // Lanjut ke bulan berikutnya
                        tglIterasi.setUTCMonth(tglIterasi.getUTCMonth() + 1, 1);
                    }
                } catch (e) { /* silent fail */ }

                // Aggregate total tunggakan jatuh tempo
                status.totalTunggakan += classStat.totalTunggakan;
            });
            
            // Perhitungan Persentase (MASALAH 2)
            const persentase = status.requiredMonthsCount > 0 
                ? (status.paidMonthsCount / status.requiredMonthsCount) * 100 
                : 0;

            // Logika Status: LUNAS = 100%
            const statusText = (persentase >= 100) ? 'lunas' : 'belum-lunas';


            return {
                status: statusText, // Lunas = 100%
                persentase: Math.min(100, Math.round(persentase)), // Persentase pembayaran (NEW)
                requiredMonthsCount: status.requiredMonthsCount, // NEW
                paidMonthsCount: status.paidMonthsCount, // NEW
                classStatus: status.classStatus,
                totalTunggakan: status.totalTunggakan,
                totalKewajibanSPP: status.totalKewajibanSPP, 
                paidPaymentsSet: paidPaymentsSet,
                allPayments: status.allPayments, 
                allRequiredMonths: Array.from(new Set(Object.values(status.classStatus).flatMap(cs => cs.requiredMonths)))
            };
        };

        const getStatusPembayaranSiswa = getStudentPaymentStatus; 


        // --- UTILITY BARU: Format Daftar Bulan WA/PDF (Multi-Class Granular) ---
        /**
         * Mengembalikan string rincian status SPP per kelas (untuk WA/PDF)
         * @param {object} classStatus - Objek status per kelas dari getStudentPaymentStatus.
         * @param {string} format - 'wa' atau 'pdf'
         */
        const formatRincianSPP = (classStatus, format = 'wa') => {
            let output = [];
            const isWA = format === 'wa';
            
            for (const idKelas in classStatus) {
                const stat = classStatus[idKelas];

                // Hanya tampilkan kelas yang memiliki kewajiban (tidak perlu filter jika sudah di activeClasses)
                if (stat.requiredMonths.length === 0) continue; 
                
                // Urutkan daftar bulan
                const sortMonths = (months) => months.map(formatBulanTahun).sort().join(', ');

                const requiredText = sortMonths(stat.requiredMonths);
                const paidText = sortMonths(stat.paidMonths);
                const owedText = sortMonths(stat.owedMonths);
                const owedCount = stat.owedMonths.length;

                let classDetail;
                
                if (isWA) {
                    classDetail = `
*--- ${stat.namaKelas} (Rp ${stat.biaya.toLocaleString('id-ID')}/bln) ---*
- *Total Bln Wajib:* ${stat.requiredMonths.length} bulan (${requiredText || '-'})
- *Bln Sudah Bayar:* ${stat.paidMonths.length} bulan (${paidText || '-'})
- *Bln Belum Bayar (Tunggakan):* ${owedCount} bulan (${owedText || '-'})
- *Total Tunggakan (Jatuh Tempo):* ${formatRupiah(stat.totalTunggakan)}
`;
                } else { // PDF - format array for table-like presentation
                    classDetail = {
                        idKelas,
                        namaKelas: stat.namaKelas,
                        biaya: stat.biaya,
                        bulanWajib: stat.requiredMonths,
                        bulanLunas: stat.paidMonths,
                        bulanTunggakan: stat.owedMonths,
                        totalTunggakan: stat.totalTunggakan
                    };
                }

                output.push(classDetail);
            }

            return isWA ? output.join('\n') : output;
        };


        // =========================================================================
        // Navigasi & UI
        // =========================================================================
        
        const navigate = async (hash) => {
            if (!hash) hash = '#dashboard';
            const pageId = 'page-' + hash.substring(1);

            pages.forEach(page => { page.classList.remove('active'); });

            const activePage = document.getElementById(pageId);
            if (activePage) {
                activePage.classList.add('active');
            } else {
                document.getElementById('page-dashboard').classList.add('active');
                hash = '#dashboard';
            }

            let pageTitle = "Dashboard";
            const activeLink = document.querySelector(`.sidebar-nav a[href="${hash}"]`);
            if (activeLink) {
                pageTitle = activeLink.textContent.trim();
            }
            if (hash === '#dashboard') {
                breadcrumbs.innerHTML = `<span>${pageTitle}</span>`;
            } else {
                breadcrumbs.innerHTML = `<a href="#dashboard" class="breadcrumb-link">Home</a> / <span>${pageTitle}</span>`;
            }

            sidebarNav.querySelectorAll('a').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === hash) {
                    link.classList.add('active');
                }
            });

            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('active');
            }

            // Render ulang data saat pindah halaman
            switch(hash) {
                case '#dashboard':
                    populateDashboardFilters();
                    renderDashboard();
                    break;
                case '#jurusan': renderJurusan(); break;
                case '#kelas': renderKelas(); break;
                case '#spp': renderSPP(); break;
                case '#siswa':
                    populateFilterSiswa();
                    renderSiswa();
                    break;
                case '#pemasukan-lain': renderPemasukanLain(); break;
                case '#pengeluaran': renderPengeluaran(); break;
                case '#broadcast': renderBroadcast(); break;
                case '#impor-ekspor': initImportExport(); break; // New init function
                case '#identitas': renderIdentitas(); break;
            }
        };

        sidebarNav.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                e.preventDefault();
                const hash = link.getAttribute('href');
                window.location.hash = hash;
            }
        });

        breadcrumbs.addEventListener('click', (e) => {
            const link = e.target.closest('a.breadcrumb-link');
             if (link) {
                e.preventDefault();
                const hash = link.getAttribute('href');
                window.location.hash = hash;
            }
        });

        window.addEventListener('hashchange', () => {
            navigate(window.location.hash);
        });

        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });

        mainContent.addEventListener('click', () => {
            if (window.innerWidth <= 1024 && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });

        const showModal = (modalId) => {
            const modal = document.getElementById(modalId);
            if (modal) modal.showModal();
        };

        const closeModal = (modalId) => {
            const modal = document.getElementById(modalId);
            if (modal) modal.close();
        };

        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-close-modal');
                closeModal(modalId);
            });
        });

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.close();
                }
            });
        });

        const updateUISidebar = () => {
            sidebarLogo.src = db.identitas.logo || "https://placehold.co/100x100/0d6efd/FFFFFF?text=M";
            sidebarTitle.textContent = db.identitas.nama || "Aplikasi SPP";
        };

        // ... (Logika Identitas, Jurusan, Kelas, SPP tetap sama) ...
        
        const formIdentitas = document.getElementById('formIdentitas');
        const identitasNama = document.getElementById('identitasNama');
        const identitasAlamat = document.getElementById('identitasAlamat');
        const identitasKepala = document.getElementById('identitasKepala');
        const identitasBendahara = document.getElementById('identitasBendahara');
        const identitasLogo = document.getElementById('identitasLogo');
        const logoPreviewContainer = document.getElementById('logoPreviewContainer');
        const logoPreview = document.getElementById('logoPreview');

        const renderIdentitas = () => {
            identitasNama.value = db.identitas.nama || "";
            identitasAlamat.value = db.identitas.alamat || "";
            identitasKepala.value = db.identitas.kepala || "";
            identitasBendahara.value = db.identitas.bendahara || "";
            if (db.identitas.logo) {
                logoPreview.src = db.identitas.logo;
                logoPreviewContainer.classList.remove('hidden');
            } else {
                logoPreviewContainer.classList.add('hidden');
            }
        };

        identitasLogo.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    logoPreview.src = event.target.result;
                    logoPreviewContainer.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        formIdentitas.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newData = {
                nama: identitasNama.value,
                alamat: identitasAlamat.value,
                kepala: identitasKepala.value,
                bendahara: identitasBendahara.value,
                logo: db.identitas.logo
            };

            const file = identitasLogo.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    newData.logo = event.target.result;
                    if (await callApi('PUT', 'identitas', newData)) {
                        await handleSuccessfulOperation('Identitas berhasil diperbarui.');
                        updateUISidebar();
                        closeModal('modalSiswa');
                    }
                };
                reader.readAsDataURL(file);
            } else {
                 if (await callApi('PUT', 'identitas', newData)) {
                    await handleSuccessfulOperation('Identitas berhasil diperbarui.');
                    updateUISidebar();
                    closeModal('modalSiswa');
                }
            }
        });
        
        const tabelJurusan = document.getElementById('tabelJurusan');
        const btnTambahJurusan = document.getElementById('btnTambahJurusan');
        const formJurusan = document.getElementById('formJurusan');
        const jurusanId = document.getElementById('jurusanId');
        const jurusanNama = document.getElementById('jurusanNama');
        const jurusanBiaya = document.getElementById('jurusanBiaya');

        const renderJurusan = () => {
            tabelJurusan.innerHTML = "";
            if (db.jurusan.length === 0) {
                tabelJurusan.innerHTML = '<tr><td colspan="3" style="text-align: center;">Belum ada data jurusan.</td></tr>';
                return;
            }
            db.jurusan.forEach(jur => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(jur.nama)}</td>
                    <td>${formatRupiah(jur.biayaPendaftaran)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-warning btn-sm btn-edit-jurusan" data-id="${jur.id}"><i class="fa-solid fa-edit"></i> Edit</button>
                            <button class="btn btn-danger btn-sm btn-hapus-jurusan" data-id="${jur.id}"><i class="fa-solid fa-trash"></i> Hapus</button>
                        </div>
                    </td>
                `;
                tabelJurusan.appendChild(tr);
            });
        };

        btnTambahJurusan.addEventListener('click', () => {
            if (db.jurusan.length === 0) {
                showToast('Harap tambahkan data jurusan terlebih dahulu.', 'warning');
                window.location.hash = '#jurusan';
                return;
            }
            formJurusan.reset();
            jurusanId.value = "";
            document.getElementById('modalJurusanTitle').textContent = "Tambah Jurusan Baru";
            showModal('modalJurusan');
        });

        formJurusan.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = jurusanId.value;
            const nama = jurusanNama.value;
            const biayaPendaftaran = parseFloat(jurusanBiaya.value);

            let data;
            if (id) { data = { id, nama, biayaPendaftaran }; } 
            else { data = { id: uuid(), nama, biayaPendaftaran }; }

            if (await callApi(id ? 'PUT' : 'POST', 'jurusan', data)) {
                await handleSuccessfulOperation(`Jurusan berhasil di${id ? 'perbarui' : 'tambahkan'}.`);
                closeModal('modalJurusan');
            }
        });

        tabelJurusan.addEventListener('click', async (e) => {
            const btnEdit = e.target.closest('.btn-edit-jurusan');
            const btnHapus = e.target.closest('.btn-hapus-jurusan');

            if (btnEdit) {
                const id = btnEdit.dataset.id;
                const jur = db.jurusan.find(j => j.id === id);
                if (jur) {
                    jurusanId.value = jur.id;
                    jurusanNama.value = jur.nama;
                    jurusanBiaya.value = jur.biayaPendaftaran;
                    document.getElementById('modalJurusanTitle').textContent = "Edit Jurusan";
                    showModal('modalJurusan');
                }
            }

            if (btnHapus) {
                const id = btnHapus.dataset.id;
                const dipakai = db.kelas.some(k => k.idJurusan === id);
                if (dipakai) {
                    showToast('Tidak dapat menghapus jurusan karena masih digunakan oleh kelas.', 'danger');
                    return;
                }

                if (confirm('Apakah Anda yakin ingin menghapus jurusan ini?')) {
                    if (await callApi('DELETE', 'jurusan', { id })) {
                        await handleSuccessfulOperation('Jurusan berhasil dihapus.');
                    }
                }
            }
        });
        
        const tabelKelas = document.getElementById('tabelKelas');
        const btnTambahKelas = document.getElementById('btnTambahKelas');
        const formKelas = document.getElementById('formKelas');
        const kelasId = document.getElementById('kelasId');
        const kelasNama = document.getElementById('kelasNama');
        const kelasJurusan = document.getElementById('kelasJurusan');
        const kelasWali = document.getElementById('kelasWali');

        const populateJurusanDropdown = (selectElement = kelasJurusan) => {
            selectElement.innerHTML = '<option value="">Pilih Jurusan</option>';
            db.jurusan.forEach(jur => {
                const option = document.createElement('option');
                option.value = jur.id;
                option.textContent = jur.nama;
                selectElement.appendChild(option);
            });
        };

        const renderKelas = () => {
            tabelKelas.innerHTML = "";
            if (db.kelas.length === 0) {
                tabelKelas.innerHTML = '<tr><td colspan="4" style="text-align: center;">Belum ada data kelas.</td></tr>';
                return;
            }
            db.kelas.forEach(kls => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(kls.nama)}</td>
                    <td>${escapeHtml(getJurusanNama(kls.idJurusan))}</td>
                    <td>${escapeHtml(kls.waliKelas)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-warning btn-sm btn-edit-kelas" data-id="${kls.id}"><i class="fa-solid fa-edit"></i> Edit</button>
                            <button class="btn btn-danger btn-sm btn-hapus-kelas" data-id="${kls.id}"><i class="fa-solid fa-trash"></i> Hapus</button>
                        </div>
                    </td>
                `;
                tabelKelas.appendChild(tr);
            });
        };

        btnTambahKelas.addEventListener('click', () => {
            if (db.jurusan.length === 0) {
                showToast('Harap tambahkan data jurusan terlebih dahulu.', 'warning');
                window.location.hash = '#jurusan';
                return;
            }
            formKelas.reset();
            kelasId.value = "";
            document.getElementById('modalKelasTitle').textContent = "Tambah Kelas Baru";
            populateJurusanDropdown();
            showModal('modalKelas');
        });

        formKelas.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = kelasId.value;
            const nama = kelasNama.value;
            const idJurusan = kelasJurusan.value;
            const waliKelas = kelasWali.value;

            let data;
            if (id) { data = { id, nama, idJurusan, waliKelas }; } 
            else { data = { id: uuid(), nama, idJurusan, waliKelas }; }

            if (await callApi(id ? 'PUT' : 'POST', 'kelas', data)) {
                await handleSuccessfulOperation(`Kelas berhasil di${id ? 'perbarui' : 'tambahkan'}.`);
                closeModal('modalKelas');
            }
        });

        tabelKelas.addEventListener('click', async (e) => {
            const btnEdit = e.target.closest('.btn-edit-kelas');
            const btnHapus = e.target.closest('.btn-hapus-kelas');

            if (btnEdit) {
                const id = btnEdit.dataset.id;
                const kls = db.kelas.find(k => k.id === id);
                if (kls) {
                    kelasId.value = kls.id;
                    kelasNama.value = kls.nama;
                    populateJurusanDropdown();
                    kelasJurusan.value = kls.idJurusan;
                    kelasWali.value = kls.waliKelas;
                    document.getElementById('modalKelasTitle').textContent = "Edit Kelas";
                    showModal('modalKelas');
                }
            }

            if (btnHapus) {
                const id = btnHapus.dataset.id;
                // Cek apakah ada siswa yang menggunakan kelas ini 
                const dipakai = db.siswa.some(s => s.idKelas && s.idKelas.includes(id));
                
                if (dipakai) {
                    showToast('Tidak dapat menghapus kelas karena masih digunakan oleh siswa.', 'danger');
                    return;
                }

                if (confirm('Apakah Anda yakin ingin menghapus kelas ini? Ini juga akan menghapus pengaturan SPP terkait dan riwayat pembayaran untuk kelas ini.')) {
                    if (await callApi('DELETE', 'kelas', { id })) {
                        await handleSuccessfulOperation('Kelas berhasil dihapus.');
                    }
                }
            }
        });
        
        const tabelBiayaSPP = document.getElementById('tabelBiayaSPP');
        const formBiayaSPP = document.getElementById('formBiayaSPP');
        const sppKelasId = document.getElementById('sppKelasId');
        const sppBiaya = document.getElementById('sppBiaya');
        const sppModalBulanMulai = document.getElementById('sppModalBulanMulai');
        const sppModalBulanSelesai = document.getElementById('sppModalBulanSelesai');

        const renderSPP = () => {
            tabelBiayaSPP.innerHTML = "";
            if (db.kelas.length === 0) {
                tabelBiayaSPP.innerHTML = '<tr><td colspan="6" style="text-align: center;">Belum ada data kelas. Tambahkan kelas terlebih dahulu.</td></tr>';
                return;
            }

            db.kelas.forEach(kls => {
                const sppInfo = db.spp?.biaya[kls.id] || { biaya: 0, mulai: '', selesai: '' };

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(kls.nama)}</td>
                    <td>${escapeHtml(getJurusanNama(kls.idJurusan))}</td>
                    <td>${formatRupiah(sppInfo.biaya)}</td>
                    <td>${formatBulanTahun(sppInfo.mulai)}</td>
                    <td>${formatBulanTahun(sppInfo.selesai)}</td>
                    <td>
                        <button class="btn btn-warning btn-sm btn-atur-biaya" data-id="${kls.id}">
                            <i class="fa-solid fa-edit"></i> Atur Biaya/Durasi
                        </button>
                    </td>
                `;
                tabelBiayaSPP.appendChild(tr);
            });
        };

        tabelBiayaSPP.addEventListener('click', (e) => {
            const btnAtur = e.target.closest('.btn-atur-biaya');
            if (btnAtur) {
                const id = btnAtur.dataset.id;
                const kls = db.kelas.find(k => k.id === id);
                if (kls) {
                    const sppInfo = db.spp?.biaya[kls.id] || {};

                    sppKelasId.value = kls.id;
                    document.getElementById('sppNamaKelas').textContent = kls.nama;
                    document.getElementById('sppNamaJurusan').textContent = getJurusanNama(kls.idJurusan);

                    sppBiaya.value = sppInfo.biaya || "";
                    sppModalBulanMulai.value = sppInfo.mulai || "";
                    sppModalBulanSelesai.value = sppInfo.selesai || "";

                    showModal('modalBiayaSPP');
                }
            }
        });

        formBiayaSPP.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idKelas = sppKelasId.value;
            const biaya = parseFloat(sppBiaya.value);
            const mulai = sppModalBulanMulai.value;
            const selesai = sppModalBulanSelesai.value;

            if (!mulai || !selesai) {
                 showToast('Bulan mulai dan selesai harus diisi.', 'danger');
                return;
            }
            if (mulai > selesai) {
                showToast('Bulan mulai tidak boleh lebih akhir dari bulan selesai.', 'danger');
                return;
            }

            const data = { idKelas, biaya, mulai, selesai };

            if (await callApi('POST', 'spp-biaya', data)) {
                await handleSuccessfulOperation('Biaya & Durasi SPP berhasil diperbarui.');
                closeModal('modalBiayaSPP');
            }
        });


        // =========================================================================
        // Halaman: Pengaturan Siswa (Multi-Kelas & Perbaikan Bug)
        // =========================================================================
        const tabelSiswaEl = document.getElementById('tabelSiswa');
        const tabelSiswaContainer = document.getElementById('tabelSiswaUtama');
        const btnTambahSiswa = document.getElementById('btnTambahSiswa');

        // Elemen Modal Siswa
        const formSiswa = document.getElementById('formSiswa');
        const siswaId = document.getElementById('siswaId');
        const siswaNama = document.getElementById('siswaNama');
        const siswaNis = document.getElementById('siswaNis');
        const siswaGender = document.getElementById('siswaGender');
        const siswaKesanggupanBayar = document.getElementById('siswaKesanggupanBayar');
        const siswaWa = document.getElementById('siswaWa');
        const siswaEmail = document.getElementById('siswaEmail');
        const siswaMultiKelasCheckboxes = document.getElementById('siswaMultiKelasCheckboxes');


        const filterSiswaNama = document.getElementById('filterSiswaNama');
        const filterSiswaKelas = document.getElementById('filterSiswaKelas'); 
        const filterSiswaStatus = document.getElementById('filterSiswaStatus');

        const checkAllSiswa = document.getElementById('checkAllSiswa');
        const btnDeleteSelectedSiswa = document.getElementById('btnDeleteSelectedSiswa');
        const btnDeleteAllSiswa = document.getElementById('btnDeleteAllSiswa');

        // New: Populate Multi-Kelas Checkboxes
        const populateMultiKelasCheckboxes = (selectedIds = []) => {
            siswaMultiKelasCheckboxes.innerHTML = '';
            
            db.kelas.forEach(kls => {
                const sppInfo = db.spp?.biaya[kls.id];
                const hasActiveSpp = sppInfo && sppInfo.biaya > 0 && sppInfo.mulai && sppInfo.selesai;
                const disabledText = hasActiveSpp ? '' : ' (Non-aktif SPP)';
                // Disallow selecting classes without active SPP settings to prevent dashboard issues
                const disabledAttr = !hasActiveSpp ? 'disabled' : ''; 

                const isSelected = selectedIds.includes(kls.id);
                
                // Checkbox untuk memilih multi-kelas
                const label = document.createElement('label');
                label.className = 'checkbox-item';
                label.title = hasActiveSpp ? kls.nama : kls.nama + ' (Tidak ada tagihan SPP aktif)';
                label.innerHTML = `
                    <input type="checkbox" name="siswaKelasIds" value="${kls.id}" ${isSelected ? 'checked' : ''} ${disabledAttr}>
                    ${kls.nama} ${disabledText}
                `;
                siswaMultiKelasCheckboxes.appendChild(label);
            });
        };
        
        // Populate Filter Siswa (Filter Kelas Aktif)
        const populateFilterSiswa = () => {
            filterSiswaKelas.innerHTML = '<option value="">Semua Kelas</option>';
            db.kelas.forEach(kls => {
                const option = document.createElement('option');
                option.value = kls.id;
                option.textContent = kls.nama;
                filterSiswaKelas.appendChild(option);
            });
        };

        // Fungsi Sorting (Dipertahankan, disesuaikan untuk Kelas Aktif dan Status/Persentase)
        const handleSortSiswa = (siswaArray) => {
             return siswaArray.sort((a, b) => {
                let valA, valB;

                if (sortColumn === 'kelas') {
                    const kelasIdsA = a.idKelas || [];
                    const kelasIdsB = b.idKelas || [];
                    valA = getKelas(kelasIdsA[0])?.nama || '';
                    valB = getKelas(kelasIdsB[0])?.nama || '';
                } else if (sortColumn === 'persentase') {
                     // Sort by percentage ascending/descending
                    valA = getStatusPembayaranSiswa(a.id).persentase;
                    valB = getStatusPembayaranSiswa(b.id).persentase;
                    
                    let comparison = 0;
                    if (valA > valB) { comparison = 1; }
                    else if (valA < valB) { comparison = -1; }
                    
                    return sortDirection === 'asc' ? comparison : comparison * -1;

                } else if (sortColumn === 'status') {
                     // Logika status lama (dihapus) diganti dengan persentase di atas
                     valA = getStatusPembayaranSiswa(a.id).status;
                     valB = getStatusPembayaranSiswa(b.id).status;
                     
                     // Menggunakan status lama untuk kompatibilitas filter dashboard, tapi tidak untuk sorting.
                     // Tetap gunakan persentase untuk sorting status.
                     return 0;

                } else if (sortColumn === 'kesanggupan') {
                    valA = a.kesanggupanBayar;
                    valB = b.kesanggupanBayar;
                } else if (sortColumn === 'nis') {
                    valA = isNaN(parseInt(a.nis)) ? a.nis : parseInt(a.nis);
                    valB = isNaN(parseInt(b.nis)) ? b.nis : parseInt(b.nis);
                }
                else {
                    valA = a[sortColumn];
                    valB = b[sortColumn];
                }

                if (typeof valA === 'string' && sortColumn !== 'persentase') {
                    valA = valA.toLowerCase();
                    valB = valB.toLowerCase();
                }

                let comparison = 0;
                if (valA > valB) { comparison = 1; }
                else if (valA < valB) { comparison = -1; }
                
                // If sorting by percentage is handled above, skip this
                if (sortColumn === 'persentase') return comparison; 

                return sortDirection === 'asc' ? comparison : comparison * -1;
            });
        };

        // Event Listener untuk Header Tabel Sorting
        tabelSiswaContainer.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sortKey;
                if (key === sortColumn) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = key;
                    sortDirection = 'asc';
                }

                // Reset ikon
                tabelSiswaContainer.querySelectorAll('th.sortable').forEach(oth => {
                    oth.classList.remove('asc', 'desc');
                    oth.querySelector('i').className = 'fa-solid fa-sort';
                });

                // Set ikon baru
                th.classList.add(sortDirection);
                th.querySelector('i').className = `fa-solid fa-sort-${sortDirection === 'asc' ? 'up' : 'down'}`;

                renderSiswa(1);
            });
        });

        // Panggil untuk inisialisasi ikon
        const initialSortEl = tabelSiswaContainer.querySelector(`th[data-sort-key="${sortColumn}"]`);
        if (initialSortEl) {
             initialSortEl.classList.add(sortDirection);
             initialSortEl.querySelector('i').className = `fa-solid fa-sort-${sortDirection === 'asc' ? 'up' : 'down'}`;
        }


        const getFilteredSiswa = () => {
            const namaFilter = filterSiswaNama.value.toLowerCase();
            const kelasFilter = filterSiswaKelas.value;
            const statusFilter = filterSiswaStatus.value;

            let filtered = db.siswa.filter(siswa => {
                const statusData = getStatusPembayaranSiswa(siswa.id);
                
                const matchNama = siswa.nama.toLowerCase().includes(namaFilter) || siswa.nis.includes(namaFilter);
                // Filter kelas berdasarkan kelas yang mana pun yang dimiliki siswa
                const matchKelas = !kelasFilter || (siswa.idKelas && siswa.idKelas.includes(kelasFilter)); 
                const matchStatus = !statusFilter || statusData.status === statusFilter;

                return matchNama && matchKelas && matchStatus;
            });

            // Terapkan sorting setelah filtering
            return handleSortSiswa(filtered);
        };

        const renderSiswa = (page = 1) => {
            tabelSiswaEl.innerHTML = "";
            currentPageSiswa = page;

            const selectedBeforeRender = new Set(selectedSiswaIds);
            const filteredSiswa = getFilteredSiswa();

            if (filteredSiswa.length === 0) {
                tabelSiswaEl.innerHTML = '<tr><td colspan="7" style="text-align: center;">Tidak ada data siswa yang cocok.</td></tr>';
                renderPaginationSiswa(0);
                selectedSiswaIds.clear();
                updateSelectionStatus();
                return;
            }

            const totalSiswa = filteredSiswa.length;
            const totalPages = Math.ceil(totalSiswa / rowsPerHalamanSiswa);
            const startIndex = (page - 1) * rowsPerHalamanSiswa;
            const endIndex = startIndex + rowsPerHalamanSiswa;
            const siswaPaginated = filteredSiswa.slice(startIndex, endIndex);

            siswaPaginated.forEach(siswa => {
                const statusData = getStatusPembayaranSiswa(siswa.id);
                const persentase = statusData.persentase; // NEW: Ambil persentase
                const statusColor = persentase === 100 ? 'success' : 'danger'; // NEW: Tentukan warna
                const kesanggupanText = (siswa.kesanggupanBayar === 'sekaligus') ? 'Sekaligus' : 'Cicil';
                
                // Gunakan getSiswaKelasNames untuk multi-kelas
                const allKelasNames = getSiswaKelasNames(siswa.idKelas).split(', ').map(name => `<span class="tag">${name}</span>`).join('');

                const isSelected = selectedBeforeRender.has(siswa.id);

                // Konten untuk Kolom Status Pembayaran (MASALAH 2: Progress Bar)
                const statusHtml = `
                    <div class="status-progress-container" title="${statusData.paidMonthsCount} dari ${statusData.requiredMonthsCount} Bulan Terbayar">
                        <div class="status-progress-bar ${statusColor}" style="width: ${persentase}%">
                            ${persentase}%
                        </div>
                    </div>
                    <span class="text-small" style="color: ${statusColor === 'success' ? getCssVar('--success-color') : getCssVar('--danger-color')};">
                        ${statusData.totalTunggakan > 0 ? formatRupiah(statusData.totalTunggakan) + ' Tunggakan Jatuh Tempo' : (persentase < 100 ? 'Ada Kewajiban Mendatang' : 'Lunas Penuh')}
                    </span>
                `;


                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="checkbox" class="check-siswa-row" data-id="${siswa.id}" ${isSelected ? 'checked' : ''}></td>
                    <td><strong>${escapeHtml(siswa.nama)}</strong><br><span class="text-small">${escapeHtml(siswa.email || '-')}</span></td>
                    <td>${escapeHtml(siswa.nis)}</td>
                    <td>${allKelasNames}</td>
                    <td>${statusHtml}</td> <td>${kesanggupanText}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-success btn-sm btn-bayar-spp" data-id="${siswa.id}"><i class="fa-solid fa-dollar-sign"></i> Bayar</button>
                            <button class="btn btn-warning btn-sm btn-edit-siswa" data-id="${siswa.id}"><i class="fa-solid fa-edit"></i> Edit</button>
                            <button class="btn btn-danger btn-sm btn-hapus-siswa-single" data-id="${siswa.id}"><i class="fa-solid fa-trash"></i> Hapus</button>
                            <button class="btn btn-secondary btn-sm btn-wa-siswa" data-id="${siswa.id}"><i class="fa-brands fa-whatsapp"></i> WA</button>
                            <button class="btn btn-primary btn-sm btn-cetak-bukti" data-id="${siswa.id}"><i class="fa-solid fa-print"></i> Cetak</button>
                        </div>
                    </td>
                `;
                tabelSiswaEl.appendChild(tr);
            });

            updateSelectionStatus();
            renderPaginationSiswa(totalPages);
        };

        const renderPaginationSiswa = (totalPages) => {
            const paginationContainer = document.getElementById('paginationSiswa');
            paginationContainer.innerHTML = "";

            if (totalPages <= 1) return;

            const prevBtn = document.createElement('button');
            prevBtn.innerHTML = '&laquo;';
            prevBtn.className = 'btn btn-secondary btn-sm';
            prevBtn.disabled = (currentPageSiswa === 1);
            prevBtn.addEventListener('click', () => renderSiswa(currentPageSiswa - 1));
            paginationContainer.appendChild(prevBtn);

            for (let i = 1; i <= totalPages; i++) {
                const pageBtn = document.createElement('button');
                pageBtn.textContent = i;
                pageBtn.className = 'btn btn-sm ' + (i === currentPageSiswa ? 'btn-primary' : 'btn-outline-primary');
                pageBtn.addEventListener('click', () => renderSiswa(i));
                paginationContainer.appendChild(pageBtn);
            }

            const nextBtn = document.createElement('button');
            nextBtn.innerHTML = '&raquo;';
            nextBtn.className = 'btn btn-secondary btn-sm';
            nextBtn.disabled = (currentPageSiswa === totalPages);
            nextBtn.addEventListener('click', () => renderSiswa(currentPageSiswa + 1));
            paginationContainer.appendChild(nextBtn);
        };

        filterSiswaNama.addEventListener('input', () => renderSiswa(1));
        filterSiswaKelas.addEventListener('change', () => renderSiswa(1));
        filterSiswaStatus.addEventListener('change', () => renderSiswa(1));

        // Logika Pemilihan Siswa (Dipertahankan)
        tabelSiswaEl.addEventListener('change', (e) => {
            if (e.target.classList.contains('check-siswa-row')) {
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    selectedSiswaIds.add(id);
                } else {
                    selectedSiswaIds.delete(id);
                }
                updateSelectionStatus();
            }
        });

        checkAllSiswa.addEventListener('change', () => {
            const isChecked = checkAllSiswa.checked;
            const visibleSiswaIds = Array.from(document.querySelectorAll('.check-siswa-row')).map(cb => cb.dataset.id);

            document.querySelectorAll('.check-siswa-row').forEach(cb => { cb.checked = isChecked; });

            visibleSiswaIds.forEach(id => {
                if (isChecked) {
                    selectedSiswaIds.add(id);
                } else {
                    selectedSiswaIds.delete(id);
                }
            });

            updateSelectionStatus();
        });

        const updateSelectionStatus = () => {
            if (selectedSiswaIds.size > 0) {
                btnDeleteSelectedSiswa.style.display = 'inline-flex';
            } else {
                btnDeleteSelectedSiswa.style.display = 'none';
            }

            const visibleCheckboxes = document.querySelectorAll('.check-siswa-row');
            if (visibleCheckboxes.length > 0) {
                const totalVisible = visibleCheckboxes.length;
                const checkedVisible = Array.from(visibleCheckboxes).filter(cb => cb.checked).length;

                checkAllSiswa.checked = (checkedVisible === totalVisible) && totalVisible > 0;
                checkAllSiswa.indeterminate = (checkedVisible > 0) && (checkedVisible < totalVisible);
            } else {
                checkAllSiswa.checked = false;
                checkAllSiswa.indeterminate = false;
            }
        };

        btnDeleteSelectedSiswa.addEventListener('click', () => {
             deleteSelectedSiswa(Array.from(selectedSiswaIds));
        });

        btnDeleteAllSiswa.addEventListener('click', () => {
             deleteAllSiswa();
        });

        const deleteSelectedSiswa = async (idsToDelete) => {
            if (idsToDelete.length === 0) {
                showToast('Tidak ada siswa yang dipilih.', 'warning');
                return;
            }

            if (!confirm(`Apakah Anda yakin ingin menghapus ${idsToDelete.length} siswa yang dipilih? Semua data pembayaran terkait juga akan terhapus.`)) {
                return;
            }

            try {
                const result = await callApi('DELETE', 'siswa', { ids: idsToDelete });
                if (result.success) {
                    await handleSuccessfulOperation(result.message || 'Siswa berhasil dihapus.');
                    selectedSiswaIds.clear(); 
                }
            } catch (e) {
                 // Error sudah ditangani di callApi
            }
        };

        const deleteAllSiswa = async () => {
            if (!confirm('PERINGATAN! Tindakan ini akan menghapus SEMUA data siswa dan seluruh data pembayaran SPP terkait. Lanjutkan?')) {
                return;
            }

            try {
                const result = await callApi('DELETE', 'siswa', { delete_all: true });
                if (result.success) {
                    await handleSuccessfulOperation(result.message || 'Semua siswa berhasil dihapus.');
                    selectedSiswaIds.clear(); 
                }
            } catch (e) {
                // Error sudah ditangani di callApi
            }
        };

        btnTambahSiswa.addEventListener('click', () => {
            if (db.kelas.length === 0) {
                showToast('Harap tambahkan data kelas terlebih dahulu.', 'warning');
                window.location.hash = '#kelas';
                return;
            }
            formSiswa.reset();
            siswaId.value = "";
            document.getElementById('modalSiswaTitle').textContent = "Tambah Siswa Baru";
            // Populate untuk kasus Tambah Baru (tidak ada yang terpilih)
            populateMultiKelasCheckboxes([]); 
            siswaKesanggupanBayar.value = 'cicil';
            showModal('modalSiswa');
        });

        formSiswa.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = siswaId.value;
            
            // Ambil semua ID kelas yang dicentang
            const selectedKelasIds = Array.from(siswaMultiKelasCheckboxes.querySelectorAll('input:checked')).map(cb => cb.value);

            if (selectedKelasIds.length === 0) {
                 showToast('Pilih setidaknya satu kelas untuk siswa ini.', 'danger');
                 return;
            }
            
            // Final idKelas array adalah semua yang dipilih (tanpa kelas utama)
            const finalIdKelasArray = selectedKelasIds;

            const data = {
                nis: siswaNis.value,
                nama: siswaNama.value,
                // Kirim array finalIdKelasArray
                idKelas: finalIdKelasArray, 
                gender: siswaGender.value,
                kesanggupanBayar: siswaKesanggupanBayar.value,
                wa: siswaWa.value,
                email: siswaEmail.value
            };

            const nisExists = db.siswa.some(s => s.nis === data.nis && s.id !== id);
            if (nisExists) {
                showToast('NIS sudah digunakan oleh siswa lain.', 'danger');
                return;
            }

            if (id) { data.id = id; } 
            else { data.id = uuid(); }

            if (await callApi(id ? 'PUT' : 'POST', 'siswa', data)) {
                await handleSuccessfulOperation(`Data siswa berhasil di${id ? 'perbarui' : 'tambahkan'}.`);
                closeModal('modalSiswa');
            }
        });

        tabelSiswaEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const id = btn.dataset.id;

            if (btn.classList.contains('btn-edit-siswa')) {
                const siswa = db.siswa.find(s => s.id === id);
                if (siswa) {
                    siswaId.value = siswa.id;
                    siswaNama.value = siswa.nama;
                    siswaNis.value = siswa.nis;
                    // Populate dengan kelas siswa yang sudah ada
                    populateMultiKelasCheckboxes(siswa.idKelas || []); 
                    siswaGender.value = siswa.gender;
                    siswaKesanggupanBayar.value = siswa.kesanggupanBayar || 'cicil';
                    siswaWa.value = siswa.wa;
                    siswaEmail.value = siswa.email;
                    document.getElementById('modalSiswaTitle').textContent = "Edit Data Siswa";
                    showModal('modalSiswa');
                }
            }

            if (btn.classList.contains('btn-hapus-siswa-single')) {
                if (confirm('Apakah Anda yakin ingin menghapus siswa ini? Ini juga akan menghapus semua data pembayaran terkait.')) {
                    if (await callApi('DELETE', 'siswa', { id })) {
                        await handleSuccessfulOperation('Siswa berhasil dihapus.');
                    }
                }
            }

            if (btn.classList.contains('btn-bayar-spp')) {
                handleBayarSPP(id);
            }

            if (btn.classList.contains('btn-cetak-bukti')) {
                generateBuktiPembayaran(id);
            }

            if (btn.classList.contains('btn-wa-siswa')) {
                handleWASiswa(id);
            }
        });

        // --- Logika Bayar SPP (Multi-Kelas) ---
        
        // Event Listener untuk update Total Bayar di modal
        document.getElementById('bayarDaftarBulanWajib').addEventListener('change', (e) => {
            if (e.target.name === 'bulanBayar') {
                updateTotalBayar();
            }
        });
        
        const updateTotalBayar = () => {
            let total = 0;
            // Hanya cek checkbox di dalam div yang relevan
            document.querySelectorAll('#bayarDaftarBulanWajib input[name="bulanBayar"]:checked').forEach(cb => {
                // Dataset now holds the granular owed amount for that specific class/month
                total += parseFloat(cb.dataset.owedAmount || 0);
            });
            document.getElementById('bayarTotal').textContent = formatRupiah(total);
        };
        
        // FIX 2: Fungsi handleBayarSPP (Perbaikan: Menambahkan status pembayaran saat ini)
        const handleBayarSPP = (idSiswa) => {
            // TAMBAHAN: Reset input file setiap kali modal dibuka
            const fileInput = document.getElementById('bayarBuktiFile');
            if(fileInput) fileInput.value = ''; 
            // AKHIR TAMBAHAN

            const siswa = db.siswa.find(s => s.id === idSiswa);
            if (!siswa) return;

            const activeClasses = getStudentActiveClasses(idSiswa);

            if (activeClasses.length === 0) {
                showToast('Siswa ini tidak memiliki kelas dengan pengaturan SPP yang aktif. Harap cek Pengaturan SPP.', 'danger');
                return;
            }
            
            // 1. Dapatkan status pembayaran granular
            const statusData = getStudentPaymentStatus(idSiswa);
            const allPayments = statusData.allPayments; // Semua pembayaran siswa

            document.getElementById('bayarSiswaId').value = idSiswa;
            document.getElementById('bayarNamaSiswa').textContent = siswa.nama;
            document.getElementById('bayarKelasSiswa').textContent = activeClasses.map(cls => cls.namaKelas).join(', ');
            document.getElementById('bayarBiayaSpp').textContent = formatRupiah(getBiayaSPPSiswa(idSiswa)); 

            const bayarDaftarBulanWajib = document.getElementById('bayarDaftarBulanWajib');
            bayarDaftarBulanWajib.innerHTML = '';
            
            // 2. Kumpulkan semua kewajiban pembayaran (lunas/belum lunas)
            let allObligations = [];
            
            for (const idKelas in statusData.classStatus) {
                const classStat = statusData.classStatus[idKelas];
                
                classStat.requiredMonths.forEach(bulan => { // Ambil SEMUA required months
                    const isPaid = classStat.paidMonths.includes(bulan);
                    const isFuture = bulan > TODAY_MONTH_YEAR;
                    const paymentRecord = allPayments.find(p => (p.idKelasSPP || p.idKelas) === idKelas && p.bulan === bulan);

                    allObligations.push({
                        idKelas,
                        namaKelas: classStat.namaKelas,
                        bulan,
                        biaya: classStat.biaya,
                        isPaid,
                        isFuture,
                        paymentId: paymentRecord ? paymentRecord.id : null // ID Pembayaran jika sudah lunas
                    });
                });
            }

            // Urutkan: Tunggakan (Arrear) dulu, lalu Bulan, lalu Nama Kelas
            allObligations.sort((a, b) => {
                // 1. Urutkan berdasarkan status (Tunggakan dulu)
                const isArrearA = !a.isPaid && !a.isFuture;
                const isArrearB = !b.isPaid && !b.isFuture;
                if (isArrearA !== isArrearB) {
                    return isArrearA ? -1 : 1; 
                }
                // 2. Urutkan berdasarkan Bulan (YYYY-MM)
                if (a.bulan !== b.bulan) {
                    return a.bulan.localeCompare(b.bulan);
                }
                // 3. Urutkan berdasarkan Nama Kelas
                return a.namaKelas.localeCompare(b.namaKelas);
            });


            // 3. Render daftar kewajiban granular
            let htmlContent = '<ul style="list-style: none; padding: 0;">';
            let hasPayableMonths = false;
            
            allObligations.forEach(obj => {
                const { idKelas, namaKelas, bulan, biaya, isPaid, isFuture, paymentId } = obj;
                const paymentKey = `${idKelas}|${bulan}`; // Unique key for this specific class/month obligation
                
                const statusText = isPaid 
                    ? `LUNAS (ID: ${paymentId})` 
                    : (isFuture 
                        ? `Akan Datang (${formatRupiah(biaya)})` 
                        : `TUNGGAKAN (${formatRupiah(biaya)})`);
                
                const statusColor = isPaid 
                    ? getCssVar('--success-color') 
                    : (isFuture ? getCssVar('--stat-blue-bg') : getCssVar('--danger-color'));
                
                // Checkbox untuk memilih tagihan spesifik (kelas dan bulan)
                // data-payment-id digunakan untuk menandai pembayaran yang sudah ada (mode edit/hapus)
                // Jika sudah lunas, set data-owed-amount ke 0
                const checkboxHtml = `<input type="checkbox" name="bulanBayar" value="${paymentKey}" data-owed-amount="${isPaid ? 0 : biaya}" data-payment-id="${paymentId || ''}" ${isPaid ? 'checked' : ''} style="margin-right: 10px; accent-color: var(--primary-color);">`;
                
                // Set flag untuk disable tombol jika tidak ada yang bisa dibayar/diedit
                if (!isFuture) hasPayableMonths = true; // Setidaknya ada kewajiban jatuh tempo

                htmlContent += `
                    <li class="payment-list-item">
                        <div style="display: flex; align-items: center; flex-grow: 1;">
                            ${checkboxHtml}
                            <span style="font-weight: 600;">${namaKelas}</span>
                            <span style="font-size: 0.9em; color: #6c757d; margin-left: 10px;">(${formatBulanTahun(bulan)})</span>
                        </div>
                        <span style="color: ${statusColor}; font-weight: 500; font-size: 0.9em; flex-shrink: 0;">${statusText}</span>
                    </li>
                `;
            });
            htmlContent += '</ul>';
            
            bayarDaftarBulanWajib.innerHTML = htmlContent;

            // Atur tombol submit dan hapus semua
            const submitBtn = document.getElementById('modalBayarSPP').querySelector('button[type="submit"]');
            
            // Disenable tombol submit jika tidak ada bulan yang bisa di-tambah/hapus
            submitBtn.disabled = !hasPayableMonths; 
            document.getElementById('btnHapusSemuaPembayaran').style.display = (allPayments.length > 0) ? 'block' : 'none';

            updateTotalBayar();
            showModal('modalBayarSPP');
        };

        document.getElementById('formBayarSPP').addEventListener('submit', async (e) => {
            e.preventDefault();
            const idSiswa = document.getElementById('bayarSiswaId').value;
            const tglBayar = new Date().toISOString();
            
            // Ambil file bukti (CODE BARU)
            const fileInput = document.getElementById('bayarBuktiFile');
            const fileBukti = fileInput ? fileInput.files[0] : null;

            const checkboxes = document.querySelectorAll('#bayarDaftarBulanWajib input[name="bulanBayar"]');
            const paymentsToDelete = [];
            const paymentsToRecord = [];

            checkboxes.forEach(cb => {
                const paymentId = cb.dataset.paymentId;
                const paymentKey = cb.value; 
                const [idKelas, bulan] = paymentKey.split('|');
                const biaya = parseFloat(cb.dataset.owedAmount);

                if (cb.checked) {
                    if (!paymentId) {
                        paymentsToRecord.push({
                            idSiswa: idSiswa,
                            idKelas: idKelas,
                            bulan: bulan,
                            jumlah: biaya,
                            tglBayar: tglBayar
                        });
                    } 
                } else {
                    if (paymentId) {
                        paymentsToDelete.push(paymentId);
                    }
                }
            });

            // Proses penghapusan
            let deleteSuccess = true;
            if (paymentsToDelete.length > 0) {
                 for (const paymentId of paymentsToDelete) {
                     try {
                          await callApi('DELETE', 'pembayaran', { id: paymentId });
                     } catch (error) {
                          console.error(`Gagal menghapus pembayaran ${paymentId}:`, error);
                          deleteSuccess = false;
                          break;
                     }
                 }
            }
            
            if (!deleteSuccess) {
                 showToast('Gagal menghapus beberapa pembayaran. Coba lagi.', 'danger');
                 return;
            }

            // Proses penambahan pembayaran baru dengan UPLOAD (CODE BARU)
            if (paymentsToRecord.length > 0) {
                 // Gunakan FormData untuk mengirim file + data JSON
                 const formData = new FormData();
                 
                 // Masukkan data JSON pembayaran sebagai string di field 'data'
                 formData.append('data', JSON.stringify({ paymentsToRecord: paymentsToRecord }));
                 
                 // Jika ada file, masukkan ke FormData
                 if (fileBukti) {
                     formData.append('bukti', fileBukti);
                 }

                 // Panggil API dengan FormData
                 if (await callApi('POST', 'pembayaran', formData)) {
                     await handleSuccessfulOperation('Pembayaran berhasil diperbarui.');
                     // Reset input file
                     if(fileInput) fileInput.value = '';
                     closeModal('modalBayarSPP');
                     return;
                 }
            }
            
            if (paymentsToDelete.length > 0 && deleteSuccess) {
                 await handleSuccessfulOperation('Pilihan pembayaran berhasil diperbarui.');
                 if(fileInput) fileInput.value = '';
                 closeModal('modalBayarSPP');
                 return;
            }
            
            if (paymentsToRecord.length === 0 && paymentsToDelete.length === 0) {
                 showToast('Tidak ada perubahan pembayaran yang dilakukan.', 'info');
            }
            
            closeModal('modalBayarSPP');
        });
        
        // FIX 2: Tombol Hapus Semua Pembayaran
        document.getElementById('btnHapusSemuaPembayaran').addEventListener('click', async () => {
             const idSiswa = document.getElementById('bayarSiswaId').value;
             const siswa = db.siswa.find(s => s.id === idSiswa);
             if (!siswa) return;
             
             const statusData = getStudentPaymentStatus(idSiswa);
             const allPaymentIds = statusData.allPayments.map(p => p.id);
             
             if (allPaymentIds.length === 0) {
                 showToast('Siswa ini tidak memiliki riwayat pembayaran SPP.', 'warning');
                 return;
             }
             
             if (confirm(`PERINGATAN! Anda akan menghapus SEMUA ${allPaymentIds.length} riwayat pembayaran SPP untuk ${siswa.nama}. Lanjutkan?`)) {
                 // Gunakan API DELETE pembayaran massal
                 if (await callApi('DELETE', 'pembayaran', { ids: allPaymentIds })) {
                     await handleSuccessfulOperation('Semua riwayat pembayaran SPP siswa berhasil dihapus.');
                     closeModal('modalBayarSPP');
                 }
             }
        });


        // --- Logika Cetak Bukti (PDF) (Multi-Class) ---
        const generateBuktiPembayaran = (idSiswa) => {
            const siswa = db.siswa.find(s => s.id === idSiswa);
            if (!siswa) return;

            const identitas = db.identitas;
            const statusData = getStatusPembayaranSiswa(idSiswa);
            const activeClasses = getStudentActiveClasses(idSiswa);
            const allKelasNames = activeClasses.map(cls => cls.namaKelas).join(', ');


            // Filter pembayaran yang sudah tercatat
            const pembayaranTerkait = db.pembayaran
                .filter(p => p.idSiswa === idSiswa)
                .sort((a, b) => new Date(a.tglBayar) - new Date(b.tglBayar));

            const tableDataRiwayat = pembayaranTerkait.map(p => [
                formatTanggal(p.tglBayar),
                `SPP Bulan ${formatBulanTahun(p.bulan)} - ${getKelas(p.idKelasSPP || p.idKelas)?.nama || 'N/A'}`,
                formatRupiah(p.jumlah),
            ]);
            
            // Total lunas
            const totalLunas = pembayaranTerkait.reduce((sum, p) => sum + p.jumlah, 0);

            try {
                // Ubah format A5 ke A4 dan atur margin
                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); 
                doc.setFont('Helvetica');
                const marginLeft = 20;
                const marginRight = 20;
                const docWidth = doc.internal.pageSize.getWidth();
                const textCenter = docWidth / 2;

                // Judul dan Header
                doc.setFontSize(16);
                doc.setTextColor(50);
                doc.text(`BUKTI PEMBAYARAN SPP`, textCenter, 20, null, null, 'center');
                doc.setFontSize(12);
                doc.text(identitas.nama || 'Ma\'had Anda', textCenter, 26, null, null, 'center');
                doc.setFontSize(10);
                doc.text(identitas.alamat || 'Alamat Ma\'had', textCenter, 31, null, null, 'center');

                // Data Siswa
                doc.setFontSize(10);
                doc.text(`Nama Siswa: ${siswa.nama}`, marginLeft, 45);
                doc.text(`NIS: ${siswa.nis}`, marginLeft, 50);
                doc.text(`Kelas Aktif: ${allKelasNames}`, marginLeft, 55);
                doc.text(`Status Pembayaran: ${statusData.persentase}% (${statusData.paidMonthsCount} dari ${statusData.requiredMonthsCount} Bulan)`, marginLeft, 60); // NEW: Menampilkan persentase
                doc.text(`Total Tunggakan Keseluruhan (Jatuh Tempo): ${formatRupiah(statusData.totalTunggakan)}`, marginLeft, 65);


                let finalY = 70;

                // --- TABEL: Riwayat Pembayaran (Semua Transaksi) ---
                doc.setFontSize(12);
                doc.text('Riwayat Transaksi Pembayaran', marginLeft, finalY + 10);
                finalY += 10;

                doc.autoTable({
                    startY: finalY + 5,
                    head: [['Tanggal Bayar', 'Keterangan', 'Jumlah']],
                    body: tableDataRiwayat,
                    theme: 'grid',
                    headStyles: { fillColor: [13, 110, 253], textColor: 255, fontStyle: 'bold' },
                    columnStyles: {
                        2: { halign: 'right' }
                    },
                    margin: { left: marginLeft, right: marginRight },
                    didParseCell: (data) => {
                        // Tambahkan baris baru jika konten terlalu panjang
                        if (data.section === 'body' && data.column.index === 1 && data.cell.text.length > 1) {
                            data.cell.styles.cellWidth = 'auto'; // Auto-adjust width for multi-line content
                        }
                    }
                });

                finalY = doc.autoTable.previous.finalY;
                
                // Total Pembayaran
                doc.setFontSize(10);
                doc.setFont('Helvetica', 'bold');
                doc.text('TOTAL PEMBAYARAN (Riwayat Transaksi): ', docWidth - marginRight - 30, finalY + 5, null, null, 'right');
                doc.text(formatRupiah(totalLunas), docWidth - marginRight, finalY + 5, null, null, 'right');
                doc.setFont('Helvetica', 'normal');
                
                finalY += 10;
                
                // --- TABEL 2: Rincian Status SPP per Kelas (Multi-Class) ---
                doc.setFontSize(12);
                doc.text('Rincian Status Kewajiban SPP per Kelas', marginLeft, finalY + 10);
                finalY += 15;
                
                // Dapatkan data status per kelas yang diformat
                const classRincian = formatRincianSPP(statusData.classStatus, 'pdf');
                
                // Gunakan autoTable.previous.finalY untuk melacak posisi
                let startYKelas = finalY;

                classRincian.forEach((classStat, index) => {
                    const pageHeight = doc.internal.pageSize.getHeight();
                    const requiredSpace = 60; // Perkiraan ruang untuk satu kelas + TTD/Footer

                    // Jika ruang tidak cukup di halaman ini, buat halaman baru
                    if (startYKelas + requiredSpace > pageHeight - 30) { 
                        doc.addPage();
                        startYKelas = 20; // Mulai di atas halaman baru
                    }

                    const bulanWajibText = classStat.bulanWajib.map(formatBulanTahun).join(', ') || '-';
                    const bulanLunasText = classStat.bulanLunas.map(formatBulanTahun).join(', ') || '-';
                    const bulanTunggakanText = classStat.bulanTunggakan.map(formatBulanTahun).join(', ') || '-';

                    // Sub-header kelas
                    doc.setFontSize(10);
                    doc.setFont('Helvetica', 'bold');
                    doc.text(`${classStat.namaKelas} (Biaya: ${formatRupiah(classStat.biaya)}/bln)`, marginLeft, startYKelas);
                    doc.setFont('Helvetica', 'normal');
                    
                    const classBody = [
                        ['Bln Wajib Bayar', classStat.bulanWajib.length, bulanWajibText],
                        ['Bln Sudah Bayar', classStat.bulanLunas.length, bulanLunasText],
                        ['Bln Belum Bayar (Jatuh Tempo)', classStat.bulanTunggakan.length, bulanTunggakanText]
                    ];

                    doc.autoTable({
                        startY: startYKelas + 3,
                        head: [['Keterangan', 'Jml Bulan', 'Bulan']],
                        body: classBody,
                        theme: 'plain',
                        margin: { left: marginLeft, right: marginRight },
                        styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' },
                        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
                        columnStyles: { 
                            0: { fontStyle: 'bold', cellWidth: 40 },
                            1: { halign: 'center', cellWidth: 15 },
                            2: { cellWidth: docWidth - 40 - 15 - (marginLeft + marginRight) - 1 }
                        }
                    });
                    
                    startYKelas = doc.autoTable.previous.finalY;
                    doc.setFontSize(10);
                    doc.setFont('Helvetica', 'bold');
                    doc.setTextColor(getCssVar('--danger-color').replace('#', '')); // Warna merah
                    doc.text(`Total Tunggakan (Jatuh Tempo) untuk ${classStat.namaKelas}: ${formatRupiah(classStat.totalTunggakan)}`, marginLeft, startYKelas + 5);
                    doc.setFont('Helvetica', 'normal');
                    doc.setTextColor(50); // Reset warna teks
                    startYKelas += 10; // Jarak antar kelas
                });
                
                finalY = startYKelas + 5; // Posisi akhir setelah semua tabel

                // Tambahkan halaman baru jika perlu untuk TTD
                const pageHeight = doc.internal.pageSize.getHeight();
                if (finalY + 30 > pageHeight) {
                    doc.addPage();
                    finalY = 20;
                }

                // Tanda Tangan
                doc.setFontSize(10);
                doc.setTextColor(50);
                doc.text(`Dicetak pada: ${formatTanggal(new Date().toISOString())}`, marginLeft, finalY + 10);
                doc.text(`Bendahara,`, docWidth - marginRight - 30, finalY + 10);
                doc.text(identitas.bendahara || 'Ustadz Fulanah', docWidth - marginRight - 30, finalY + 30);


                doc.save(`bukti_spp_${siswa.nis}_${siswa.nama}.pdf`);

            } catch (error) {
                console.error("Gagal membuat PDF:", error);
                if (error instanceof TypeError && error.message.includes("doc.autoTable is not a function")) {
                     showToast("Gagal membuat PDF: Plugin autoTable sepertinya gagal dimuat.", "danger");
                } else {
                     showToast("Gagal membuat PDF. Periksa konsol untuk error.", "danger");
                }
            }
        };

        // --- Logika WA Siswa (Multi-Class) ---
        const handleWASiswa = (idSiswa) => {
            const siswa = db.siswa.find(s => s.id === idSiswa);
            if (!siswa || !siswa.wa) {
                showToast('Nomor WhatsApp siswa tidak ditemukan.', 'warning');
                return;
            }

            const statusData = getStatusPembayaranSiswa(idSiswa); 
            const activeClasses = getStudentActiveClasses(idSiswa);
            const identitas = db.identitas;

            const kesanggupanText = (siswa.kesanggupanBayar === 'sekaligus') ? 'Sekaligus' : 'Cicil per Bulan';
            
            // Rincian SPP per kelas (WA format)
            const rincianPerKelas = formatRincianSPP(statusData.classStatus, 'wa');

            // Daftar Wali Kelas
            const waliKelasNames = activeClasses.map(cls => {
                const kls = getKelas(cls.idKelas);
                return kls ? kls.waliKelas : 'N/A';
            }).filter((v, i, a) => a.indexOf(v) === i).join(', ');
            
            // Daftar semua kelas aktif
            const allKelasNames = activeClasses.map(cls => cls.namaKelas).join(', ');
            
            // Total tunggakan dari statusData
            const totalTunggakanRupiah = formatRupiah(statusData.totalTunggakan);

            // --- Pembentukan Pesan Lengkap ---
            // Gunakan template dari broadcastMessage jika ada, kalau tidak pakai default
            let templatePesan = broadcastMessage.value || 
            `Assalamu'alaikum Wr. Wb.

Yth. Wali Santri/Santriwati {nama} ({nis})
            
Kami dari {mahad_nama} ingin menginformasikan status pembayaran SPP ananda.

*--- Status Santri ---*
*Nama:* {nama}
*NIS:* {nis}
*Kelas Aktif:* {kelas}
*Wali Kelas:* {wali_kelas}
*Kesanggupan Bayar:* {kesanggupan_bayar}

*--- Rincian SPP per Kelas ---*
{rincian_spp_kelas}

*Total Tunggakan Keseluruhan (Jatuh Tempo):* *{total_tunggakan_rupiah}*

Mohon untuk segera menyelesaikan pembayaran bulan ini.
Jika sudah melakukan pembayaran, mohon abaikan pesan ini.

Terima kasih atas perhatiannya.
Wassalamu'alaikum Wr. Wb.

{bendahara} - Bendahara {mahad_nama}`;


             let pesan = templatePesan
                .replace(/{mahad_nama}/g, identitas.nama || 'Ma\'had Anda')
                .replace(/{bendahara}/g, identitas.bendahara || 'Bendahara')
                .replace(/{nama}/g, siswa.nama)
                .replace(/{nis}/g, siswa.nis)
                .replace(/{kelas}/g, allKelasNames)
                .replace(/{wali_kelas}/g, waliKelasNames)
                .replace(/{kesanggupan_bayar}/g, kesanggupanText)
                .replace(/{total_tunggakan_rupiah}/g, totalTunggakanRupiah)
                // NEW VARS
                .replace(/{rincian_spp_kelas}/g, rincianPerKelas || 'Tidak ada kewajiban SPP.')
                .replace(/{rincian_tunggakan}/g, "Dihapus. Gunakan {rincian_spp_kelas} untuk detail.") // Deprecated/Removed
                .replace(/{bulan_lunas}/g, "Dihapus. Gunakan {rincian_spp_kelas} untuk detail."); // Deprecated/Removed

            // Perbaikan: Encode pesan, lalu ganti line break (\n) dengan %0A
            let waNumber = siswa.wa;
            if (waNumber && waNumber.startsWith('0')) {
                waNumber = '62' + waNumber.substring(1);
            }
            const encodedPesan = encodeURIComponent(pesan).replace(/%0A/g, '%0D%0A');
            const waLink = `https://wa.me/${waNumber}?text=${encodedPesan}`;

            window.open(waLink, '_blank');
        };

        const generateBroadcastList = () => {
            const kategori = broadcastFilterKategori.value;
            const idKelas = broadcastFilterKelas.value;
            const todayMonthYear = TODAY_MONTH_YEAR;
            
            let filteredList = [];

            db.siswa.forEach(siswa => {
                const statusData = getStatusPembayaranSiswa(siswa.id);
                const hasTunggakan = statusData.totalTunggakan > 0;
                // Status Lunas Penuh: Persentase 100%
                const isFullyPaid = statusData.persentase >= 100;
                
                // Cek Kelas (semua kategori kecuali 'semua' dan 'penagihan-aktif' akan menggunakan filter internal)
                if (kategori === 'per-kelas' && (!siswa.idKelas || !siswa.idKelas.includes(idKelas))) {
                    return; 
                }
                
                // Cek Kelas (penagihan-aktif: siswa yang punya SPP di bulan ini DAN belum lunas)
                let include = false;
                
                switch (kategori) {
                    case 'semua':
                        include = true;
                        break;
                    case 'per-kelas': // Sudah difilter di atas
                        include = true; 
                        break;
                    case 'belum-bayar':
                         // Siswa yang memiliki tunggakan jatuh tempo
                        include = hasTunggakan;
                        break;
                    case 'sudah-bayar':
                         // Siswa yang LUNAS PENUH
                         include = isFullyPaid;
                         break;
                    case 'penagihan-aktif':
                        // Siswa yang punya kewajiban di bulan ini DAN belum lunas untuk bulan tersebut di salah satu kelasnya
                        const owesThisMonth = Object.values(statusData.classStatus).some(classStat => 
                             classStat.requiredMonths.includes(todayMonthYear) && !classStat.paidMonths.includes(todayMonthYear)
                        );
                        
                        include = owesThisMonth;
                        break;
                }
                
                if (include) {
                    filteredList.push({ siswa, statusData });
                }
            });
            
            renderBroadcastTable(filteredList);
        };
        
        const renderBroadcastTable = (siswaList) => {
            tabelBroadcast.innerHTML = '';
            broadcastListContainer.classList.remove('hidden');
            
            if (siswaList.length === 0) {
                 tabelBroadcast.innerHTML = '<tr><td colspan="4" style="text-align: center;">Tidak ada penerima yang cocok dengan filter.</td></tr>';
                 return;
            }

            siswaList.forEach(({ siswa, statusData }) => {
                 const activeClasses = getStudentActiveClasses(siswa.id);
                 const identitas = db.identitas;
                 
                 const kesanggupanText = (siswa.kesanggupanBayar === 'sekaligus') ? 'Sekaligus' : 'Cicil per Bulan';
                 
                 // Daftar Wali Kelas
                 const waliKelasNames = activeClasses.map(cls => {
                    const kls = getKelas(cls.idKelas);
                    return kls ? kls.waliKelas : 'N/A';
                 }).filter((v, i, a) => a.indexOf(v) === i).join(', ');
                 
                 // Daftar semua kelas aktif
                 const allKelasNames = activeClasses.map(cls => cls.namaKelas).join(', ');
                 
                 // Rincian SPP per kelas (WA format)
                 const rincianPerKelas = formatRincianSPP(statusData.classStatus, 'wa');
                 
                 const totalTunggakanRupiah = formatRupiah(statusData.totalTunggakan);

                 // Siapkan pesan yang akan di-encode
                 let rawMessage = broadcastMessage.value;
                 
                 // Isi variabel
                 rawMessage = rawMessage
                    .replace(/{mahad_nama}/g, identitas.nama || 'Ma\'had Anda')
                    .replace(/{bendahara}/g, identitas.bendahara || 'Bendahara')
                    .replace(/{nama}/g, siswa.nama)
                    .replace(/{nis}/g, siswa.nis)
                    .replace(/{kelas}/g, allKelasNames)
                    .replace(/{wali_kelas}/g, waliKelasNames)
                    .replace(/{kesanggupan_bayar}/g, kesanggupanText)
                    .replace(/{total_tunggakan_rupiah}/g, totalTunggakanRupiah)
                    // NEW VARS
                    .replace(/{rincian_spp_kelas}/g, rincianPerKelas || 'Tidak ada kewajiban SPP.')
                    .replace(/{rincian_tunggakan}/g, "Dihapus. Gunakan {rincian_spp_kelas} untuk detail.") // Deprecated/Removed
                    .replace(/{bulan_lunas}/g, "Dihapus. Gunakan {rincian_spp_kelas} untuk detail."); // Deprecated/Removed


                 // Perbaikan: Pastikan nomor WA dimulai dengan 62
                 let waNumber = siswa.wa;
                 if (waNumber && waNumber.startsWith('0')) {
                    waNumber = '62' + waNumber.substring(1);
                 }
                 
                 const encodedPesan = encodeURIComponent(rawMessage).replace(/%0A/g, '%0D%0A');
                 const waLink = `https://wa.me/${waNumber}?text=${encodedPesan}`;

                 const tr = document.createElement('tr');
                 tr.innerHTML = `
                    <td>${escapeHtml(siswa.nama)} <br><span class="text-small" style="color: ${statusData.totalTunggakan > 0 ? getCssVar('--danger-color') : getCssVar('--success-color')};">${statusData.persentase}% Lunas, ${statusData.totalTunggakan > 0 ? totalTunggakanRupiah + ' Tunggakan' : 'Tidak Ada Tunggakan Jatuh Tempo'}</span></td>
                    <td>${escapeHtml(siswa.wa || '-')}</td>
                    <td><textarea rows="3" class="form-control" readonly style="font-size: 0.8rem; overflow: auto;">${escapeHtml(rawMessage)}</textarea></td>
                    <td><a href="${waLink}" target="_blank" class="btn btn-success btn-sm" ${!siswa.wa ? 'disabled' : ''}><i class="fa-brands fa-whatsapp"></i> Kirim</a></td>
                 `;
                 tabelBroadcast.appendChild(tr);
            });
        };

        // =========================================================================
        // Halaman: Pemasukan Lain (Fixes for Problem 1)
        // =========================================================================
        const tabelPemasukanLain = document.getElementById('tabelPemasukanLain');
        const btnTambahPemasukanLain = document.getElementById('btnTambahPemasukanLain');
        const formPemasukanLain = document.getElementById('formPemasukanLain');
        const pemasukanLainId = document.getElementById('pemasukanLainId');
        const pemasukanLainTanggal = document.getElementById('pemasukanLainTanggal');
        const pemasukanLainKeterangan = document.getElementById('pemasukanLainKeterangan');
        const pemasukanLainJumlah = document.getElementById('pemasukanLainJumlah');

        // FIX 1: Render Pemasukan Lain (Implementasi Penuh)
        const renderPemasukanLain = () => {
            tabelPemasukanLain.innerHTML = "";
            // Sortir berdasarkan tanggal terbaru
            const pemasukanSorted = [...db.pemasukanLain].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

            if (pemasukanSorted.length === 0) {
                tabelPemasukanLain.innerHTML = '<tr><td colspan="4" style="text-align: center;">Belum ada data pemasukan lain.</td></tr>';
                return;
            }
            pemasukanSorted.forEach(item => {
                const tr = document.createElement('tr');
                // Pastikan data tanggal ada sebelum format
                const tanggal = item.tanggal ? item.tanggal.substring(0, 10) : ''; 
                tr.innerHTML = `
                    <td>${formatTanggal(tanggal)}</td>
                    <td>${escapeHtml(item.keterangan)}</td>
                    <td>${formatRupiah(item.jumlah)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-warning btn-sm btn-edit-pemasukan" data-id="${item.id}"><i class="fa-solid fa-edit"></i> Edit</button>
                            <button class="btn btn-danger btn-sm btn-hapus-pemasukan" data-id="${item.id}"><i class="fa-solid fa-trash"></i> Hapus</button>
                        </div>
                    </td>
                `;
                tabelPemasukanLain.appendChild(tr);
            });
        };

        btnTambahPemasukanLain.addEventListener('click', () => {
            formPemasukanLain.reset();
            pemasukanLainId.value = "";
            document.getElementById('modalPemasukanLainTitle').textContent = "Tambah Pemasukan Lain";
            // Isi tanggal hari ini secara default
            pemasukanLainTanggal.value = new Date().toISOString().substring(0, 10);
            showModal('modalPemasukanLain');
        });

        // FIX 1: Form Submit Pemasukan Lain (Menggunakan callApi POST/PUT)
        formPemasukanLain.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = pemasukanLainId.value;
            const tanggal = pemasukanLainTanggal.value;
            const keterangan = pemasukanLainKeterangan.value;
            const jumlah = parseFloat(pemasukanLainJumlah.value);

            if (jumlah <= 0) {
                 showToast('Jumlah harus lebih dari 0.', 'danger');
                 return;
            }

            let data;
            if (id) { data = { id, tanggal, keterangan, jumlah }; } 
            // Tambahkan createdAt untuk konsistensi, walau tidak digunakan di backend
            else { data = { id: uuid(), tanggal, keterangan, jumlah, createdAt: new Date().toISOString() }; } 

            // Endpoint di API adalah 'pemasukan-lain'
            if (await callApi(id ? 'PUT' : 'POST', 'pemasukan-lain', data)) {
                await handleSuccessfulOperation(`Pemasukan berhasil di${id ? 'perbarui' : 'tambahkan'}.`);
                closeModal('modalPemasukanLain');
            }
        });

        // FIX 1: Edit dan Hapus Pemasukan Lain (Menggunakan callApi DELETE)
        tabelPemasukanLain.addEventListener('click', async (e) => {
            const btnEdit = e.target.closest('.btn-edit-pemasukan');
            const btnHapus = e.target.closest('.btn-hapus-pemasukan');

            if (btnEdit) {
                const id = btnEdit.dataset.id;
                const item = db.pemasukanLain.find(i => i.id === id);
                if (item) {
                    pemasukanLainId.value = item.id;
                    // Pastikan format tanggal untuk input type="date"
                    pemasukanLainTanggal.value = item.tanggal ? item.tanggal.substring(0, 10) : new Date().toISOString().substring(0, 10); 
                    pemasukanLainKeterangan.value = item.keterangan;
                    pemasukanLainJumlah.value = item.jumlah;
                    document.getElementById('modalPemasukanLainTitle').textContent = "Edit Pemasukan Lain";
                    showModal('modalPemasukanLain');
                }
            }

            if (btnHapus) {
                const id = btnHapus.dataset.id;
                if (confirm('Apakah Anda yakin ingin menghapus data pemasukan ini?')) {
                    // Endpoint di API adalah 'pemasukan-lain'
                    if (await callApi('DELETE', 'pemasukan-lain', { id })) {
                        await handleSuccessfulOperation('Pemasukan berhasil dihapus.');
                    }
                }
            }
        });

        // =========================================================================
        // Halaman: Pengeluaran (New)
        // =========================================================================
        const tabelPengeluaran = document.getElementById('tabelPengeluaran');
        const btnTambahPengeluaran = document.getElementById('btnTambahPengeluaran');
        const formPengeluaran = document.getElementById('formPengeluaran');
        const pengeluaranId = document.getElementById('pengeluaranId');
        const pengeluaranTanggal = document.getElementById('pengeluaranTanggal');
        const pengeluaranKeterangan = document.getElementById('pengeluaranKeterangan');
        const pengeluaranJumlah = document.getElementById('pengeluaranJumlah');

        const renderPengeluaran = () => {
            tabelPengeluaran.innerHTML = "";
            if (db.pengeluaran.length === 0) {
                tabelPengeluaran.innerHTML = '<tr><td colspan="4" style="text-align: center;">Belum ada data pengeluaran.</td></tr>';
                return;
            }
            db.pengeluaran.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)).forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatTanggal(item.tanggal)}</td>
                    <td>${escapeHtml(item.keterangan)}</td>
                    <td>${formatRupiah(item.jumlah)}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-warning btn-sm btn-edit-pengeluaran" data-id="${item.id}"><i class="fa-solid fa-edit"></i> Edit</button>
                            <button class="btn btn-danger btn-sm btn-hapus-pengeluaran" data-id="${item.id}"><i class="fa-solid fa-trash"></i> Hapus</button>
                        </div>
                    </td>
                `;
                tabelPengeluaran.appendChild(tr);
            });
        };

        btnTambahPengeluaran.addEventListener('click', () => {
            formPengeluaran.reset();
            pengeluaranId.value = "";
            document.getElementById('modalPengeluaranTitle').textContent = "Tambah Pengeluaran Baru";
            // Isi tanggal hari ini secara default
            pengeluaranTanggal.value = new Date().toISOString().substring(0, 10);
            showModal('modalPengeluaran');
        });

        formPengeluaran.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = pengeluaranId.value;
            const tanggal = pengeluaranTanggal.value;
            const keterangan = pengeluaranKeterangan.value;
            const jumlah = parseFloat(pengeluaranJumlah.value);
            
             if (jumlah <= 0) {
                 showToast('Jumlah harus lebih dari 0.', 'danger');
                 return;
            }

            let data;
            if (id) { data = { id, tanggal, keterangan, jumlah }; } 
            else { data = { id: uuid(), tanggal, keterangan, jumlah, createdAt: new Date().toISOString() }; }

            if (await callApi(id ? 'PUT' : 'POST', 'pengeluaran', data)) {
                await handleSuccessfulOperation(`Pengeluaran berhasil di${id ? 'perbarui' : 'tambahkan'}.`);
                closeModal('modalPengeluaran');
            }
        });

        tabelPengeluaran.addEventListener('click', async (e) => {
            const btnEdit = e.target.closest('.btn-edit-pengeluaran');
            const btnHapus = e.target.closest('.btn-hapus-pengeluaran');

            if (btnEdit) {
                const id = btnEdit.dataset.id;
                const item = db.pengeluaran.find(i => i.id === id);
                if (item) {
                    pengeluaranId.value = item.id;
                    pengeluaranTanggal.value = item.tanggal;
                    pengeluaranKeterangan.value = item.keterangan;
                    pengeluaranJumlah.value = item.jumlah;
                    document.getElementById('modalPengeluaranTitle').textContent = "Edit Pengeluaran";
                    showModal('modalPengeluaran');
                }
            }

            if (btnHapus) {
                const id = btnHapus.dataset.id;
                if (confirm('Apakah Anda yakin ingin menghapus data pengeluaran ini?')) {
                    if (await callApi('DELETE', 'pengeluaran', { id })) {
                        await handleSuccessfulOperation('Pengeluaran berhasil dihapus.');
                    }
                }
            }
        });

        // =========================================================================
        // Halaman: Dashboard (New)
        // =========================================================================

        const populateDashboardFilters = () => {
            const dashFilterJurusan = document.getElementById('dashFilterJurusan');
            const dashFilterKelas = document.getElementById('dashFilterKelas');

            // Jurusan
            dashFilterJurusan.innerHTML = '<option value="">Semua Jurusan</option>';
            db.jurusan.forEach(j => {
                const option = document.createElement('option');
                option.value = j.id;
                option.textContent = j.nama;
                dashFilterJurusan.appendChild(option);
            });
            dashFilterJurusan.value = dashFilter.jurusan;


            // Kelas
            dashFilterKelas.innerHTML = '<option value="">Semua Kelas</option>';
            db.kelas.forEach(k => {
                // Filter kelas yang ditampilkan berdasarkan jurusan yang dipilih
                if (!dashFilter.jurusan || k.idJurusan === dashFilter.jurusan) {
                    const option = document.createElement('option');
                    option.value = k.id;
                    option.textContent = k.nama;
                    dashFilterKelas.appendChild(option);
                }
            });
            dashFilterKelas.value = dashFilter.kelas;

            // Status
            document.getElementById('dashFilterStatus').value = dashFilter.status;

        };
        
        // Event Listener untuk filter Dashboard
        document.getElementById('dashFilterJurusan').addEventListener('change', (e) => {
            dashFilter.jurusan = e.target.value;
            // Reset kelas filter dan populate ulang
            dashFilter.kelas = '';
            populateDashboardFilters(); 
        });

        document.getElementById('applyDashFilter').addEventListener('click', () => {
             dashFilter.kelas = document.getElementById('dashFilterKelas').value;
             dashFilter.status = document.getElementById('dashFilterStatus').value;
             renderDashboard();
        });


        const renderDashboard = () => {
            const filteredSiswa = db.siswa.filter(siswa => {
                const statusData = getStatusPembayaranSiswa(siswa.id);
                
                // Cek apakah siswa memiliki setidaknya satu kelas yang jurusan/kelasnya sesuai filter dashboard
                let isRelevant = false;
                
                if (siswa.idKelas && siswa.idKelas.length > 0) {
                    for (const idKelas of siswa.idKelas) {
                        const kls = getKelas(idKelas);
                        if (!kls) continue;
                        
                        const matchJurusan = !dashFilter.jurusan || kls.idJurusan === dashFilter.jurusan;
                        const matchKelas = !dashFilter.kelas || kls.id === dashFilter.kelas;

                        if (matchJurusan && matchKelas) {
                            isRelevant = true;
                            break;
                        }
                    }
                }

                // Filter Status: Menggunakan status 100% lunas
                const matchStatus = dashFilter.status === '' || statusData.status === dashFilter.status;

                return isRelevant && matchStatus;
            });
            
            // --- 1. Hitung Statistik Finansial ---
            
            let totalSiswa = filteredSiswa.length;
            let totalSppMasukBulanIni = 0;
            let totalSppMasukKeseluruhan = 0;
            // REVISI 2: Potensi Pemasukan = Total Kewajiban SPP (semua periode)
            let totalPotensiPemasukan = 0; 
            
            // Lakukan iterasi hanya pada siswa yang sudah difilter
            filteredSiswa.forEach(siswa => {
                const statusData = getStatusPembayaranSiswa(siswa.id); 
                
                // REVISI 2: Ambil total kewajiban SPP untuk dashboard
                // Penting: Harus menggunakan total kewajiban SPP untuk siswa yang relevan (sudah difilter)
                totalPotensiPemasukan += statusData.totalKewajibanSPP;
                
                // Hitung SPP Masuk total
                db.pembayaran.filter(p => p.idSiswa === siswa.id).forEach(p => {
                    // Cek apakah pembayaran terkait dengan kelas yang ada di filter
                    const idKelasDibayar = p.idKelasSPP || p.idKelas;
                    const isPaymentRelevant = siswa.idKelas && siswa.idKelas.includes(idKelasDibayar);

                    if (isPaymentRelevant) {
                        totalSppMasukKeseluruhan += p.jumlah;
                        // Cek apakah pembayaran dilakukan di bulan ini
                        if (p.tglBayar.substring(0, 7) === TODAY_MONTH_YEAR) {
                            totalSppMasukBulanIni += p.jumlah;
                        }
                    }
                });
            });

            // FIX 1: Perhitungan Pemasukan Lain dan Pengeluaran (sudah benar, tapi cek ulang)
            const totalPemasukanLain = db.pemasukanLain.reduce((sum, item) => sum + item.jumlah, 0);
            const totalPengeluaran = db.pengeluaran.reduce((sum, item) => sum + item.jumlah, 0);
            const pengeluaranBulanIni = db.pengeluaran.filter(item => 
                 item.tanggal.substring(0, 7) === TODAY_MONTH_YEAR
            ).reduce((sum, item) => sum + item.jumlah, 0);

            // Hitung Saldo
            const totalSaldo = totalSppMasukKeseluruhan + totalPemasukanLain - totalPengeluaran;


            // --- 2. Update Kartu Statistik ---
            document.getElementById('statTotalSiswa').textContent = totalSiswa;
            document.getElementById('statSppMasuk').textContent = formatRupiahShort(totalSppMasukBulanIni);
            document.getElementById('statTotalSppMasuk').textContent = formatRupiahShort(totalSppMasukKeseluruhan);
            // REVISI 2: Gunakan totalKewajibanSPP
            document.getElementById('statPotensiPemasukan').textContent = formatRupiahShort(totalPotensiPemasukan);
            // FIX 1: Pemasukan Lain harus muncul
            document.getElementById('statPemasukanLain').textContent = formatRupiahShort(totalPemasukanLain);
            document.getElementById('statPengeluaranBulanIni').textContent = formatRupiahShort(pengeluaranBulanIni);
            document.getElementById('statTotalPengeluaran').textContent = formatRupiahShort(totalPengeluaran);
            document.getElementById('statTotalSaldo').textContent = formatRupiahShort(totalSaldo);


            // --- 3. Hitung Data Chart Status Pembayaran ---
            let lunasCount = 0;
            let belumLunasCount = 0;
            
            filteredSiswa.forEach(siswa => {
                // Gunakan status 100% lunas untuk chart
                const persentase = getStatusPembayaranSiswa(siswa.id).persentase;
                if (persentase >= 100) {
                    lunasCount++;
                } else {
                    belumLunasCount++;
                }
            });

            // --- 4. Hitung Data Chart Gender ---
            let lakiLakiCount = filteredSiswa.filter(s => s.gender === 'Laki-laki').length;
            let perempuanCount = filteredSiswa.filter(s => s.gender === 'Perempuan').length;
            
            // --- 5. Render Charts ---

            // Chart Status Pembayaran
            renderPieChart('chartStatusPembayaran', chartStatusPembayaran, 'Status Pembayaran SPP', [lunasCount, belumLunasCount], ['Lunas Penuh', 'Belum Lunas'], [getCssVar('--success-color'), getCssVar('--danger-color')]);
            
            // Chart Gender
            renderPieChart('chartGender', chartGender, 'Siswa Berdasarkan Gender', [lakiLakiCount, perempuanCount], ['Laki-laki', 'Perempuan'], [getCssVar('--stat-blue-bg'), getCssVar('--stat-red-bg')]);
        };
        
        /**
         * Fungsi generik untuk merender/memperbarui Chart Donut/Pie
         */
        const renderPieChart = (canvasId, chartInstance, title, data, labels, colors) => {
            const canvasEl = document.getElementById(canvasId);
            if (!canvasEl) return null;
            
            // Hancurkan instance lama jika ada
            if (chartInstance) {
                chartInstance.destroy();
            }

            const total = data.reduce((sum, val) => sum + val, 0);

            // Jika total 0, tampilkan chart kosong
            if (total === 0) {
                 data = [1];
                 labels = ['Tidak Ada Data'];
                 colors = ['#ced4da'];
            }


            const newChart = new Chart(canvasEl, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: getCssVar('--card-bg'),
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { size: 14, family: getCssVar('--text-color') }
                            }
                        },
                        title: {
                            display: false,
                            text: title
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed;
                                    const percentage = total === 0 ? '0%' : ((value / total) * 100).toFixed(1) + '%';
                                    return `${label}: ${value} (${percentage})`;
                                }
                            }
                        },
                        datalabels: {
                            color: getCssVar('--text-light'),
                            formatter: (value, context) => {
                                if (total === 0) return '';
                                const percentage = ((value / total) * 100).toFixed(0);
                                return percentage > 5 ? percentage + '%' : ''; // Hanya tampilkan jika > 5%
                            },
                            font: { weight: 'bold' }
                        }
                    }
                }
            });
            
            // Simpan instance chart ke variabel global yang sesuai
            if (canvasId === 'chartStatusPembayaran') {
                chartStatusPembayaran = newChart;
            } else if (canvasId === 'chartGender') {
                chartGender = newChart;
            }
            return newChart;
        };


        // =========================================================================
        // Halaman: Broadcast WA (New)
        // =========================================================================
        const broadcastFilterKategori = document.getElementById('broadcastFilterKategori');
        const broadcastFilterKelas = document.getElementById('broadcastFilterKelas');
        const btnGenerateBroadcastList = document.getElementById('btnGenerateBroadcastList');
        const broadcastListContainer = document.getElementById('broadcastListContainer');
        const tabelBroadcast = document.getElementById('tabelBroadcast');
        const broadcastMessage = document.getElementById('broadcastMessage');

        const renderBroadcast = () => {
            // Isi dropdown kelas
            broadcastFilterKelas.innerHTML = '<option value="">Pilih Kelas</option>';
            db.kelas.forEach(kls => {
                const option = document.createElement('option');
                option.value = kls.id;
                option.textContent = kls.nama;
                broadcastFilterKelas.appendChild(option);
            });
            
            // Atur visibility filter kelas
            broadcastFilterKelas.classList.add('hidden');
            
            // Reset tabel
            broadcastListContainer.classList.add('hidden');
            tabelBroadcast.innerHTML = '';
        };

        broadcastFilterKategori.addEventListener('change', (e) => {
            const kategori = e.target.value;
            if (kategori === 'per-kelas') {
                broadcastFilterKelas.classList.remove('hidden');
            } else {
                broadcastFilterKelas.classList.add('hidden');
                broadcastFilterKelas.value = '';
            }
            
            // Set default message (Template pesan yang diperbarui)
            const defaultTemplate = `Assalamu'alaikum Wr. Wb.

Yth. Wali Santri/Santriwati {nama} ({nis})
            
Kami dari {mahad_nama} ingin menginformasikan status pembayaran SPP ananda.

*--- Status Santri ---*
*Nama:* {nama}
*NIS:* {nis}
*Kelas Aktif:* {kelas}
*Wali Kelas:* {wali_kelas}
*Kesanggupan Bayar:* {kesanggupan_bayar}

*--- Rincian SPP per Kelas ---*
{rincian_spp_kelas}

*Total Tunggakan Keseluruhan (Jatuh Tempo):* *{total_tunggakan_rupiah}*

Mohon untuk segera menyelesaikan pembayaran bulan ini.
Jika sudah melakukan pembayaran, mohon abaikan pesan ini.

Terima kasih atas perhatiannya.
Wassalamu'alaikum Wr. Wb.

{bendahara} - Bendahara {mahad_nama}`;

            broadcastMessage.value = defaultTemplate;
            
            // Sembunyikan daftar penerima saat filter berubah
            broadcastListContainer.classList.add('hidden');
        });

        btnGenerateBroadcastList.addEventListener('click', () => {
             generateBroadcastList();
        });

        // ... (Logika Import/Export) ...
        
        // =========================================================================
        // Halaman: Import / Export (New/Revised)
        // =========================================================================

        const initImportExport = () => {
             // Pasang event listener untuk unduh contoh CSV di halaman utama
            document.getElementById('btnUnduhContohCsv').removeEventListener('click', downloadExampleCsv);
            document.getElementById('btnUnduhContohCsv').addEventListener('click', downloadExampleCsv);
             
            // Pasang listener di modal Import Siswa (jika ada)
            const btnUnduhContohCsvDialog = document.getElementById('btnUnduhContohCsvDialog');
            if (btnUnduhContohCsvDialog) {
                btnUnduhContohCsvDialog.removeEventListener('click', downloadExampleCsv);
                btnUnduhContohCsvDialog.addEventListener('click', downloadExampleCsv);
            }

            // Pasang listener untuk reset data
            document.getElementById('btnResetData').addEventListener('click', handleResetData);
            
            // Pasang listener untuk Export
            document.getElementById('btnExportSiswaCsv').addEventListener('click', () => handleExport('siswa'));
            document.getElementById('btnExportPembayaranCsv').addEventListener('click', () => handleExport('pembayaran'));
            document.getElementById('btnExportAllJson').addEventListener('click', () => handleExport('all_json'));
            
            // Pasang listener untuk Import Siswa CSV
            document.getElementById('formImportSiswa').addEventListener('submit', handleImportSiswa);
            
            // Pasang listener untuk Import All JSON
            document.getElementById('formImportJson').addEventListener('submit', handleImportJson);

        };
        
        const handleResetData = async () => {
             if (confirm('PERINGATAN KERAS! Anda akan MENGHAPUS SEMUA DATA (siswa, jurusan, kelas, pembayaran, dll) dan meresetnya ke data default. Tindakan ini tidak dapat dibatalkan. Lanjutkan?')) {
                 if (await callApi('POST', 'reset-data')) {
                     await handleSuccessfulOperation('Semua data berhasil direset ke kondisi awal.');
                 }
             }
        };

        const handleExport = (type) => {
             if (type === 'all_json') {
                 // Clone db dan hapus data sensitif
                 const exportData = JSON.parse(JSON.stringify(db));
                 delete exportData.users;
                 
                 const jsonString = JSON.stringify(exportData, null, 2);
                 downloadFile(jsonString, 'aplikasi_spp_data.json', 'application/json');
                 showToast('Data JSON berhasil diekspor.', 'success');
                 return;
             }
             
             let dataToExport = [];
             let headers = [];
             let filename = '';
             
             if (type === 'siswa') {
                 // Export Siswa
                 headers = ["NIS", "Nama", "Kelas_Aktif", "Gender", "Kesanggupan_Bayar", "No_WhatsApp", "Email", "Total_Tunggakan"];
                 filename = 'data_siswa.csv';
                 dataToExport = db.siswa.map(s => {
                     const statusData = getStatusPembayaranSiswa(s.id);
                     return {
                         NIS: s.nis,
                         Nama: s.nama,
                         Kelas_Aktif: getSiswaKelasNames(s.idKelas),
                         Gender: s.gender,
                         Kesanggupan_Bayar: s.kesanggupanBayar,
                         No_WhatsApp: s.wa,
                         Email: s.email,
                         Total_Tunggakan: statusData.totalTunggakan
                     };
                 });
             } else if (type === 'pembayaran') {
                 // Export Pembayaran
                 headers = ["Tanggal_Bayar", "NIS_Siswa", "Nama_Siswa", "Kelas_SPP", "Bulan", "Jumlah"];
                 filename = 'data_pembayaran.csv';
                 
                 dataToExport = db.pembayaran.map(p => {
                     const siswa = db.siswa.find(s => s.id === p.idSiswa) || { nis: 'N/A', nama: 'N/A' };
                     const kelasNama = getKelas(p.idKelasSPP || p.idKelas)?.nama || 'N/A';
                     
                     return {
                         Tanggal_Bayar: p.tglBayar.substring(0, 10),
                         NIS_Siswa: siswa.nis,
                         Nama_Siswa: siswa.nama,
                         Kelas_SPP: kelasNama,
                         Bulan: p.bulan,
                         Jumlah: p.jumlah
                     };
                 });
             }
             
             if (dataToExport.length === 0) {
                 showToast('Tidak ada data yang dapat diekspor.', 'warning');
                 return;
             }

             const csv = Papa.unparse({ fields: headers, data: dataToExport });
             downloadFile(csv, filename, 'text/csv;charset=utf-8;');
             showToast(`Data ${type} berhasil diekspor.`, 'success');

        };
        
        const downloadFile = (content, filename, mimeType) => {
            const blob = new Blob([content], { type: mimeType });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        
        const handleImportSiswa = (e) => {
            e.preventDefault();
            const file = document.getElementById('importSiswaFile').files[0];
            if (!file) {
                 showToast('Pilih file CSV untuk diimport.', 'danger');
                 return;
            }

            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: async (results) => {
                    if (results.errors.length > 0) {
                        console.error("CSV Parsing Errors:", results.errors);
                        showToast(`Gagal membaca CSV: ${results.errors[0].message}`, 'danger');
                        return;
                    }
                    
                    const dataToImport = results.data;
                    if (dataToImport.length === 0) {
                         showToast('File CSV kosong.', 'danger');
                         return;
                    }

                    if (!confirm(`Anda akan mengimport ${dataToImport.length} baris data siswa. Data yang sudah ada (berdasarkan NIS) akan diperbarui. Lanjutkan?`)) {
                        return;
                    }
                    
                    try {
                        // Gunakan endpoint import-siswa yang menangani validasi dan update/insert
                        const result = await callApi('POST', 'import-siswa', dataToImport);
                        if (result.success) {
                             await handleSuccessfulOperation(result.message);
                             e.target.reset(); // Reset form file input
                        }
                    } catch (error) {
                         // Ditangani di callApi
                    }
                }
            });
        };
        
        const handleImportJson = (e) => {
            e.preventDefault();
            const file = document.getElementById('importJsonFile').files[0];
            if (!file) {
                 showToast('Pilih file JSON untuk diimport.', 'danger');
                 return;
            }
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    
                    if (!importedData || !importedData.siswa || !importedData.kelas || !importedData.jurusan) {
                         showToast('Struktur file JSON tidak valid.', 'danger');
                         return;
                    }
                    
                    if (!confirm('PERINGATAN KERAS! Anda akan menimpa SEMUA data di aplikasi dengan data dari file JSON ini. Lanjutkan?')) {
                        return;
                    }
                    
                    // Gunakan endpoint import-all
                    const result = await callApi('POST', 'import-all', importedData);
                    if (result.success) {
                        await handleSuccessfulOperation(result.message);
                        e.target.reset(); 
                    }
                } catch (error) {
                    showToast(`Gagal memproses file JSON: ${error.message}`, 'danger');
                }
            };
            reader.readAsText(file);
        };


        // =========================================================================
        // Inisialisasi Aplikasi
        // =========================================================================
        const initApp = async () => {
            // Pastikan otentikasi lolos sebelum load data
            if (!checkAuth()) return;
            
            await loadData();
            updateUISidebar();
            navigate(window.location.hash || '#dashboard');
            
            // Set default message broadcast (Template pesan yang diperbarui)
            const defaultTemplate = `Assalamu'alaikum Wr. Wb.

Yth. Wali Santri/Santriwati {nama} ({nis})
            
Kami dari {mahad_nama} ingin menginformasikan status pembayaran SPP ananda.

*--- Status Santri ---*
*Nama:* {nama}
*NIS:* {nis}
*Kelas Aktif:* {kelas}
*Wali Kelas:* {wali_kelas}
*Kesanggupan Bayar:* {kesanggupan_bayar}

*--- Rincian SPP per Kelas ---*
{rincian_spp_kelas}

*Total Tunggakan Keseluruhan (Jatuh Tempo):* *{total_tunggakan_rupiah}*

Mohon untuk segera menyelesaikan pembayaran bulan ini.
Jika sudah melakukan pembayaran, mohon abaikan pesan ini.

Terima kasih atas perhatiannya.
Wassalamu'alaikum Wr. Wb.

{bendahara} - Bendahara {mahad_nama}`;

            if (!broadcastMessage.value || broadcastMessage.value.startsWith('Assalamu\'alaikum Yth. Wali Santri {nama}')) {
                 broadcastMessage.value = defaultTemplate;
            }
        };

        initApp();

    });