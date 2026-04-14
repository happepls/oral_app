import { MessageBubble } from "../components/MessageBubble";

export function MessageBubblePage() {
  const examples = [
    {
      type: "user" as const,
      message: "Hello! Can you help me practice my language speaking?",
      timestamp: "10:30 AM",
      state: "default" as const,
    },
    {
      type: "ai" as const,
      message: "Of course! I'd be happy to help you practice. What would you like to focus on today?",
      timestamp: "10:30 AM",
      state: "default" as const,
    },
    {
      type: "user" as const,
      message: "I want to practice ordering food at a restaurant.",
      timestamp: "10:31 AM",
      state: "default" as const,
    },
    {
      type: "ai" as const,
      message: "Great choice! Let's start with a simple scenario. I'll be your waiter.",
      timestamp: "10:31 AM",
      state: "default" as const,
    },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">💬 MessageBubble</h1>
        <p className="text-gray-600">AI 对话消息气泡组件</p>
      </div>

      {/* Live Example */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">实时示例</h2>
        <div className="bg-gradient-to-b from-gray-50 to-gray-100 rounded-lg p-6 space-y-4">
          {examples.map((example, index) => (
            <MessageBubble key={index} {...example} />
          ))}
        </div>
      </section>

      {/* Type Variants */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">类型变体 (Type)</h2>
        
        <div className="space-y-8">
          {/* User Message */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">用户消息 (User)</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <MessageBubble
                type="user"
                message="Hello! Can you help me practice my language speaking?"
                timestamp="10:30 AM"
              />
            </div>
            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <p>• 背景：Primary 色 (#637FF1)</p>
              <p>• 圆角：24px (左上、左下、右上) / 8px (右下)</p>
              <p>• 内边距：24px</p>
              <p>• 文字颜色：白色</p>
            </div>
          </div>

          {/* AI Message */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">AI 消息 (AI)</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <MessageBubble
                type="ai"
                message="Of course! I'd be happy to help you practice. What would you like to focus on today?"
                timestamp="10:30 AM"
              />
            </div>
            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <p>• 背景：#E1E2E6 (Background/Dark-Surface)</p>
              <p>• 圆角：8px (左上) / 24px (右上、左下、右下)</p>
              <p>• 头像：48px 圆形，Secondary 色</p>
              <p>• 文字颜色：深灰色</p>
            </div>
          </div>
        </div>
      </section>

      {/* State Variants */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">状态变体 (State)</h2>
        
        <div className="space-y-8">
          {/* Default */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Default - 正常状态</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <MessageBubble
                type="user"
                message="This is a normal message"
                timestamp="10:30 AM"
                state="default"
              />
            </div>
          </div>

          {/* Loading */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Loading - 加载状态</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <MessageBubble
                type="ai"
                message=""
                state="loading"
              />
            </div>
            <p className="mt-4 text-sm text-gray-600">• 显示三个脉动的点表示 AI 正在思考</p>
          </div>

          {/* Error */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Error - 错误状态</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <MessageBubble
                type="user"
                message="This message failed to send"
                timestamp="10:30 AM"
                state="error"
              />
            </div>
            <p className="mt-4 text-sm text-gray-600">• 红色边框 (2px) 表示发送失败</p>
          </div>
        </div>
      </section>

      {/* Props Documentation */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">组件属性 (Props)</h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">属性</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">类型</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">默认值</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-900">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">type</td>
                <td className="px-6 py-4 text-sm text-gray-600">"user" | "ai"</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">消息类型</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">message</td>
                <td className="px-6 py-4 text-sm text-gray-600">string</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">消息内容</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">timestamp</td>
                <td className="px-6 py-4 text-sm text-gray-600">string</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">时间戳</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">avatar</td>
                <td className="px-6 py-4 text-sm text-gray-600">string</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">头像 URL（仅 AI）</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">state</td>
                <td className="px-6 py-4 text-sm text-gray-600">"default" | "loading" | "error"</td>
                <td className="px-6 py-4 text-sm text-gray-600">"default"</td>
                <td className="px-6 py-4 text-sm text-gray-600">消息状态</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Usage Code */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">使用示例</h2>
        <div className="bg-gray-900 rounded-lg p-6 overflow-x-auto">
          <pre className="text-sm text-gray-100">
            <code>{`import { MessageBubble } from "./components/MessageBubble";

function Chat() {
  return (
    <div className="space-y-4">
      {/* User message */}
      <MessageBubble
        type="user"
        message="Hello! Can you help me?"
        timestamp="10:30 AM"
        state="default"
      />
      
      {/* AI loading */}
      <MessageBubble
        type="ai"
        message=""
        state="loading"
      />
      
      {/* Error message */}
      <MessageBubble
        type="user"
        message="Failed to send"
        timestamp="10:31 AM"
        state="error"
      />
    </div>
  );
}`}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}