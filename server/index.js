// AI 合伙分钱方案生成器 - V0 Server
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Render Secret Files fallback - 尝试多个路径
const secretPaths = [
  '/etc/secrets/.env',
  '/etc/secrets/env',
  '/etc/secret/.env',
];
for (const sp of secretPaths) {
  if (fs.existsSync(sp)) {
    console.log('[env] Found secret file at', sp);
    require('dotenv').config({ path: sp });
    if (process.env.AI_PROVIDER) {
      console.log('[env] AI_PROVIDER loaded from', sp);
      break;
    }
  }
}
console.log('[env] AI_PROVIDER =', process.env.AI_PROVIDER || '(not set, using ollama)');

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { initDb } = require('./db');
const { generateReport } = require('./ai');
const { generateProfitTable } = require('./report');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function validateInput(body) {
  const errors = [];

  if (!body.partnerCount || ![2, 3].includes(Number(body.partnerCount))) {
    errors.push('合伙人数必须是 2 或 3');
  }

  if (!body.partners || !Array.isArray(body.partners)) {
    errors.push('合伙信息缺失');
  } else {
    body.partners.forEach((p, i) => {
      const capital = Number(p.capital);
      if (isNaN(capital) || capital < 0) {
        errors.push(`合伙人 ${p.name || String.fromCharCode(65 + i)} 的出资金额不能为负数`);
      } else if (capital === 0) {
        // 0元出资：必须给出力类型和职责描述
        if (!p.effortType || p.effortType.trim().length === 0) {
          errors.push(`出资 0 元的合伙人 ${p.name || String.fromCharCode(65 + i)} 必须选择出力类型`);
        }
        if (!p.responsibility || p.responsibility.trim().length < 2) {
          errors.push(`出资 0 元的合伙人 ${p.name || String.fromCharCode(65 + i)} 必须填写职责描述`);
        }
      } else if (capital <= 0) {
        errors.push(`合伙人 ${p.name || String.fromCharCode(65 + i)} 的出资金额必须为正数`);
      }
      if (capital > 0 && (!p.responsibility || p.responsibility.trim().length < 2)) {
        errors.push(`合伙人 ${p.name || String.fromCharCode(65 + i)} 的职责描述不能为空`);
      }
    });
  }

  if (!body.contact || body.contact.trim().length < 5) {
    errors.push('联系方式（微信或手机号）不能为空');
  }

  const disputeKeywords = ['纠纷', '诉讼', '打官司', '法院', '律师正在', '已经打'];
  const allText = JSON.stringify(body);
  for (const kw of disputeKeywords) {
    if (allText.includes(kw)) {
      errors.push('dispute_detected');
      break;
    }
  }

  return errors;
}

// Store db reference after init
let db = null;

// Admin token middleware (protects sensitive routes)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
function requireAdminToken(req, res, next) {
  // If ADMIN_TOKEN is not set, block access in production only
  if (!ADMIN_TOKEN) {
    // Allow localhost access without token for debugging
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') {
      return next();
    }
    // No token configured, block all remote access
    return res.status(403).json({ error: 'forbidden', message: '接口未开放远程访问。请配置 ADMIN_TOKEN 后通过 ?token=xxx 访问。' });
  }
  const token = req.query.token;
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'forbidden', message: '无效的访问令牌（token）' });
  }
  next();
}

// === API Routes ===

app.post('/api/generate', async (req, res) => {
  try {
    const errors = validateInput(req.body);
    if (errors.length > 0) {
      if (errors.includes('dispute_detected')) {
        return res.status(400).json({
          error: 'dispute',
          message: '⚠️ 检测到您描述的内容涉及已发生的纠纷。本工具不处理已发生纠纷的分配方案，建议您咨询专业律师。'
        });
      }
      return res.status(400).json({ error: 'validation', message: errors.join('；') });
    }

    const caseId = 'case_' + crypto.randomBytes(12).toString('hex');
    const { partnerCount, partners, contact } = req.body;

    db.createCase({
      id: caseId,
      partnerCount: Number(partnerCount),
      contact: contact.trim(),
      inputJson: req.body
    });

    try {
      const reportMarkdown = await generateReport(req.body, db);
      const profitTable = generateProfitTable(partners);
      const fullReport = reportMarkdown + '\n\n---\n\n## 利润模拟表（系统计算）\n\n' + profitTable;

      db.updateReport(caseId, fullReport);

      const previewMarkdown = fullReport.length > 2000
        ? fullReport.substring(0, 2000) + '\n\n> ...（完整报告请联系客服获取）'
        : fullReport;

      res.json({
        caseId,
        previewMarkdown,
        reportMarkdown: fullReport,
        status: 'pending_review'
      });
    } catch (aiErr) {
      db.updateReport(caseId, `AI 生成失败：${aiErr.message}`, 'pending_review');
      res.status(500).json({
        caseId,
        error: 'ai_error',
        message: `报告生成失败：${aiErr.message}。请稍后重试或联系客服。`
      });
    }
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'server_error', message: '服务器内部错误，请稍后重试。' });
  }
});

app.get('/api/cases', requireAdminToken, (req, res) => {
  try {
    const cases = db.getAllCases();
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例列表失败' });
  }
});

app.get('/api/cases/:id', requireAdminToken, (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例详情失败' });
  }
});

app.put('/api/cases/:id/payment', (req, res) => {
  try {
    const { paymentIntent } = req.body;
    if (!paymentIntent) return res.status(400).json({ error: 'validation', message: 'paymentIntent 必填' });
    db.updatePaymentIntent(req.params.id, paymentIntent);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '记录付款意向失败' });
  }
});

// Review endpoint (requires ADMIN_TOKEN)
app.put('/api/cases/:id/review', requireAdminToken, (req, res) => {
  try {
    const { reviewStatus, reviewNote } = req.body;
    const validStatuses = ['reviewed', 'delivered', 'rejected'];
    if (!reviewStatus || !validStatuses.includes(reviewStatus)) {
      return res.status(400).json({ error: 'validation', message: `reviewStatus 必须为: ${validStatuses.join('、')}` });
    }
    const existing = db.getCase(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    db.updateReviewStatus(req.params.id, reviewStatus, reviewNote || '');
    res.json({ success: true, status: reviewStatus, note: reviewNote || '' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新审核状态失败' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), provider: process.env.AI_PROVIDER || 'ollama' });
});

// Start server after DB init
initDb().then(database => {
  db = database;
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`   AI 合伙分钱方案生成器 V0`);
    console.log(`   服务已启动: http://localhost:${PORT}`);
    console.log(`   AI Provider: ${process.env.AI_PROVIDER || 'ollama'}`);
    console.log(`   数据目录: ${path.join(__dirname, '..', 'data')}`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
