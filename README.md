# SenCye — Integrasi mobile dan rute UNDIP–Bulusan

## Sesudah dihosting

Tanpa Google Maps API atau pengaturan server tambahan:
- Navbar Home, Rute, Monitoring, dan Profil saling terhubung.
- Seluruh kartu Titik Awal/Titik Tujuan menerima tap.
- Pengenalan suara bahasa Indonesia mengisi teks lokasi. Ucapkan “UNDIP”, “Universitas Diponegoro”, “Bulusan”, atau “dari UNDIP ke Bulusan”.
- Pasangan UNDIP–Bulusan (dan arah sebaliknya) otomatis menggambar rute dengan animasi ikon sepeda. Tombol Ulangi memutar animasi kembali.
- Pilihan lokasi manual tersedia ketika suara gagal atau browser tidak mendukung pengenalan suara.
- Pilihan lokasi tersimpan pada browser.
- Kamera belakang dapat diaktifkan dengan tombol Aktifkan Kamera; izin yang ditolak dapat dicoba ulang.
- Scan QR dan input kode manual meneruskan pairing ID ke halaman pengguna.

Peta rute merupakan ilustrasi lokal dengan jalur yang telah ditentukan. Animasi, jarak 2,6 km, dan 15 menit adalah data demonstrasi, bukan hasil routing/GPS aktual. Sesuai permintaan, tidak ada label simulasi pada antarmuka. Gunakan hanya untuk demonstrasi, bukan petunjuk navigasi perjalanan. Pengenalan suara menggunakan layanan browser, dapat memerlukan internet dan izin mikrofon; tidak memerlukan Google Maps API key.

Profil masih menggunakan data contoh dan gambar QR dari desain. Untuk pairing sungguhan, gunakan QR atau kode yang ditampilkan di Dashboard Pendamping (`pages/companion.html`), bukan gambar QR Profil.

## Deploy ke Vercel

1. Ekstrak ZIP. `index.html`, `api/`, `pages/`, `css/`, dan `js/` berada langsung pada root proyek.
2. Import proyek ke Vercel. Gunakan Framework Preset **Other**, tanpa Build Command dan tanpa mengarahkan Output Directory ke subfolder lain.
3. Deploy, lalu buka URL HTTPS langsung di browser HP.
4. Izinkan mic/kamera saat diminta. Pengaturan izin browser/OS tidak dapat dilewati oleh aplikasi.

`vercel.json` mengizinkan mic, kamera, dan lokasi untuk origin aplikasi sendiri. Tidak diperlukan build/npm dependency untuk kode aplikasi. Pembaca QR dan Supabase SDK masih dimuat melalui CDN; internet diperlukan saat memuatnya.

## Mengaktifkan voice note, panggilan, dan lokasi antar-HP

Fitur antar-perangkat memerlukan project Supabase milik pengguna. Project tersebut belum tersedia dalam ZIP ini. Hosting Vercel saja tidak membuat database, storage, atau koneksi realtime.

1. Buat project Supabase.
2. Jalankan `supabase/schema.sql` pada SQL Editor project tersebut.
3. Di Vercel → Project Settings → Environment Variables, isi:
   - `SUPABASE_URL`: URL project Supabase.
   - `SUPABASE_ANON_KEY`: publishable key atau legacy anon key project; **bukan service_role/secret key**.
4. Redeploy. Endpoint `/api/config` mengirim konfigurasi publik yang diperlukan ke frontend. Jangan mengunggah file `.env` berisi rahasia ke folder statis.
5. Di HP pendamping, buka `pages/companion.html` untuk menampilkan QR dan kode pairing. Pilih kode unik untuk pasangan perangkat.
6. Di HP pengguna, buka Sign In/Scan QR, lalu pindai QR atau masukkan kode yang sama.
7. Pendamping dapat memakai **Monitoring** untuk mengirim/menerima panggilan dan voice note. Biarkan satu halaman penerima aktif pada HP pendamping; jangan membuka Dashboard dan Monitoring sebagai dua penerima sekaligus.
8. Di HP pengguna, biarkan Homepage aktif selama komunikasi. Berpindah halaman menghentikan rekaman/panggilan.

Tanpa konfigurasi Supabase, kode lama tetap mendukung pengujian lokal antartab melalui BroadcastChannel; ini tidak menghubungkan dua HP. Jika konfigurasi tersedia tetapi koneksi gagal, aplikasi tidak menganggap pesan berhasil dikirim.

Panggilan memakai WebRTC dengan STUN. Pada beberapa jaringan seluler/NAT, TURN tetap diperlukan; isi ICE_SERVERS di `js/config.js` dengan konfigurasi penyedia TURN yang dimiliki. Belum ada akun TURN yang disediakan. Browser HP juga dapat menghentikan halaman di latar belakang; belum ada background calling atau push notification.

Monitoring tanpa Google API menampilkan koordinat dan kecepatan GPS yang benar-benar diterima sebagai teks di atas desain peta. Peta monitoring tidak otomatis menjadi peta GPS interaktif tanpa Google API. Animasi pada Pilih Rute terpisah dari pelacakan pengguna.

## Pairing bukan autentikasi akun

Scan QR memeriksa format kode pairing dan menyimpan kode untuk memilih channel; tidak memverifikasi akun pengguna terhadap server. SQL bawaan bersifat terbuka untuk prototipe sebagaimana versi sumber. Sebelum digunakan untuk data pribadi produksi, tambahkan Supabase Auth dan pembatasan akses per pasangan. Jangan membagikan data pribadi pada project prototipe publik.

## Pemeriksaan revisi

- Sintaks seluruh JavaScript, referensi file HTML/CSS, struktur navbar, dan integritas ZIP diperiksa.
- Pengujian logika dengan mock: pengenalan ucapan, arah rute, akhir animasi, fallback manual, penolakan izin, pemulihan pilihan, kamera/pelepasan stream, kode pairing, status koneksi, dan kegagalan pengiriman.
- Endpoint konfigurasi diuji untuk mengeluarkan hanya key publik/anon dan menolak secret/service-role key.
- Belum diuji melalui browser yang dirender atau perangkat HP fisik. Koneksi Supabase/WebRTC lintas perangkat belum dapat diuji karena akun/konfigurasi pengguna belum tersedia.

## Referensi implementasi

- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://supabase.com/docs/reference/javascript/subscribe
- https://vercel.com/docs/functions/runtimes/node-js
