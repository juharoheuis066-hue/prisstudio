<?php
// Tentukan path ke file database JSON
$db_file = 'data.json';
// Tentukan struktur data dummy untuk inisialisasi jika file tidak ada
$dummy_data = [
    'identitas' => [
        'nama' => "Ma'had Anda",
        'alamat' => "Jl. Pendidikan No. 1",
        'kepala' => "Ustadz Fulan",
        'bendahara' => "Ustadz Fulanah",
        'logo' => "https://placehold.co/100x100/0d6efd/FFFFFF?text=M"
    ],
    'jurusan' => [
        ['id' => 'j-1', 'nama' => "HADITS", 'biayaPendaftaran' => 500000],
        ['id' => 'j-2', 'nama' => "BAHASA ARAB", 'biayaPendaftaran' => 500000]
    ],
    'kelas' => [
        ['id' => 'k-1', 'nama' => "TAMHIDI", 'idJurusan' => 'j-2', 'waliKelas' => "Ustadz Jafar"],
        ['id' => 'k-2', 'nama' => "DIRASAH HADITS 1", 'idJurusan' => 'j-1', 'waliKelas' => "Ustadz Miftah"]
    ],
    'spp' => [
        'biaya' => [ // Struktur SPP baru: { idKelas: { biaya: 150000, mulai: 'YYYY-MM', selesai: 'YYYY-MM' } }
            'k-1' => ['biaya' => 150000, 'mulai' => '2024-07', 'selesai' => '2025-06'],
            'k-2' => ['biaya' => 200000, 'mulai' => '2024-07', 'selesai' => '2025-06']
        ]
    ],
    'siswa' => [
        // Siswa sekarang menggunakan 'idKelas' sebagai ARRAY untuk multi-kelas
        ['id' => 's-1', 'nis' => '1001', 'nama' => 'Ahmad Fauzi', 'idKelas' => ['k-1'], 'gender' => 'Laki-laki', 'wa' => '6281234567890', 'email' => 'ahmad@example.com', 'kesanggupanBayar' => 'cicil'],
        ['id' => 's-2', 'nis' => '1002', 'nama' => 'Fatimah Zahra', 'idKelas' => ['k-1', 'k-2'], 'gender' => 'Perempuan', 'wa' => '6281234567891', 'email' => 'fatimah@example.com', 'kesanggupanBayar' => 'sekaligus']
    ],
    'pembayaran' => [
        // Struktur pembayaran dipertahankan, namun idKelasSPP sekarang mewakili ID Kelas yang dibayar
        ['id' => 'p-1', 'idSiswa' => 's-1', 'idKelasSPP' => 'k-1', 'bulan' => '2024-08', 'jumlah' => 150000, 'tglBayar' => date('c')],
        ['id' => 'p-2', 'idSiswa' => 's-2', 'idKelasSPP' => 'k-2', 'bulan' => '2024-07', 'jumlah' => 200000, 'tglBayar' => date('c')]
    ],
    'pemasukanLain' => [],
    'pengeluaran' => [],
    // Tambahkan konfigurasi login sederhana
    'users' => [
        'admin' => ['password' => 'admin123'], // Username: admin, Password: admin123
    ]
];

// --- FUNGSI UTAMA UNTUK MANIPULASI FILE JSON ---
/**
 * Memvalidasi Token Bearer dari Header
 */
