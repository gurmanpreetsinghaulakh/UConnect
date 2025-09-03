const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises'); // New import for file system operations
const Post = require('../models/Post');
const auth = require('../middleware/authMiddleware');

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const deletedDir = path.join(uploadsDir, 'deleted'); // New directory for deleted files

// Ensure the deleted directory exists
(async () => {
  try {
    await fs.mkdir(deletedDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create deleted directory:', err);
  }
})();

// Helper function to safely move a file
async function safeMoveFile(filename) {
  try {
    const srcPath = path.join(uploadsDir, filename);
    const destPath = path.join(deletedDir, filename);
    await fs.rename(srcPath, destPath);
    console.log(`Successfully moved file: ${filename}`);
  } catch (err) {
    console.error(`Failed to move file ${filename}:`, err);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|mov|webm/;
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.test(ext) ? cb(null, true) : cb(new Error('Only image/video files allowed'));
  }
});

// Create post
router.post('/', auth, upload.single('media'), async (req, res) => {
  try {
    const content = (req.body.content || '').trim();
    const category = (req.body.category || 'academics').toLowerCase();
    if (!['academics','campus event','sports','clubs'].includes(category)) {
      return res.status(400).json({ ok:false, message:'Invalid category' });
    }
    if (!content && !req.file) return res.status(400).json({ ok:false, message:'Post cannot be empty' });

    const postData = {
      userId: req.user._id,
      content,
      category
    };

    if (req.file) {
      const ext = path.extname(req.file.filename).toLowerCase();
      const type = ['.mp4','.mov','.webm'].includes(ext) ? 'video' : 'image';
      postData.media = { type, url: `/uploads/${req.file.filename}` };
    }

    const post = await Post.create(postData);
    res.json({ ok:true, post });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Feed (all or category)
router.get('/', auth, async (req, res) => {
  try {
    const cat = (req.query.category || 'foru').toLowerCase();
    const filter = (cat && cat !== 'foru') ? { category: cat } : {};
    const posts = await Post.find(filter)
      .populate('userId','name username avatar')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ok:true, posts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Posts by user
router.get('/user/:uid', auth, async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.uid })
      .populate('userId','name username avatar')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ok:true, posts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Like / Unlike
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ ok:false, message:'Post not found' });
    const uid = req.user._id.toString();
    const has = post.likes.some(x => x.toString() === uid);
    if (has) {
      post.likes = post.likes.filter(x => x.toString() !== uid);
    } else {
      post.likes.push(req.user._id);
    }
    await post.save();
    res.json({ ok:true, likes: post.likes.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Add comment
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ ok:false, message:'Post not found' });
    const body = (req.body.body || '').trim();
    if (!body) return res.status(400).json({ ok:false, message:'Empty comment' });

    post.comments.push({ userId: req.user._id, body });
    await post.save();
    res.json({ ok:true, comments: post.comments.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Get comments
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('comments.userId','name username avatar');
    if (!post) return res.status(404).json({ ok:false, message:'Post not found' });
    res.json({ ok:true, comments: post.comments });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Delete post (owner or admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate('userId','_id');
    if (!post) return res.status(404).json({ ok:false, message:'Post not found' });

    const isOwner = post.userId._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ ok:false, message:'Not allowed' });

    if (post.media && post.media.url) {
      const filename = path.basename(post.media.url);
      await safeMoveFile(filename);
    }

    await Post.deleteOne({ _id: post._id });
    res.json({ ok:true, message:'Post deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// Delete comment (owner or admin)
router.delete('/:postId/comments/:commentId', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ ok:false, message:'Post not found' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ ok:false, message:'Comment not found' });

    const isOwner = comment.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ ok:false, message:'Not allowed' });

    comment.deleteOne();
    await post.save();
    res.json({ ok:true, message:'Comment deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

module.exports = router;
