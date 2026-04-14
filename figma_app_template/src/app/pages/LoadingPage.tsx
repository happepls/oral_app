import { Loading, Skeleton, SkeletonCard } from "../components/Loading";

export function LoadingPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">⏳ Loading</h1>
        <p className="text-gray-600">加载状态指示器组件</p>
      </div>

      {/* Loading Variants */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">加载动画变体</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Spinner */}
          <div className="bg-white rounded-lg p-12 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-6 text-center">Spinner - 旋转加载</h3>
            <Loading variant="spinner" size="md" text="加载中..." />
            <p className="mt-6 text-xs text-gray-600 text-center">• 3px 边框，Primary 色</p>
          </div>

          {/* Dots */}
          <div className="bg-white rounded-lg p-12 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-6 text-center">Dots - 跳动圆点</h3>
            <Loading variant="dots" size="md" text="加载中..." />
            <p className="mt-6 text-xs text-gray-600 text-center">• 三个圆点依次跳动</p>
          </div>

          {/* Pulse */}
          <div className="bg-white rounded-lg p-12 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-6 text-center">Pulse - 脉冲效果</h3>
            <Loading variant="pulse" size="md" text="加载中..." />
            <p className="mt-6 text-xs text-gray-600 text-center">• 缩放和透明度动画</p>
          </div>

          {/* Bars */}
          <div className="bg-white rounded-lg p-12 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-6 text-center">Bars - 音频条</h3>
            <Loading variant="bars" size="md" text="加载中..." />
            <p className="mt-6 text-xs text-gray-600 text-center">• 五个竖条波动效果</p>
          </div>
        </div>
      </section>

      {/* Sizes */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">尺寸变体 (Size)</h2>
        <div className="bg-white rounded-lg p-12 border border-gray-200">
          <div className="flex items-end justify-around">
            <div className="text-center space-y-4">
              <Loading variant="spinner" size="sm" />
              <p className="text-xs text-gray-500">Small (24px)</p>
            </div>
            <div className="text-center space-y-4">
              <Loading variant="spinner" size="md" />
              <p className="text-xs text-gray-500">Medium (48px)</p>
            </div>
            <div className="text-center space-y-4">
              <Loading variant="spinner" size="lg" />
              <p className="text-xs text-gray-500">Large (64px)</p>
            </div>
            <div className="text-center space-y-4">
              <Loading variant="spinner" size="xl" />
              <p className="text-xs text-gray-500">XLarge (80px)</p>
            </div>
          </div>
        </div>
      </section>

      {/* Skeleton Components */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">骨架屏组件 (Skeleton)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Text Skeleton */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Text - 文本占位</h3>
            <div className="space-y-3">
              <Skeleton variant="text" height="16px" width="100%" />
              <Skeleton variant="text" height="16px" width="90%" />
              <Skeleton variant="text" height="16px" width="80%" />
            </div>
            <p className="mt-4 text-xs text-gray-600">• 高度：16px<br />• 圆角：4px</p>
          </div>

          {/* Circular Skeleton */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Circular - 圆形占位</h3>
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width="48px" height="48px" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" height="14px" width="60%" />
                <Skeleton variant="text" height="12px" width="40%" />
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-600">• 用于头像占位<br />• 50% 圆角</p>
          </div>

          {/* Rectangular Skeleton */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Rectangular - 矩形占位</h3>
            <Skeleton variant="rectangular" height="100px" width="100%" />
            <div className="mt-3 space-y-2">
              <Skeleton variant="text" height="14px" width="80%" />
              <Skeleton variant="text" height="12px" width="60%" />
            </div>
            <p className="mt-4 text-xs text-gray-600">• 用于图片、卡片占位<br />• 4px 圆角</p>
          </div>
        </div>
      </section>

      {/* Skeleton Card */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">骨架卡片 (SkeletonCard)</h2>
        <div className="bg-gray-50 rounded-lg p-8">
          <div className="flex justify-center">
            <SkeletonCard />
          </div>
        </div>
        <div className="mt-4 bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">组件结构</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• <strong>图片占位：</strong>200px 高，矩形骨架屏</p>
            <p>• <strong>标题占位：</strong>20px 高，80% 宽度</p>
            <p>• <strong>描述占位：</strong>两行文本骨架屏</p>
            <p>• <strong>元信息占位：</strong>时长和评分骨架屏</p>
            <p>• <strong>按钮占位：</strong>36px 高，全宽矩形</p>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">使用场景</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">页面加载 - Spinner</h3>
            <div className="bg-gray-50 rounded-lg p-8 flex items-center justify-center min-h-[200px]">
              <Loading variant="spinner" size="lg" text="正在加载页面..." />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">数据加载 - Dots</h3>
            <div className="bg-gray-50 rounded-lg p-8 flex items-center justify-center min-h-[200px]">
              <Loading variant="dots" size="md" text="正在加载数据..." />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">语音处理 - Bars</h3>
            <div className="bg-gray-50 rounded-lg p-8 flex items-center justify-center min-h-[200px]">
              <Loading variant="bars" size="md" text="正在处理语音..." />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">内容占位 - Skeleton</h3>
            <div className="bg-gray-50 rounded-lg p-8 min-h-[200px]">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton variant="circular" width="40px" height="40px" />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" height="16px" width="60%" />
                    <Skeleton variant="text" height="14px" width="40%" />
                  </div>
                </div>
                <Skeleton variant="rectangular" height="120px" width="100%" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Props Documentation */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">组件属性 (Props)</h2>
        
        {/* Loading Props */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Loading 组件</h3>
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
                  <td className="px-6 py-4 text-sm font-mono text-purple-600">variant</td>
                  <td className="px-6 py-4 text-sm text-gray-600">"spinner" | "dots" | "pulse" | "bars"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">"spinner"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">加载动画类型</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-mono text-purple-600">size</td>
                  <td className="px-6 py-4 text-sm text-gray-600">"sm" | "md" | "lg" | "xl"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">"md"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">尺寸大小</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-mono text-purple-600">text</td>
                  <td className="px-6 py-4 text-sm text-gray-600">string</td>
                  <td className="px-6 py-4 text-sm text-gray-600">-</td>
                  <td className="px-6 py-4 text-sm text-gray-600">提示文本</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Skeleton Props */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Skeleton 组件</h3>
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
                  <td className="px-6 py-4 text-sm font-mono text-purple-600">variant</td>
                  <td className="px-6 py-4 text-sm text-gray-600">"text" | "circular" | "rectangular"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">"text"</td>
                  <td className="px-6 py-4 text-sm text-gray-600">骨架屏类型</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-mono text-purple-600">width</td>
                  <td className="px-6 py-4 text-sm text-gray-600">number | string</td>
                  <td className="px-6 py-4 text-sm text-gray-600">-</td>
                  <td className="px-6 py-4 text-sm text-gray-600">宽度</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm font-mono text-purple-600">height</td>
                  <td className="px-6 py-4 text-sm text-gray-600">number | string</td>
                  <td className="px-6 py-4 text-sm text-gray-600">-</td>
                  <td className="px-6 py-4 text-sm text-gray-600">高度</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Usage Code */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">使用示例</h2>
        <div className="bg-gray-900 rounded-lg p-6 overflow-x-auto">
          <pre className="text-sm text-gray-100">
            <code>{`import { Loading, Skeleton, SkeletonCard } from "./components/Loading";

// Loading spinner
<Loading variant="spinner" size="lg" text="加载中..." />

// Skeleton text
<Skeleton variant="text" height="16px" width="80%" />

// Skeleton card
<SkeletonCard />

// Custom skeleton layout
<div className="space-y-4">
  <div className="flex items-center gap-3">
    <Skeleton variant="circular" width="48px" height="48px" />
    <div className="flex-1 space-y-2">
      <Skeleton variant="text" height="16px" width="60%" />
      <Skeleton variant="text" height="14px" width="40%" />
    </div>
  </div>
  <Skeleton variant="rectangular" height="200px" />
</div>`}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}