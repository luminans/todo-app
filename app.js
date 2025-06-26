const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Database initialization
const dbPath = path.join(__dirname, 'db', 'todo.db');
const initDb = new sqlite3.Database(dbPath);

initDb.serialize(() => {
  initDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      email TEXT NOT NULL
    )
  `);
  initDb.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
  console.log('Database initialized successfully');
});

initDb.close();

// Set EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Parse POST request body
app.use(express.urlencoded({ extended: false }));

// Session settings
app.use(session({
  secret: 'mysecretkey',
  resave: false,
  saveUninitialized: false
}));

// Middleware to check login
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// Home route
app.get('/', (req, res) => {
  res.render('index');
});

// Sign up form
app.get('/register', (req, res) => {
  res.render('register');
});

// Sign up handler
app.post('/register', async (req, res) => {
  const { userid, password, email } = req.body;
  const db = new sqlite3.Database(dbPath);

  // Check for duplicate ID
  db.get('SELECT id FROM users WHERE id = ?', [userid], async (err, row) => {
    if (err) {
      db.close();
      return res.send('Database error');
    }
    if (row) {
      db.close();
      return res.send('ID already exists.');
    }
    // Hash the password
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (id, password, email) VALUES (?, ?, ?)', [userid, hash, email], (err) => {
      db.close();
      if (err) return res.send('Sign up failed');
      res.send('Sign up successful! <a href="/login">Login</a>');
    });
  });
});

// Login form
app.get('/login', (req, res) => {
  res.render('login');
});

// Login handler
app.post('/login', (req, res) => {
  const { userid, password } = req.body;
  const db = new sqlite3.Database(dbPath);
  db.get('SELECT * FROM users WHERE id = ?', [userid], async (err, user) => {
    db.close();
    if (err || !user) {
      return res.redirect('/login-fail');
    }
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.userId = user.id;
      return res.redirect('/todos');
    } else {
      return res.redirect('/login-fail');
    }
  });
});

// Login failed page
app.get('/login-fail', (req, res) => {
  res.render('login-fail');
});

// To Do list page
app.get('/todos', requireLogin, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  db.all('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at ASC', [req.session.userId], (err, rows) => {
    db.close();
    if (err) return res.send('Database error');
    res.render('todos', { todos: rows });
  });
});

// Add To Do form
app.get('/todos/new', requireLogin, (req, res) => {
  res.render('todo-new');
});

// Add To Do handler
app.post('/todos/new', requireLogin, (req, res) => {
  const { title } = req.body;
  const db = new sqlite3.Database(dbPath);
  db.run('INSERT INTO todos (user_id, title) VALUES (?, ?)', [req.session.userId, title], (err) => {
    db.close();
    if (err) return res.send('Failed to add to-do');
    res.redirect('/todos');
  });
});

// Edit To Do form
app.get('/todos/:id/edit', requireLogin, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  db.get('SELECT * FROM todos WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], (err, todo) => {
    db.close();
    if (err || !todo) return res.send('To-do to edit not found.');
    res.render('todo-edit', { todo });
  });
});

// Edit To Do handler
app.post('/todos/:id/edit', requireLogin, (req, res) => {
  const { title } = req.body;
  const db = new sqlite3.Database(dbPath);
  db.run('UPDATE todos SET title = ? WHERE id = ? AND user_id = ?', [title, req.params.id, req.session.userId], function(err) {
    db.close();
    if (err || this.changes === 0) return res.send('Edit failed');
    res.redirect('/todos');
  });
});

// Delete To Do handler
app.post('/todos/:id/delete', requireLogin, (req, res) => {
  const db = new sqlite3.Database(dbPath);
  db.run('DELETE FROM todos WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], function(err) {
    db.close();
    if (err || this.changes === 0) return res.send('Delete failed');
    res.redirect('/todos');
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
}); 