function is_authenticated($db) {
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER["Authorization"]);
    } else if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }

    if (!empty($headers)) {
        if (preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
            $token = $matches[1];
            // Cek apakah token ada di salah satu user di database
            foreach ($db['users'] as $user) {
                if (isset($user['token']) && $user['token'] === $token) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Memuat data dari file JSON. Jika file tidak ada, inisialisasi dengan dummy data.
 * @return array
 */
function load_data() {
    global $db_file, $dummy_data;
    if (!file_exists($db_file) || filesize($db_file) == 0) {
        // Hapus file data.json yang mungkin kosong
        if (file_exists($db_file)) unlink($db_file);
        save_data($dummy_data);
        return $dummy_data;
    }
    $data_json = file_get_contents($db_file);
    $db = json_decode($data_json, true) ?? $dummy_data;

    // --- PERBAIKAN PENTING: Pastikan 'users' data selalu ada untuk login ---
    if (!isset($db['users'])) {
        $db['users'] = $dummy_data['users'];
    }
    // --------------------------------------------------------
    
    return $db;
}

/**
 * Menyimpan data ke file JSON.
 * @param array $data
 * @return bool
 */
function save_data($data) {
    global $db_file;
    // Bersihkan array kosong atau data null sebelum disimpan
    $cleaned_data = $data;
    $cleaned_data['siswa'] = array_values(array_filter($cleaned_data['siswa']));
    $cleaned_data['kelas'] = array_values(array_filter($cleaned_data['kelas']));
    $cleaned_data['jurusan'] = array_values(array_filter($cleaned_data['jurusan']));
    $cleaned_data['pemasukanLain'] = array_values(array_filter($cleaned_data['pemasukanLain'])); // FIX 1: Ensure pemasukanLain is cleaned
    // ... tambahkan pembersihan entitas array lain jika diperlukan
    
    // Gunakan LOCK_EX untuk mencegah race condition saat menulis
    return file_put_contents($db_file, json_encode($cleaned_data, JSON_PRETTY_PRINT), LOCK_EX) !== false;
}

// --- SETUP API ---

// Header wajib untuk CORS dan tipe konten
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Tangani preflight request OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$method = $_SERVER['REQUEST_METHOD'];
$entity = $_GET['entity'] ?? ''; // e.g., 'siswa', 'jurusan', 'identitas'

// Cek apakah content type adalah JSON atau FormData
$contentType = $_SERVER["CONTENT_TYPE"] ?? '';
if (strpos($contentType, 'application/json') !== false) {
    $input = json_decode(file_get_contents('php://input'), true);
} else {
    // Jika FormData (Upload File), ambil dari $_POST. Data JSON kompleks dikirim sebagai string di dalam $_POST['data']
    $input = $_POST;
    if (isset($_POST['data'])) {
        $jsonInput = json_decode($_POST['data'], true);
        if (is_array($jsonInput)) {
            $input = array_merge($input, $jsonInput);
        }
    }
}

$db = load_data();
// --- CEK KEAMANAN ---
// Kecuali login ('auth'), semua request harus punya token valid
if ($entity !== 'auth' && $method !== 'OPTIONS') {
    if (!is_authenticated($db)) {
        send_response(['error' => 'Unauthorized. Silakan login kembali.'], 401);
    }
}
// --------------------

// Fungsi utilitas untuk respons
function send_response($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}

// --- LOGIKA UTAMA PER METHOD ---

switch ($method) {
    case 'GET':
        // Jika entity kosong, kirim seluruh data
        if ($entity === '') {
            // Hapus data sensitif seperti 'users' dari respons GET ALL
            $response_db = $db;
            unset($response_db['users']); 
            send_response($response_db);
        }
        
        // Cek entity yang diminta
        // Hapus data sensitif
        if ($entity === 'users') {
            send_response(['error' => 'Akses ditolak'], 403);
        } elseif (isset($db[$entity])) {
            send_response($db[$entity]);
        } else {
            // Khusus untuk identitas, kirim objeknya
             if ($entity === 'identitas') {
                send_response($db['identitas'] ?? []);
            }
            send_response(['error' => 'Entity tidak ditemukan'], 404);
        }
        break;

    case 'POST':
    case 'PUT':
        // Cek input data
        if (!$input) {
            send_response(['error' => 'Data input tidak valid.'], 400);
        }

        switch ($entity) {
            case 'auth':
                $username = $input['username'] ?? '';
                $password = $input['password'] ?? '';

                // Catatan: Password sebaiknya di-hash, tapi untuk sekarang kita pakai plaintext sesuai request
                $user = $db['users'][$username] ?? null;

                if ($user && $user['password'] === $password) {
                    // Buat token baru
                    $token = bin2hex(random_bytes(32)); // Token yang lebih aman
                    
                    // SIMPAN token ke database agar bisa divalidasi nanti
                    $db['users'][$username]['token'] = $token;
                    
                    // Simpan database yang sudah ada tokennya
                    save_data($db);

                    send_response(['success' => true, 'token' => $token, 'message' => 'Login berhasil.']);
                } else {
                    send_response(['success' => false, 'message' => 'Username atau password salah.'], 401);
                }
                break;

            case 'identitas':
                $db['identitas'] = array_merge($db['identitas'], $input);
                $success_msg = 'Identitas berhasil diperbarui.';
                break;
                
            case 'jurusan':
            case 'kelas':
            case 'pemasukan-lain': // FIX 1: Added to handle POST/PUT for single entity
            case 'pengeluaran':
                // Perbaikan Bug 1: Pastikan entity 'pemasukan-lain' menggunakan data yang benar
                $entity_key = $entity;
                // Mapping entity (hanya untuk POST/PUT)
                if ($entity === 'pemasukan-lain') {
                     $entity_key = 'pemasukanLain';
                }

                // Cek apakah entitas array ada di db
                if (!isset($db[$entity_key]) || !is_array($db[$entity_key])) {
                     send_response(['error' => 'Entity database tidak valid.'], 500);
                }
                
                $data_array = &$db[$entity_key];
                $is_update = false;
                
                foreach ($data_array as $key => $item) {
                    if (isset($input['id']) && $item['id'] === $input['id']) {
                        $data_array[$key] = array_merge($item, $input);
                        $is_update = true;
                        break;
                    }
                }
                
                if (!$is_update) {
                    if (!isset($input['id'])) { $input['id'] = uniqid(); }
                    $data_array[] = $input;
                    $success_msg = 'Data baru berhasil ditambahkan.';
                } else {
                    $success_msg = 'Data berhasil diperbarui.';
                }
                break;

            case 'siswa':
                // Hapus logika array_merge jika multi-kelas
                $data_array = &$db['siswa'];
                $is_update = false;

                // Pastikan idKelas adalah array (untuk multi-kelas)
                if (!isset($input['idKelas']) || !is_array($input['idKelas'])) {
                     send_response(['error' => 'Data kelas siswa tidak valid (harus array idKelas).'], 400);
                }
                
                // Cari dan update (PUT)
                foreach ($data_array as $key => $item) {
                    if (isset($input['id']) && $item['id'] === $input['id']) {
                        // Perbarui data dengan input baru, termasuk array idKelas
                        $data_array[$key] = array_merge($item, $input); 
                        $is_update = true;
                        break;
                    }
                }
                
                // Jika tidak update, tambahkan baru (POST)
                if (!$is_update) {
                    if (!isset($input['id'])) {
                        $input['id'] = uniqid('s_'); 
                    }
                    $data_array[] = $input;
                    $success_msg = 'Data siswa berhasil ditambahkan.';
                } else {
                    $success_msg = 'Data siswa berhasil diperbarui.';
                }
                break;
            
            case 'spp-biaya':
                $idKelas = $input['idKelas'] ?? null;
                if (!$idKelas) { send_response(['error' => 'idKelas diperlukan.'], 400); }
                $db['spp']['biaya'][$idKelas] = [
                    'biaya' => $input['biaya'] ?? 0,
                    'mulai' => $input['mulai'] ?? '',
                    'selesai' => $input['selesai'] ?? ''
                ];
                $success_msg = 'Biaya SPP berhasil diperbarui.';
                break;

            case 'pembayaran':
                // REVISI: Logika baru untuk multi-kelas + Upload Bukti
                $paymentsToRecord = $input['paymentsToRecord'] ?? [];

                if (empty($paymentsToRecord) || !is_array($paymentsToRecord)) {
                    send_response(['error' => 'Data pembayaran tidak lengkap atau format tidak valid.'], 400);
                }

                // --- LOGIKA UPLOAD FILE ---
                $buktiUrl = null;
                if (isset($_FILES['bukti']) && $_FILES['bukti']['error'] === UPLOAD_ERR_OK) {
                    $uploadDir = 'uploads/';
                    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

                    $fileTmpPath = $_FILES['bukti']['tmp_name'];
                    $fileName = $_FILES['bukti']['name'];
                    $fileSize = $_FILES['bukti']['size'];
                    $fileType = $_FILES['bukti']['type'];
                    
                    // Ambil ekstensi
                    $fileNameCmps = explode(".", $fileName);
                    $fileExtension = strtolower(end($fileNameCmps));

                   // Validasi Ekstensi & MIME Type
                    $allowedfileExtensions = array('jpg', 'gif', 'png', 'jpeg', 'webp', 'pdf');
                    
                    // Cek ekstensi ganda (misal: gambar.php.jpg) - Bahaya!
                    if (count($fileNameCmps) > 2) {
                         send_response(['error' => 'Nama file tidak valid.'], 400);
                    }

                    if (in_array($fileExtension, $allowedfileExtensions)) {
                        
                        // Validasi MIME Type sesungguhnya (Mencegah script PHP diupload sebagai JPG)
                        $finfo = new finfo(FILEINFO_MIME_TYPE);
                        $mime = $finfo->file($fileTmpPath);
                        $allowedMimeTypes = [
                            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'
                        ];

                        if (!in_array($mime, $allowedMimeTypes)) {
                             send_response(['error' => 'Isi file tidak sesuai ekstensi.'], 400);
                        }

                        // Buat nama unik dan acak (Lebih aman dari time() + rand())
                        $newFileName = 'bukti_' . bin2hex(random_bytes(8)) . '.' . $fileExtension;
                        $dest_path = $uploadDir . $newFileName;

                        if(move_uploaded_file($fileTmpPath, $dest_path)) {
                            // Simpan URL relatif agar bisa diakses frontend
                            $buktiUrl = $dest_path; 
                        }
                    }
                }
                // ---------------------------

                $recordedCount = 0;
                $db_pembayaran = &$db['pembayaran'];

                foreach ($paymentsToRecord as $record) {
                    $idSiswa = $record['idSiswa'] ?? null;
                    $idKelas = $record['idKelas'] ?? null; 
                    $bulan = $record['bulan'] ?? null;
                    $jumlah = $record['jumlah'] ?? 0;
                    $tglBayar = $record['tglBayar'] ?? date('c');

                    if (!$idSiswa || !$idKelas || !$bulan || $jumlah <= 0) {
                        continue; 
                    }

                    // Cek duplikasi
                    $is_lunas = false;
                    foreach ($db_pembayaran as $p) {
                        if ($p['idSiswa'] === $idSiswa && ($p['idKelasSPP'] ?? $p['idKelas']) === $idKelas && $p['bulan'] === $bulan) {
                            $is_lunas = true;
                            break;
                        }
                    }

                    if (!$is_lunas) {
                        $db_pembayaran[] = [
                            'id' => uniqid('p_'),
                            'idSiswa' => $idSiswa,
                            'idKelasSPP' => $idKelas, 
                            'bulan' => $bulan,
                            'jumlah' => $jumlah,
                            'tglBayar' => $tglBayar,
                            'buktiTransfer' => $buktiUrl // Tambahkan field bukti transfer
                        ];
                        $recordedCount++;
                    }
                }
                
                if ($recordedCount > 0) {
                    $success_msg = $recordedCount . ' pembayaran berhasil dicatat' . ($buktiUrl ? ' dengan bukti transfer.' : '.');
                } else {
                    $success_msg = 'Tidak ada pembayaran baru yang dicatat.';
                }
                break;

            case 'import-siswa':
                 // Logika import siswa (batch update/insert)
                if (!is_array($input)) { send_response(['error' => 'Data import harus berupa array.'], 400); }

                $imported_count = 0;
                $db_siswa = &$db['siswa'];

                foreach ($input as $row) {
                    // Cari kelas berdasarkan Nama_Kelas (menganggap hanya satu kelas yang relevan untuk proses import cepat)
                    $kelas = null;
                    // Logika multi-kelas: Import hanya kelas pertama (utama) yang ditemukan
                    foreach ($db['kelas'] as $k) {
                        if (strtolower($k['nama']) === strtolower($row['Nama_Kelas'])) {
                            $kelas = $k;
                            break;
                        }
                    }

                    if (!$kelas) continue; // Skip jika kelas tidak ditemukan

                    $nis = trim($row['NIS']);
                    $existing_index = -1;
                    foreach ($db_siswa as $key => $s) {
                        if ($s['nis'] === $nis) {
                            $existing_index = $key;
                            break;
                        }
                    }

                    $siswa_data = [
                        'nis' => $nis,
                        'nama' => trim($row['Nama']),
                        // Penting: idKelas disimpan sebagai array. Kelas utama dihapus, hanya kelas yang dipilih.
                        'idKelas' => [$kelas['id']], 
                        'gender' => trim($row['Jenis_Kelamin'] ?? 'Laki-laki'),
                        'kesanggupanBayar' => strtolower(trim($row['Kesanggupan_Bayar'] ?? 'cicil')),
                        'wa' => trim($row['No_WhatsApp'] ?? ''),
                        'email' => trim($row['Email'] ?? '')
                    ];

                    if ($existing_index > -1) {
                        // Update
                        $db_siswa[$existing_index] = array_merge($db_siswa[$existing_index], $siswa_data);
                    } else {
                        // Insert
                        $siswa_data['id'] = uniqid('s_');
                        $db_siswa[] = $siswa_data;
                    }
                    $imported_count++;
                }
                $success_msg = $imported_count . ' siswa berhasil diimport/diperbarui.';
                break;

            case 'import-all':
                // Timpa seluruh data dengan data JSON dari file import
                if (is_array($input) && isset($input['siswa'], $input['kelas'], $input['jurusan'])) {
                     $db = array_merge($db, $input); // Merge agar 'users' tidak hilang
                     $success_msg = 'Seluruh data berhasil ditimpa.';
                } else {
                    send_response(['error' => 'Format data JSON seluruh data tidak valid.'], 400);
                }
                break;

            case 'reset-data':
                // Reset data ke dummy
                global $dummy_data;
                // Pertahankan users dari data yang sedang berjalan
                $current_users = $db['users'];
                $db = $dummy_data;
                $db['users'] = $current_users;
                $success_msg = 'Semua data berhasil direset.';
                break;
                
            default:
                send_response(['error' => 'Entity POST/PUT tidak dikenal.'], 400);
        }
        
        // Simpan perubahan dan kirim respons
        if (save_data($db)) {
            send_response(['success' => true, 'message' => $success_msg ?? 'Operasi berhasil.']);
        } else {
            send_response(['success' => false, 'error' => 'Gagal menyimpan data ke file.'], 500);
        }
        break;

    case 'DELETE':
        $id = $input['id'] ?? null;
        $ids = $input['ids'] ?? null; // ID untuk hapus masal siswa
        $deleteAll = $input['delete_all'] ?? false; // Flag untuk hapus semua siswa
        $idKelas = $input['idKelas'] ?? null; // ID tunggal untuk hapus kelas
        
        $success = false;
        $deleted_count = 0;

        switch ($entity) {
            case 'jurusan':
            case 'pemasukan-lain': // FIX 1: Allow DELETE for single entity
            case 'pengeluaran':
                $entity_key = $entity;
                 // Mapping entity (hanya untuk DELETE)
                if ($entity === 'pemasukan-lain') {
                     $entity_key = 'pemasukanLain';
                }

                if ($id) {
                    $db[$entity_key] = array_filter($db[$entity_key], function($item) use ($id) {
                        return $item['id'] !== $id;
                    });
                    $success = true;
                }
                break;
            
            case 'pembayaran':
                // NEW: Endpoint untuk menghapus pembayaran tunggal (digunakan di alur edit)
                if ($id) {
                    $db['pembayaran'] = array_filter($db['pembayaran'], function($item) use ($id) {
                        return $item['id'] !== $id;
                    });
                    $success = true;
                    $success_msg = 'Pembayaran berhasil dihapus.';
                } elseif ($ids && is_array($ids)) {
                     // Hapus masal (untuk kasus Hapus Semua Pembayaran Siswa)
                     $db['pembayaran'] = array_filter($db['pembayaran'], function($item) use ($ids) {
                        return !in_array($item['id'], $ids);
                     });
                     $success = true;
                     $success_msg = count($ids) . ' Pembayaran berhasil dihapus.';
                }
                break;
                
            case 'kelas':
                // Perbaikan 1: Hapus kelas
                if ($id) {
                    $db['kelas'] = array_filter($db['kelas'], function($item) use ($id) {
                        return $item['id'] !== $id;
                    });

                    // Hapus kelas dari daftar idKelas siswa yang terkait
                    foreach ($db['siswa'] as &$siswa) {
                        // --- PERBAIKAN FATAL ERROR: Pastikan idKelas adalah array ---
                        if (!isset($siswa['idKelas']) || !is_array($siswa['idKelas'])) {
                            // Jika data idKelas hilang atau bukan array (kemungkinan dari skema lama), inisialisasi sebagai array kosong
                            $siswa['idKelas'] = []; 
                        }
                        // -----------------------------------------------------------------

                        $siswa['idKelas'] = array_values(array_filter($siswa['idKelas'], function($kid) use ($id) {
                            return $kid !== $id;
                        }));
                        
                        // Jika siswa tidak punya kelas lagi, beri kelas dummy (atau atur default)
                        if (empty($siswa['idKelas'])) {
                            $siswa['idKelas'] = []; 
                        }
                    }
                    unset($siswa);

                    // Hapus pengaturan SPP terkait
                    if (isset($db['spp']['biaya'][$id])) {
                        unset($db['spp']['biaya'][$id]);
                    }

                    // REVISI: Hapus data pembayaran yang merujuk kelas yang dihapus sebagai idKelasSPP (sekarang ID Kelas)
                    $db['pembayaran'] = array_filter($db['pembayaran'], function($p) use ($id) {
                        return ($p['idKelasSPP'] ?? $p['idKelas']) !== $id;
                    });

                    $success = true;
                    $success_msg = 'Kelas berhasil dihapus, dan referensi siswa terkait diperbarui.';
                }
                break;

            case 'siswa':
                // Perbaikan 2: Bug hapus siswa (ids seharusnya menghapus yang terpilih saja)
                if ($deleteAll) {
                    // Hapus semua siswa
                    $deleted_count = count($db['siswa']);
                    $db['siswa'] = [];
                    $db['pembayaran'] = [];
                    $success = true;
                    $success_msg = 'Semua siswa berhasil dihapus.';
                } elseif ($ids && is_array($ids)) {
                    // Hapus siswa berdasarkan array ID (masal)
                    $deleted_count = 0;
                    $db['siswa'] = array_filter($db['siswa'], function($item) use ($ids, &$deleted_count) {
                        if (in_array($item['id'], $ids)) {
                            $deleted_count++;
                            return false; // Hapus
                        }
                        return true; // Pertahankan
                    });

                    // Hapus pembayaran terkait
                    $db['pembayaran'] = array_filter($db['pembayaran'], function($item) use ($ids) {
                        return !in_array($item['idSiswa'], $ids);
                    });
                    $success = true;
                    $success_msg = $deleted_count . ' siswa berhasil dihapus.';

                } elseif ($id) {
                    // Hapus siswa berdasarkan ID tunggal
                    $db['siswa'] = array_filter($db['siswa'], function($item) use ($id) {
                        return $item['id'] !== $id;
                    });
                    
                    // Hapus pembayaran terkait
                    $db['pembayaran'] = array_filter($db['pembayaran'], function($item) use ($id) {
                        return $item['idSiswa'] !== $id;
                    });
                    $success = true;
                    $success_msg = 'Siswa berhasil dihapus.';
                }
                break;
            
            case 'spp-biaya':
                // Hapus pengaturan SPP per kelas (khusus untuk DELETE kelas)
                if ($idKelas && isset($db['spp']['biaya'][$idKelas])) {
                    unset($db['spp']['biaya'][$idKelas]);
                    $success = true;
                }
                break;

            default:
                send_response(['error' => 'Entity DELETE tidak dikenal.'], 400);
        }

        if ($success) {
            if (save_data($db)) {
                send_response(['success' => true, 'message' => $success_msg ?? 'Data berhasil dihapus.'], 200);
            } else {
                send_response(['success' => false, 'error' => 'Gagal menyimpan data setelah penghapusan.'], 500);
            }
        } else {
            send_response(['error' => 'Gagal menghapus data atau ID tidak ditemukan.'], 404);
        }
        break;

    default:
        send_response(['error' => 'Metode tidak didukung.'], 405);
}
?>