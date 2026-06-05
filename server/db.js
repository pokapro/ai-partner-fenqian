// database setup - SQLite with sql.js (pure JS, no native compilation needed)
// Initialized synchronously at startup
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');
let db = null;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  ensureDir(DB_PATH);

  let database;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    database = new SQL.Database(buffer);
  } else {
    database = new SQL.Database();
  }

  database.run('PRAGMA journal_mode=WAL');
  database.run('PRAGMA encoding="UTF-8"');

  database.run(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      source TEXT NOT NULL DEFAULT 'manual_test',
      contact TEXT NOT NULL DEFAULT '',
      partner_count INTEGER NOT NULL,
      input_json TEXT NOT NULL,
      report_markdown TEXT DEFAULT '',
      payment_intent TEXT DEFAULT '',
      review_status TEXT NOT NULL DEFAULT 'pending_review',
      review_note TEXT DEFAULT ''
    );
  `);

  function persist() {
    const data = database.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }

  db = {
    createCase({ id, partnerCount, contact, inputJson }) {
      database.run(
        `INSERT INTO cases (id, partner_count, contact, input_json)
         VALUES (?, ?, ?, ?)`,
        [id, partnerCount, contact, JSON.stringify(inputJson)]
      );
      persist();
    },

    updateReport(id, reportMarkdown, reviewStatus = 'pending_review') {
      database.run(
        `UPDATE cases SET report_markdown = ?, review_status = ? WHERE id = ?`,
        [reportMarkdown, reviewStatus, id]
      );
      persist();
    },

    updatePaymentIntent(id, paymentIntent) {
      database.run(
        `UPDATE cases SET payment_intent = ? WHERE id = ?`,
        [paymentIntent, id]
      );
      persist();
    },

    updateReviewStatus(id, status, note = '') {
      database.run(
        `UPDATE cases SET review_status = ?, review_note = ? WHERE id = ?`,
        [status, note, id]
      );
      persist();
    },

    getCase(id) {
      const stmt = database.prepare('SELECT * FROM cases WHERE id = ?');
      stmt.bind([id]);
      let row = null;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      stmt.free();
      return row;
    },

    getAllCases() {
      const results = [];
      const stmt = database.prepare('SELECT * FROM cases ORDER BY created_at DESC');
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },

    getPendingCases() {
      const results = [];
      const stmt = database.prepare("SELECT * FROM cases WHERE review_status = 'pending_review' ORDER BY created_at DESC");
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    }
  };

  return db;
}

module.exports = { initDb };
