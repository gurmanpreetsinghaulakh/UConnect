const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const auth = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');
const { deleteUserCascade } = require('../utils/cascade');

// List users with optional search (name, username, email)
router.get('/users', auth, isAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = q
      ? { $or: [
          { name:     { $regex: q, $options: 'i' } },
          { username: { $regex: q, $options: 'i' } },
          { email:    { $regex: q, $options: 'i' } },
        ] }
      : {};
    const users = await User.find(filter).select('name username email role verified avatar createdAt');
    res.json({ ok:true, users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Admin delete user (cascade)
router.delete('/users/:id', auth, isAdmin, async (req, res) => {
  try {
    const uid = req.params.id;
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ ok:false, message:'User not found' });

    await deleteUserCascade(uid);
    await User.deleteOne({ _id: uid });

    res.json({ ok:true, message:'User deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Admin delete any post 
router.delete('/posts/:id', auth, isAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ ok:false, message:'Post not found' });
    await Post.deleteOne({ _id: post._id });
    res.json({ ok:true, message:'Post deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
