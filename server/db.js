// database setup - SQLite with sql.js (pure JS, no native compilation needed)
// Initialized synchronously at startup
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

// 用 HOME 目录持久化数据库，避免 Render 部署重建时丢失
const DB_PATH = process.env.PERSISTENT_DB_PATH || path.join(process.env.HOME || '/tmp', '.fenqian-data', 'app.db');
console.log('[DB] 数据库路径:', DB_PATH);
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

  database.run (`
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
      review_note TEXT DEFAULT '',
      progress INTEGER NOT NULL DEFAULT 0,
      admin_note TEXT DEFAULT '',
      followup_status TEXT DEFAULT ''
    );
  `);

  // 升级：补全旧库可能缺失的字段（兼容老库）
  try {
    const cols = database.exec("PRAGMA table_info(cases)");
    const colNames = (cols[0]?.values || []).map(r => r[1]);
    if (!colNames.includes('admin_note')) {
      database.run ('ALTER TABLE cases ADD COLUMN admin_note TEXT DEFAULT ""');
      console.log('[DB] 迁移: cases.admin_note 已添加');
    }
    if (!colNames.includes('followup_status')) {
      database.run ('ALTER TABLE cases ADD COLUMN followup_status TEXT DEFAULT ""');
      console.log('[DB] 迁移: cases.followup_status 已添加');
    }
  } catch(e) { console.warn('[DB] 字段迁移检查失败:', e.message); }

  // 恢复备份案例数据（部署重建后 SQLite 丢失时从 JSON 恢复）
  try {
    const backupDir = path.join(process.env.HOME || '/tmp', '.fenqian-data');
  const backupFile = path.join(backupDir, 'cases_backup.json');
    if (fs.existsSync(backupFile)) {
      const backup = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
      if (backup.cases && Array.isArray(backup.cases)) {
        const count = database.prepare('SELECT COUNT(*) as c FROM cases').getAsObject().c;
        if (count === 0) {
          const stmt = database.prepare('INSERT OR IGNORE INTO cases (id, created_at, source, contact, partner_count, input_json, report_markdown, payment_intent, review_status, review_note, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          let restored = 0;
          for (const c of backup.cases) {
            if (c.id && c.created_at) {
              stmt.run([c.id, c.created_at, c.source || 'restored', c.contact || '', c.partner_count || 2, c.input_json || '{}', c.report_markdown || '', c.payment_intent || '', c.review_status || 'pending_review', c.review_note || '', c.progress || 0]);
              restored++;
            }
          }
          stmt.free();
          if (restored > 0) console.log('[DB] 从备份恢复案例:', restored, '条');
        }
      }
    }
  } catch(e) {
    if (e.code !== 'ENOENT') console.log('[DB] 备份恢复跳过:', e.message);
  }

  // Knowledge cases table (curated, reusable cases)
  database.run (`
    CREATE TABLE IF NOT EXISTS knowledge_cases (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      title TEXT NOT NULL,
      partner_count INTEGER NOT NULL,
      scene_type TEXT NOT NULL,
      funding_pattern TEXT NOT NULL,
      effort_pattern TEXT NOT NULL,
      profit_range TEXT,
      oral_agreement TEXT,
      core_conflict TEXT,
      recommended_scheme TEXT NOT NULL,
      allocation_summary TEXT NOT NULL,
      risk_points TEXT NOT NULL,
      clause_templates TEXT NOT NULL,
      negotiation_tips TEXT,
      source TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'active'
    );
  `);

  // Rules table
  database.run (`
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      rule_name TEXT NOT NULL,
      trigger_conditions TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      risk_level TEXT DEFAULT 'medium',
      priority INTEGER DEFAULT 50,
      status TEXT DEFAULT 'active'
    );
  `);

  // Templates table
  database.run (`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      template_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT,
      status TEXT DEFAULT 'active'
    );
  `);

  // Orders table (PayJS 支付订单)
  database.run (`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      out_trade_no TEXT,
      payjs_order_id TEXT,
      payjs_qrcode TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      FOREIGN KEY (case_id) REFERENCES cases(id)
    );
  `);

  // 多版本备份：保留最近 50 次 + 每天一个快照
  function persist() {
    const data = database.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    // 同步备份到 JSON（部署重建后从 JSON 恢复）
    try {
      const backupDir = path.join(process.env.HOME || '/tmp', '.fenqian-data');
      const rows = [];
      const stmt2 = database.prepare('SELECT * FROM cases ORDER BY created_at DESC');
      while (stmt2.step()) rows.push(stmt2.getAsObject());
      stmt2.free();
      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '-');
      
      // 1. 当前备份（最新，启动时从这里恢复）
      fs.writeFileSync(path.join(backupDir, 'cases_backup.json'), JSON.stringify({ backup_time: now.toISOString(), count: rows.length, cases: rows }, null, 2));
      
      // 2. 多版本备份：保留最近 50 个版本（每分钟最多一次）
      const versionDir = path.join(backupDir, 'versions');
      if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });
      fs.writeFileSync(path.join(versionDir, `cases_${ts}.json`), JSON.stringify({ backup_time: now.toISOString(), count: rows.length, cases: rows }, null, 2));
      
      // 3. 清理旧版本：保留最近 50 个
      const files = fs.readdirSync(versionDir).filter(f => f.endsWith('.json')).sort().reverse();
      if (files.length > 50) {
        for (let i = 50; i < files.length; i++) {
          fs.unlinkSync(path.join(versionDir, files[i]));
        }
      }
      
      // 4. 每天一个快照（保留最近 30 天）
      const dateStr = now.toISOString().slice(0, 10);
      const dailyDir = path.join(backupDir, 'daily');
      if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
      const dailyFile = path.join(dailyDir, `cases_${dateStr}.json`);
      if (!fs.existsSync(dailyFile)) {
        fs.writeFileSync(dailyFile, JSON.stringify({ backup_time: now.toISOString(), count: rows.length, cases: rows }, null, 2));
      }
      // 清理 30 天前的每日快照
      const dailyFiles = fs.readdirSync(dailyDir).filter(f => f.endsWith('.json')).sort();
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      for (const f of dailyFiles) {
        const d = f.replace('cases_', '').replace('.json', '');
        if (d < cutoff) fs.unlinkSync(path.join(dailyDir, f));
      }
    } catch(e) { /* silent */ }
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

  /**
   * Knowledge Cases CRUD
   */
  function getKnowledgeCases() {
    const results = [];
    const stmt = database.prepare("SELECT * FROM knowledge_cases WHERE status = 'active' ORDER BY created_at DESC");
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  function getKnowledgeCaseById(id) {
    const stmt = database.prepare("SELECT * FROM knowledge_cases WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  function createKnowledgeCase(data) {
    const id = data.id || 'kc_' + crypto.randomBytes(8).toString('hex');
    database.run(
      `INSERT INTO knowledge_cases (id, created_at, title, partner_count, scene_type, funding_pattern, effort_pattern, profit_range, oral_agreement, core_conflict, recommended_scheme, allocation_summary, risk_points, clause_templates, negotiation_tips, source, status)
       VALUES (?, datetime('now', '+8 hours'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.title, data.partner_count, data.scene_type, data.funding_pattern, data.effort_pattern,
       data.profit_range || '', data.oral_agreement || '', data.core_conflict || '',
       data.recommended_scheme, data.allocation_summary, data.risk_points, data.clause_templates,
       data.negotiation_tips || '', data.source || 'manual', data.status || 'active']
    );
    persist();
    return id;
  }

  function updateKnowledgeCase(id, data) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
      if (['id', 'created_at'].includes(key)) continue;
      // Convert camelCase keys to snake_case for DB column names
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      fields.push(`${col} = ?`);
      values.push(val);
    }
    if (fields.length === 0) return;
    values.push(id);
    database.run (`UPDATE knowledge_cases SET ${fields.join(', ')} WHERE id = ?`, values);
    persist();
  }

  /**
   * Rules CRUD
   */
  function getRules() {
    const results = [];
    const stmt = database.prepare("SELECT * FROM rules WHERE status = 'active' ORDER BY priority DESC, created_at DESC");
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  function getRuleById(id) {
    const stmt = database.prepare("SELECT * FROM rules WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  function createRule(data) {
    const id = data.id || 'rule_' + crypto.randomBytes(8).toString('hex');
    database.run(
      `INSERT INTO rules (id, created_at, rule_name, trigger_conditions, recommendation, risk_level, priority, status)
       VALUES (?, datetime('now', '+8 hours'), ?, ?, ?, ?, ?, ?)`,
      [id, data.rule_name, data.trigger_conditions, data.recommendation,
       data.risk_level || 'medium', data.priority || 50, data.status || 'active']
    );
    persist();
    return id;
  }

  function updateRule(id, data) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
      if (['id', 'created_at'].includes(key)) continue;
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      fields.push(`${col} = ?`);
      values.push(val);
    }
    if (fields.length === 0) return;
    values.push(id);
    database.run (`UPDATE rules SET ${fields.join(', ')} WHERE id = ?`, values);
    persist();
  }

  /**
   * Templates CRUD
   */
  function getTemplates() {
    const results = [];
    const stmt = database.prepare("SELECT * FROM templates WHERE status = 'active' ORDER BY created_at DESC");
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  function getTemplateById(id) {
    const stmt = database.prepare("SELECT * FROM templates WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  function createTemplate(data) {
    const id = data.id || 'tpl_' + crypto.randomBytes(8).toString('hex');
    database.run(
      `INSERT INTO templates (id, created_at, template_type, title, content, tags, status)
       VALUES (?, datetime('now', '+8 hours'), ?, ?, ?, ?, ?)`,
      [id, data.template_type, data.title, data.content, data.tags || '', data.status || 'active']
    );
    persist();
    return id;
  }

  function updateTemplate(id, data) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
      if (['id', 'created_at'].includes(key)) continue;
      const col = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      fields.push(`${col} = ?`);
      values.push(val);
    }
    if (fields.length === 0) return;
    values.push(id);
    database.run (`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, values);
    persist();
  }

  /**
   * Promote a case from cases table to knowledge_cases
   */
  function promoteCaseToKnowledge(caseId, data) {
    const existingCase = db.getCase(caseId);
    if (!existingCase) throw new Error(`Case not found: ${caseId}`);

    const id = 'kc_' + crypto.randomBytes(8).toString('hex');
    database.run(
      `INSERT INTO knowledge_cases (id, created_at, title, partner_count, scene_type, funding_pattern, effort_pattern, profit_range, oral_agreement, core_conflict, recommended_scheme, allocation_summary, risk_points, clause_templates, negotiation_tips, source, status)
       VALUES (?, datetime('now', '+8 hours'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'promoted', 'active')`,
      [id, data.title, data.partner_count, data.scene_type, data.funding_pattern, data.effort_pattern,
       data.profit_range || '', data.oral_agreement || '', data.core_conflict || '',
       data.recommended_scheme, data.allocation_summary, data.risk_points, data.clause_templates,
       data.negotiation_tips || '']
    );
    persist();
    return id;
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

    updateProgress(id, progress) {
      database.run(
        `UPDATE cases SET progress = ? WHERE id = ?`,
        [progress, id]
      );
      persist();
    },

    getProgress(id) {
      const row = database.prepare(`SELECT progress FROM cases WHERE id = ?`).get(id);
      return row ? row.progress : null;
    },

    getCaseReportSummary(id) {
      const row = database.prepare(`SELECT report_markdown FROM cases WHERE id = ?`).get(id);
      if (!row || !row.report_markdown) return null;
      const md = row.report_markdown;
      // 前6000字截断
      const preview = md.length > 6000 ? md.substring(0, 6000) + '\n\n> ...（完整报告请联系客服获取）' : md;
      return { previewMarkdown: preview };
    },

    updatePaymentIntent(id, paymentIntent) {
      database.run(
        `UPDATE cases SET payment_intent = ? WHERE id = ?`,
        [paymentIntent, id]
      );
      persist();
    },

    updateCaseNotes(id, adminNote, followupStatus = '') {
      const fields = [];
      const values = [];
      if (adminNote !== undefined) { fields.push('admin_note = ?'); values.push(adminNote); }
      if (followupStatus !== undefined) { fields.push('followup_status = ?'); values.push(followupStatus); }
      if (fields.length === 0) return;
      values.push(id);
      database.run(`UPDATE cases SET ${fields.join(', ')} WHERE id = ?`, values);
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

    // New CRUD methods
    getKnowledgeCases,
    getKnowledgeCaseById,
    createKnowledgeCase,
    updateKnowledgeCase,
    getRules,
    getRuleById,
    createRule,
    updateRule,
    getTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    promoteCaseToKnowledge,

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
    },

    // === Orders (PayJS 支付) ===
    createOrder(caseId, plan, amount) {
      const id = 'order_' + crypto.randomUUID().slice(0, 8);
      const stmt = database.prepare('INSERT INTO orders (id, case_id, plan, amount, status) VALUES (?, ?, ?, ?, ?)');
      stmt.run([id, caseId, plan, amount, 'pending']);
      stmt.free();
      persist();
      return id;
    },

    getOrder(id) {
      const stmt = database.prepare('SELECT * FROM orders WHERE id = ?');
      stmt.bind([id]);
      let row = null;
      if (stmt.step()) row = stmt.getAsObject();
      stmt.free();
      return row;
    },

    updateOrder(id, updates) {
      const fields = Object.keys(updates).filter(k => k !== 'id');
      if (fields.length === 0) return;
      const sql = `UPDATE orders SET ${fields.map(f => f + ' = ?').join(', ')} WHERE id = ?`;
      const values = fields.map(f => updates[f]);
      values.push(id);
      const stmt = database.prepare(sql);
      stmt.run(values);
      stmt.free();
      persist();
    },

    getOrdersByCase(caseId) {
      const stmt = database.prepare('SELECT * FROM orders WHERE case_id = ? ORDER BY created_at DESC');
      stmt.bind([caseId]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },

    getAllOrders() {
      const stmt = database.prepare('SELECT * FROM orders ORDER BY created_at DESC');
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },

    // 从备份数据恢复：清空现有 cases 后插入
    restoreFromBackup(cases) {
      if (!Array.isArray(cases)) throw new Error('cases 必须是数组');
      database.run (`DELETE FROM cases`);
      const stmt = database.prepare('INSERT OR IGNORE INTO cases (id, created_at, source, contact, partner_count, input_json, report_markdown, payment_intent, review_status, review_note, progress, admin_note, followup_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      let count = 0;
      for (const c of cases) {
        if (c.id && c.created_at) {
          stmt.run([c.id, c.created_at, c.source || 'restored', c.contact || '', c.partner_count || 2, c.input_json || '{}', c.report_markdown || '', c.payment_intent || '', c.review_status || 'pending_review', c.review_note || '', c.progress || 0, c.admin_note || '', c.followup_status || '']);
          count++;
        }
      }
      stmt.free();
      persist(); // 备份恢复后自动创建新的当前备份
      return count;
    }
  };

  return db;
}

module.exports = { initDb };
