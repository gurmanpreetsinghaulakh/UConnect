const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  body: String,
  createdAt: { type: Date, default: Date.now }
});

const MediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image','video'], required: true },
  url: { type: String, required: true }
});

const PostSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  media: MediaSchema,
  category: { type: String, enum: ['academics','campus event','sports','clubs'], default: 'academics' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [CommentSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', PostSchema);
