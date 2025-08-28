// index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ---------- middleware ----------
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// ---------- Mongo (reuse single connection) ----------
async function connectDB() {
  if (global._mongooseConn) return global._mongooseConn;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGO_URI');
  global._mongooseConn = mongoose.connect(uri, { dbName: 'fcc_exercise_tracker' });
  return global._mongooseConn;
}
app.use(async (_req, _res, next) => {
  try { await connectDB(); next(); } catch (e) { next(e); }
});

// ---------- models (guard for serverless re-use) ----------
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
});
const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  description: { type: String, required: true, trim: true },
  duration: { type: Number, required: true },
  date: { type: Date, required: true },
});
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Exercise = mongoose.models.Exercise || mongoose.model('Exercise', exerciseSchema);

// ---------- routes ----------
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/api/users', async (req, res, next) => {
  try {
    const { username } = req.body || {};
    if (!username?.trim()) return res.status(400).json({ error: 'username required' });
    const user = await User.create({ username: username.trim() });
    res.json({ username: user.username, _id: user._id });
  } catch (err) { next(err); }
});

app.get('/api/users', async (_req, res, next) => {
  try {
    const users = await User.find({}, 'username _id').lean();
    res.json(users);
  } catch (err) { next(err); }
});

app.post('/api/users/:_id/exercises', async (req, res, next) => {
  try {
    const { _id } = req.params;
    const { description, duration, date } = req.body || {};
    const user = await User.findById(_id);
    if (!user) return res.status(400).json({ error: 'unknown userId' });

    const dur = parseInt(duration, 10);
    if (!description?.trim() || Number.isNaN(dur)) {
      return res.status(400).json({ error: 'description and numeric duration required' });
    }
    let d = new Date(date);
    if (!date || isNaN(d)) d = new Date();

    const ex = await Exercise.create({
      userId: user._id,
      description: description.trim(),
      duration: dur,
      date: d,
    });

    res.json({
      _id: user._id.toString(),
      username: user.username,
      description: ex.description,
      duration: ex.duration,
      date: ex.date.toDateString(),
    });
  } catch (err) { next(err); }
});

app.get('/api/users/:_id/logs', async (req, res, next) => {
  try {
    const { _id } = req.params;
    const { from, to, limit } = req.query;

    const user = await User.findById(_id);
    if (!user) return res.status(400).json({ error: 'unknown userId' });

    const q = { userId: user._id };
    if (from || to) {
      q.date = {};
      if (from && !isNaN(new Date(from))) q.date.$gte = new Date(from);
      if (to && !isNaN(new Date(to))) q.date.$lte = new Date(to);
      if (Object.keys(q.date).length === 0) delete q.date;
    }

    let cursor = Exercise.find(q).sort({ date: 1 });
    const lim = parseInt(limit, 10);
    if (lim > 0) cursor = cursor.limit(lim);

    const exercises = await cursor.lean();
    const log = exercises.map(e => ({
      description: e.description,
      duration: e.duration,
      date: new Date(e.date).toDateString(),
    }));

    res.json({ username: user.username, count: log.length, _id: user._id.toString(), log });
  } catch (err) { next(err); }
});

// ---------- error ----------
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

// ---------- export for Vercel; listen only when run locally ----------
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('Local listening on ' + port));
} else {
  module.exports = app;
}
