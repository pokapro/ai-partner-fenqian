import { useState, useRef, useEffect } from "react";

// marked 从 CDN 的 window.marked 引用，避免与 CopilotKit/mermaid 的 marked 版本冲突
const marked = window.marked;

// HTML 净化函数：移除 script 标签和事件处理器（防止 XSS）
function sanitizeHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

// 修复表格 HTML 中 marked 参数对象乱码
function fixTables(html) {
  // marked 18 中 tablecell/tablerow 可能输出 [object Object]
  // 替换所有 [object Object]
  let result = html;
  while (result.indexOf('[object Object]') >= 0) {
    result = result.replace('[object Object]', '');
  }
  // 替换 undefined
  result = result.replace(/undefined/g, '');
  return result;
}

// 配置 marked 格式
marked.setOptions({ breaks: true, gfm: true });
const renderer = new marked.Renderer();
// 表格 → 卡片式布局（替代传统表格，更美观兼容）
function stripMd(t) {
  return String(t || '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').replace(/~/g, '');
}
function extractCellText(obj) {
  if (typeof obj === 'string') return stripMd(obj);
  if (obj && typeof obj === 'object') {
    // marked 18: text 是 { type: 'text', raw: 'xxx', text: 'xxx', tokens: [...] }
    if (obj.raw) return stripMd(obj.raw);
    if (Array.isArray(obj.tokens)) return obj.tokens.map(function(t){return t.raw||t.text||''}).join('').replace(/\*\*/g,'').replace(/\*/g,'');
    if (obj.text) return stripMd(obj.text);
    // 兜底：序列化
    try { return JSON.stringify(obj).replace(/\*\*/g,'').replace(/\*/g,''); } catch(e) {}
  }
  return '';
}

renderer.table = ({ header, body }) => {
  // 兼容 marked v18：header/body 可能是 tokens 对象，需要用 extractCellText 确保字符串
  const headerStr = typeof header === 'string' ? header : (Array.isArray(header) ? header.map(t => typeof t === 'object' ? t.text || '' : t).join('') : '');
  const bodyStr = typeof body === 'string' ? body : (Array.isArray(body) ? body.map(t => typeof t === 'object' ? t.text || '' : t).join('') : JSON.stringify(body || ''));
  // 提取表头和数据行，用 flex 卡片布局
  const headRows = headerStr.replace(/<tr>/g, '').replace(/<\/tr>/g, '').replace(/<th[^>]*>/g, '').replace(/<\/th>/g, '|');
  const headCells = headRows.split('|').filter(Boolean).map(h => h.trim());
  
  // body 中的行
  const rowMatches = [...bodyStr.matchAll(/<tr>(.*?)<\/tr>/gs)];
  const dataRows = rowMatches.map(m => {
    const cells = m[1].replace(/<td[^>]*>/g, '').replace(/<\/td>/g, '|').split('|').filter(Boolean).map(c => c.trim());
    return cells;
  });
  
  // 用 HTML 表格（但是我们自己构建，绕过 marked 的 tablecell bug）
  let html = '<div style="overflow-x:auto;margin:10px 0;border-radius:10px;border:1px solid #e2e8f0;background:white;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;white-space:nowrap;"><thead><tr>';
  headCells.forEach(c => {
    html += '<th style="padding:10px 12px;background:#f0fdf4;color:#166534;font-weight:700;font-size:0.78rem;letter-spacing:0.02em;text-align:left;white-space:nowrap;">' + extractCellText(c) + '</th>';
  });
  html += '</tr></thead><tbody>';
  dataRows.forEach(row => {
    html += '<tr>';
    row.forEach(c => {
      html += '<td style="padding:10px 12px;border-top:1px solid #f1f5f9;text-align:left;min-width:80px;">' + extractCellText(c) + '</td>';
    });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
};
renderer.tablerow = ({ text }) => {
  // 不处理，由 table 接管
  return JSON.stringify(text);
};
renderer.tablecell = ({ text, align, header }) => {
  // 不处理，由 table 接管。但 marked 18 仍然会调用它构建中间 token
  // 返回空 td/th
  const tag = header ? 'th' : 'td';
  const txt = extractCellText(text);
  const s = header
    ? 'padding:10px 12px;background:#f0fdf4;color:#166534;font-weight:700;font-size:0.78rem;letter-spacing:0.02em;text-align:left;white-space:nowrap;'
    : 'padding:10px 12px;border-top:1px solid #f1f5f9;text-align:left;min-width:80px;';
  return '<' + tag + ' style="' + s + '">' + txt + '</' + tag + '>';
};
renderer.strong = ({ text }) => `<span style="font-weight:700;">${text}</span>`;
renderer.blockquote = ({ text }) =>
  `<blockquote style="border-left:4px solid #059669;padding:8px 16px;margin:12px 0;background:#f0fdf4;color:#166534;font-style:italic;">${text}</blockquote>`;
renderer.hr = () => `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">`;

// 商业诊断书式标题与列表
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const id = 'h' + depth;
  if (depth === 1) {
    return `<h${id} style="font-size:1.35rem;font-weight:800;color:#0f172a;margin:20px 0 12px;padding:0 0 0 14px;border-left:5px solid #059669;line-height:1.4;">${text}</h${id}>`;
  }
  if (depth === 2) {
    return `<h${id} style="font-size:1.12rem;font-weight:700;color:#0f172a;margin:18px 0 10px;padding:0 0 0 12px;border-left:4px solid #10b981;line-height:1.4;">${text}</h${id}>`;
  }
  if (depth === 3) {
    return `<h${id} style="font-size:0.98rem;font-weight:700;color:#1e293b;margin:14px 0 8px;padding:0 0 0 10px;border-left:3px solid #34d399;line-height:1.4;">${text}</h${id}>`;
  }
  return `<h${id} style="font-size:0.9rem;font-weight:700;color:#475569;margin:12px 0 6px;">${text}</h${id}>`;
};
renderer.paragraph = function ({ tokens }) {
  const text = this.parser.parseInline(tokens);
  return `<p style="margin:8px 0;line-height:1.7;color:#334155;font-size:0.92rem;">${text}</p>`;
};
renderer.list = function (token) {
  const items = (token.items || []).map(item => {
    let content;
    if (typeof item.text === 'string') content = item.text;
    else if (item.tokens) {
      try { content = this.parser.parse(item.tokens); } catch(e) { content = JSON.stringify(item.tokens).slice(0,200); }
    } else content = JSON.stringify(item).slice(0,200);
    const style = 'margin:5px 0;line-height:1.65;color:#334155;font-size:0.9rem;padding-left:6px;list-style:none;position:relative;';
    if (token.ordered) {
      return `<li style="${style}"><span style="color:#059669;font-weight:700;margin-right:6px;">${(token.start||1) + (token.items.indexOf(item))}.</span>${content}</li>`;
    }
    return `<li style="${style}"><span style="color:#10b981;margin-right:6px;">●</span>${content}</li>`;
  }).join('');
  const tag = token.ordered ? 'ol' : 'ul';
  const containerStyle = token.ordered
    ? 'margin:10px 0;padding-left:8px;list-style:none;'
    : 'margin:10px 0;padding-left:8px;list-style:none;';
  return `<${tag} style="${containerStyle}">${items}</${tag}>`;
};
marked.use({ renderer });

const PARTNER_CONFIGS = {
  2: [{ id: "A", label: "合伙人 A" }, { id: "B", label: "合伙人 B" }],
  3: [
    { id: "A", label: "合伙人 A" },
    { id: "B", label: "合伙人 B" },
    { id: "C", label: "合伙人 C" },
  ],
  4: [
    { id: "A", label: "合伙人 A" },
    { id: "B", label: "合伙人 B" },
    { id: "C", label: "合伙人 C" },
    { id: "D", label: "合伙人 D" },
  ],
};

const EFFORT_OPTIONS = [
  { value: "全职运营", label: "全职运营" },
  { value: "兼职", label: "兼职" },
  { value: "不出力", label: "仅出资不出力" },
  { value: "技术", label: "技术/开发" },
  { value: "资源", label: "资源/渠道" },
];

// 经营场景模式
const SCENE_MODES = [
  { value: "small_biz", label: "🏪 小店/夫妻档", desc: "小本经营、亲友合伙，适合温和务实方案" },
  { value: "standard", label: "🏢 标准合伙", desc: "全职+兼职组合，一般商业合伙场景" },
  { value: "corporate", label: "🏛️ 公司化合伙", desc: "多人合伙、大额出资，适合正式商业方案" },
];

const PLAN_INFO = {
  basic: {
    name: "基础版",
    price: "29.9",
    intent: "request_basic",
    title: "申请基础版完整报告",
    intro: "内测阶段暂不开放自动支付。提交后，客服会按您填写的联系方式确认需求，再人工开放完整报告和下载。",
    items: ["完整 AI 诊断报告", "三套分钱方案与利润模拟", "基础协议条款草稿", "后台人工确认后开放下载"],
  },
  reviewed: {
    name: "人工审核版",
    price: "99",
    intent: "request_reviewed",
    title: "申请人工审核版",
    intro: "提交后进入人工审核队列。适合已经准备拿给合伙人沟通、需要降低表达风险的场景。",
    items: ["包含基础版完整内容", "人工复核一次核心比例与风险点", "可按反馈补充信息后重生成", "重点协议条款与文件清单"],
  },
};

// 场景预设（按类别分组）
const SCENE_PRESETS = {
  small_biz: [
    {
      label: "夫妻档口（3万+2万）",
      data: { partnerCount: 2, partners: [
        { name: "小明", capital: 30000, effortType: "全职", responsibility: "制作+出餐" },
        { name: "小红", capital: 20000, effortType: "全职", responsibility: "收银+采购" },
      ], annualProfit: 120000 },
    },
    {
      label: "小餐饮（5万+3万）",
      data: { partnerCount: 2, partners: [
        { name: "A", capital: 50000, effortType: "全职", responsibility: "厨房+出品" },
        { name: "B", capital: 30000, effortType: "全职", responsibility: "前厅+收银" },
      ], annualProfit: 180000 },
    },
  ],
  standard: [
    {
      label: "一人出钱一人全职",
      data: { partnerCount: 2, partners: [
        { name: "A", capital: 200000, effortType: "不出力", responsibility: "仅出资" },
        { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常运营管理" },
      ], annualProfit: 300000 },
    },
    {
      label: "两人都出钱，一全职一兼职",
      data: { partnerCount: 2, partners: [
        { name: "A", capital: 100000, effortType: "全职运营", responsibility: "全面负责公司运营" },
        { name: "B", capital: 100000, effortType: "兼职", responsibility: "周末协助管理" },
      ], annualProfit: 200000 },
    },
  ],
  corporate: [
    {
      label: "资金+运营+技术",
      data: { partnerCount: 3, partners: [
        { name: "A", capital: 150000, effortType: "不出力", responsibility: "仅出资" },
        { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常管理+销售" },
        { name: "C", capital: 0, effortType: "技术", responsibility: "产品开发和技术维护" },
      ], annualProfit: 500000 },
    },
    {
      label: "四人合伙出资",
      data: { partnerCount: 4, partners: [
        { name: "A", capital: 300000, effortType: "不出力", responsibility: "仅出资" },
        { name: "B", capital: 200000, effortType: "全职运营", responsibility: "CEO+全面管理" },
        { name: "C", capital: 100000, effortType: "兼职", responsibility: "市场拓展" },
        { name: "D", capital: 50000, effortType: "技术", responsibility: "技术研发" },
      ], annualProfit: 800000 },
    },
  ],
};



function QArea({ label, current, setter }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ fontSize: "0.8rem", color: "#777", minWidth: 120 }}>{label}</label>
      {["是", "否"].map((v) => (
        <button key={v} onClick={() => setter(v)}
          style={{ padding: "6px 16px", fontSize: "0.8rem", borderRadius: 6, border: current === v ? "2px solid #059669" : "1px solid #ddd", background: current === v ? "#f0fdf4" : "white", cursor: "pointer", color: current === v ? "#059669" : "#555" }}
        >{v}</button>
      ))}
    </div>
  );
}

