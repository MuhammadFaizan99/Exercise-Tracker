// index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ----- Middleware -----
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// ----- DB -----
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.warn('⚠️  No MONGO_URI found in .env — set it to your MongoDB connection string.');
}
mongoose
  .connect(MONGO_URI, { dbName: 'fcc_exercise_tracker' })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((e) => console.error('MongoDB connection error:', e.message));

// ----- Models -----
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: false, trim: true },
});
const User = mongoose.model('User', userSchema);

const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  description: { type: String, required: true, trim: true },
  duration: { type: Number, required: true },
  date: { type: Date, required: true },
});
const Exercise = mongoose.model('Exercise', exerciseSchema);

// ----- Routes -----
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

/**
 * POST /api/users
 * body: { username }
 * response: { username, _id }
 */
app.post('/api/users', async (req, res, next) => {
  try {
    const { username } = req.body || {};
    if (!username || !username.trim()) return res.status(400).json({ error: 'username required' });
    const user = await User.create({ username: username.trim() });
    return res.json({ username: user.username, _id: user._id });
  } catch (err) { next(err); }
});

/**
 * GET /api/users
 * response: [ { username, _id }, ... ]
 */
app.get('/api/users', async (_req, res, next) => {
  try {
    const users = await User.find({}, 'username _id').lean();
    return res.json(users);
  } catch (err) { next(err); }
});

/**
 * POST /api/users/:_id/exercises
 * body: { description, duration, date? }
 * response: { _id, username, date, duration, description }
 * - date defaults to current date if missing/invalid
 */
app.post('/api/users/:_id/exercises', async (req, res, next) => {
  try {
    const { _id } = req.params;
    const { description, duration, date } = req.body || {};

    const user = await User.findById(_id);
    if (!user) return res.status(400).json({ error: 'unknown userId' });

    const dur = parseInt(duration, 10);
    if (!description || !description.trim() || Number.isNaN(dur)) {
      return res.status(400).json({ error: 'description and duration required (duration must be a number)' });
    }

    // Parse date (default to today if missing/invalid)
    let d = new Date(date);
    if (!date || isNaN(d.getTime())) d = new Date();

    const ex = await Exercise.create({
      userId: user._id,
      description: description.trim(),
      duration: dur,
      date: d,
    });

    return res.json({
      _id: user._id.toString(),
      username: user.username,
      description: ex.description,
      duration: ex.duration,
      date: ex.date.toDateString(),
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/users/:_id/logs?[from][&to][&limit]
 * response:
 * {
 *   username, count, _id, log: [{ description, duration, date }]
 * }
 */
app.get('/api/users/:_id/logs', async (req, res, next) => {
  try {
    const { _id } = req.params;
    const { from, to, limit } = req.query;

    const user = await User.findById(_id);
    if (!user) return res.status(400).json({ error: 'unknown userId' });

    // Build query
    const q = { userId: user._id };
    if (from || to) {
      q.date = {};
      if (from && !Number.isNaN(new Date(from).getTime())) q.date.$gte = new Date(from);
      if (to && !Number.isNaN(new Date(to).getTime())) q.date.$lte = new Date(to);
      // If both invalid, remove date filter
      if (Object.keys(q.date).length === 0) delete q.date;
    }

    let cursor = Exercise.find(q).sort({ date: 1 }); // ascending date
    const lim = parseInt(limit, 10);
    if (!Number.isNaN(lim) && lim > 0) cursor = cursor.limit(lim);

    const exercises = await cursor.lean();

    const log = exercises.map((e) => ({
      description: e.description,
      duration: e.duration,
      date: new Date(e.date).toDateString(),
    }));

    return res.json({
      username: user.username,
      count: log.length,
      _id: user._id.toString(),
      log,
    });
  } catch (err) { next(err); }
});

// ----- Error handler -----
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

// ----- Listen (for Replit/Glitch/Local) -----
const port = process.env.PORT || 3000;
const listener = app.listen(port, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
