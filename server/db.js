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

  /**
   * Classify a case's funding mode and effort profile from its input_json.
   * Returns { fundingMode, effortSignature } for matching.
   */
  function classifyCase(inputJson) {
    let partners;
    try {
      partners = typeof inputJson === 'string' ? JSON.parse(inputJson).partners : inputJson.partners;
    } catch (e) {
      return null;
    }
    if (!Array.isArray(partners) || partners.length === 0) return null;

    const capitals = partners.map(p => Number(p.capital) || 0);
    const total = capitals.reduce((a, b) => a + b, 0);

    // Funding mode
    let fundingMode;
    if (total === 0) {
      fundingMode = '0元出资'; // all 0
    } else if (capitals.every(c => c > 0 && Math.abs(c / capitals[0] - 1) < 0.01)) {
      // All equal (within 1% tolerance of the first one)
      fundingMode = '等额出资';
    } else if (capitals.some(c => c === 0)) {
      fundingMode = '0元出资'; // at least one 0
    } else {
      fundingMode = '不等额出资';
    }

    // Refine: if some capital inflow matches but some are zero, it's '0元出资'
    if (fundingMode === '等额出资' && capitals.some(c => c === 0)) {
      fundingMode = '0元出资';
    }

    // Effort signature: sorted list of effort types
    const effortTypes = partners.map(p => (p.effortType || '').trim()).filter(Boolean).sort();
    const effortSignature = effortTypes.join('+');

    return { partnerCount: partners.length, fundingMode, effortSignature, capitals, totalCapital: total };
  }

  /**
   * Score how similar two cases are.
   * Returns a similarity score (higher = more similar).
   */
  function similarityScore(a, b) {
    if (!a || !b) return 0;
    let score = 0;

    // Same partner count: +30
    if (a.partnerCount === b.partnerCount) score += 30;
    // Same funding mode: +30
    if (a.fundingMode === b.fundingMode) score += 30;
    // Same effort signature (exact): +20
    if (a.effortSignature === b.effortSignature && a.effortSignature !== '') score += 20;
    // Partial effort overlap: +10 if at least one effort type matches
    if (a.effortSignature && b.effortSignature) {
      const aSet = new Set(a.effortSignature.split('+'));
      const bSet = new Set(b.effortSignature.split('+'));
      const intersection = [...aSet].filter(x => bSet.has(x));
      if (intersection.length > 0 && a.effortSignature !== b.effortSignature) {
        score += 10;
      }
    }
    // Same total capital magnitude (within 50%): +20
    if (a.totalCapital > 0 && b.totalCapital > 0) {
      const ratio = Math.max(a.totalCapital, b.totalCapital) / Math.min(a.totalCapital, b.totalCapital);
      if (ratio <= 1.5) score += 20;
    }

    return score;
  }

  /**
   * Extract a sanitized (de-identified) similar case summary from a DB row.
   */
  function sanitizeCase(row) {
    let inputJson;
    try {
      inputJson = typeof row.input_json === 'string' ? JSON.parse(row.input_json) : row.input_json;
    } catch (e) {
      return null;
    }
    const partners = inputJson.partners || [];
    const caps = partners.map(p => Number(p.capital) || 0);
    const total = caps.reduce((a, b) => a + b, 0);

    return {
      partnerCount: Number(row.partner_count),
      fundingMode: classifyCase(inputJson)?.fundingMode || '未知',
      effortTypes: partners.map(p => p.effortType || ''),
      totalCapital: total,
      // Extract which allocation scheme was chosen in the report (if available)
      allocationScheme: extractAllocationScheme(row.report_markdown),
      caseId: row.id,
      createdAt: row.created_at
    };
  }

  /**
   * Extract the recommended allocation scheme from a report.
   */
  function extractAllocationScheme(markdown) {
    if (!markdown) return '未知';
    const lines = markdown.split('\n');
    // Look for 推荐方案 section
    let inRecommend = false;
    for (const line of lines) {
      if (line.startsWith('##') && line.includes('推荐方案')) {
        inRecommend = true;
        continue;
      }
      if (inRecommend) {
        if (line.startsWith('##')) break;
        const match = line.match(/(保守型|平衡型|激励型|方案一|方案二|方案三)/);
        if (match) {
          // Map to human-readable
          const schemeMap = {
            '方案一': '保守型',
            '方案二': '平衡型',
            '方案三': '激励型'
          };
          return schemeMap[match[1]] || match[1];
        }
      }
    }
    return '未知';
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
    },

    /**
     * Find up to `limit` similar cases (de-identified) based on funding mode and effort type matching.
     * Excludes the current case if `excludeId` is provided.
     */
    findSimilarCases(partners, limit = 5, excludeId = null) {
      const currentClass = classifyCase({ partners });
      if (!currentClass) return [];

      const allCases = db.getAllCases();
      const scored = [];

      for (const row of allCases) {
        // Skip excluded case
        if (excludeId && row.id === excludeId) continue;
        // Skip cases without a proper report
        if (!row.report_markdown || row.report_markdown.trim().length === 0) continue;

        let rowInput;
        try {
          rowInput = typeof row.input_json === 'string' ? JSON.parse(row.input_json) : row.input_json;
        } catch (e) {
          continue;
        }

        const rowClass = classifyCase(rowInput);
        const score = similarityScore(currentClass, rowClass);
        if (score > 0) {
          const sanitized = sanitizeCase(row);
          if (sanitized) {
            scored.push({ score, case: sanitized });
          }
        }
      }

      // Sort by similarity score descending, then by recency descending
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.case.createdAt || '').localeCompare(a.case.createdAt || '');
      });

      return scored.slice(0, limit).map(s => s.case);
    },

    /**
     * Get aggregate statistics about all cases.
     * Returns: total cases, scheme breakdown, etc.
     */
    getCaseStats() {
      const allCases = db.getAllCases();
      const withReport = allCases.filter(c => c.report_markdown && c.report_markdown.trim().length > 0);

      // Scheme adoption count
      const schemeCount = {};
      let schemeUnknown = 0;
      for (const c of withReport) {
        const scheme = extractAllocationScheme(c.report_markdown);
        if (scheme !== '未知') {
          schemeCount[scheme] = (schemeCount[scheme] || 0) + 1;
        } else {
          schemeUnknown++;
        }
      }

      // Review status breakdown
      const reviewStats = {};
      for (const c of allCases) {
        const status = c.review_status || 'pending_review';
        reviewStats[status] = (reviewStats[status] || 0) + 1;
      }

      // Payment intent count
      const withPayment = allCases.filter(c => c.payment_intent && c.payment_intent.trim().length > 0).length;

      // Funding mode distribution
      const fundingModeCount = {};
      for (const c of withReport) {
        let inputJson;
        try {
          inputJson = typeof c.input_json === 'string' ? JSON.parse(c.input_json) : c.input_json;
        } catch (e) {
          continue;
        }
        const cls = classifyCase(inputJson);
        if (cls) {
          fundingModeCount[cls.fundingMode] = (fundingModeCount[cls.fundingMode] || 0) + 1;
        }
      }

      return {
        totalCases: allCases.length,
        totalWithReport: withReport.length,
        schemeAdoption: schemeCount,
        schemeUnknown,
        reviewStats,
        withPaymentIntent: withPayment,
        fundingModeDistribution: fundingModeCount
      };
    }
  };

  return db;
}

module.exports = { initDb };
