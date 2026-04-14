import { useState } from "react";
import { ScenarioCard } from "../components/ScenarioCard";

export function ScenarioCardPage() {
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  const scenarios = [
    {
      title: "Coffee Shop Chat",
      description: "学习如何在咖啡店点单，包括询问推荐、选择大小和支付等基础对话。",
      image: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80",
      duration: "10 分钟",
      difficulty: "beginner" as const,
      rating: 4.9,
      progress: 75,
    },
    {
      title: "机场办理登机",
      description: "学习如何在机场值机柜台办理登机手续，包括行李托运、座位选择等常用对话。",
      image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80",
      duration: "15 分钟",
      difficulty: "intermediate" as const,
      rating: 4.8,
      progress: 0,
    },
    {
      title: "商务会议讨论",
      description: "练习在商务会议中表达观点、提出建议和参与讨论的专业英语表达。",
      image: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80",
      duration: "20 分钟",
      difficulty: "advanced" as const,
      rating: 4.6,
      progress: 30,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">🃏 ScenarioCard</h1>
        <p className="text-gray-600">学习场景卡片组件</p>
      </div>

      {/* Live Examples */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">实时示例</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.map((scenario, index) => (
            <ScenarioCard
              key={index}
              {...scenario}
              state={selectedCard === index ? "selected" : "default"}
              onStart={() => {
                setSelectedCard(index);
                console.log(`Starting: ${scenario.title}`);
              }}
            />
          ))}
        </div>
      </section>

      {/* Difficulty Variants */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">难度变体 (Difficulty)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Beginner */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Beginner - 初级</h3>
            <ScenarioCard
              title="咖啡店点单"
              description="学习基础的点单对话"
              image="https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400&q=80"
              duration="10 分钟"
              difficulty="beginner"
              rating={4.9}
            />
            <p className="mt-3 text-xs text-gray-600">• 标签背景：#10B981 (绿色)</p>
          </div>

          {/* Intermediate */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Intermediate - 中级</h3>
            <ScenarioCard
              title="酒店入住"
              description="掌握酒店入住的完整流程"
              image="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400&q=80"
              duration="15 分钟"
              difficulty="intermediate"
              rating={4.7}
            />
            <p className="mt-3 text-xs text-gray-600">• 标签背景：#F6B443 (黄色)</p>
          </div>

          {/* Advanced */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Advanced - 高级</h3>
            <ScenarioCard
              title="产品发布演讲"
              description="练习产品发布会演讲技巧"
              image="https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=400&q=80"
              duration="25 分钟"
              difficulty="advanced"
              rating={4.5}
            />
            <p className="mt-3 text-xs text-gray-600">• 标签背景：#FB7250 (红色)</p>
          </div>
        </div>
      </section>

      {/* State Variants */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">状态变体 (State)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Default */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Default - 正常状态</h3>
            <ScenarioCard
              title="餐厅点餐"
              description="掌握在餐厅点餐的完整流程"
              image="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80"
              duration="12 分钟"
              difficulty="beginner"
              rating={4.9}
              state="default"
            />
            <p className="mt-3 text-xs text-gray-600">• 边框：1px #E5E7EB</p>
          </div>

          {/* Hover */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Hover - 悬停状态</h3>
            <ScenarioCard
              title="医院就诊"
              description="学习描述症状和理解医生建议"
              image="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400&q=80"
              duration="18 分钟"
              difficulty="intermediate"
              rating={4.7}
              state="hover"
            />
            <p className="mt-3 text-xs text-gray-600">• 阴影高亮，轻微上移 (-4px)</p>
          </div>

          {/* Selected */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Selected - 选中状态</h3>
            <ScenarioCard
              title="购物对话"
              description="练习在商店购物的常用表达"
              image="https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&q=80"
              duration="14 分钟"
              difficulty="beginner"
              rating={4.8}
              progress={45}
              state="selected"
            />
            <p className="mt-3 text-xs text-gray-600">• 边框：2px Primary 色</p>
          </div>

          {/* Locked */}
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Locked - 锁定状态</h3>
            <ScenarioCard
              title="高级商务谈判"
              description="掌握商务谈判的高级技巧"
              image="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&q=80"
              duration="30 分钟"
              difficulty="advanced"
              rating={4.6}
              state="locked"
            />
            <p className="mt-3 text-xs text-gray-600">• 透明度 60%，锁图标覆盖层</p>
          </div>
        </div>
      </section>

      {/* Card Anatomy */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">卡片结构</h2>
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="space-y-3 text-sm text-gray-600">
            <p>• <strong>尺寸：</strong>320px 宽 × 自适应高度</p>
            <p>• <strong>圆角：</strong>20px (radius.lg)</p>
            <p>• <strong>图片区域：</strong>200px 高，包含封面图</p>
            <p>• <strong>图标区域：</strong>48px 圆形，Primary 色背景，左上角</p>
            <p>• <strong>难度标签：</strong>胶囊形状，右上角，根据难度显示不同颜色</p>
            <p>• <strong>标题：</strong>Text/H3 样式，最多显示 1 行</p>
            <p>• <strong>描述：</strong>Text/Small 样式，最多显示 2 行</p>
            <p>• <strong>元信息：</strong>时长和评分，带图标</p>
            <p>• <strong>进度条：</strong>4px 高度，Primary 色填充</p>
            <p>• <strong>操作按钮：</strong>全宽，Primary 色背景</p>
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
                <td className="px-6 py-4 text-sm font-mono text-purple-600">title</td>
                <td className="px-6 py-4 text-sm text-gray-600">string</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">场景标题</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">description</td>
                <td className="px-6 py-4 text-sm text-gray-600">string</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">场景描述</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">image</td>
                <td className="px-6 py-4 text-sm text-gray-600">string</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">封面图片 URL</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">difficulty</td>
                <td className="px-6 py-4 text-sm text-gray-600">"beginner" | "intermediate" | "advanced"</td>
                <td className="px-6 py-4 text-sm text-gray-600">"intermediate"</td>
                <td className="px-6 py-4 text-sm text-gray-600">难度等级</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">progress</td>
                <td className="px-6 py-4 text-sm text-gray-600">number</td>
                <td className="px-6 py-4 text-sm text-gray-600">0</td>
                <td className="px-6 py-4 text-sm text-gray-600">完成进度 (0-100)</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">state</td>
                <td className="px-6 py-4 text-sm text-gray-600">"default" | "hover" | "selected" | "locked"</td>
                <td className="px-6 py-4 text-sm text-gray-600">"default"</td>
                <td className="px-6 py-4 text-sm text-gray-600">卡片状态</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">onStart</td>
                <td className="px-6 py-4 text-sm text-gray-600">() =&gt; void</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">开始按钮点击回调</td>
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
            <code>{`import { ScenarioCard } from "./components/ScenarioCard";

function Scenarios() {
  return (
    <div className="grid grid-cols-3 gap-6">
      <ScenarioCard
        title="Coffee Shop Chat"
        description="学习如何在咖啡店点单"
        image="/images/coffee.jpg"
        duration="10 分钟"
        difficulty="beginner"
        rating={4.9}
        progress={75}
        state="selected"
        onStart={() => console.log("Starting")}
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