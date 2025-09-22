const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.sqlite");

// Init tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS ebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    cover TEXT,
    status TEXT, -- 'published' | 'upcoming'
    releaseDate TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS upcoming_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ebook_id INTEGER,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ebook_id) REFERENCES ebooks(id)
  )`);
});

module.exports = db;