import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import ChatApp from "./ChatApp";

export default function App() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="fenqian"
    >
      <CopilotSidebar
        defaultOpen={false}
        clickOutsideToClose={false}
        labels={{
          title: "🤖 AI 顾问",
          initial: "我是你的合伙分钱 AI 顾问。可以帮你：\n\n• 分析合伙情况\n• 解释分钱方案\n• 对比相似案例\n• 回答关于股权的问题\n\n需要我帮忙吗？",
        }}
      >
        <ChatApp />
      </CopilotSidebar>
    </CopilotKit>
  );
}
