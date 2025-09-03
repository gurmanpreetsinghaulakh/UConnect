const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const { sendVerificationEmail } = require('../utils/email');
const { deleteUserCascade } = require('../utils/cascade');

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

const createToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || "1d") =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

function isAllowedUniversityEmail(email) {
  const allowed = (process.env.ALLOWED_DOMAINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true; // fallback (allow all) if not set
  return allowed.some(dom => email.endsWith(dom));
}

// Seed admin (single endpoint)
router.post('/create-admin', async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ username: 'uconnect', role: 'admin' });
    if (existingAdmin) return res.status(409).json({ ok:false, message:'Admin already exists' });

    const hash = await bcrypt.hash('admin123', 10);
    const admin = await User.create({
      name: 'UConnect Admin',
      username: 'uconnect',
      email: 'admin@uconnect.com',
      password: hash,
      role: 'admin',
      verified: true,
      emailVerifiedAt: new Date(),
      avatar: 'https://placehold.co/150x150/000000/FFFFFF?text=ADMIN'
    });
    res.json({ ok:true, message:'Admin created', admin: { id: admin._id, username: admin.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Signup -> creates user (unverified) and emails link (console)
router.post('/signup', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password) {
      return res.status(400).json({ ok:false, message:'Missing fields' });
    }

    if (!isAllowedUniversityEmail(email)) {
      return res.status(400).json({ ok:false, message:'Please use your university email to sign up.' });
    }

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      if (existing.verified) return res.status(409).json({ ok:false, message:'User already exists.' });
      // allow re-send verification
    }

    const hash = await bcrypt.hash(password, 10);
    const payload = { name, username, email, password: hash, role: 'user', verified: false };

    let user;
    if (!existing) user = await User.create(payload);
    else user = existing;

    // create email verification JWT
    const emailToken = jwt.sign(
      { uid: user._id.toString(), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.EMAIL_VERIFY_TOKEN_EXPIRES_IN || '1d' }
    );

    user.emailVerifyToken = emailToken;
    user.emailVerifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const verifyUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email?token=${emailToken}`;
    await sendVerificationEmail(user.email, verifyUrl);

    res.json({ ok:true, message:'Signup successful. Please check your email to verify your account.' });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Verify email -> marks user verified, returns redirect
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ ok:false, message:'Missing token' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ ok:false, message:'Invalid or expired token' });
    }

    const user = await User.findById(decoded.uid);
    if (!user || user.email !== decoded.email) {
      return res.status(400).json({ ok:false, message:'Invalid token' });
    }

    if (user.verified) {
      return res.redirect('/pages/signin.html?verified=1'); // already verified
    }

    if (user.emailVerifyToken !== token) {
      return res.status(400).json({ ok:false, message:'Token mismatch' });
    }

    user.verified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerifyToken = '';
    user.emailVerifyTokenExp = null;
    await user.save();

    // Optionally auto-login after verification 
    // const t = createToken({ user: { _id: user._id, role: user.role } });
    // res.cookie('token', t, { httpOnly: true, sameSite: 'strict' });

    res.redirect('/pages/signin.html?verified=1');
  } catch (e) {
    console.error('Verify email error:', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Login -> user must be verified 
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ ok:false, message:'Missing fields' });

    // Admin special-case
    let user = await User.findOne({ $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }] });

    if (!user) return res.status(400).json({ ok:false, message:'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ ok:false, message:'Invalid credentials' });

    if (user.role !== 'admin') {
      // enforce university email + verified
      if (!isAllowedUniversityEmail(user.email)) {
        return res.status(403).json({ ok:false, message:'Only university email accounts are allowed.' });
      }
      if (!user.verified) {
        return res.status(403).json({ ok:false, message:'Please verify your email first.' });
      }
    }

    const token = jwt.sign({ user: { _id: user._id, role: user.role } }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'strict' });

    const redirect = user.role === 'admin' ? '/pages/adminDashboard.html' : '/pages/userHome.html';
    res.json({ ok:true, redirect });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
  res.json({ ok:true });
});

// Who am I
router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user._id).select('name username email avatar role verified');
  if (!user) return res.status(404).json({ ok:false, message:'User not found' });
  res.json({ ok:true, user });
});

// Upload avatar
router.post('/upload-avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'No file' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ ok:false, message:'User not found' });

    // optional: delete old file if local path
    if (user.avatar && user.avatar.startsWith('/uploads/')) {
      const oldPath = path.join(uploadsDir, path.basename(user.avatar));
      fs.existsSync(oldPath) && fs.unlink(oldPath, () => {});
    }

    user.avatar = `/uploads/${req.file.filename}`;
    await user.save();
    res.json({ ok:true, avatar: user.avatar });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Update profile (name, username)
router.post('/update-profile', auth, async (req, res) => {
  try {
    const { name, username } = req.body;
    if (!name || !username) return res.status(400).json({ ok:false, message:'Name and username are required' });

    const me = await User.findById(req.user._id);
    if (!me) return res.status(404).json({ ok:false, message:'User not found' });

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists && exists._id.toString() !== me._id.toString()) {
      return res.status(409).json({ ok:false, message:'Username already taken' });
    }

    me.name = name;
    me.username = username.toLowerCase();
    await me.save();

    res.json({ ok:true, message:'Profile updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Change password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ ok:false, message:'Missing fields' });

    const me = await User.findById(req.user._id);
    if (!me) return res.status(404).json({ ok:false, message:'User not found' });

    const ok = await bcrypt.compare(oldPassword, me.password);
    if (!ok) return res.status(400).json({ ok:false, message:'Old password incorrect' });

    me.password = await bcrypt.hash(newPassword, 10);
    await me.save();
    res.json({ ok:true, message:'Password updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Delete account (cascade)
router.delete('/delete-account', auth, async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    if (!me) return res.status(404).json({ ok:false, message:'User not found' });

    await deleteUserCascade(me._id);
    await User.deleteOne({ _id: me._id });
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
    res.json({ ok:true, message:'Account deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
