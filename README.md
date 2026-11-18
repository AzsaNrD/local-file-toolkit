# Local File Toolkit

Kumpulan 30 tools buat ngurusin PDF, gambar, dan dokumen Office yang jalan di komputermu sendiri. Nggak perlu akun, nggak ada upload, nggak ada batas pemakaian.

Kalau pakai iLovePDF atau Smallpdf, file kamu dikirim dulu ke server mereka. Di sini nggak begitu. Sebagian besar tools jalan langsung di browser. Beberapa lainnya memanggil program yang sudah terpasang di komputermu (Microsoft Office, LibreOffice, Ghostscript), tapi tetap di komputer yang sama. File-nya nggak pernah keluar.

## Download

| Sistem operasi | Cara paling gampang |
|----------------|---------------------|
| **Windows** | Download `Local File Toolkit Setup x.y.z.exe` dari halaman [Releases](https://github.com/AzsaNrD/local-file-toolkit/releases), lalu double click. Nggak perlu install Node.js atau npm. Langkahnya ada di [Windows](#windows). |
| **macOS** | Belum ada installer. Jalankan dari source code lewat Terminal. Langkahnya ada di [macOS](#macos). |
| **Linux** | Belum ada installer. Jalankan dari source code lewat terminal. Langkahnya ada di [Linux](#linux). |

## Daftar isi

- [Daftar tools](#daftar-tools)
- [Instalasi dan cara menjalankan](#instalasi-dan-cara-menjalankan)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux](#linux)
- [Cara pakai tools-nya](#cara-pakai-tools-nya)
- [Program tambahan (opsional)](#program-tambahan-opsional)
- [Install sebagai aplikasi dan pakai offline](#install-sebagai-aplikasi-dan-pakai-offline)
- [Kalau ada masalah](#kalau-ada-masalah)
- [Buat developer](#buat-developer)
- [Soal privasi](#soal-privasi)
- [Lisensi](#lisensi)

## Daftar tools

**PDF**: Merge PDF, Split PDF, Delete pages, Replace pages, Reorder pages, Rotate PDF, Crop PDF, Page numbers, Watermark PDF, Redact PDF, Sign PDF, Fill PDF form, Compare PDFs, PDF Properties, Edit PDF properties, Make PDF searchable (OCR), Compress PDF, Protect or unlock PDF.

**Gambar**: Compress image, Resize image, Crop image, Remove image metadata.

**Konversi**: Images to PDF, PDF to images, Convert image format, Extract images, Extract text, Office to PDF, PDF to Word.

**Utilitas**: Batch rename.

## Instalasi dan cara menjalankan

Setiap sistem operasi punya langkah lengkapnya sendiri: prerequisites, install, menjalankan, menghentikan, dan update.

### Windows

Ada dua cara. Cara 1 paling gampang, dan nggak butuh Node.js atau npm sama sekali.

#### Cara 1: pakai installer (disarankan)

**Prerequisites:** nggak ada. Node.js dan server-nya sudah ikut di dalam installer. Aman dipakai di komputer yang belum atau sudah terinstall Node.js, dan nggak bentrok dengan versi Node.js yang kamu punya.

1. Download `Local File Toolkit Setup x.y.z.exe` dari halaman [Releases](https://github.com/AzsaNrD/local-file-toolkit/releases).
2. Double click file-nya.
3. Kalau muncul layar biru **SmartScreen**, klik **More info**, lalu **Run anyway**. Peringatan ini muncul karena installer-nya belum ditandatangani sertifikat berbayar, jadi bukan berarti ada yang salah dengan filenya.
4. Pilih folder instalasi, lalu ikuti wizard sampai selesai.
5. Buka **Local File Toolkit** dari shortcut di Desktop atau Start Menu.

**Update:** download installer versi terbaru dari Releases, lalu jalankan. Kalau versi lama masih ada, installer akan menggantinya.

**Uninstall:** Settings, Apps, Installed apps, lalu cari **Local File Toolkit**.

Buat dipakai di komputer lain, cukup salin file `.exe` installer-nya.

#### Cara 2: dari source code

**Prerequisites:** Node.js 20.9 ke atas (sudah termasuk npm). Git juga dibutuhkan kalau mau clone repo-nya. Kalau repo-nya kamu download sebagai ZIP, Git nggak perlu.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Atau download installer-nya langsung dari [nodejs.org](https://nodejs.org) dan [git-scm.com](https://git-scm.com). Tutup lalu buka ulang terminal setelah install, lalu cek:

```powershell
node -v
npm -v
```

`node -v` harus menampilkan `v20.9.0` atau lebih baru.

**Install dan jalankan, pakai file `.bat`:**

1. Download atau clone repo-nya, lalu buka foldernya.
2. Double click **`Jalankan Local File Toolkit.bat`**.
3. Di pertama kali jalan, file ini akan install dependencies dan build aplikasinya. Tunggu beberapa menit.
4. Browser kebuka sendiri di `http://localhost:3000`.

**Menghentikan:** tutup jendela hitamnya.

**Update:** ambil source code terbaru (`git pull`, atau download ZIP-nya lagi), lalu jalankan `.bat` seperti biasa. File ini akan build ulang otomatis kalau source code berubah. Buat maksa build ulang, jalankan `Jalankan Local File Toolkit.bat rebuild` dari terminal.

**Atau lewat terminal:**

```powershell
git clone https://github.com/AzsaNrD/local-file-toolkit.git
cd local-file-toolkit
npm install
npm run build
npm run start
```

Lalu buka [http://localhost:3000](http://localhost:3000). Tekan `Ctrl+C` di terminal buat menghentikan.

### macOS

Belum ada installer buat macOS, jadi aplikasinya dijalankan dari source code lewat Terminal. Semua tools yang jalan di browser bisa dipakai penuh. PDF to Word nggak tersedia di macOS (lihat [Program tambahan](#program-tambahan-opsional)).

**Prerequisites:** Node.js 20.9 ke atas dan Git.

1. Buka **Terminal**: tekan `Cmd + Space`, ketik `Terminal`, lalu Enter.
2. Install [Homebrew](https://brew.sh) kalau belum punya. Cek dulu dengan `brew -v`. Kalau muncul `command not found`, jalankan:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   Di akhir proses, Homebrew menampilkan beberapa baris "Next steps". Jalankan baris itu supaya `brew` dikenali.
3. Install Node.js dan Git:
   ```bash
   brew install node git
   ```
4. Cek hasilnya:
   ```bash
   node -v
   npm -v
   git --version
   ```
   `node -v` harus menampilkan `v20.9.0` atau lebih baru.

**Install:**

```bash
git clone https://github.com/AzsaNrD/local-file-toolkit.git
cd local-file-toolkit
npm install
npm run build
```

**Menjalankan:**

```bash
npm run start
```

Lalu buka [http://localhost:3000](http://localhost:3000) di browser.

**Menghentikan:** tekan `Ctrl+C` di Terminal.

**Lain kali, jalankan lagi:**

```bash
cd local-file-toolkit
npm run start
```

**Update:**

```bash
cd local-file-toolkit
git pull
npm install
npm run build
```

Kalau Node.js dan Git sudah terinstall dari dulu, lewati langkah 2 sampai 4 dan langsung ke **Install**.

### Linux

Belum ada installer buat Linux, jadi aplikasinya dijalankan dari source code lewat terminal. Contoh di bawah pakai Debian atau Ubuntu. Di distro lain, pakai package manager bawaannya.

**Prerequisites:** Node.js 20.9 ke atas dan Git.

```bash
sudo apt install git
```

Buat Node.js, jangan pakai `apt install nodejs` begitu saja, karena versi di repository bawaan sering lebih lama dari 20.9. Install lewat [nodejs.org](https://nodejs.org/en/download) atau [nvm](https://github.com/nvm-sh/nvm). Cek hasilnya:

```bash
node -v
npm -v
git --version
```

**Install:**

```bash
git clone https://github.com/AzsaNrD/local-file-toolkit.git
cd local-file-toolkit
npm install
npm run build
```

**Menjalankan:**

```bash
npm run start
```

Lalu buka [http://localhost:3000](http://localhost:3000) di browser.

**Menghentikan:** tekan `Ctrl+C` di terminal.

**Update:**

```bash
cd local-file-toolkit
git pull
npm install
npm run build
```

## Cara pakai tools-nya

Langkahnya sama di semua sistem operasi.

1. Buka halaman utama. Cari tools lewat kolom search (tekan `/` atau `Ctrl+K` biar langsung bisa ngetik, di macOS bisa juga `Cmd+K`), atau filter per kategori: PDF, Gambar, Konversi, Utilitas.
2. Klik kartu tools yang kamu mau.
3. Drag and drop file ke area yang tersedia, atau klik area itu buat pilih file.
4. Atur opsinya kalau ada. Kalau tombol utama masih mati, lihat teks kecil di sebelahnya. Di situ tertulis apa yang kurang, misalnya "Add at least 2 PDFs to merge."
5. Klik tombol utamanya. Progress bar menampilkan persentase dan sudah berapa detik berjalan. Kalau filenya banyak, kelihatan juga file mana yang lagi diproses.
6. Di layar hasil, kamu bisa ganti nama file dulu (ekstensinya tetap), lalu klik **Download**. Kalau hasilnya banyak, pakai **Download all as ZIP**.
7. Hasilnya bisa langsung dipakai di tools lain lewat **Use in another tool**, jadi nggak perlu download dan upload ulang. Mau mulai dari awal? Klik **Start over**.

## Program tambahan (opsional)

Hampir semua tools langsung jalan tanpa install apa-apa. Empat yang di bawah ini beda, karena mereka butuh program lain di komputer yang sama. Kalau programnya belum ada, kartunya menampilkan "Needs ...", dan halaman tools-nya menjelaskan cara install-nya.

| Tools | Program | Windows | macOS | Linux |
|-------|---------|---------|-------|-------|
| PDF to Word | Microsoft Word | Bisa | Nggak bisa | Nggak bisa |
| Office to PDF | Microsoft Office, atau LibreOffice sebagai cadangan | Bisa | Lewat LibreOffice | Lewat LibreOffice |
| Compress PDF | Ghostscript | Bisa | Bisa | Bisa |
| Protect or unlock PDF | Ghostscript | Bisa | Bisa | Bisa |

### Microsoft Office (PDF to Word dan Office to PDF)

Dua tools ini membuka file kamu di Word, Excel, atau PowerPoint yang terpasang, secara tersembunyi, lalu menyimpannya. Hasilnya jauh lebih rapi dibanding konverter lain.

- **Tutup dulu Word, Excel, dan PowerPoint.** Tools ini sengaja nggak menyentuh program Office yang lagi terbuka, supaya dokumenmu nggak ikut tertutup. PDF to Word akan menolak jalan sampai Word ditutup. Office to PDF pindah ke LibreOffice kalau ada.
- PDF hasil scan nggak punya teks yang bisa dikonversi. Jalankan **Make PDF searchable** dulu.
- PDF atau dokumen Office yang diberi password akan ditolak. Buka password-nya dulu.
- Cuma jalan di Windows. Di macOS dan Linux, PDF to Word nggak tersedia.

### LibreOffice

| OS | Cara install |
|----|--------------|
| Windows | `winget install TheDocumentFoundation.LibreOffice`, atau download dari [libreoffice.org](https://www.libreoffice.org/download/download/) |
| macOS | `brew install --cask libreoffice` |
| Linux (Debian/Ubuntu) | `sudo apt install libreoffice` |

Aplikasi akan nyari LibreOffice di lokasi default tiap OS, lalu nyari `soffice` di `PATH`. Kalau kamu install di tempat lain, salin [.env.local.example](.env.local.example) jadi `.env.local`, lalu isi `LIBREOFFICE_PATH` dengan path lengkap ke file `soffice`.

### Ghostscript

| OS | Cara install |
|----|--------------|
| Windows | Download installer dari [ghostscript.com](https://www.ghostscript.com/releases/gsdnld.html) |
| macOS | `brew install ghostscript` |
| Linux (Debian/Ubuntu) | `sudo apt install ghostscript` |

Di Windows, installer Ghostscript nggak menambahkan dirinya ke `PATH`, jadi aplikasi langsung scan `C:\Program Files\gs\<versi>\bin\`. Kamu nggak perlu setting apa-apa. Di macOS dan Linux, aplikasi nyari `gs` di `PATH` dan di lokasi Homebrew yang umum. Kalau kamu install di tempat lain, isi `GHOSTSCRIPT_PATH` di `.env.local`.

Habis install program baru, refresh halamannya supaya kartunya dicek ulang. Kalau kamu pakai aplikasi desktop di Windows, tutup lalu buka lagi aplikasinya.

## Install sebagai aplikasi dan pakai offline

Kalau kamu menjalankan dari source code dengan production build (`npm run build`, lalu `npm run start`, atau lewat file `.bat`), browser akan menawarkan buat install Local File Toolkit sebagai jendela sendiri. Service worker menyimpan halaman dan script yang pernah dibuka, jadi tools yang jalan di browser tetap bisa dibuka walaupun server-nya sudah dimatikan. Office to PDF, PDF to Word, Compress PDF, dan Protect or unlock PDF butuh server lokal, jadi nggak jalan dalam mode ini. Dev server nggak pernah mendaftarkan service worker.

## Kalau ada masalah

| Gejala | Penyebab dan solusi |
|--------|---------------------|
| `node` atau `npm` nggak dikenali | Node.js belum terinstall, atau terminal belum dibuka ulang setelah install. |
| `brew: command not found` di macOS | Homebrew baru diinstall. Jalankan baris "Next steps" yang muncul di akhir instalasi Homebrew, atau buka Terminal baru. |
| `Setting up fake worker failed` | Jalankan `npm install` lagi. |
| Kartu menampilkan "Needs Microsoft Word", "Needs LibreOffice", atau "Needs Ghostscript" | Programnya belum terpasang atau nggak ketemu. Lihat bagian [Program tambahan](#program-tambahan-opsional). |
| PDF to Word bilang "Microsoft Word is open" | Simpan pekerjaanmu, tutup Word, lalu coba lagi. |
| PDF to Word atau Office to PDF gagal di file yang diberi password | Buka password filenya dulu. |
| Port 3000 sudah dipakai | Jalankan `npm run start -- -p 3001`, lalu buka `http://localhost:3001`. |
| SmartScreen memblokir installer | Klik **More info**, lalu **Run anyway**. |

## Buat developer

### Command yang tersedia

| Command | Fungsinya |
|---------|-----------|
| `npm run dev` | Jalankan dev server (cocok buat ngoprek kode, buka di `http://localhost:3000`) |
| `npm run build` | Production build (sekalian cek lint dan type) |
| `npm run start` | Jalankan hasil production build |
| `npm run lint` | Jalankan ESLint saja |
| `npm run electron:run` | Jalankan versi desktop tanpa install |
| `npm run electron:dir` | Build folder aplikasi desktop tanpa installer |
| `npm run electron:build` | Build installer Windows ke `dist-electron/` |

`npm install` juga menyalin dua file yang dibutuhkan saat runtime ke `public/`, yaitu `pdf.worker.min.mjs` (buat render PDF) dan `browser-image-compression.js` (buat compress gambar). Kalau muncul error `Setting up fake worker failed`, jalankan `npm install` sekali lagi.

### Build installer Windows sendiri

Langkah ini cuma buat yang mau bikin file installer, misalnya buat diunggah ke Releases. Pemakai biasa nggak perlu. Installer-nya harus di-build di Windows, dan butuh Node.js.

```powershell
npm install
npm run electron:build
```

Hasilnya ada di `dist-electron\Local File Toolkit Setup 0.1.0.exe`. File ini sudah berisi semua yang dibutuhkan, jadi komputer yang menjalankannya nggak perlu Node.js atau npm.

Aplikasi desktop ini belum bisa update sendiri. Tiap ada versi baru, build installer-nya lagi lalu upload ke Releases.

### Struktur project

- `src/lib/tools.ts`: satu-satunya sumber daftar tools. Grid di halaman utama dan setiap halaman tools membaca dari sini.
- `src/lib/pdf/`, `src/lib/image/`: logika pemrosesan file, terpisah dari tampilan.
- `src/app/tools/<slug>/page.tsx`: satu halaman per tools, pakai layout `ToolShell` dan state machine `useToolRun`.
- `src/app/api/`: route buat tools yang jalan di sisi server.
- `src/lib/libreoffice.ts`, `src/lib/ghostscript.ts`, `src/lib/word.ts`, `src/lib/office-pdf.ts`: deteksi dan pemanggilan program eksternal.
- `electron/`, `scripts/`: wrapper aplikasi desktop dan script buat build installer.

## Soal privasi

Tools yang jalan di browser (`mode: "client"` di `src/lib/tools.ts`) nggak mengirim isi file lewat jaringan. Kalau mau mengecek sendiri, buka tab Network di browser pas kamu pakai tools-nya.

Tools sisi server cuma mengirim file ke route `/api/...` di `localhost`. Server menghapus folder kerja sementaranya begitu selesai menjawab, termasuk kalau terjadi error.

## Lisensi

[MIT](LICENSE)
