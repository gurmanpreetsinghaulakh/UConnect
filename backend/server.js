const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const app = express();

const PORT = process.env.PORT || 3000;

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static
app.use(express.static(path.join(__dirname, '..', 'public')));

// DB
mongoose.connect(process.env.MONGO_URI, { })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// API routes (prefix /api)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// HTML routes (served from public/pages)
// Root -> signin
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'signin.html'));
});
app.get('/pages/:file', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', req.params.file));
});

// Fallback 404
app.use((req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
