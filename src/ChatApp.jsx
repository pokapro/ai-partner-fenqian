export default function ChatApp() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "12px" }}>
        🤝 合伙算钱
      </h1>
      <p style={{ color: "#666", maxWidth: "480px", lineHeight: 1.6 }}>
        AI 自动生成契合你们情况的合伙分钱方案。
        点击左侧聊天图标开始，描述你们的出资、出力、利润情况。
      </p>
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          background: "#f0f4ff",
          borderRadius: "8px",
          maxWidth: "400px",
          fontSize: "0.9rem",
        }}
      >
        💡 试试这样说：<br />
        <em>
          "我们两个人合伙。A出资20万不出力，B出资5万全职运营，
          年利润预计30万，怎么分钱？
          A觉得他出钱多应该拿大头"
        </em>
      </div>
    </div>
  );
}
