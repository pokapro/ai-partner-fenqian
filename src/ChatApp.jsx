import { useState, useRef } from "react";
import { marked } from "marked";

// 配置 marked 格式
marked.setOptions({ breaks: true, gfm: true });
const renderer = new marked.Renderer();
renderer.table = ({ header, body }) =>
  `<div style="overflow-x:auto;margin:8px 0;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;"><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
renderer.tablerow = ({ text }) => `<tr>${text}</tr>`;
renderer.tablecell = ({ text, align, header }) => {
  const tag = header ? 'th' : 'td';
  const s = header
    ? `padding:8px 10px;background:#f0fdf4;color:#166534;font-weight:600;border:1px solid #d1d5db;text-align:left;`
    : `padding:8px 10px;border:1px solid #e2e8f0;text-align:left;`;
  return `<${tag} style="${s}">${text}</${tag}>`;
};
renderer.strong = ({ text }) => `<strong style="color:#059669;">${text}</strong>`;
renderer.blockquote = ({ text }) =>
  `<blockquote style="border-left:4px solid #059669;padding:8px 16px;margin:12px 0;background:#f0fdf4;color:#166534;font-style:italic;">${text}</blockquote>`;
renderer.hr = () => `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">`;
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

const SCENARIOS = [
  {
    label: "A出20万不出力，B出5万全职",
    data: { partnerCount: 2, partners: [
      { name: "A", capital: 200000, effortType: "不出力", responsibility: "仅出资" },
      { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常运营管理" },
    ], annualProfit: 300000 },
  },
  {
    label: "两人都出钱，一人全职一人兼职",
    data: { partnerCount: 2, partners: [
      { name: "A", capital: 100000, effortType: "全职运营", responsibility: "全面负责公司运营" },
      { name: "B", capital: 100000, effortType: "兼职", responsibility: "周末协助管理" },
    ], annualProfit: 200000 },
  },
  {
    label: "三人合伙：资金+运营+技术",
    data: { partnerCount: 3, partners: [
      { name: "A", capital: 150000, effortType: "不出力", responsibility: "仅出资" },
      { name: "B", capital: 50000, effortType: "全职运营", responsibility: "日常管理+销售" },
      { name: "C", capital: 0, effortType: "技术", responsibility: "产品开发和技术维护" },
    ], annualProfit: 500000 },
  },
];

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

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showResult, setShowResult] = useState(false);

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
      const res = await fetch("/api/suggest-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg.trim(), currencyUnit }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setAiFilling(false); return; }

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
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || "生成失败");
        setGenerating(false);
        return;
      }

      if (!data.caseId) {
        setError("服务器返回异常，请重试");
        setGenerating(false);
        return;
      }

      // 轮询进度
      const caseId = data.caseId;
      const poll = async () => {
        try {
          const pRes = await fetch(`/api/progress/${caseId}`);
          const pData = await pRes.json();
          if (pData.status === 'done') {
            setProgress(100);
            setProgressLabel("生成完成");
            // 直接使用后端返回的 previewMarkdown
            setResult({ caseId, previewMarkdown: pData.previewMarkdown, hasUnlocked: false, status: 'pending_review' });
            setShowResult(true);
            setGenerating(false);
            setEditHistory([]);
            setTimeout(() => { reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 150);
            return;
          }
          if (pData.status === 'failed') {
            setError("报告生成失败，请稍后重试");
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
      setError("网络错误，请检查连接后重试");
      setGenerating(false);
    }
  };

  // 修改报告
  const handleEditReport = async () => {
    if (!result?.caseId || !editPrompt.trim()) return;
    setEditLoading(true);

    try {
      const res = await fetch("/api/regenerate", {
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

      const data = await res.json();

      if (!res.ok) {
        setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "error", error: data.message || "修改失败" }]);
        setEditLoading(false);
        return;
      }

      setResult((prev) => ({ ...prev, previewMarkdown: data.updatedReport || data.previewMarkdown }));
      setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "success", error: null }]);
      setEditPrompt("");
      setEditLoading(false);
    } catch (e) {
      setEditHistory((prev) => [...prev, { prompt: editPrompt, target: editTarget, status: "error", error: "网络错误" }]);
      setEditLoading(false);
    }
  };

  const handlePayment = async (intent) => {
    if (!result?.caseId) return;
    try {
      await fetch(`/api/cases/${result.caseId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntent: intent }),
      });
      setResult((prev) => ({ ...prev, paymentRecorded: intent }));
    } catch (e) {
      console.error("Payment record failed", e);
    }
  };

  const renderPreview = (markdown, hasUnlocked) => {
    if (!markdown) return null;

    // 已付费解锁：marked 渲染完整报告
    if (hasUnlocked) {
      const html = marked.parse(markdown);
      return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
    }

    // 未解锁：按行处理付费保护
    const lines = markdown.split("\n").filter(Boolean);
    let inPaid = false, paidLinesShown = 0, maxVisible = 2;
    const elements = [];

    lines.forEach((line, i) => {
      if (line.includes("<!--paid-->")) {
        inPaid = true; paidLinesShown = 0;
        elements.push(
          <h3 key={i} style={{ fontSize: "1.05rem", fontWeight: 700, margin: "16px 0 8px" }}>
            {line.replace("<!--paid-->", "").replace(/^##\s*/, "")}
            <span style={{ fontSize: "0.7rem", color: "#d97706", marginLeft: 8, background: "#fef3c7", padding: "2px 8px", borderRadius: 4 }}>🔒 付费内容</span>
          </h3>
        );
        return;
      }
      if (line.startsWith("## ")) { inPaid = false; elements.push(<h3 key={i} style={{ fontSize: "1.05rem", fontWeight: 700, margin: "16px 0 8px" }}>{line.replace(/^##\s*/, "")}</h3>); return; }
      if (line.startsWith("### ")) { elements.push(<h4 key={i} style={{ fontSize: "0.95rem", fontWeight: 600, margin: "12px 0 4px", color: "#1f2937" }}>{line.replace(/^###\s*/, "")}</h4>); return; }

      if (inPaid && !hasUnlocked) {
        paidLinesShown++;
        if (paidLinesShown <= maxVisible) {
          const html = marked.parseInline(line.replace(/^[>-]\s*/, ''));
          if (line.startsWith('- ')) elements.push(<li key={i} style={{ marginLeft: 16, marginBottom: 4, fontSize: "0.85rem" }} dangerouslySetInnerHTML={{ __html: html }} />);
          else if (line.startsWith('> ')) elements.push(<blockquote key={i} style={{ borderLeft: "3px solid #059669", padding: "4px 12px", margin: "4px 0", background: "#f0fdf4", fontSize: "0.85rem" }} dangerouslySetInnerHTML={{ __html: html }} />);
          else elements.push(<p key={i} style={{ margin: "4px 0", fontSize: "0.85rem" }} dangerouslySetInnerHTML={{ __html: html }} />);
        } else if (paidLinesShown === maxVisible + 1) {
          elements.push(
            <div key={i} style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: "14px 18px", margin: "12px 0", textAlign: "center" }}>
              <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#92400e", marginBottom: 6 }}>🔒 付费解锁完整专业内容</p>
              <p style={{ fontSize: "0.78rem", color: "#92400e", marginBottom: 10, lineHeight: 1.3 }}>贡献估值、五权诊断、协议条款等完整数据付费后可查看</p>
              <button onClick={() => document.getElementById("payment-section")?.scrollIntoView({ behavior: "smooth" })}
                style={{ padding: "10px 24px", fontSize: "0.85rem", fontWeight: 600, color: "white", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" }}>查看付费方案 →</button>
            </div>
          );
        }
        return;
      }

      // 非付费内容
      const trimmed = line.trim();
      if (!trimmed) return;
      const html = marked.parseInline(trimmed);
      if (trimmed.startsWith('- ')) elements.push(<li key={i} style={{ marginLeft: 16, marginBottom: 4, fontSize: "0.85rem" }} dangerouslySetInnerHTML={{ __html: html.replace(/^-\s*/, '') }} />);
      else if (trimmed.startsWith('> ')) elements.push(<blockquote key={i} style={{ borderLeft: "3px solid #059669", padding: "4px 12px", margin: "4px 0", background: "#f0fdf4", fontSize: "0.85rem" }} dangerouslySetInnerHTML={{ __html: html }} />);
      else if (trimmed.startsWith('---')) elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "16px 0" }} />);
      else if (trimmed.startsWith('|')) elements.push(<p key={i} style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "#4b5563", margin: "2px 0" }}>{trimmed}</p>);
      else elements.push(<p key={i} style={{ margin: "4px 0", fontSize: "0.85rem" }} dangerouslySetInnerHTML={{ __html: html }} />);
    });

    return <div>{elements}</div>;
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "#1e293b", color: "white", padding: "40px 20px 30px", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: 8 }}>斯塔管理 | 🤝 AI 合伙分钱诊断</h1>
        <p style={{ fontSize: "0.95rem", opacity: 0.9, maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
          输入合伙人的出资、出力、利润预期，生成<strong>分钱方案 + 五权结构诊断 + 贡献估值 + 协议草稿</strong>。
        </p>
      </header>

      <main style={{ flex: 1, maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px", width: "100%" }}>
        {/* 合伙人数 + 场景 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>选择合伙人数</h2>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {[2, 3, 4].map((n) => (
              <button key={n} onClick={() => handlePartnerCountChange(n)}
                style={{ flex: 1, padding: "12px 0", fontSize: "1rem", fontWeight: 600, border: partnerCount === n ? "2px solid #059669" : "1px solid #ddd", borderRadius: 10, background: partnerCount === n ? "#f0fdf4" : "white", cursor: "pointer", color: partnerCount === n ? "#059669" : "#555" }}
              >{n} 人合伙</button>
            ))}
          </div>
          <p style={{ fontSize: "0.75rem", color: "#999", marginBottom: 8 }}>快速填一个场景试试：</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SCENARIOS.map((s, i) => (
              <button key={i} onClick={() => applyScenario(s)}
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
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>合伙人信息</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {PARTNER_CONFIGS[partnerCount].map((cfg, idx) => (
              <div key={cfg.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, color: "#444", fontSize: "0.9rem" }}>{cfg.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>姓名</label>
                    <input type="text" placeholder={cfg.id} value={partners[idx]?.name || ""} onChange={(e) => updatePartner(idx, "name", e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: "0.8rem", color: "#777" }}>出力类型</label>
                    <select value={partners[idx]?.effortType || ""} onChange={(e) => updatePartner(idx, "effortType", e.target.value)}
                      style={{ ...inputStyle, background: "white", cursor: "pointer", color: !partners[idx]?.effortType ? "#999" : "#333" }}>
                      <option value="" disabled>选择</option>
                      {EFFORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 8 }}>
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
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>经营预期与顾虑</h2>
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: "0.8rem", color: "#777" }}>年利润</label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" placeholder="0" value={annualProfit} onChange={(e) => setAnnualProfit(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <span style={{ fontSize: "0.8rem", color: "#999" }}>{currencyUnit}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>运营负责人</label>
                  <input type="text" placeholder="谁日常管公司" value={operatorPerson} onChange={(e) => setOperatorPerson(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>财务负责人</label>
                  <input type="text" placeholder="谁掌握财务账户" value={financeController} onChange={(e) => setFinanceController(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: "0.8rem", color: "#777" }}>谁拍板</label>
                  <input type="text" placeholder="重大事项谁说了算" value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 联系方式 */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>联系方式</h2>
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", alignItems: "center", gap: 10 }}>
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
              <div style={{ marginBottom: 4 }}>{progressLabel}</div>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 6, height: 10, margin: "0 20px", position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, background: "#a7f3d0", height: "100%", borderRadius: 6, transition: "width 0.3s ease" }}></div>
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
          <div ref={reportRef} id="result-section">
            <div style={{ background: "#f0fdf4", border: "1px solid #a7f3d0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: "0.85rem", color: "#166534" }}>
              ✅ 方案已生成 · {new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
              {editHistory.length > 0 && <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "#ff9800" }}>已修改 {editHistory.length} 次</span>}
              {result.caseId && <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: 8 }}>ID: {result.caseId.slice(0, 8)}...</span>}
            </div>

            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 16, lineHeight: 1.6, fontSize: "0.9rem" }}>
              {result.previewMarkdown ? renderPreview(result.previewMarkdown, result.hasUnlocked) : <p style={{ color: "#888" }}>报告内容加载中...</p>}
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

            {/* 付款转化 — 卡片式计费 */}
            <div id="payment-section" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>📋 获取完整报告</h3>
              <p style={{ fontSize: "0.8rem", color: "#777", marginBottom: 16, lineHeight: 1.5 }}>
                预览版已展示付费模块的前 2 行摘要<br/>完整内容含全部数据、分析和协议条款
              </p>
              <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                {/* 基础版卡片 */}
                <div onClick={() => { setSelectedPlan("basic"); setShowPaymentModal(true); }}
                  style={{ background: "white", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "left" }}>
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
                    <div style={{ fontSize: "1.3rem", color: "#059669", marginTop: 8 }}>→</div>
                  </div>
                </div>
                {/* 人工审核版卡片 */}
                <div onClick={() => { setSelectedPlan("reviewed"); setShowPaymentModal(true); }}
                  style={{ background: "#fff8e1", border: "2px solid #059669", borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "left" }}>
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
                    <div style={{ fontSize: "1.3rem", color: "#059669", marginTop: 8 }}>→</div>
                  </div>
                </div>
              </div>
              {result.paymentRecorded && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: "0.8rem", color: "#166534", border: "1px solid #a7f3d0" }}>
                  ✅ 已记录您的选择，客服会通过您填写的联系方式联系
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "16px 20px", fontSize: "0.75rem", color: "#aaa", borderTop: "1px solid #eee" }}>
        右侧聊天可 AI 顾问辅助 · 基于真实案例数据的商业分析参考
      </footer>

      {/* 支付弹窗 Modal */}
      {showPaymentModal && (
        <div onClick={() => { setShowPaymentModal(false); setSelectedPlan(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{selectedPlan === "basic" ? "基础版" : "人工审核版"}</h3>
              <button onClick={() => { setShowPaymentModal(false); setSelectedPlan(null); }}
                style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#999", padding: "4px 8px" }}>✕</button>
            </div>

            <p style={{ fontSize: "0.8rem", color: "#555", marginBottom: 16, lineHeight: 1.5 }}>
              {selectedPlan === "basic"
                ? "选择基础版后请使用微信或支付宝扫码支付 29.9 元，支付完成后报告将自动解锁。"
                : "选择人工审核版后请扫码支付 99 元，客服将审核您的报告。"}
            </p>

            <div style={{ background: "#f8fafc", borderRadius: 12, padding: 20, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#059669", marginBottom: 2 }}>
                {selectedPlan === "basic" ? "29.9" : "99"} 元
              </div>
              <div style={{ fontSize: "0.75rem", color: "#888", marginBottom: 14 }}>微信扫码支付</div>
              <div style={{ background: "white", border: "2px dashed #d1d5db", borderRadius: 12, padding: 12, display: "inline-block" }}>
                <img src="/wechat-qr.png" alt="微信收款码"
                  style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 8, display: "block" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowPaymentModal(false); setSelectedPlan(null); }}
                style={{ flex: 1, padding: "12px 0", fontSize: "0.85rem", color: "#059669", background: "white", border: "1px solid #059669", borderRadius: 8, cursor: "pointer" }}>
                取消
              </button>
              <button onClick={() => { handlePayment(selectedPlan === "basic" ? "basic" : "reviewed"); setShowPaymentModal(false); }}
                style={{ flex: 1, padding: "12px 0", fontSize: "0.85rem", fontWeight: 600, color: "white", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" }}>
                我已付款
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
