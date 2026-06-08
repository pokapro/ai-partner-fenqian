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
        defaultOpen={true}
        clickOutsideToClose={false}
        labels={{
          title: "🤝 合伙算钱",
          initial: "描述你的合伙情况，我来帮你生成分钱方案！",
        }}
      >
        <ChatApp />
      </CopilotSidebar>
    </CopilotKit>
  );
}
