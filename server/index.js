// AI 合伙分钱方案生成器 - V0.7 Server (案例库+规则库驱动)
const path = require('path');
const fs = require('fs');
const { marked } = require('marked');
const htmlToDocx = require('html-to-docx');
const PDFDocument = require('pdfkit');
// 强制从项目根目录加载 .env，不依赖启动 cwd
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// 🛡️ 全局崩溃兜底 — 防止 CopilotKit/DeepSeek 异常拖垮整个进程
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

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
const { generateReport, getCleanDeepSeekKey } = require('./ai');
const { generateProfitTable } = require('./report');
const decisionTree = require('./decision_tree');
const frameworkGaps = require('./framework_gaps');
const { buildDTSystemPrompt, buildDTUserPrompt } = require('./prompt_dt');
const { seedData } = require('./seed');
const { seedAdewoAgreement } = require('../scripts/seed_adewo_agreement');
const { createCopilotKitHandler: setupCopilotKit } = require('./copilotkit');

const app = express();
const PORT = process.env.PORT || 3000;
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 65000);

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，服务器正在启动或 AI 响应较慢，请稍后重试');
    }
    // 透传真实错误（仅 AI 调用方，不影响其它路由）
    throw new Error('AI fetch 失败：' + (err.message || err.code || 'unknown') + ' | cause: ' + (err.cause?.code || ''));
  } finally {
    clearTimeout(timer);
  }
}

// API 请求频率限制（防止滥用 + API 费用爆炸）
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'rate_limit', message: '请求太频繁，请稍后再试。' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/generate', apiLimiter);
app.use('/api/suggest-form', apiLimiter);
app.use('/api/regenerate', apiLimiter);

app.use(cors());
app.set('trust proxy', 1); app.use(express.json({ limit: '1mb' }));
// Serve built frontend (Vite build → dist), fallback to legacy public/
app.use(express.static(path.join(__dirname, '..', 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

// 进度存储（内存 Map，不依赖 SQLite，确保异步读写正确）
const progressStore = new Map();

function validateInput(body) {
  body = body || {};
  const errors = [];

  if (!body.partnerCount || ![2, 3, 4].includes(Number(body.partnerCount))) {
    errors.push('合伙人数必须是 2、3 或 4');
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

  const disputeKeywords = ['打官司', '律师正在', '已经起诉', '已经仲裁', '起诉状', '仲裁申请书', '法院已受理'];
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
// 白名单验证中间件（只验证账号密码，无需 token）
function requireAdminToken(req, res, next) {
  // 从 whitelist 文件加载
  const wl = (() => {
    try { return JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'data', 'admin_whitelist.json'), 'utf-8')); } catch { return []; }
  })();
  // 尝试 Basic Auth
  let user = '', pass = '';
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
      const parts = decoded.split(':');
      user = parts[0] || '';
      pass = parts.slice(1).join(':') || '';
    } catch (e) {}
  } else if (auth.startsWith('Bearer ')) {
    // 兼容 admin.html 之前保存的 base64 token
    try {
      const decoded = Buffer.from(auth.slice(7), 'base64').toString('utf-8');
      const parts = decoded.split(':');
      user = parts[0] || '';
      pass = parts.slice(1).join(':') || '';
    } catch (e) {}
  }
  // 也兼容 ?user&pass 查询参数方式
  if (!user && req.query.user && req.query.pass) {
    user = req.query.user;
    pass = req.query.pass;
  }
  // 兼容登录接口的 JSON body
  if (!user && req.body && req.body.username && req.body.password) {
    user = req.body.username;
    pass = req.body.password;
  }
  const match = wl.find(w => w.username === user && w.password === pass);
  if (!match) {
    // 白名单文件不存在或不在其中的硬编码兜底
    if (user === 'admin' && pass === 'afu_admin_2026') {
      req.adminUser = { username: 'admin', role: 'admin' };
      return next();
    }
    // 也兼容旧的 ?token=xxx 方式（保留过渡）
    const token = req.query.token || '';
    if (token && (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN)) {
      req.adminUser = { username: 'admin', role: 'admin' };
      return next();
    }
    return res.status(403).json({ error: 'forbidden', message: '用户名或密码错误' });
  }
  req.adminUser = { username: match.username, role: match.role };
  next();
}

// === Public API Routes ===

// AI一键填表：弹出一个对话框让用户描述情况，AI解析后返回表单数据
const suggestFormInputs = {}; // 临时存储用户输入

app.post('/api/suggest-form', async (req, res) => {
  const { message } = req.body;

  // 如果没有消息，返回引导信息让用户输入
  if (!message) {
    return res.json({
      needInput: true,
      prompt: '简单说说你们的合伙情况，例如："我和两个朋友合伙开餐厅，我出20万全职，张三出10万兼职，李四出5万不出力"'
    });
  }

  try {
    const { key: apiKey, warning: keyWarning } = getCleanDeepSeekKey();
    if (keyWarning) console.warn('[suggest-form]', keyWarning);
    const sysPrompt = '你是AI填表助手。用户会用口语描述他们的合伙创业情况，你需要提取结构化的表单数据并返回JSON。' +
      '返回格式（只返回JSON，不要其他内容）：' +
      '{"partnerCount":2,"partners":[{"name":"张三","capital":200000,"effortType":"全职运营","responsibility":"日常管理"},{"name":"李四","capital":100000,"effortType":"不出力","responsibility":"仅出资"}],"annualProfit":500000}' +
      '规则：partnerCount必须是2/3/4；effortType取值(对应前端下拉选项)："全职运营"、"兼职"、"仅出资不出力"、"技术/开发"、"资源/渠道"；capital是数字（元）；annualProfit是数字（元）；无法推断的字段填null；只输出JSON，不要任何其他文字';

    const candidateModels = [
      process.env.DEEPSEEK_MODEL,
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-chat',
      'deepseek-reasoner'
    ].filter(Boolean);
    let parsed = null;
    let lastError = null;
    let modelUsed = null;
    for (const model of candidateModels) {
      try {
        const res2 = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.3,
            max_tokens: 800
          })
        });
        if (!res2.ok) {
          lastError = `${model}: HTTP ${res2.status}`;
          continue;
        }
        const data = await res2.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (!content) {
          lastError = `${model}: empty content`;
          continue;
        }
        let cleaned = content.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        const braceMatch = cleaned.match(/\{[\s\S]*\}/);
        if (braceMatch) cleaned = braceMatch[0];
        parsed = JSON.parse(cleaned);
        modelUsed = model;
        break;
      } catch (e) {
        lastError = `${model}: ${e.message}`;
      }
    }

    if (!parsed) throw new Error(`所有模型都失败（${candidateModels.join(', ')}）。最后错误：${lastError}`);

    res.json({
      needInput: false,
      modelUsed,
      ...parsed
    });
  } catch (err) {
    console.error('[suggest-form]', err);
    res.status(500).json({ error: err.message || 'AI解析失败，请手动填写表单', needInput: false });
  }
});

