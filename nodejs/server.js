const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173', // Local frontend (development)
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy violation: origin not allowed.'));
      }
    },
    credentials: true, // Allow cookies/session data
  })
);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_API_URL;

if (!MONGO_URI) {
  console.error('Error: MONGO_API_URL is not defined in your environment variables.');
  process.exit(1);
}

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected to Atlas'))
  .catch((err) => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });

// Session Store
const store = new MongoDBStore({
  uri: MONGO_URI,
  collection: 'sessions',
  connectionOptions: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
});

store.on('error', (error) => {
  console.error('Session store error:', error);
});

// Ensure session secret exists
if (!process.env.SESSION_SECRET) {
  console.error('Error: SESSION_SECRET is not defined in your environment variables.');
  process.exit(1);
}

// Session Middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const User = mongoose.model('User', UserSchema);

// Contact Schema
const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now },
});

const Contact = mongoose.model('Contact', ContactSchema);

// User Registration
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  console.log(username,email,password);
  
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).send('User already exists.');

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.status(201).send('User registered successfully!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error registering user.');
  }
});

// User Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).send('Invalid email or password.');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send('Invalid email or password.');

    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((err) => {
      if (err) return res.status(500).send('Error logging in.');

      req.session.userId = user._id;
      res.send('Login successful!');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error logging in.');
  }
});

// User Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send('Error logging out.');
    res.clearCookie('connect.sid');
    res.send('Logout successful!');
  });
});

// Protected Dashboard Route
app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('Unauthorized. Please log in.');
  }
  res.send('Welcome to your dashboard!');
});

// Contact Form Submission
app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;

  try {
    const newContact = new Contact({
      name,
      email,
      message,
      userId: req.session.userId || null,
    });
    await newContact.save();

    res.status(201).send('Message submitted successfully!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error submitting message.');
  }
});

// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
