# SPH Simulator — Deployment Guide
## PT. Palapa Timur Telematika

### Cara Deploy ke Railway (Gratis, ~10 menit)

---

## 1. Persiapan — Install Git & buat akun

1. Install [Git](https://git-scm.com/downloads) di komputer Anda
2. Buat akun di [railway.app](https://railway.app) (pakai GitHub atau Google)

---

## 2. Upload ke GitHub

1. Buat repository baru di [github.com](https://github.com/new)
   - Name: `sph-simulator`
   - Visibility: **Private** (penting! jangan Public)
   - Klik **Create repository**

2. Buka terminal/command prompt, masuk ke folder `sph-app`:
```bash
cd sph-app
git init
git add .
git commit -m "Initial SPH Simulator"
git remote add origin https://github.com/NAMA_ANDA/sph-simulator.git
git push -u origin main
```

---

## 3. Deploy di Railway

1. Buka [railway.app/dashboard](https://railway.app/dashboard)
2. Klik **New Project**
3. Pilih **Deploy from GitHub repo** → pilih `sph-simulator`
4. Railway akan otomatis detect Node.js dan mulai deploy

### Tambah Database PostgreSQL:
5. Di project Railway, klik **+ New** → **Database** → **PostgreSQL**
6. Tunggu database siap (30 detik)
7. Klik **PostgreSQL** → tab **Connect** → salin `DATABASE_URL`

### Set Environment Variables:
8. Klik service `sph-simulator` → tab **Variables** → **+ New Variable**:
   ```
   DATABASE_URL = (paste dari langkah 7)
   JWT_SECRET   = (buat string acak panjang, mis: ptt-sph-2026-AbCdEfGhIjKlMnOp)
   PORT         = 3000
   ```
9. Save → Railway akan restart otomatis

### Dapat URL:
10. Klik tab **Settings** → bagian **Domains** → **Generate Domain**
11. URL Anda akan seperti: `https://sph-simulator-production.up.railway.app`

---

## 4. Login Pertama

Buka URL Railway Anda, login dengan:
- **Username:** `admin`
- **Password:** `admin123`

⚠️ **Segera ganti password admin** setelah login pertama melalui **👥 Kelola User**.

---

## 5. Kelola User

Login sebagai admin → klik **👥 Kelola User** di pojok kanan atas.

| Role | Bisa apa |
|------|----------|
| `commercial` | Buat SPH, simpan draft, kirim untuk approval |
| `manager` | + Mengetahui (approve level 1) |
| `director` | + Menyetujui (approve level 2, bisa cetak) |
| `admin` | Semua akses + kelola user |

---

## 6. Alur Kerja SPH

```
Commercial buat SPH  →  Kirim Approval
                              ↓
               Manager login → Riwayat → Mengetahui ✓
                              ↓
            Director login → Riwayat → Menyetujui ✓
                              ↓
                    Status: DISETUJUI — Tombol Cetak muncul
```

Tombol **🖨 Cetak / Simpan PDF** HANYA muncul di **Riwayat SPH** setelah status = Disetujui.

---

## 7. Update Aplikasi

Kalau ada perubahan file, cukup:
```bash
git add .
git commit -m "Update"
git push
```
Railway akan otomatis redeploy dalam ~1 menit.

---

## Troubleshooting

**"Cannot connect to database"** → Pastikan `DATABASE_URL` sudah di-set di Variables Railway.

**"Invalid token"** → Session habis (8 jam). Login ulang.

**Aplikasi lambat pertama kali** → Railway free tier "tidur" setelah 30 menit tidak dipakai. Request pertama akan lambat ~10 detik untuk "bangun". Upgrade ke Hobby plan ($5/bln) untuk menghilangkan ini.

---

## Spesifikasi Teknis

- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL (Railway managed)
- **Auth:** JWT (JSON Web Token), expire 8 jam
- **Password:** bcrypt hash (aman)
- **Frontend:** Single-page HTML, served dari Express