// ====== 决策树 API（V0.8 新增，不影响旧 API） ======

// 获取初始块（start）
app.get('/api/decision-tree/start', (req, res) => {
  res.json({
    block: decisionTree.BLOCKS.start,
    scene: ''
  });
});

// 智能识别 + 下一步推进
app.post('/api/decision-tree/next', (req, res) => {
  try {
    const { state = {}, text = '' } = req.body || {};
    const result = decisionTree.nextStep(state, text);
    res.json({
      block: result.block,
      state: result.state,
      detected: result.detected,
      scene: decisionTree.summarizeScene(result.state)
    });
  } catch (err) {
    console.error('[decision-tree next]', err);
    res.status(500).json({ error: err.message });
  }
});

// ====== P0 增强 1：渐进式单点追问 ======
app.post('/api/decision-tree/next-question', (req, res) => {
  try {
    const { state = {} } = req.body || {};
    const result = decisionTree.buildProgressiveQuestion(state);
    res.json({ ...result, progress: decisionTree.buildProgress(state) });
  } catch (err) {
    console.error('[decision-tree next-question]', err);
    res.status(500).json({ error: err.message });
  }
});

// ====== P0 增强 2：框架树 gap 检测 ======
app.post('/api/decision-tree/detect-gap', (req, res) => {
  try {
    const { text = '' } = req.body || {};
    res.json(frameworkGaps.detectGap(text));
  } catch (err) {
    console.error('[decision-tree detect-gap]', err);
    res.status(500).json({ error: err.message });
  }
});

// ====== P0 增强 3：框架树 gap 提交 ======
app.post('/api/decision-tree/submit-gap', (req, res) => {
  try {
    const { userInput, hits, category, source = 'user-submit', note = '' } = req.body || {};
    if (!userInput || !hits || !category) {
      return res.status(400).json({ error: 'userInput / hits / category 必填' });
    }
    const entry = frameworkGaps.addGap({ userInput, hits, category, source, note });
    if (!entry) return res.status(500).json({ error: '保存失败' });
    res.json({ ok: true, gap: entry });
  } catch (err) {
    console.error('[decision-tree submit-gap]', err);
    res.status(500).json({ error: err.message });
  }
});

// ====== 框架树 gap 列表 ======
app.get('/api/decision-tree/gaps', (req, res) => {
  try {
    const { status, category } = req.query || {};
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    res.json({
      gaps: frameworkGaps.listGaps(filter),
      stats: frameworkGaps.stats()
    });
  } catch (err) {
    console.error('[decision-tree gaps]', err);
    res.status(500).json({ error: err.message });
  }
});

// 终态：构造 AI 输入并复用 suggest-form 的解析逻辑
app.post('/api/decision-tree/finalize', async (req, res) => {
  try {
    const { state = {}, freeText = '' } = req.body || {};
    const aiInput = decisionTree.buildAiInput(state, freeText);
    const scene = decisionTree.summarizeScene(state);

    // 调用 DeepSeek 解析成表单数据（复用 suggest-form 的 prompt）
    const { key: apiKey, warning: keyWarning } = getCleanDeepSeekKey();
    if (keyWarning) console.warn('[decision-tree finalize]', keyWarning);
    const sysPrompt = '你是AI填表助手。用户会用口语描述他们的合伙创业情况，你需要提取结构化的表单数据并返回JSON。' +
      '返回格式（只返回JSON，不要其他内容）：' +
      '{"partnerCount":2,"partners":[{"name":"张三","capital":200000,"effortType":"全职运营","responsibility":"日常管理"},{"name":"李四","capital":100000,"effortType":"不出力","responsibility":"仅出资"}],"annualProfit":500000}' +
      '规则：partnerCount必须是2/3/4；effortType取值(对应前端下拉选项)："全职运营"、"兼职"、"仅出资不出力"、"技术/开发"、"资源/渠道"；capital是数字（元）；annualProfit是数字（元）；无法推断的字段填null；只输出JSON，不要任何其他文字';

    // 模型 fallback 链（DeepSeek 2026-06 模型大升级，原 deepseek-chat 被 v4-flash/pro 替代）
    const candidateModels = [
      process.env.DEEPSEEK_MODEL,
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-chat',
      'deepseek-reasoner'
    ].filter(Boolean);
    const triedModels = [];
    let parsed = null;
    let lastError = null;
    let modelUsed = null;

    for (const model of candidateModels) {
      triedModels.push(model);
      try {
        const res2 = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: aiInput }
            ],
            temperature: 0.3,
            max_tokens: 800
          })
        });
        if (!res2.ok) {
          lastError = `${model}: HTTP ${res2.status}`;
          continue;
        }
        const data = await res2.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (!content) {
          lastError = `${model}: empty content`;
          continue;
        }

        let cleaned = content.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        const braceMatch = cleaned.match(/\{[\s\S]*\}/);
        if (braceMatch) cleaned = braceMatch[0];
        parsed = JSON.parse(cleaned);
        modelUsed = model;
        break; // 成功
      } catch (e) {
        lastError = `${model}: ${e.message}`;
      }
    }

    if (!parsed) {
      throw new Error(`所有模型都失败（${triedModels.join(', ')}）。最后错误：${lastError}`);
    }

    res.json({
      ok: true,
      scene,
      aiInput,
      formData: parsed,
      modelUsed
    });
  } catch (err) {
    console.error('[decision-tree finalize]', err);
    res.status(500).json({
      ok: false,
      error: err.message || 'AI 解析失败',
      hint: 'DeepSeek 模型可能不可用。已在代码中加了 fallback 链，仍失败请联系管理员'
    });
  }
});