function getFriendlyErrorMessage(error, fallback) {
  const msg = error?.message || '';
  if (error?.name === 'AbortError' || /timeout|timed out|超时/i.test(msg)) {
    return "请求超时，服务器正在启动或 AI 响应较慢，请稍后重试";
  }
  if (/Failed to fetch|fetch failed|NetworkError|Load failed|ERR_|connection|network/i.test(msg)) {
    return "服务正在启动或连接不稳定，请稍后重试";
  }
  return msg || fallback || "服务暂时不可用，请稍后重试";
}

async function fetchJson(url, options = {}, timeoutMs = 65000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.error) {
      const err = new Error(data.message || data.error || `请求失败：${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const APP_VERSION = 'v0.7.0'; // 瀑布式回复+AI思考动画
export default function ChatApp() {
  // AI一键填表
  const [aiFilling, setAiFilling] = useState(false);
  const [showAiFillDialog, setShowAiFillDialog] = useState(false);
  const [aiFillInput, setAiFillInput] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const formRef = useRef(null);
  const reportRef = useRef(null);

  // 基础表单
  const [partnerCount, setPartnerCount] = useState(2);
  const [sceneMode, setSceneMode] = useState("standard"); // small_biz / standard / corporate
  const [partners, setPartners] = useState(PARTNER_CONFIGS[2].map(() => ({ name: "", capital: 0, effortType: "", responsibility: "" })));
  const [currencyUnit, setCurrencyUnit] = useState("元");
  const [annualProfit, setAnnualProfit] = useState("");
  const [oralAgreement, setOralAgreement] = useState("");
  const [exitConcern, setExitConcern] = useState("");
  const [lossConcern, setLossConcern] = useState("");
  const [contact, setContact] = useState("");

  // 进阶诊断
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasCompany, setHasCompany] = useState("");
  const [hasEquityRegistration, setHasEquityRegistration] = useState("");
  const [hasNomineeHolding, setHasNomineeHolding] = useState("");
  const [operatorPerson, setOperatorPerson] = useState("");
  const [financeController, setFinanceController] = useState("");
  const [decisionMaker, setDecisionMaker] = useState("");
  const [hasNonOperatingPartner, setHasNonOperatingPartner] = useState("");
  const [needsControlRight, setNeedsControlRight] = useState("");
  const [worriesExit, setWorriesExit] = useState("");
  const [needsProtocolList, setNeedsProtocolList] = useState("");

  // === 前端统一状态机 ===
  // idle | generating | preview_ready | payment_pending | paid_unlocked | error
  const [appState, setAppState] = useState('idle');
  const [unlockChecking, setUnlockChecking] = useState(false);

  // localStorage 写入脱闪：防抖 800ms 合并多次写入
  const writeLocalStorage = (key, value) => {
    if (writeLocalStorage._t) clearTimeout(writeLocalStorage._t);
    writeLocalStorage._t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        if (e.name === 'QuotaExceededError' || /quota/i.test(e.message)) {
          // 配额超出：清理最旧的备份 key（保留 3 个历史会话点）
          console.warn('[LocalStorage] 配额超出，清理历史会话');
          try { localStorage.removeItem('fenqian_history_1'); } catch {}
        }
      }
    }, 800);
  };

  // 从 localStorage + 后端 public-status 恢复会话
  const savedResult = (() => {
    try {
      const r = JSON.parse(localStorage.getItem('fenqian_currentCase'));
      if (r && r.state && (r.caseId || r.data?.caseId)) return r;
    } catch {}
    return null;
  })();

  const [result, setResult] = useState(savedResult?.data || null);

  const isServerUnlocked = (status) => {
    if (!status) return false;
    return status.unlockStatus === 'unlocked' ||
      ['reviewed', 'paid_delivered', 'delivered'].includes(status.status) ||
      ['reviewed', 'paid_delivered', 'delivered'].includes(status.reviewStatus);
  };

  const applyUnlockedReport = (caseId, status = {}, report = {}) => {
    const fullMarkdown =
      report.reportMarkdown ||
      report.fullReport ||
      status.fullReport ||
      status.reportMarkdown ||
      status.previewMarkdown ||
      resultRef.current?.previewMarkdown ||
      '';
    const unlockedData = {
      ...(resultRef.current || {}),
      caseId: status.caseId || report.caseId || caseId,
      previewMarkdown: fullMarkdown,
      hasUnlocked: true,
      reviewStatus: status.status || status.reviewStatus || resultRef.current?.reviewStatus,
      status: 'done'
    };
    setResult(unlockedData);
    setAppState('paid_unlocked');
    setShowResult(true);
    try { writeLocalStorage('fenqian_currentCase', ({ state: 'paid_unlocked', data: unlockedData })); } catch {}
    return true;
  };

  // 如果 localStorage 中有 caseId，尝试从后端恢复完整状态
  useEffect(() => {
    const caseId = savedResult?.data?.caseId || localStorage.getItem('fenqian_lastCaseId');
    if (!caseId) return;
    if (appState !== 'idle') return;  // 已在活动中

    (async () => {
      const unlocked = await refreshCaseUnlockStatus(caseId, { silent: true });
      if (unlocked) return;

      fetch('/api/progress/' + caseId)
        .then(r => r.json())
        .then(prog => {
        if (prog.status === 'done') {
          // 拉取预览（2000 字符）
          let previewMd = prog.previewMarkdown || '';
          if (previewMd) {
            const restored = { caseId, previewMarkdown: previewMd, hasUnlocked: false, status: 'done' };
            setResult(restored);
            setAppState('preview_ready');
            setShowResult(true);
            try { writeLocalStorage('fenqian_currentCase', ({ state: 'preview_ready', data: restored })); } catch {}
          }
        } else if (prog.status === 'unknown' || prog.status === 'failed') {
          // 试试 public-status
          fetch('/api/cases/' + caseId + '/public-status')
            .then(r => r.json())
            .then(s => {
              if (s.status && s.previewMarkdown) {
                const serverUnlocked = isServerUnlocked(s);
                const restored = { caseId: s.caseId, previewMarkdown: s.previewMarkdown, hasUnlocked: serverUnlocked, reviewStatus: s.status, status: 'done' };
                setResult(restored);
                setAppState(serverUnlocked ? 'paid_unlocked' : 'preview_ready');
                setShowResult(true);
                try { writeLocalStorage('fenqian_currentCase', ({ state: serverUnlocked ? 'paid_unlocked' : 'preview_ready', data: restored })); } catch {}
                // 如果是已解锁状态，拉取完整报告
                if (serverUnlocked) {
                  fetch('/api/cases/' + caseId + '/unlocked-report', { credentials: 'include' })
                    .then(r => r.ok ? r.json() : null)
                    .then(d => { if (d && (d.reportMarkdown || d.fullReport)) applyUnlockedReport(caseId, s, d); })
                    .catch(() => {});
                }
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    })();
  }, []);

  const [error, setError] = useState("");
  const [showResult, setShowResult] = useState(false);

  const refreshCaseUnlockStatus = async (caseId, options = {}) => {
    if (!caseId) return false;
    const silent = options.silent !== false;
    try {
      if (!silent) setUnlockChecking(true);
      const directReportRes = await fetch('/api/cases/' + caseId + '/unlocked-report', {
        cache: 'no-store',
        credentials: 'include'
      }).catch(() => null);
      if (directReportRes && directReportRes.ok) {
        const directReport = await directReportRes.json();
        return applyUnlockedReport(caseId, { unlockStatus: 'unlocked' }, directReport);
      }

      const statusRes = await fetch('/api/cases/' + caseId + '/public-status', {
        cache: 'no-store',
        credentials: 'include'
      });
      if (!statusRes.ok) return false;
      const status = await statusRes.json();
      const isUnlocked = isServerUnlocked(status);

      if (!isUnlocked) {
        if (status.previewMarkdown) {
          setResult((prev) => ({
            ...(prev || {}),
            caseId: status.caseId || caseId,
            previewMarkdown: prev?.previewMarkdown || status.previewMarkdown,
            hasUnlocked: false,
            reviewStatus: status.status,
            status: 'done'
          }));
          setAppState('preview_ready');
          setShowResult(true);
        }
        return false;
      }

      const reportRes = await fetch('/api/cases/' + caseId + '/unlocked-report', {
        cache: 'no-store',
        credentials: 'include'
      });
      if (!reportRes.ok) {
        return applyUnlockedReport(caseId, status, {});
      }
      const report = await reportRes.json();
      return applyUnlockedReport(caseId, status, report);
    } catch (e) {
      return false;
    } finally {
      if (!silent) setUnlockChecking(false);
    }
  };

  // 修改报告
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [editTarget, setEditTarget] = useState("auto");
  const [editLoading, setEditLoading] = useState(false);
  const [editHistory, setEditHistory] = useState([]);

  const updatePartner = (idx, field, value) => {
    setPartners((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const applyScenario = (scenario) => {
    setPartnerCount(scenario.data.partnerCount);
    setPartners(scenario.data.partners.map((p) => ({ ...p })));
    setAnnualProfit(scenario.data.annualProfit);
    setResult(null);
    setShowResult(false);
    setError("");
    setEditHistory([]);
    setShowEditDialog(false);
  };

  const applyPreset = (mode, preset) => {
    setSceneMode(mode);
    applyScenario(preset);
  };

  const handlePartnerCountChange = (count) => {
    setPartnerCount(count);
    setPartners(PARTNER_CONFIGS[count].map(() => ({ name: "", capital: 0, effortType: "", responsibility: "" })));
  };

  // AI一键填表
  const handleAiFill = async (msg) => {
    if (!msg?.trim()) { setShowAiFillDialog(true); return; }
    setAiFilling(true);
    setShowAiFillDialog(false);
    try {
      const data = await fetchJson("/api/suggest-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg.trim(), currencyUnit }),
      });

      if (data.partnerCount) handlePartnerCountChange(data.partnerCount);
      if (data.partners) {
        const padded = [...data.partners];
        while (padded.length < (data.partnerCount || 2)) {
          padded.push({ name: "", capital: 0, effortType: "", responsibility: "" });
        }
        const slice = padded.slice(0, data.partnerCount || 2);
        // 检测是否整万，自动切万元显示
        const allWan = slice.every(p => p.capital % 10000 === 0) && ((data.annualProfit || 0) % 10000 === 0);
        if (allWan && slice.length > 0) setCurrencyUnit("万元");
        setPartners(slice);
      }
      if (data.annualProfit) setAnnualProfit(String(data.annualProfit));
      if (data.oralAgreement) setOralAgreement(data.oralAgreement);
      if (data.lossConcern) setLossConcern(data.lossConcern);
      if (data.exitConcern) setExitConcern(data.exitConcern);
    } catch (e) {
      console.error("AI fill error", e);
      setError(getFriendlyErrorMessage(e, "AI 填表失败，请手动填写"));
    }
    setAiFilling(false);
  };

  // 进度条轮询
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  const handleSubmit = async () => {
    setError("");
    setResult(null);
    setShowResult(false);
    setGenerating(true);
    setProgress(0);
    setProgressLabel("正在启动...");

    const body = {
      partnerCount,
      sceneMode,
      partners: partners.map((p, i) => ({
        name: p.name || String.fromCharCode(65 + i),
        capital: (Number(p.capital) || 0) * (currencyUnit === "万元" ? 10000 : 1),
        effortType: p.effortType,
        responsibility: p.responsibility,
      })),
      annualProfit: (Number(annualProfit) || 0) * (currencyUnit === "万元" ? 10000 : 1),
      contact: contact.trim(),
    };

    if (oralAgreement) body.oralAgreement = oralAgreement;
    if (exitConcern) body.exitConcern = exitConcern;
    if (lossConcern) body.lossConcern = lossConcern;

    if (showAdvanced) {
      if (hasCompany) body.hasCompany = hasCompany === "是";
      if (hasEquityRegistration) body.hasEquityRegistration = hasEquityRegistration === "是";
      if (hasNomineeHolding) body.hasNomineeHolding = hasNomineeHolding === "是";
      if (operatorPerson) body.operatorPerson = operatorPerson;
      if (financeController) body.financeController = financeController;
      if (decisionMaker) body.decisionMaker = decisionMaker;
      if (hasNonOperatingPartner) body.hasNonOperatingPartner = hasNonOperatingPartner === "是";
      if (needsControlRight) body.needsControlRight = needsControlRight === "是";
      if (worriesExit) body.worriesExit = worriesExit === "是";
      if (needsProtocolList) body.needsProtocolList = needsProtocolList === "是";
    }

    try {
      const data = await fetchJson("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!data.caseId) {
        setError("服务器返回异常，请重试");
        setGenerating(false);
        return;
      }

      // 轮询进度
      const caseId = data.caseId;
      try { localStorage.setItem('fenqian_lastCaseId', caseId); } catch(e) {}
      try {
        localStorage.setItem('fenqian_currentCase', JSON.stringify({
          state: 'generating',
          data: { caseId, hasUnlocked: false, status: 'generating' }
        }));
      } catch(e) {}
      const poll = async () => {
        try {
          const pRes = await fetch(`/api/progress/${caseId}`);
          const pData = await pRes.json();
          if (pData.status === 'done') {
            setProgress(100);
            setProgressLabel("生成完成");
            // 瀑布式展示：先存储完整markdown供章节拆分
            const fullMd = pData.previewMarkdown || '';
            const chapters = splitChapters(fullMd);
            chaptersRef.current = chapters;
            const resultData = {
              caseId,
              previewMarkdown: fullMd,
              hasUnlocked: false,
              status: 'pending_review',
              partners: body.partners,
              sceneMode: body.sceneMode,
              annualProfit: body.annualProfit,
            };
            setResult(resultData);
            setAppState('preview_ready');
            try { localStorage.setItem('fenqian_lastCaseId', caseId); } catch(e) {}
            try { writeLocalStorage('fenqian_currentCase', ({ state: 'preview_ready', data: resultData })); } catch(e) {}
            setShowResult(true);
            setGenerating(false);
            setVisibleChapters(0);
            setEditHistory([]);
            // 瀑布触发：渐进展示段落
            const timer = setInterval(() => {
              setVisibleChapters((prev) => {
                if (prev >= chapters.length) { clearInterval(timer); return prev; }
                return prev + 1;
              });
            }, 280);
            setTimeout(() => { reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 300);
            return;
          }
          if (pData.status === 'failed') {
            setError(getFriendlyErrorMessage({ message: pData.error }, "报告生成失败，请稍后重试"));
            setGenerating(false);
            return;
          }
          const pct = pData.progress || 0;
          setProgress(pct);
          if (pct < 20) setProgressLabel("正在分析合伙信息...");
          else if (pct < 40) setProgressLabel("正在匹配参考案例...");
          else if (pct < 60) setProgressLabel("正在生成诊断报告...");
          else if (pct < 80) setProgressLabel("正在生成分钱方案...");
          else if (pct < 100) setProgressLabel("正在整理最终报告...");
          setTimeout(poll, 500);
        } catch (e) {
          // 重试
          setTimeout(poll, 1000);
        }
      };
      poll();
    } catch (e) {
      setError(getFriendlyErrorMessage(e, "生成失败，请稍后重试"));
      setGenerating(false);
    }
  };

  // 修改报告
  const handleEditReport = async () => {
    if (!result?.caseId || !editPrompt.trim()) return;
    setEditLoading(true);

    try {
      const data = await fetchJson("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: result.caseId,
          target: editTarget === "auto" ? null : editTarget,
          instruction: editPrompt.trim(),
          partners: partners.map((p, i) => ({
            name: p.name || String.fromCharCode(65 + i),
            capital: (Number(p.capital) || 0) * (currencyUnit === "万元" ? 10000 : 1),
            effortType: p.effortType,
            responsibility: p.responsibility,
          })),
          hasAdvanced: showAdvanced,
          advancedFields: showAdvanced
            ? {
                hasCompany: hasCompany === "是",
                hasNomineeHolding: hasNomineeHolding === "是",
                hasNonOperatingPartner: hasNonOperatingPartner === "是",
                needsControlRight: needsControlRight === "是",
                worriesExit: worriesExit === "是",
                operatorPerson,
                financeController,
                decisionMaker,
              }
            : null,
        }),
      });

      const nextMarkdown = data.updatedReport || data.previewMarkdown || "";
      chaptersRef.current = splitChapters(nextMarkdown);
      setResult((prev) => ({ ...prev, previewMarkdown: nextMarkdown }));
      setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "success", error: null }]);
      setEditPrompt("");
      setEditLoading(false);
    } catch (e) {
      setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "error", error: getFriendlyErrorMessage(e, "修改失败，请稍后重试") }]);
      setEditLoading(false);
    }
  };

  // === 内测完整报告申请 ===
  const handleUnlockRequest = async (plan) => {
    if (!result?.caseId) return;
    const planInfo = PLAN_INFO[plan] || PLAN_INFO.basic;
    try {
      // 只记录申请意向，不触发真实支付/自动解锁
      await fetch('/api/cases/' + result.caseId + '/payment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntent: planInfo.intent }),
      });
      setResult((prev) => ({ ...prev, paymentRecorded: planInfo.intent }));
      setAppState('preview_ready');
      const safeMeta = { caseId: result.caseId, hasUnlocked: false, paymentRecorded: planInfo.intent, partners: result.partners, sceneMode: result.sceneMode, annualProfit: result.annualProfit, previewMarkdown: result.previewMarkdown };
      try { writeLocalStorage('fenqian_currentCase', ({ state: 'preview_ready', data: safeMeta })); } catch {}
    } catch (e) {
      alert('记录失败：' + e.message);
      setAppState('preview_ready');
    }
  };

  // 根据章节标题识别模块，返回卡片样式
  const getCardStyle = (chapterText) => {
    const firstLine = chapterText.split('\n')[0] || '';
    if (firstLine.includes('贡献估值表')) {
      return {
        background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
        border: '1px solid #86efac',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
      };
    }
    if (firstLine.includes('五权结构诊断')) {
      return {
        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        border: '1px solid #93c5fd',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
      };
    }
    if (firstLine.includes('三套分钱方案') || firstLine.includes('利润模拟表')) {
      return {
        background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
        border: '1px solid #c084fc',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
      };
    }
    if (firstLine.includes('风险清单')) {
      return {
        background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
        border: '1px solid #fca5a5',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
      };
    }
    if (firstLine.includes('协议条款草稿')) {
      return {
        background: '#f8fafc',
        border: '1px solid #cbd5e1',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
        fontFamily: 'monospace',
      };
    }
    if (firstLine.includes('沟通话术')) {
      return {
        background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
        border: '1px solid #fdba74',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
      };
    }
    return null;
  };

  const getPreviewLimit = (hasUnlocked) => {
    if (hasUnlocked) return Number.POSITIVE_INFINITY;
    if (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) return 3;
    return 4;
  };

  const renderPreview = (markdown, hasUnlocked) => {
    if (!markdown) return null;

    // 已付费解锁：marked 渲染完整报告（带瀑布效果）
    if (hasUnlocked) {
      const chapters = splitChapters(markdown);
      return <div>{chapters.slice(0, Math.max(visibleChapters, chapters.length)).map((ch, i) => {
        // 识别章节类型，选择卡片样式
        const cardStyle = getCardStyle(ch);
        return <div key={i} className="waterfall-item" style={{ animationDelay: `${i * 0.05}s` }}>
          {cardStyle ? (
            <div style={cardStyle}>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: fixTables(sanitizeHtml(marked.parse(ch))) }} />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: fixTables(sanitizeHtml(marked.parse(ch))) }} />
          )}
        </div>;
      })}{renderReportFooter()}</div>;
    }

    // 未解锁：只展示前几章，后续内容做明确保护
    const chapters = chaptersRef.current.length > 0 ? chaptersRef.current : splitChapters(markdown);
    const shownCount = Math.min(visibleChapters, getPreviewLimit(false), chapters.length);
    return <div>
      {chapters.slice(0, shownCount).map((ch, idx) => (
        <div key={idx} className="waterfall-item" style={{ animationDelay: `${idx * 0.04}s` }}>
          <div className="prose prose-sm max-w-none report-chapter" dangerouslySetInnerHTML={{ __html: fixTables(sanitizeHtml(marked.parse(ch))) }} />
        </div>
      ))}
      {chapters.length > shownCount && (
        <div className="locked-report-mask">
          <div className="locked-title">完整报告已生成，以下内容已保护</div>
          <div className="locked-text">剩余章节包含推荐比例、利润模拟、协议条款草稿、沟通话术和下一步行动。内测阶段提交申请后由人工确认开放。</div>
        </div>
      )}
      {renderReportFooter()}
    </div>;
  };

  const isResultUnlocked = (r) => {
    return Boolean(r?.hasUnlocked) ||
      appState === 'paid_unlocked' ||
      ['reviewed', 'paid_delivered', 'delivered'].includes(r?.reviewStatus);
  };

  // 报告顶部封面 + 底部签名 (3. 报告顶部封面)
  const renderReportCover = () => {
    if (!result) return null;
    const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
    return <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      color: 'white',
      padding: '24px 20px',
      borderRadius: 14,
      marginBottom: 18,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(15,23,42,0.15)'
    }}>
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', letterSpacing: '0.15em', marginBottom: 8 }}>STARR 商业诊断书</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 6, lineHeight: 1.4 }}>{result.partners?.length||2} 人合伙分钱诊断方案</div>
      <div style={{ fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>📅 {generatedAt}</span>
        {result.sceneMode && <span>💼 {result.sceneMode === 'small_biz' ? '小店' : result.sceneMode === 'standard' ? '标准' : result.sceneMode === 'corporate' ? '公司化' : result.sceneMode}</span>}
        {result.annualProfit && <span>💰 年利润 ¥{Number(result.annualProfit).toLocaleString()}</span>}
      </div>
      <div style={{ position: 'absolute', top: -30, right: -30, fontSize: '5rem', opacity: 0.06, fontWeight: 900 }}>✦</div>
    </div>;
  };

  // 报告底部签名 (3. 报告底部签名)
  const renderReportFooter = () => {
    return <div style={{
      marginTop: 20,
      paddingTop: 14,
      borderTop: '1px dashed #cbd5e1',
      textAlign: 'center',
      color: '#64748b',
      fontSize: '0.75rem',
      lineHeight: 1.6
    }}>
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>——— 斯塔管理 STARR 商业诊断书 ———</div>
      <div>本报告由 AI 生成，仅供参考。重大决策请咨询专业财务/法律顾问。</div>
      <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#94a3b8' }}>https://ai-partner-fenqian.onrender.com</div>
    </div>;
  };

  // 瀑布式段落分割：将报告按 ## 标题切分为段落块
  const splitChapters = (md) => {
    if (!md) return [];
    const chapters = [];
    const lines = md.split('\n');
    let current = [];
    lines.forEach((line) => {
      if (line.startsWith('## ') && current.length > 0) {
        chapters.push(current.join('\n').trim());
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.length > 0) chapters.push(current.join('\n').trim());
    return chapters.filter(Boolean);
  };

  // 已展示的段落索引（用于瀑布效果）
  const [visibleChapters, setVisibleChapters] = useState(0);
  const chaptersRef = useRef([]);
  // 页面切回时刷新报告状态（使用 useRef 避免闭包中 result 过期）
  const resultRef = useRef(result);
  resultRef.current = result;
  
  // visibilitychange 监听：切回页面时自动从服务器刷新报告
  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === 'visible') {
        const r = resultRef.current;
        if (!r?.caseId) return;
        refreshCaseUnlockStatus(r.caseId, { silent: true }).then((unlocked) => {
          if (unlocked) return;
          fetch('/api/progress/' + r.caseId).then(res => res.json()).then(d => {
            if (d.status === 'done' && d.previewMarkdown) {
              const updated = { ...r, caseId: r.caseId, previewMarkdown: d.previewMarkdown, hasUnlocked: false, status: 'done' };
              setResult(updated);
              setAppState('preview_ready');
              try { writeLocalStorage('fenqian_currentCase', ({ state: 'preview_ready', data: updated })); } catch(e) {}
            }
          }).catch(() => {});
        });
      }
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);

  // 内测人工审核轮询：后台标记 delivered 后，前端自动解锁完整报告。
  useEffect(() => {
    if (!result?.caseId || result?.hasUnlocked) return;
    const timer = setInterval(() => {
      refreshCaseUnlockStatus(result.caseId, { silent: true });
    }, 8000);
    return () => clearInterval(timer);
  }, [result?.caseId, result?.hasUnlocked]);

  useEffect(() => {
    if (!result?.previewMarkdown) return;
    chaptersRef.current = splitChapters(result.previewMarkdown);
    setVisibleChapters(0);
    const timer = setInterval(() => {
      setVisibleChapters((prev) => {
        if (prev >= chaptersRef.current.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 300);
    return () => clearInterval(timer);
  }, [result?.caseId, result?.previewMarkdown]);

  return (
    <div className="app-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* 内联 CSS */}
      <style>{`
        @keyframes think-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .think-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #a7f3d0; animation: think-bounce 1.4s ease-in-out infinite both; }
        .think-dot:nth-child(1) { animation-delay: -0.32s; }
        .think-dot:nth-child(2) { animation-delay: -0.16s; }
        .think-dot:nth-child(3) { animation-delay: 0s; }

        @keyframes waterfall-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .waterfall-item {
          animation: waterfall-in 0.4s ease-out both;
        }
        .app-shell {
          background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 52%, #f8fafc 100%);
        }
        .top-hero {
          background: #102033;
          color: white;
          padding: 34px 20px 26px;
          text-align: center;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }
        .top-hero h1 {
          font-size: 1.72rem;
          font-weight: 800;
          margin-bottom: 8px;
          letter-spacing: 0;
        }
        .top-hero p {
          font-size: .95rem;
          opacity: .88;
          max-width: 560px;
          margin: 0 auto;
          line-height: 1.65;
        }
        .section-title {
          font-size: .82rem;
          font-weight: 700;
          color: #334155;
          margin-bottom: 10px;
          letter-spacing: 0;
        }
        .report-shell {
          background: #fff;
          border: 1px solid #dfe7ef;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 16px;
          line-height: 1.7;
          font-size: .92rem;
          box-shadow: 0 10px 30px rgba(15,23,42,.06);
        }
        .report-chapter {
          line-height: 1.75 !important;
          font-size: .92rem !important;
          color: #263244;
        }
        .locked-report-mask {
          margin: 16px 0 4px;
          padding: 18px 16px;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          background: linear-gradient(180deg, rgba(248,250,252,.72), #f8fafc);
          color: #334155;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .locked-report-mask:before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(135deg, rgba(148,163,184,.09) 0, rgba(148,163,184,.09) 8px, transparent 8px, transparent 16px);
          pointer-events: none;
        }
        .locked-title {
          position: relative;
          font-weight: 800;
          font-size: .96rem;
          margin-bottom: 6px;
          color: #0f172a;
        }
        .locked-text {
          position: relative;
          font-size: .82rem;
          line-height: 1.65;
          color: #64748b;
        }
        .plan-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .plan-card {
          background: #fff;
          border: 1px solid #d7dee8;
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          text-align: left;
          transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
        }
        .plan-card:hover {
          transform: translateY(-1px);
          border-color: #059669;
          box-shadow: 0 10px 24px rgba(15,23,42,.08);
        }
        .plan-card.featured {
          background: #f6fbf8;
          border: 2px solid #059669;
        }
        .modal-panel {
          background: white;
          border-radius: 16px;
          padding: 24px;
          max-width: 420px;
          width: 100%;
          max-height: calc(100vh - 40px);
          overflow: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }

        /* 手机端响应式 */
        @media (max-width: 480px) {
          main { padding: 12px 10px 120px !important; }
          .top-hero { padding: 24px 16px 18px !important; text-align: left !important; }
          .top-hero h1 { font-size: 1.36rem !important; line-height: 1.35 !important; }
          .top-hero p { font-size: .86rem !important; margin: 0 !important; }
          .plan-grid { grid-template-columns: 1fr !important; }
          .report-shell { padding: 14px !important; border-radius: 10px !important; }
          .report-chapter { font-size: .94rem !important; line-height: 1.82 !important; }
          .waterfall-item { animation-duration: 0.3s !important; }
          /* 表格转竖排 */
          table { font-size: 0.72rem !important; }
          th, td { padding: 6px 6px !important; }
          /* 代码块 */
          pre { font-size: 0.72rem !important; padding: 10px !important; }
          /* 按钮变大 */
          button { min-height: 42px !important; }
          /* 报告封面 */
          h1[style*="1.35rem"] { font-size: 1.15rem !important; }
          h2[style*="1.12rem"] { font-size: 1rem !important; }
          h3[style*="0.98rem"] { font-size: 0.9rem !important; }
          /* 输入框/文本区 */
          input, textarea, select { font-size: 16px !important; }
          [data-field-row="true"] { grid-template-columns: 1fr !important; gap: 6px !important; }
          [data-field-row="true"] label { font-weight: 700 !important; color: #475569 !important; }
        }
        @media (min-width: 481px) and (max-width: 768px) {
          main { padding: 16px 14px 100px !important; }
        }
        /* CopilotKit 侧边栏手机端宽度 */
        @media (max-width: 640px) {
          .__copilot_sidebar { width: 100% !important; }
          .__copilot_sidebar .csdk-w-\[400px\] { width: 100% !important; max-width: 100vw !important; }
        }
        /* 触屏点击反馈 */
        @media (hover: none) and (pointer: coarse) {
          button:active { transform: scale(0.97); transition: transform 0.1s; }
          .btn-primary:active, .btn-outline:active { opacity: 0.85; }
        }
        /* 报告区域滚动对齐 */
        #report-section { scroll-margin-top: 16px; }
      `}</style>
      <header className="top-hero">
        <h1>斯塔管理 | AI 合伙分钱诊断</h1>
        <p>
          输入合伙人的出资、出力、利润预期，生成<strong>分钱方案 + 五权结构诊断 + 贡献估值 + 协议草稿</strong>。
        </p>
      </header>

      <main style={{ flex: 1, maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px", width: "100%" }}>
        {/* 合伙人数 + 场景 */}
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">第一步：选择合伙结构</h2>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {[2, 3, 4].map((n) => (
              <button key={n} onClick={() => handlePartnerCountChange(n)}
                style={{ flex: 1, padding: "12px 0", fontSize: "1rem", fontWeight: 600, border: partnerCount === n ? "2px solid #059669" : "1px solid #ddd", borderRadius: 10, background: partnerCount === n ? "#f0fdf4" : "white", cursor: "pointer", color: partnerCount === n ? "#059669" : "#555" }}
              >{n} 人合伙</button>
            ))}
          </div>
          {/* 经营场景模式选择 */}
          <p style={{ fontSize: "0.75rem", color: "#999", marginBottom: 6 }}>选择经营类型：</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {SCENE_MODES.map((m) => (
              <button key={m.value} onClick={() => setSceneMode(m.value)}
                style={{
                  flex: 1, padding: "10px 6px", fontSize: "0.75rem", lineHeight: 1.3,
                  border: sceneMode === m.value ? "2px solid #059669" : "1px solid #d1d5db",
                  borderRadius: 10, background: sceneMode === m.value ? "#f0fdf4" : "white",
                  cursor: "pointer", color: sceneMode === m.value ? "#059669" : "#555",
                  textAlign: "center",
                }}
              >
                {m.label}<br/>
                <span style={{ fontSize: "0.65rem", color: sceneMode === m.value ? "#059669" : "#999", fontWeight: 400 }}>{m.desc}</span>
              </button>
            ))}
          </div>
          {/* 按当前经营模式显示预设场景 */}
          <p style={{ fontSize: "0.75rem", color: "#999", marginBottom: 8 }}>快速填一个{SCENE_MODES.find(m=>m.value===sceneMode)?.label.replace(/^[^\s]+\s/,'')}场景：</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(SCENE_PRESETS[sceneMode] || []).map((s, i) => (
              <button key={i} onClick={() => applyPreset(sceneMode, s)}
                style={{ padding: "8px 14px", fontSize: "0.8rem", background: "#f0fdf4", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", color: "#444", whiteSpace: "nowrap" }}
                onMouseEnter={(e) => e.target.style.background = "#f1f5f9"}
                onMouseLeave={(e) => e.target.style.background = "#f0fdf4"}
              >{s.label}</button>
            ))}
          </div>
          {/* AI一键填表 */}
          <button onClick={() => setShowAiFillDialog(true)} disabled={aiFilling}
            style={{
              width: "100%", padding: "10px 0", fontSize: "0.85rem", fontWeight: 600,
              background: aiFilling ? "#94a3b8" : "#059669",
              color: "white", border: "none", borderRadius: 10, cursor: aiFilling ? "not-allowed" : "pointer",
              marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6
            }}
          >
            {aiFilling ? "⏳ AI 正在分析..." : "🤖 跟 AI 说说什么情况，自动填好表单"}
          </button>

          {/* AI填表对话弹窗 */}
          {showAiFillDialog && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1000, padding: 20
            }} onClick={() => setShowAiFillDialog(false)}>
              <div style={{
                background: "white", borderRadius: 16, padding: 24, maxWidth: 500, width: "100%",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6 }}>🤖 描述你们的合伙情况</h3>
                <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 14, lineHeight: 1.5 }}>
                  用自然语言说就行，AI 会自动提取并填入左侧表单。
                </p>
                <textarea value={aiFillInput} onChange={(e) => setAiFillInput(e.target.value)}
                  placeholder={`例如：
我和两个朋友合伙开餐厅，我出20万全职运营，
张三出10万平时兼职帮忙，李四出5万不出力只分红。
预计一年能赚个三四十万。`}
                  style={{
                    width: "100%", minHeight: 120, padding: 12, fontSize: "0.9rem",
                    border: "1px solid #dde2eb", borderRadius: 10, resize: "vertical",
                    fontFamily: "inherit", lineHeight: 1.5,
                  }} />
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={() => setShowAiFillDialog(false)}
                    style={{
                      flex: 1, padding: "10px 0", fontSize: "0.85rem",
                      border: "1px solid #ddd", borderRadius: 8, background: "white", cursor: "pointer",
                    }}
                  >取消</button>
                  <button onClick={() => handleAiFill(aiFillInput)} disabled={aiFilling || !aiFillInput.trim()}
                    style={{
                      flex: 2, padding: "10px 0", fontSize: "0.85rem", fontWeight: 600,
                      color: "white", background: aiFilling || !aiFillInput.trim() ? "#999" : "#059669",
                      border: "none", borderRadius: 8, cursor: aiFilling || !aiFillInput.trim() ? "not-allowed" : "pointer",
                    }}
                  >{aiFilling ? "⏳ 分析中..." : "🚀 自动填写"}</button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 合伙人信息 */}
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">第二步：填写合伙人信息</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {PARTNER_CONFIGS[partnerCount].map((cfg, idx) => (
              <div key={cfg.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, color: "#444", fontSize: "0.9rem" }}>{cfg.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>姓名</label>
                    <input type="text" placeholder={cfg.id} value={partners[idx]?.name || ""} onChange={(e) => updatePartner(idx, "name", e.target.value)} style={inputStyle} />
                  </div>
                  <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>出资</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" placeholder="0" value={partners[idx]?.capital || ""} onChange={(e) => updatePartner(idx, "capital", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <select value={currencyUnit} onChange={(e) => setCurrencyUnit(e.target.value)}
                        style={{ fontSize: "0.76rem", padding: "6px 4px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", minWidth: 55 }}>
                        <option value="元">元</option>
                        <option value="万元">万元</option>
                      </select>
                    </div>
                  </div>
                  <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>出力类型</label>
                    <select value={partners[idx]?.effortType || ""} onChange={(e) => updatePartner(idx, "effortType", e.target.value)}
                      style={{ ...inputStyle, background: "white", cursor: "pointer", color: !partners[idx]?.effortType ? "#999" : "#333" }}>
                      <option value="" disabled>选择</option>
                      {EFFORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </div>
                  <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>职责</label>
                    <input type="text" placeholder="日常运营、技术开发等" value={partners[idx]?.responsibility || ""} onChange={(e) => updatePartner(idx, "responsibility", e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 经营预期 */}
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">第三步：经营预期与顾虑</h2>
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>年利润</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="0" value={annualProfit} onChange={(e) => setAnnualProfit(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <select value={currencyUnit} onChange={(e) => setCurrencyUnit(e.target.value)}
                  style={{ fontSize: "0.76rem", padding: "6px 4px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", cursor: "pointer", minWidth: 55 }}>
                  <option value="元">元</option>
                  <option value="万元">万元</option>
                </select>
              </div>
            </div>
            <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>口头约定</label>
              <input type="text" placeholder="例如：五五分" value={oralAgreement} onChange={(e) => setOralAgreement(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777", display: "block", marginBottom: 4 }}>顾虑</label>
              <input type="text" placeholder="关于亏损？例如：亏损怎么承担" value={lossConcern} onChange={(e) => setLossConcern(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
              <input type="text" placeholder="关于退出？例如：某人想退出怎么办" value={exitConcern} onChange={(e) => setExitConcern(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </section>

        {/* 进阶诊断 */}
        <section style={{ marginBottom: 24 }}>
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ width: "100%", padding: "12px 16px", fontSize: "0.9rem", fontWeight: 600, background: showAdvanced ? "#059669" : "#f5f7ff", color: showAdvanced ? "white" : "#059669", border: showAdvanced ? "2px solid #059669" : "1px dashed #9ca3af", borderRadius: 12, cursor: "pointer" }}>
            {showAdvanced ? "△ 收起进阶诊断" : "▽ 打开进阶诊断：股权、决策权、退出机制"}
          </button>
          {showAdvanced && (
            <div style={{ background: "#f8fafc", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginTop: 8 }}>
              <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 14, lineHeight: 1.4 }}>
                填写后报告将包含<strong>五权结构诊断</strong>和<strong>完善协议草稿</strong>。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <QArea label="是否已注册公司" current={hasCompany} setter={setHasCompany} />
                <QArea label="股权是否已登记" current={hasEquityRegistration} setter={setHasEquityRegistration} />
                <QArea label="是否存在代持" current={hasNomineeHolding} setter={setHasNomineeHolding} />
                <QArea label="有人只分红不经营？" current={hasNonOperatingPartner} setter={setHasNonOperatingPartner} />
                <QArea label="需某一方保持控制权？" current={needsControlRight} setter={setNeedsControlRight} />
                <QArea label="担心合伙人退出？" current={worriesExit} setter={setWorriesExit} />
                <QArea label="需要协议文件清单？" current={needsProtocolList} setter={setNeedsProtocolList} />
                <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>运营负责人</label>
                  <input type="text" placeholder="谁日常管公司" value={operatorPerson} onChange={(e) => setOperatorPerson(e.target.value)} style={inputStyle} />
                </div>
                <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>财务负责人</label>
                  <input type="text" placeholder="谁掌握财务账户" value={financeController} onChange={(e) => setFinanceController(e.target.value)} style={inputStyle} />
                </div>
                <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>谁拍板</label>
                  <input type="text" placeholder="重大事项谁说了算" value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 联系方式 */}
        <section style={{ marginBottom: 24 }}>
          <h2 className="section-title">第四步：联系方式</h2>
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div data-field-row="true" style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>微信/手机</label>
              <input type="text" placeholder="用于获取完整报告" value={contact} onChange={(e) => setContact(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </section>

        {/* 生成按钮 + 进度条 */}
        <button onClick={handleSubmit} disabled={generating}
          style={{ width: "100%", padding: generating ? "10px 0 6px" : "14px 0", fontSize: "1.05rem", fontWeight: 700, color: "white", background: generating ? "#334155" : "#334155", border: "none", borderRadius: 12, cursor: generating ? "not-allowed" : "pointer", marginBottom: 16 }}>
          {generating ? (
            <div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{progressLabel}</span>
                <span style={{ marginLeft: 10 }}>
                  <span className="think-dot"></span>
                  <span className="think-dot" style={{ marginLeft: 4 }}></span>
                  <span className="think-dot" style={{ marginLeft: 4 }}></span>
                </span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 6, height: 10, margin: "0 20px", position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, background: "linear-gradient(90deg, #a7f3d0, #34d399)", height: "100%", borderRadius: 6, transition: "width 0.4s ease" }}></div>
              </div>
              <div style={{ fontSize: "0.75rem", marginTop: 2, opacity: 0.8 }}>{Math.round(progress)}%</div>
            </div>
          ) : (
            "✨ 生成分钱方案"
          )}
        </button>

        {/* 错误提示 */}
        {error && (
          <div style={{ padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626", fontSize: "0.85rem", marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {/* 报告区域 */}
        {showResult && result && (
          <div ref={reportRef} id="report-section">
            <div style={{ background: "#f0fdf4", border: "1px solid #a7f3d0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: "0.85rem", color: "#166534" }}>
              ✅ 方案已生成 · {new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
              {editHistory.length > 0 && <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "#ff9800" }}>已修改 {editHistory.length} 次</span>}
              {result.caseId && <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: 8 }}>ID: {result.caseId.slice(0, 8)}...</span>}
            </div>

            {renderReportCover()}
            <div className="report-shell">
              {result.previewMarkdown ? (
                (() => {
                  try {
                    const rendered = renderPreview(result.previewMarkdown, isResultUnlocked(result));
                    if (!rendered) throw new Error('renderPreview returned null');
                    return rendered;
                  } catch(e) {
                    console.error('渲染报告失败:', e);
                    return <div className="prose prose-sm max-w-none" style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: fixTables(sanitizeHtml(marked.parse(result.previewMarkdown))) }} />;
                  }
                })()
              ) : (
                <p style={{ color: "#888", textAlign: "center", padding: 20 }}>报告内容加载中...</p>
              )}
            </div>

            {/* 修改报告区 */}
            <div style={{ marginBottom: 16 }}>
              <button onClick={() => setShowEditDialog(!showEditDialog)}
                style={{ width: "100%", padding: "10px 0", fontSize: "0.85rem", fontWeight: 600, background: showEditDialog ? "#059669" : "#f5f7ff", color: showEditDialog ? "white" : "#059669", border: showEditDialog ? "1px solid #334155" : "1px dashed #94a3b8", borderRadius: 10, cursor: "pointer" }}
              >{showEditDialog ? "▲ 收起修改面板" : "✏️ 让 AI 修改报告（支持局部调整）"}</button>

              {showEditDialog && (
                <div style={{ background: "#f8fafc", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginTop: 8 }}>
                  <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 12, lineHeight: 1.4 }}>
                    告诉 AI 你想怎么改——可以<strong>只改某一部分</strong>（如"把方案三的A改成6，B改成4"），也可以<strong>全部重做</strong>。
                  </p>
                  <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder={`示例：\n- 把方案三的A和B分成改成6:4\n- 帮我补充退出机制，要求三年回本后才能退\n- 全部重做，A和B平均分配`}
                    style={{ width: "100%", minHeight: 80, padding: 10, fontSize: "0.85rem", border: "1px solid #dde2eb", borderRadius: 8, resize: "vertical", fontFamily: "inherit", marginBottom: 10 }} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={editTarget} onChange={(e) => setEditTarget(e.target.value)}
                      style={{ fontSize: "0.8rem", padding: "8px 10px", border: "1px solid #dde2eb", borderRadius: 6, background: "white", flexShrink: 0 }}>
                      <option value="auto">自动识别改哪部分</option>
                      <option value="合伙关系摘要">合伙关系摘要</option>
                      <option value="核心矛盾诊断">核心矛盾诊断</option>
                      <option value="贡献估值表">贡献估值表</option>
                      <option value="五权结构诊断">五权结构诊断</option>
                      <option value="三套分钱方案">三套分钱方案</option>
                      <option value="利润模拟表">利润模拟表</option>
                      <option value="推荐方案与调整条件">推荐方案</option>
                      <option value="风险清单">风险清单</option>
                      <option value="协议条款草稿">协议条款草稿</option>
                      <option value="沟通话术与下一步行动">沟通话术</option>
                      <option value="全部">全部重做</option>
                    </select>
                    <button onClick={handleEditReport} disabled={editLoading || !editPrompt.trim()}
                      style={{ flex: 1, padding: "10px 0", fontSize: "0.85rem", fontWeight: 600, color: "white", background: editLoading || !editPrompt.trim() ? "#999" : "#059669", border: "none", borderRadius: 8, cursor: editLoading || !editPrompt.trim() ? "not-allowed" : "pointer" }}
                    >{editLoading ? "⏳ 修改中..." : "🚀 应用修改"}</button>
                  </div>
                </div>
              )}

              {editHistory.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 6, fontWeight: 600 }}>修改记录</div>
                  {editHistory.map((h, i) => (
                    <div key={i} style={{ padding: "8px 12px", marginBottom: 4, borderRadius: 6,
                      background: h.status === "success" ? "#f0fdf4" : "#fef2f2",
                      border: "1px solid", borderColor: h.status === "success" ? "#a7f3d0" : "#fecaca",
                      fontSize: "0.8rem", color: h.status === "success" ? "#166534" : "#dc2626" }}>
                      <strong>第{i+1}次：</strong>{h.prompt}
                      <span style={{ float: "right", fontSize: "0.75rem" }}>{h.status === "success" ? "✅" : "❌"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 内测转化 — 完整报告申请 */}
            <div id="payment-section" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
              {isResultUnlocked(result) ? (
                <div style={{ padding: "8px 0" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 6, color: "#166534" }}>完整报告已开放</h3>
                  <p style={{ fontSize: "0.82rem", color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                    后台已完成审核/交付，当前页面已展示完整内容。
                  </p>
                  <a href={`/api/cases/${result.caseId}/download`} target="_blank" rel="noreferrer"
                    style={{ display: "inline-block", padding: "10px 18px", borderRadius: 8, background: "#059669", color: "white", fontSize: ".85rem", fontWeight: 700, textDecoration: "none" }}>
                    下载完整报告
                  </a>
                </div>
              ) : (
                <>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>获取完整报告</h3>
              <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 16, lineHeight: 1.5 }}>
                内测阶段先提交申请，由人工确认后开放完整报告和下载权限。
              </p>
              <div className="plan-grid">
                {/* 基础版卡片 */}
                <div onClick={() => { setSelectedPlan("basic"); setShowPaymentModal(true); }}
                  className="plan-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>基础版</div>
                      <div style={{ fontSize: "0.78rem", color: "#059669", fontWeight: 600, marginBottom: 8 }}>29.9 元</div>
                      <ul style={{ fontSize: "0.76rem", color: "#666", margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
                        <li>完整 AI 报告含五权结构诊断</li>
                        <li>三套分钱方案 + 利润模拟表</li>
                        <li>基础协议条款草稿 + 协议清单</li>
                        <li>PDF 下载可保存</li>
                      </ul>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#059669", marginTop: 8, fontWeight: 700 }}>申请</div>
                  </div>
                </div>
                {/* 人工审核版卡片 */}
                <div onClick={() => { setSelectedPlan("reviewed"); setShowPaymentModal(true); }}
                  className="plan-card featured">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>
                        人工审核版
                        <span style={{ fontSize: "0.65rem", background: "#059669", color: "white", padding: "2px 8px", borderRadius: 4, marginLeft: 6, verticalAlign: "middle" }}>推荐</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#059669", fontWeight: 600, marginBottom: 8 }}>99 元</div>
                      <ul style={{ fontSize: "0.76rem", color: "#666", margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
                        <li>包含全部基础版权益</li>
                        <li>人工快速审核报告一次</li>
                        <li>可根据建议补充信息后重生成</li>
                        <li>重点协议条款草稿 + 完整协议清单</li>
                      </ul>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#059669", marginTop: 8, fontWeight: 700 }}>申请</div>
                  </div>
                </div>
              </div>
              {result.paymentRecorded && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: "0.8rem", color: "#166534", border: "1px solid #a7f3d0" }}>
                  已记录您的完整报告申请，客服会通过您填写的联系方式联系。
                </div>
              )}
              <button onClick={() => refreshCaseUnlockStatus(result.caseId, { silent: false })}
                disabled={unlockChecking}
                style={{ marginTop: 12, padding: "9px 14px", borderRadius: 8, border: "1px solid #059669", background: unlockChecking ? "#f1f5f9" : "white", color: "#059669", fontSize: ".8rem", fontWeight: 700, cursor: unlockChecking ? "wait" : "pointer" }}>
                {unlockChecking ? "正在检查..." : "我已提交/客服已确认，刷新解锁状态"}
              </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "16px 20px", fontSize: "0.75rem", color: "#aaa", borderTop: "1px solid #eee" }}>
        右侧聊天可 AI 顾问辅助 · 基于真实案例数据的商业分析参考
      </footer>

      {/* 内测申请弹窗 Modal */}
      {showPaymentModal && (
        <div onClick={() => { setShowPaymentModal(false); setSelectedPlan(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            className="modal-panel">
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{(PLAN_INFO[selectedPlan] || PLAN_INFO.basic).title}</h3>
              <button onClick={() => { setShowPaymentModal(false); setSelectedPlan(null); }}
                style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#999", padding: "4px 8px" }}>✕</button>
            </div>

            <p style={{ fontSize: "0.8rem", color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
              {(PLAN_INFO[selectedPlan] || PLAN_INFO.basic).intro}
            </p>

            <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16, textAlign: "left", marginBottom: 16 }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#059669", marginBottom: 2 }}>
                {selectedPlan === "basic" ? "29.9" : "99"} 元
              </div>
              <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 12 }}>当前为内测申请价，最终以人工确认结果为准。</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".82rem", color: "#475569", lineHeight: 1.75 }}>
                {(PLAN_INFO[selectedPlan] || PLAN_INFO.basic).items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              {!contact.trim() && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#fff7ed", color: "#9a3412", fontSize: ".78rem", lineHeight: 1.5 }}>
                  建议先在表单里填写微信或手机号，方便人工确认后发送完整报告。
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowPaymentModal(false); setSelectedPlan(null); }}
                style={{ flex: 1, padding: "12px 0", fontSize: "0.85rem", color: "#059669", background: "white", border: "1px solid #059669", borderRadius: 8, cursor: "pointer" }}>
                取消
              </button>
              <button onClick={() => { handleUnlockRequest(selectedPlan === "basic" ? "basic" : "reviewed"); setShowPaymentModal(false); }}
                style={{ flex: 1, padding: "12px 0", fontSize: "0.85rem", fontWeight: 600, color: "white", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" }}>
                提交申请
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px", fontSize: "0.85rem", border: "1px solid #dde2eb", borderRadius: 6, outline: "none", width: "100%", boxSizing: "border-box",
};
