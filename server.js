// server.js — SPH Simulator Backend (Express + PostgreSQL)
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ptt-sph-change-this-secret-in-production';

// ── DATABASE ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'commercial'
          CHECK(role IN ('admin','commercial','manager','director')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS sph_counter (
        id INT PRIMARY KEY DEFAULT 1,
        value INT DEFAULT 0
      );
      INSERT INTO sph_counter(id,value) VALUES(1,0) ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS sph_records (
        id TEXT PRIMARY KEY,
        nomor TEXT,
        tanggal TEXT,
        kepada TEXT,
        perihal TEXT,
        items JSONB NOT NULL DEFAULT '[]',
        subtotal NUMERIC DEFAULT 0,
        ppn_rate TEXT DEFAULT '0',
        ppn NUMERIC DEFAULT 0,
        total NUMERIC DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT NOT NULL,
        created_name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        submitted_at TIMESTAMPTZ,
        mengetahui JSONB,
        menyetujui JSONB
      );
    `);

    // Create default admin if no users exist
    const { rows } = await client.query('SELECT COUNT(*) as n FROM users');
    if (parseInt(rows[0].n) === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        'INSERT INTO users(username,password_hash,name,role) VALUES($1,$2,$3,$4)',
        ['admin', hash, 'Administrator', 'admin']
      );
      console.log('Default admin created: admin / admin123');
    }
    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token diperlukan' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Khusus Admin' });
  next();
}

// ── AUTH ROUTES ──
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username.toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', auth, (req, res) => res.json(req.user));

// ── USER ROUTES (admin only) ──
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,username,name,role,created_at FROM users ORDER BY id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'Semua field wajib diisi' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  const validRoles = ['admin','commercial','manager','director'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users(username,password_hash,name,role) VALUES($1,$2,$3,$4)',
      [username.toLowerCase(), hash, name, role]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: `Username "${username}" sudah digunakan` });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  const { name, password, role } = req.body || {};
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (name)  await pool.query('UPDATE users SET name=$1, updated_at=NOW() WHERE id=$2', [name, req.params.id]);
    if (role)  await pool.query('UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2', [role, req.params.id]);
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (rows[0].username === req.user.username) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPH ROUTES ──
app.get('/api/sph', auth, async (req, res) => {
  try {
    let rows;
    const isReviewer = ['admin','manager','director'].includes(req.user.role);
    if (isReviewer) {
      ({ rows } = await pool.query('SELECT * FROM sph_records ORDER BY created_at DESC'));
    } else {
      ({ rows } = await pool.query('SELECT * FROM sph_records WHERE created_by=$1 ORDER BY created_at DESC', [req.user.username]));
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sph', auth, async (req, res) => {
  const { nomor,tanggal,kepada,perihal,items,subtotal,ppn_rate,ppn,total,status } = req.body || {};
  if (!items || !items.length) return res.status(400).json({ error: 'Items wajib ada' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ctr = await client.query('UPDATE sph_counter SET value=value+1 WHERE id=1 RETURNING value');
    const n = ctr.rows[0].value;
    const yr = new Date().getFullYear();
    const id = `SPH-${yr}-${String(n).padStart(3,'0')}`;
    await client.query(
      `INSERT INTO sph_records(id,nomor,tanggal,kepada,perihal,items,subtotal,ppn_rate,ppn,total,status,created_by,created_name,submitted_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, nomor||'', tanggal||'', kepada||'', perihal||'',
       JSON.stringify(items), subtotal||0, ppn_rate||'0', ppn||0, total||0,
       status==='submitted'?'submitted':'draft',
       req.user.username, req.user.name,
       status==='submitted'?new Date():null]
    );
    await client.query('COMMIT');
    res.json({ ok: true, id });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/api/sph/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sph_records WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'SPH tidak ditemukan' });
    const r = rows[0];
    const isReviewer = ['admin','manager','director'].includes(req.user.role);
    if (!isReviewer && r.created_by !== req.user.username) return res.status(403).json({ error: 'Akses ditolak' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sph/:id/approve', auth, async (req, res) => {
  const { step, approved, note } = req.body || {};
  if (!['mengetahui','menyetujui'].includes(step)) return res.status(400).json({ error: 'Step tidak valid' });
  if (!approved && !note) return res.status(400).json({ error: 'Catatan wajib diisi saat menolak' });

  const canMengetahui = ['manager','director','admin'].includes(req.user.role);
  const canMenyetujui = ['director','admin'].includes(req.user.role);
  if (step==='mengetahui' && !canMengetahui) return res.status(403).json({ error: 'Tidak memiliki hak Mengetahui' });
  if (step==='menyetujui' && !canMenyetujui) return res.status(403).json({ error: 'Tidak memiliki hak Menyetujui' });

  try {
    const { rows } = await pool.query('SELECT * FROM sph_records WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'SPH tidak ditemukan' });
    const rec = rows[0];
    if (!['submitted','partial'].includes(rec.status)) return res.status(400).json({ error: 'SPH tidak dalam status yang bisa diapprove' });
    if (step==='menyetujui' && !rec.mengetahui) return res.status(400).json({ error: 'Harus Mengetahui dulu sebelum Menyetujui' });

    const entry = JSON.stringify({ name: req.user.name, username: req.user.username, at: new Date().toISOString(), note: note||'', approved });
    let newStatus;
    if (step === 'mengetahui') {
      newStatus = approved ? 'partial' : 'rejected';
      await pool.query('UPDATE sph_records SET mengetahui=$1, status=$2 WHERE id=$3', [entry, newStatus, req.params.id]);
    } else {
      newStatus = approved ? 'approved' : 'rejected';
      await pool.query('UPDATE sph_records SET menyetujui=$1, status=$2 WHERE id=$3', [entry, newStatus, req.params.id]);
    }
    res.json({ ok: true, status: newStatus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── START ──
initDB().then(() => {
  app.listen(PORT, () => console.log(`SPH Server running on port ${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