// ====== 决策树测试版报告生成（仅测试版，正式版 /api/generate 不受影响）======
// 输入：决策树 final 块的状态 + 用户补充文字 + 表单数据（partnerCount/partners）
// 输出：按 L0-L4 五段式生成的 Markdown 报告 + 场景摘要
app.post('/api/decision-tree/generate-report', async (req, res) => {
  try {
    const { state = {}, freeText = '', partnerCount = null, partners = [] } = req.body || {};
    const aiInput = decisionTree.buildAiInput(state, freeText);
    const scene = decisionTree.summarizeScene(state);

    const { key: apiKey, warning: keyWarning } = getCleanDeepSeekKey();
    if (keyWarning) console.warn('[decision-tree generate-report]', keyWarning);

    const sysPrompt = buildDTSystemPrompt();
    const userPrompt = buildDTUserPrompt({ ...state, scene }, freeText, partnerCount, partners);

    // 模型 fallback 链（与决策树 finalize 一致）
    const candidateModels = [
      process.env.DEEPSEEK_MODEL,
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-chat',
      'deepseek-reasoner'
    ].filter(Boolean);
    const triedModels = [];
    let markdown = null;
    let lastError = null;
    let modelUsed = null;

    for (const model of candidateModels) {
      triedModels.push(model);
      try {
        const res2 = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.6,
            max_tokens: 4000
          })
        });
        if (!res2.ok) {
          lastError = `${model}: HTTP ${res2.status}`;
          continue;
        }
        const data = await res2.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (!content) {
          lastError = `${model}: empty content`;
          continue;
        }
        markdown = content.trim();
        modelUsed = model;
        break;
      } catch (e) {
        lastError = `${model}: ${e.message}`;
      }
    }

    if (!markdown) {
      throw new Error(`所有模型都失败（${triedModels.join(', ')}）。最后错误：${lastError}`);
    }

    // 校验「需求响应表 + L0-L4」齐全（缺段补警告，不阻断）
    const requiredSections = [
      { key: '需求响应表', pattern: /##.*📋\s*需求响应表/ },
      { key: 'L0', pattern: /##.*L0.*场景匹配结论/ },
      { key: 'L1', pattern: /##.*L1.*核心条款正文/ },
      { key: 'L2', pattern: /##.*L2.*强制风险提示/ },
      { key: 'L3', pattern: /##.*L3.*备选方案补充/ },
      { key: 'L4', pattern: /##.*L4.*信息补全询问/ }
    ];
    const missing = requiredSections.filter(s => !s.pattern.test(markdown)).map(s => s.key);
    const warning = missing.length > 0 ? `AI 输出缺少「${missing.join(' / ')}」段，请关注` : null;

    res.json({
      ok: true,
      scene,
      aiInput,
      markdown,
      modelUsed,
      branch: state.branch || null,
      warning
    });
  } catch (err) {
    console.error('[decision-tree generate-report]', err);
    res.status(500).json({
      ok: false,
      error: err.message || 'AI 报告生成失败',
      hint: 'DeepSeek 模型可能不可用。已在代码中加了 fallback 链，仍失败请联系管理员'
    });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const caseId = 'case_' + crypto.randomBytes(12).toString('hex');
    const { partnerCount, partners, contact } = req.body || {};

    // 数据安全优先：只要用户点击提交，先落库保存原始输入。
    // 后续即使校验失败、AI失败或前端刷新，也能在后台看到这次提交。
    db.createCase({
      id: caseId,
      partnerCount: Number(partnerCount) || 0,
      contact: String(contact || '').trim(),
      inputJson: req.body || {}
    });

    const errors = validateInput(req.body);
    if (errors.length > 0) {
      if (errors.includes('dispute_detected')) {
        db.updateReport(caseId, '提交内容涉及已发生纠纷或诉讼请求，系统已拒绝自动生成。原始信息已保留，建议人工跟进判断。', 'rejected');
        return res.status(400).json({
          error: 'dispute',
          caseId,
          message: '⚠️ 检测到您描述的内容涉及已发生的纠纷。本工具不处理已发生纠纷的分配方案，建议您咨询专业律师。'
        });
      }
      db.updateReport(caseId, '提交内容未通过表单校验：' + errors.join('；') + '\n\n原始信息已保留，可在后台查看。', 'rejected');
      return res.status(400).json({ error: 'validation', caseId, message: errors.join('；') });
    }

    // 先返回 caseId，后端异步生成
    res.json({ caseId, progress: 0, status: 'generating' });

    // 异步生成报告
    // 初始化进度到内存 Map
    progressStore.set(caseId, 2);

    (async () => {
      try {
        // 进度推进器：每400ms递增，直到AI返回或到75%
        progressStore.set(caseId, 3);
        let pStep = 2;
        const iv = setInterval(() => {
          const cur = progressStore.get(caseId) || 0;
          if (cur >= 75) { clearInterval(iv); return; }
          progressStore.set(caseId, Math.min(cur + pStep, 75));
          if (pStep < 6) pStep += 0.4;
        }, 400);

        const reportMarkdown = await generateReport(req.body, db);
        clearInterval(iv);
        progressStore.set(caseId, 80);

        const profitTable = generateProfitTable(partners || []);
        const fullReport = reportMarkdown + '\n\n---\n\n## 利润模拟表（系统计算）\n\n' + profitTable;
        progressStore.set(caseId, 88);

        db.updateReport(caseId, fullReport);

        // 在前端付费模块前插入 <!--paid--> 标记
        // 付费保护已暂时禁用（等用户指令再开启）
        progressStore.set(caseId, { pct: 100, preview: fullReport });
      } catch (aiErr) {
        db.updateReport(caseId, `AI 生成失败：${aiErr.message}`, 'pending_review');
        progressStore.set(caseId, { pct: -1, error: aiErr.message });
        console.error('Async generation error:', aiErr);
      }
    })();
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'server_error', message: '服务器内部错误，请稍后重试。' });
  }
});

app.get('/api/progress/:caseId', (req, res) => {
  const entry = progressStore.get(req.params.caseId);
  // entry 可能是数字（进行中）也可能是对象（完成）
  if (entry === null || entry === undefined) {
    return res.json({ progress: 0, status: 'unknown' });
  }
  if (typeof entry === 'object' && entry.pct === 100) {
    // 完成后的条目 60 秒后自动清理（防止内存泄漏）
    if (!progressStore._cleanupTimers) progressStore._cleanupTimers = new Map();
    if (!progressStore._cleanupTimers.has(req.params.caseId)) {
      const timer = setTimeout(() => { progressStore.delete(req.params.caseId); progressStore._cleanupTimers.delete(req.params.caseId); }, 60000);
      progressStore._cleanupTimers.set(req.params.caseId, timer);
    }
    // 内容保护：只返回前 2000 字符预览，完整报告走 /api/cases/:id/unlocked-report
    const preview = (entry.preview || '').slice(0, 2000);
    return res.json({ progress: 100, status: 'done', caseId: req.params.caseId, previewMarkdown: preview, contentLocked: true });
  }
  if (typeof entry === 'number' && entry >= 100) {
    // 兼容：如果是数字100，尝试从数据库读
    const summary = db.getCaseReportSummary(req.params.caseId);
    if (summary) {
      // 内容保护：只返预览，不返完整报告
      const preview = (summary.previewMarkdown || '').slice(0, 2000);
      return res.json({ progress: 100, status: 'done', caseId: req.params.caseId, previewMarkdown: preview, contentLocked: true });
    }
    return res.json({ progress: 100, status: 'done' });
  }
  if ((typeof entry === 'number' && entry < 0) || (typeof entry === 'object' && entry.pct < 0)) {
    return res.json({
      progress: 0,
      status: 'failed',
      error: typeof entry === 'object' ? entry.error || '' : ''
    });
  }
  const val = typeof entry === 'object' ? (entry.pct || 0) : entry;
  res.json({ progress: Math.round(val), status: 'generating' });
});

// 公开案例状态接口（无需token），供前端页面恢复用
app.get('/api/cases/:id/public-status', (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });

    // 获取后端记录的付款状态
    let unlockStatus = 'locked';
    if (c.payment_intent && /completed|manual_unlocked|unlocked/.test(c.payment_intent)) unlockStatus = 'unlocked';
    // review_status 为已审核/已交付，或人工备注含 paid/unlocked，也视为已解锁
    if (['reviewed', 'paid_delivered', 'delivered'].includes(c.review_status) || (c.review_note && /paid|unlocked|已解锁/.test(c.review_note))) unlockStatus = 'unlocked';

    res.json({
      caseId: c.id,
      status: c.review_status || 'pending_review',
      unlockStatus,
      paymentStatus: c.payment_intent ? 'recorded' : 'none',
      previewMarkdown: c.report_markdown ? c.report_markdown.slice(0, 2000) : '',
      createdAt: c.created_at,
      // 不返回完整报告
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取案例状态失败' });
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

// 修改报告端点：局部或全部重做
app.post('/api/regenerate', async (req, res) => {
  try {
    const { caseId, target, instruction, partners, hasAdvanced, advancedFields } = req.body;
    if (!caseId || !instruction) {
      return res.status(400).json({ error: 'validation', message: 'caseId 和 instruction 必填' });
    }

    // 统一字段映射：前端用 caseId/previewMarkdown，数据库用 id/report_markdown
    const c = db.getCase(caseId);
    if (!c) return res.status(404).json({ error: 'not_found', message: '未找到该案例' });

    const row = { previewMarkdown: c.report_markdown || '', fullReport: c.report_markdown || '' };

    const input = {
      partners: partners || [],
      partnerCount: (partners || []).length,
      annualProfit: 0,
      instruction,
      target: target || 'auto',
      originalReport: row.previewMarkdown || '',
      hasAdvanced,
      advancedFields,
    };

    const { regenerateReport } = require('./ai');
    const updatedReport = await regenerateReport(input);

    // 🔒 付费保护已暂时禁用（等用户指令再开启）
    // 统一字段映射：更新数据库字段 report_markdown
    db.updateReport(caseId, updatedReport);

    res.json({ success: true, updatedReport });
  } catch (err) {
    console.error('[regenerate]', err);
    res.status(500).json({ error: 'server_error', message: err.message || '修改失败' });
  }
});

// === PayJS 支付接口 ===
// 创建支付订单
app.post('/api/pay/create', async (req, res) => {
  try {
    const { caseId, plan } = req.body;
    if (!caseId || !plan) return res.status(400).json({ error: 'validation', message: 'caseId 和 plan 必填' });

    const amount = plan === 'reviewed' ? 9900 : 2990; // 99元 or 29.9元（单位：分）
    const orderId = db.createOrder(caseId, plan, amount);

    // PayJS 扫码支付
    const PAYJS_MCHID = process.env.PAYJS_MCHID || '';
    const PAYJS_KEY = process.env.PAYJS_KEY || '';

    if (!PAYJS_MCHID || !PAYJS_KEY) {
      return res.json({ success: true, orderId, amount, qrcode: null, message: '支付未配置，返回模拟数据' });
    }

    const crypto = require('crypto');
    const params = {
      mchid: PAYJS_MCHID,
      total_fee: String(amount),
      out_trade_no: orderId,
      body: `合伙分钱报告-${plan === 'reviewed' ? '人工审核版' : '基础版'}`,
      notify_url: `https://${req.hostname}/api/pay/notify`,
    };

    // 按 key 排序后生成签名
    const keys = Object.keys(params).sort();
    const signStr = keys.map(k => k + '=' + params[k]).join('&') + '&key=' + PAYJS_KEY;
    params.sign = crypto.createHash('md5').update(signStr, 'utf-8').digest('hex').toUpperCase();

    const payResp = await fetch('https://payjs.cn/api/native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    }).then(r => r.json());

    if (payResp.return_code === 1) {
      db.updateOrder(orderId, { payjs_order_id: payResp.payjs_order_id, payjs_qrcode: payResp.qrcode, status: 'pending_pay' });
      return res.json({ success: true, orderId, amount, qrcode: payResp.qrcode });
    } else {
      return res.json({ success: false, message: payResp.return_msg || '支付创建失败' });
    }
  } catch (err) {
    console.error('[pay/create]', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 查询订单状态
app.get('/api/pay/status/:orderId', (req, res) => {
  try {
    const order = db.getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'not_found', message: '订单不存在' });
    res.json({
      orderId: order.id,
      status: order.status,
      plan: order.plan,
      amount: order.amount,
      paidAt: order.paid_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 支付回调通知（PayJS POST 到 notify_url）
app.post('/api/pay/notify', (req, res) => {
  try {
    const { out_trade_no, total_fee, payjs_order_id, sign } = req.body || {};
    if (!out_trade_no) return res.status(400).send('fail');

    // 更新订单状态
    db.updateOrder(out_trade_no, {
      status: 'paid',
      payjs_order_id: payjs_order_id || '',
      paid_at: new Date().toISOString(),
    });

    console.log('[pay/notify] 支付成功:', out_trade_no, total_fee);
    res.send('success');
  } catch (err) {
    console.error('[pay/notify]', err);
    res.status(500).send('fail');
  }
});

// 获取完整报告（付款后）
app.get('/api/cases/:id/unlocked-report', (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });

    // 检查是否已解锁。支付暂未正式开通时，允许人工/后台记录完成状态后读取。
    const orders = db.getOrdersByCase(req.params.id);
    const hasPaid = orders.some(o => o.status === 'paid');
    const hasManualUnlock =
      (c.payment_intent && /completed|manual_unlocked|unlocked/.test(c.payment_intent)) ||
      ['reviewed', 'paid_delivered', 'delivered'].includes(c.review_status);
    if (!hasPaid && !hasManualUnlock) {
      return res.status(403).json({ error: 'payment_required', message: '请先完成支付' });
    }

    res.json({
      caseId: c.id,
      reportMarkdown: c.report_markdown || '',
      fullReport: c.report_markdown || '',
      hasUnlocked: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 下载报告（付款后）— 统一权限校验
function checkDownloadAuth(c) {
  const orders = db.getOrdersByCase(c.id);
  const hasPaid = orders.some(o => o.status === 'paid');
  const hasManualUnlock =
    (c.payment_intent && /completed|manual_unlocked|unlocked/.test(c.payment_intent)) ||
    ['reviewed', 'paid_delivered', 'delivered'].includes(c.review_status);
  return hasPaid || hasManualUnlock;
}

// 下载 Word 版
app.get('/api/cases/:id/download/word', async (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    if (!checkDownloadAuth(c)) {
      return res.status(403).json({ error: 'payment_required', message: '请先完成支付' });
    }
    const md = c.report_markdown || '';
    const html = marked.parse(md);
    const styledHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; line-height: 1.8; color: #222; padding: 30px; max-width: 900px; margin: auto; }
      h1 { font-size: 1.6em; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-top: 30px; }
      h2 { font-size: 1.3em; color: #2563eb; margin-top: 24px; }
      h3 { font-size: 1.1em; color: #333; margin-top: 18px; }
      table { border-collapse: collapse; width: 100%; margin: 12px 0; }
      th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; font-size: 0.9em; }
      th { background: #f0f4ff; font-weight: 700; }
      code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
      pre { background: #f8f8f8; border: 1px solid #ddd; padding: 12px; border-radius: 6px; overflow-x: auto; }
    </style></head><body>${html}</body></html>`;
    const docxBuffer = await htmlToDocx(styledHtml, { table: { maxRow: 999 } });
    const filename = 'fenqian-report-' + req.params.id.slice(0, 8) + '.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(Buffer.from(docxBuffer));
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 注册中文字体（用于 PDF 渲染，防止中文乱码）
const fontDir = path.join(__dirname, '..', 'assets', 'fonts');
function getChineseFontPath() {
  // 1. 项目本地 assets/fonts/NotoSansSC-Regular.ttf（git 提交的 10MB 中文字体）
  const localFont = path.join(fontDir, 'NotoSansSC-Regular.ttf');
  if (fs.existsSync(localFont)) return localFont;
  // 2. 扫描系统字体目录
  const searchPaths = [
    '/usr/share/fonts',
    '/usr/local/share/fonts',
    '/opt/render/.render/fonts',
    '/System/Library/Fonts',
    '/Library/Fonts',
  ];
  for (const sp of searchPaths) {
    if (!fs.existsSync(sp)) continue;
    try {
      const entries = fs.readdirSync(sp, { recursive: true });
      for (const entry of entries) {
        const fullPath = path.join(sp, entry);
        if (!fullPath.endsWith('.ttf') && !fullPath.endsWith('.otf')) continue;
        const lower = fullPath.toLowerCase();
        if (!lower.includes('cjk') && !lower.includes('noto') && !lower.includes('chinese') && !lower.includes('sc') && !lower.includes('wqy') && !lower.includes('han')) continue;
        return fullPath;
      }
    } catch (e) { /* skip */ }
  }
  return null;
}

// PDF 渲染工具函数 — Markdown tokens → pdfkit 纯 JS 渲染（无需浏览器）
function renderMdToPdf(doc, md) {
  const tokens = marked.lexer(md);
  const pageWidth = 595.28;
  const marginLeft = 56, marginRight = 56, marginTop = 56, marginBottom = 56;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = marginTop;

  const cnFontPath = getChineseFontPath();
  const hasCn = !!(cnFontPath);

  // 注册中文字体
  if (hasCn) {
    try {
      doc.registerFont('CnFont', cnFontPath);
      doc.registerFont('CnFontBold', cnFontPath);
    } catch (e) {
      // fallback silently
    }
  }

  function wrapText(text, size) {
    doc.fontSize(size);
    const chars = text.split('');
    let lines = [], currentLine = '';
    for (const ch of chars) {
      const test = currentLine + ch;
      if (doc.widthOfString(test) > contentWidth) {
        lines.push(currentLine);
        currentLine = ch;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  function checkPage(needed) {
    if (y + needed > doc.page.height - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  }

  // 选择合适的字体名
  const regularFont = hasCn ? 'CnFont' : 'Helvetica';
  const boldFont = hasCn ? 'CnFontBold' : 'Helvetica-Bold';
  const monoFont = 'Courier';
  const italicFont = hasCn ? 'CnFont' : 'Helvetica-Oblique';

  for (const token of tokens) {
    if (token.type === 'heading') {
      const sizes = { 1: 22, 2: 16, 3: 13 };
      const size = sizes[token.depth] || 12;
      checkPage(size + 10);
      y += 8;
      doc.font(boldFont).fontSize(size).fillColor(token.depth === 1 ? '#2563eb' : '#222');
      const lines = wrapText(token.text, size);
      for (const line of lines) {
        doc.text(line, marginLeft, y, { width: contentWidth });
        y += size * 1.4;
      }
      if (token.depth === 1) {
        doc.moveTo(marginLeft, y).lineTo(pageWidth - marginRight, y).strokeColor('#2563eb').lineWidth(1.5).stroke();
        y += 8;
      }
      y += 4;
    } else if (token.type === 'paragraph') {
      doc.font(regularFont).fontSize(11).fillColor('#222');
      const text = token.tokens ? token.tokens.map(t => t.text || t.raw || '').join('') : token.text || token.raw;
      const lines = wrapText(text, 11);
      for (const line of lines) {
        checkPage(16);
        doc.text(line, marginLeft, y, { width: contentWidth });
        y += 16;
      }
      y += 4;
    } else if (token.type === 'table') {
      const rows = [];
      if (token.header && token.header.length) {
        rows.push(token.header.map(c => c.text || c));
      }
      for (const row of token.rows || []) {
        rows.push(row.map(c => c.text || c));
      }
      const colW = contentWidth / (token.header ? token.header.length : 1);
      const rowH = 22;
      y += 4;
      for (let ri = 0; ri < rows.length; ri++) {
        checkPage(rowH + 4);
        const isHeader = ri === 0 && token.header && token.header.length > 0;
        const cells = rows[ri];
        const cellY = y;
        for (let ci = 0; ci < cells.length; ci++) {
          const cx = marginLeft + ci * colW;
          doc.rect(cx, cellY, colW, rowH).strokeColor('#ccc').lineWidth(0.5).stroke();
          if (isHeader) {
            doc.rect(cx, cellY, colW, rowH).fillColor('#eff6ff').fill().strokeColor('#ccc').lineWidth(0.5).stroke();
          }
          doc.font(isHeader ? boldFont : regularFont).fontSize(9).fillColor('#222');
          doc.text(cells[ci] || '', cx + 4, cellY + 5, { width: colW - 8, height: rowH - 4 });
        }
        y += rowH;
      }
      y += 6;
    } else if (token.type === 'code') {
      const codeLines = (token.text || '').split('\n');
      const lineH = 14;
      const codeH = codeLines.length * lineH + 12;
      checkPage(codeH + 4);
      doc.rect(marginLeft, y, contentWidth, codeH).fillColor('#f8f8f8').fill().strokeColor('#ddd').lineWidth(0.5).stroke();
      y += 6;
      doc.font(monoFont).fontSize(9).fillColor('#333');
      for (const line of codeLines) {
        doc.text(line, marginLeft + 8, y, { width: contentWidth - 16 });
        y += lineH;
      }
      y += 6;
    } else if (token.type === 'list') {
      doc.font(regularFont).fontSize(11).fillColor('#222');
      for (let li = 0; li < (token.items || []).length; li++) {
        const item = token.items[li];
        if (item) {
          const text = item.tokens ? item.tokens.map(t => t.text || t.raw || '').join('') : item.text || item.raw || '';
          const bullet = token.ordered ? `${token.start + li}. ` : '• ';
          const lines = wrapText(bullet + text, 11);
          for (const line of lines) {
            checkPage(16);
            doc.text(line, marginLeft + 12, y, { width: contentWidth - 12 });
            y += 16;
          }
        }
      }
      y += 4;
    } else if (token.type === 'hr') {
      checkPage(10);
      y += 4;
      doc.moveTo(marginLeft, y).lineTo(pageWidth - marginRight, y).strokeColor('#ddd').lineWidth(1).stroke();
      y += 8;
    } else if (token.type === 'space') {
      y += 8;
    } else if (token.type === 'blockquote') {
      checkPage(20);
      const text = token.tokens ? token.tokens.map(t => t.text || t.raw || '').join('') : token.text || token.raw || '';
      doc.rect(marginLeft, y, 4, 20).fillColor('#2563eb').fill();
      doc.font(italicFont).fontSize(10).fillColor('#555');
      const lines = wrapText(text, 10);
      for (const line of lines) {
        checkPage(16);
        doc.text(line, marginLeft + 12, y, { width: contentWidth - 12 });
        y += 16;
      }
      y += 4;
    }
  }
}

// 下载 PDF 版（纯 JS 渲染，无需浏览器）
app.get('/api/cases/:id/download/pdf', async (req, res) => {
  try {
    const c = db.getCase(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    if (!checkDownloadAuth(c)) {
      return res.status(403).json({ error: 'payment_required', message: '请先完成支付' });
    }
    const md = c.report_markdown || '';
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: '合伙分钱方案报告', Creator: 'AI合伙分钱方案生成器' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      const filename = 'fenqian-report-' + req.params.id.slice(0, 8) + '.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.send(pdfBuffer);
    });
    renderMdToPdf(doc, md);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

app.put('/api/cases/:id/payment', (req, res) => {
  try {
    const { paymentIntent } = req.body;
    if (!paymentIntent) return res.status(400).json({ error: 'validation', message: 'paymentIntent 必填' });
    const allowedPublicIntents = ['request_basic', 'request_reviewed'];
    if (!allowedPublicIntents.includes(paymentIntent)) {
      return res.status(403).json({ error: 'forbidden', message: '当前接口只记录用户申请，不开放解锁操作' });
    }
    db.updatePaymentIntent(req.params.id, paymentIntent);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '记录付款意向失败' });
  }
});

// Admin 手动确认解锁：内测期用于客服/后台确认申请后开放完整报告。
app.put('/api/admin/cases/:id/unlock', requireAdminToken, (req, res) => {
  try {
    const existing = db.getCase(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    const note = req.body?.reviewNote || req.body?.note || '后台已确认完整报告申请，开放查看和下载';
    db.updatePaymentIntent(req.params.id, 'manual_unlocked');
    db.updateReviewStatus(req.params.id, 'delivered', note);
    res.json({ success: true, status: 'delivered', paymentIntent: 'manual_unlocked', note });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '确认解锁失败' });
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
    const shouldUnlock = ['reviewed', 'delivered'].includes(reviewStatus);
    const storedReviewStatus = shouldUnlock ? 'delivered' : reviewStatus;
    const storedReviewNote = shouldUnlock
      ? `${reviewNote ? reviewNote + '；' : ''}已解锁，开放完整报告查看和下载`
      : (reviewNote || '');
    if (shouldUnlock) {
      db.updatePaymentIntent(req.params.id, 'manual_unlocked');
    }
    db.updateReviewStatus(req.params.id, storedReviewStatus, storedReviewNote);
    res.json({
      success: true,
      status: storedReviewStatus,
      note: storedReviewNote,
      unlockStatus: shouldUnlock ? 'unlocked' : 'locked',
      paymentIntent: shouldUnlock ? 'manual_unlocked' : existing.payment_intent || '',
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新审核状态失败' });
  }
});

// Admin case notes（管理员备注+跟进状态）
app.put('/api/admin/cases/:id/notes', requireAdminToken, (req, res) => {
  try {
    const { adminNote, followupStatus } = req.body;
    const existing = db.getCase(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not_found', message: '案例不存在' });
    db.updateCaseNotes(req.params.id, adminNote, followupStatus);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin API Routes (knowledge_cases) ===

app.get('/api/admin/knowledge-cases', requireAdminToken, (req, res) => {
  try {
    const cases = db.getKnowledgeCases();
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取知识案例失败' });
  }
});

app.post('/api/admin/knowledge-cases', requireAdminToken, (req, res) => {
  try {
    const id = db.createKnowledgeCase(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '创建知识案例失败' });
  }
});

app.put('/api/admin/knowledge-cases/:id', requireAdminToken, (req, res) => {
  try {
    db.updateKnowledgeCase(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新知识案例失败' });
  }
});

// === Admin API Routes (rules) ===

app.get('/api/admin/rules', requireAdminToken, (req, res) => {
  try {
    const rules = db.getRules();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取规则失败' });
  }
});

app.post('/api/admin/rules', requireAdminToken, (req, res) => {
  try {
    const id = db.createRule(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '创建规则失败' });
  }
});

app.put('/api/admin/rules/:id', requireAdminToken, (req, res) => {
  try {
    db.updateRule(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新规则失败' });
  }
});

// === Admin API Routes (templates) ===

app.get('/api/admin/templates', requireAdminToken, (req, res) => {
  try {
    const templates = db.getTemplates();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '获取模板失败' });
  }
});

app.post('/api/admin/templates', requireAdminToken, (req, res) => {
  try {
    const id = db.createTemplate(req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '创建模板失败' });
  }
});

app.put('/api/admin/templates/:id', requireAdminToken, (req, res) => {
  try {
    db.updateTemplate(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: '更新模板失败' });
  }
});

// === Admin: Promote case to knowledge ===

app.post('/api/admin/cases/:id/promote', requireAdminToken, (req, res) => {
  try {
    const id = db.promoteCaseToKnowledge(req.params.id, req.body);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message || '提升为知识案例失败' });
  }
});

// === Admin 登录校验 ===
app.post('/api/admin/login', requireAdminToken, (req, res) => {
  let localLedger = null;
  let unlockNormalize = null;
  try {
    localLedger = db.replayLocalLedger();
  } catch (err) {
    console.warn('[admin/login] 本地流水回读失败:', err.message);
  }
  try {
    unlockNormalize = db.normalizeUnlockStates ? db.normalizeUnlockStates() : null;
  } catch (err) {
    console.warn('[admin/login] 历史解锁状态修复失败:', err.message);
  }
  res.json({
    success: true,
    user: req.adminUser?.username || 'admin',
    role: req.adminUser?.role || 'admin',
    localLedger,
    unlockNormalize
  });
});

// === Admin Dashboard 统计 ===
app.get('/api/admin/stats', requireAdminToken, (req, res) => {
  try {
    const allCases = db.getAllCases();
    const allOrders = db.getAllOrders();
    const paidOrders = allOrders.filter(o => o.status === 'paid');
    const basicOrders = paidOrders.filter(o => o.plan === 'basic');
    const reviewedOrders = paidOrders.filter(o => o.plan === 'reviewed');
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todayCases = allCases.filter(c => (c.created_at || '').startsWith(todayStr));
    const todayPaid = paidOrders.filter(o => (o.paid_at || '').startsWith(todayStr));

    res.json({
      totalCases: allCases.length,
      todayCases: todayCases.length,
      totalOrders: allOrders.length,
      totalPaid: paidOrders.length,
      todayPaid: todayPaid.length,
      basicOrders: basicOrders.length,
      reviewedOrders: reviewedOrders.length,
      pendingReview: allCases.filter(c => c.review_status === 'pending_review').length,
      unpaid: allCases.filter(c => !c.payment_intent || c.payment_intent === '').length,
    });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

app.get('/api/admin/db-health', requireAdminToken, (req, res) => {
  try {
    res.json(db.getDbHealth ? db.getDbHealth() : { error: 'db_health_unavailable' });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin 订单管理 ===
app.get('/api/admin/orders', requireAdminToken, (req, res) => {
  try {
    const orders = db.getAllOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin 导出案例 CSV ===
app.get('/api/admin/export/cases', requireAdminToken, (req, res) => {
  try {
    const cases = db.getAllCases();
    const today = new Date();
    const header = '案例ID,提交时间,合伙人数,联系方式,付费意向,审核状态,跟进状态,管理员备注';
    const rows = cases.map(c => {
      const id = c.id || '';
      const time = c.created_at || '';
      const count = c.partner_count || '';
      const contact = (c.contact || '').replace(/,/g, ';');
      const payment = c.payment_intent || '';
      const review = c.review_status || '';
      const followup = c.followup_status || '';
      const note = (c.admin_note || '').replace(/,/g, ';').replace(/\n/g, ' ');
      return [id, time, count, contact, payment, review, followup, note].join(',');
    });
    const csv = '\ufeff' + header + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fenqian-cases-' + today.toISOString().slice(0,10) + '.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// === Admin 导出订单 CSV ===
app.get('/api/admin/export/orders', requireAdminToken, (req, res) => {
  try {
    const orders = db.getAllOrders();
    const today = new Date();
    const header = '订单ID,案例ID,套餐,金额(分),状态,支付时间,创建时间';
    const rows = orders.map(o => {
      return [o.id, o.case_id, o.plan, o.amount, o.status, o.paid_at || '', o.created_at || ''].join(',');
    });
    const csv = '\ufeff' + header + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fenqian-orders-' + today.toISOString().slice(0,10) + '.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    provider: process.env.AI_PROVIDER || 'ollama',
    model: process.env.DEEPSEEK_MODEL || '(default)',
    keyPreview: process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.slice(0, 7) + '...' : (process.env.DEEPSEEK_API_KEY_P1 || ''),
    version: require('../package.json').version
  });
});

// 诊断端点：直接试一下 DeepSeek 连通性 + 查看真实错误
app.get('/api/health/ai-test', async (req, res) => {
  const results = [];
  const { key: apiKey, warning: keyWarning, source: keySource } = getCleanDeepSeekKey();
  if (keyWarning) console.warn('[ai-test]', keyWarning);
  results.push({ diagnostic: 'apiKeySource', source: keySource, warning: keyWarning });
  const models = ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'];
  for (const model of models) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 10
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      const body = await r.text();
      results.push({ model, status: r.status, ok: r.ok, snippet: body.slice(0, 200) });
    } catch (e) {
      results.push({ model, error: e.message, code: e.code || '', cause: e.cause?.code || '' });
    }
  }
  res.json({
    apiKeyPrefix: apiKey.slice(0, 7),
    apiKeyLength: apiKey.length,
    apiKeyBytes: Array.from(apiKey).map(c => c.charCodeAt(0)),
    apiKeyTail: apiKey.slice(-10),
    results
  });
});

// 临时诊断端点：让管理员验证 environment 里的 key 是什么
app.get('/api/health/ai-key-info', (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  const p1 = process.env.DEEPSEEK_API_KEY_P1 || '';
  const p2 = process.env.DEEPSEEK_API_KEY_P2 || '';
  const fullAscii = /^[\x00-\x7F]*$/.test(apiKey);
  // 拼接的 P1+P2 fallback key
  const concatKey = p1 + p2;
  res.json({
    apiKey_length: apiKey.length,
    apiKey_first7: apiKey.slice(0, 7),
    apiKey_last10: apiKey.slice(-10),
    apiKey_isAscii: fullAscii,
    apiKey_nonAsciiChars: Array.from(apiKey).filter(c => c.charCodeAt(0) > 127).map(c => c.charCodeAt(0)),
    concatKey_length: concatKey.length,
    concatKey_last10: concatKey.slice(-10),
    concatKey_isAscii: /^[\x00-\x7F]*$/.test(concatKey),
    concatKey_nonAsciiChars: Array.from(concatKey).filter(c => c.charCodeAt(0) > 127).map(c => c.charCodeAt(0)),
    model: process.env.DEEPSEEK_MODEL || '(default)',
    diagnosis: fullAscii
      ? (concatKey.length > 20 ? 'concatKey可用' : '需要修复 env var')
      : `apiKey 含 ${Array.from(apiKey).filter(c => c.charCodeAt(0) > 127).length} 个非ASCII字符（ U+2026=…）`
  });
});

// === Admin Whitelist DB (首次启动自动初始化默认管理员) ===
// === 多版本备份 API ===
app.get('/api/admin/backups', requireAdminToken, (req, res) => {
  try {
    const dbHealth = db.getDbHealth ? db.getDbHealth() : null;
    const backupDir = dbHealth?.dbPath ? path.dirname(dbHealth.dbPath) : path.join(process.env.HOME || '/tmp', '.fenqian-data');
    const result = {
      current: null,
      versions: [],
      daily: [],
      localLedger: db.getLocalLedgerStats ? db.getLocalLedgerStats() : null,
      dbHealth
    };
    // 当前备份
    const cur = path.join(backupDir, 'cases_backup.json');
    if (fs.existsSync(cur)) {
      const data = JSON.parse(fs.readFileSync(cur, 'utf-8'));
      result.current = { time: data.backup_time, count: data.count };
    }
    // 版本列表
    const versionDir = path.join(backupDir, 'versions');
    if (fs.existsSync(versionDir)) {
      result.versions = fs.readdirSync(versionDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30).map(f => {
        const p = path.join(versionDir, f);
        try {
          const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
          return { file: f, time: d.backup_time, count: d.count };
        } catch { return { file: f }; }
      });
    }
    // 每日快照
    const dailyDir = path.join(backupDir, 'daily');
    if (fs.existsSync(dailyDir)) {
      result.daily = fs.readdirSync(dailyDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 30).map(f => {
        const p = path.join(dailyDir, f);
        try {
          const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
          return { date: d.backup_time.slice(0,10), count: d.count };
        } catch { return { date: f.replace('cases_','').replace('.json','') }; }
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 从备份恢复
app.post('/api/admin/backups/restore', requireAdminToken, (req, res) => {
  try {
    const { file } = req.body;
    if (!file) return res.status(400).json({ error: 'validation', message: '请指定备份文件名' });
    const dbHealth = db.getDbHealth ? db.getDbHealth() : null;
    const backupDir = dbHealth?.dbPath ? path.dirname(dbHealth.dbPath) : path.join(process.env.HOME || '/tmp', '.fenqian-data');
    // 支持从 version 和 daily 恢复
    let backupPath = path.join(backupDir, 'versions', file);
    if (!fs.existsSync(backupPath)) {
      backupPath = path.join(backupDir, 'daily', file);
    }
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'not_found', message: '未找到备份文件' });
    }
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    if (!data.cases || !Array.isArray(data.cases)) {
      return res.status(400).json({ error: 'invalid', message: '备份文件格式无效' });
    }
    // 通过 db.restoreFromBackup() 调用（不直接访问内部 database/persist）
    const count = db.restoreFromBackup(data.cases);
    res.json({ success: true, restored: count });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

const WHITELIST_DB = path.join(__dirname, '..', 'data', 'admin_whitelist.json');
const DEFAULT_ADMINS = [
  { username: 'admin', password: 'afu_admin_2026', role: 'admin', created_at: '2026-06-11T00:00:00.000Z' }
];

function loadWhitelist() {
  try { return JSON.parse(require('fs').readFileSync(WHITELIST_DB, 'utf-8')); } catch { return []; }
}
function saveWhitelist(list) {
  const dir = path.dirname(WHITELIST_DB);
  if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
  require('fs').writeFileSync(WHITELIST_DB, JSON.stringify(list, null, 2));
}
function ensureWhitelist() {
  const list = loadWhitelist();
  if (list.length === 0) {
    saveWhitelist(DEFAULT_ADMINS);
  }
}
// 初始化白名单
ensureWhitelist();

// 调试：确保白名单已初始化
if (loadWhitelist().length === 0) {
  console.error('[whitelist] WARNING: 白名单为空，强制写入默认管理员');
  saveWhitelist(DEFAULT_ADMINS);
}

// GET whitelist
app.get('/api/admin/whitelist', requireAdminToken, (req, res) => {
  const list = loadWhitelist();
  res.json(list.map(({ password, ...safe }) => safe));
});

// POST add to whitelist
app.post('/api/admin/whitelist', requireAdminToken, (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'validation', message: '用户名和密码必填' });
    const list = loadWhitelist();
    if (list.find(w => w.username === username)) {
      return res.status(409).json({ error: 'conflict', message: '用户名已存在' });
    }
    list.push({ username: username.trim(), password, role: role || 'viewer', created_at: new Date().toISOString() });
    saveWhitelist(list);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// DELETE whitelist entry
app.delete('/api/admin/whitelist', requireAdminToken, (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'validation', message: 'username 必填' });
    let list = loadWhitelist();
    list = list.filter(w => w.username !== username);
    saveWhitelist(list);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Admin 管理页面
app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/.')) return;
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
  });
});

// Start server after DB init
initDb().then(database => {
  db = database;
  try {
    const normalized = db.normalizeUnlockStates ? db.normalizeUnlockStates() : null;
    if (normalized && normalized.updated > 0) {
      console.log('[unlock] 已修复历史解锁状态:', normalized);
    }
  } catch (err) {
    console.warn('[unlock] 历史解锁状态修复失败:', err.message);
  }
  // Run seed data on first start
  seedData(db);
  seedAdewoAgreement(db);
  // Start CopilotKit Agent runtime
  try {
    setupCopilotKit(app, db);
    console.log('[startup] CopilotKit 初始化成功');
  } catch (e) {
    console.error('[startup] CopilotKit 初始化失败（不阻塞主服务）:', e.message);
  }

  // Keepalive: 每 5 分钟自 ping，防止 Render 免费实例休眠
  const KEEPALIVE_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    const http = require('http');
    const host = process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT;
    http.get(host + '/api/health', (res) => {
      console.log('[keepalive] ping ok, status:', res.statusCode);
    }).on('error', (err) => {
      console.log('[keepalive] ping error:', err.message);
    });
  }, KEEPALIVE_INTERVAL);
  console.log('[keepalive] 已启动，每 5 分钟自 ping');
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`   AI 合伙分钱方案生成器 V${require('../package.json').version} (五权诊断+AI填表+报告编辑)`);
    console.log(`   服务已启动: http://localhost:${PORT}`);
    console.log(`   AI Provider: ${process.env.AI_PROVIDER || 'ollama'}`);
    console.log(`   数据目录: ${path.join(__dirname, '..', 'data')}`);
    console.log(`   后台管理: https://ai-partner-fenqian.onrender.com/admin`);
    console.log(`   后台登录: admin / afu_admin_2026`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
