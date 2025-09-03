const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },

  role: { type: String, enum: ['user', 'admin'], default: 'user' },

  verified: { type: Boolean, default: false },
  emailVerifiedAt: { type: Date, default: null },

  // verification flow
  emailVerifyToken: { type: String, default: '' },
  emailVerifyTokenExp: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
