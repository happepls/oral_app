import { VoiceRecorder } from "../components/VoiceRecorder";

export function VoiceRecorderPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">🎙️ VoiceRecorder</h1>
        <p className="text-gray-600">语音录音控件组件</p>
      </div>

      {/* Live Example */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">实时示例</h2>
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-12">
          <VoiceRecorder />
        </div>
      </section>

      {/* State Variants */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">状态变体 (State)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Idle */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 text-center">Idle - 待录音</h3>
            <div className="bg-gray-50 p-8 rounded-lg">
              <VoiceRecorder state="idle" />
            </div>
            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <p>• 圆形按钮：80px</p>
              <p>• 背景：Primary 色</p>
              <p>• 图标：麦克风</p>
            </div>
          </div>

          {/* Recording */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 text-center">Recording - 录音中</h3>
            <div className="bg-gray-50 p-8 rounded-lg">
              <VoiceRecorder state="recording" />
            </div>
            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <p>• 脉冲环：120px，动画效果</p>
              <p>• 显示计时器</p>
              <p>• 波形可视化</p>
              <p>• 进度条</p>
            </div>
          </div>

          {/* Processing */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 text-center">Processing - 处理中</h3>
            <div className="bg-gray-50 p-8 rounded-lg">
              <VoiceRecorder state="processing" />
            </div>
            <div className="mt-4 text-sm text-gray-600 space-y-1">
              <p>• 旋转加载图标</p>
              <p>• 背景：Primary Light</p>
              <p>• 提示文字："处理中..."</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">功能特性</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🎤</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">实时录音</h3>
            <p className="text-sm text-gray-600">点击麦克风按钮开始录制语音，支持实时音频捕获</p>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">波形可视化</h3>
            <p className="text-sm text-gray-600">录音时显示动态波形，直观展示音频输入状态</p>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <span className="text-2xl">⏱️</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">计时器显示</h3>
            <p className="text-sm text-gray-600">实时显示录音时长，支持最大时长限制</p>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🔄</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">处理反馈</h3>
            <p className="text-sm text-gray-600">录音完成后显示处理状态，旋转加载动画</p>
          </div>
        </div>
      </section>

      {/* States */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">状态流程</h2>
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <h3 className="font-semibold text-gray-900">Idle（待录音）</h3>
            </div>
            <p className="text-sm text-gray-600 ml-7">初始状态，显示蓝色麦克风按钮，等待用户点击</p>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <h3 className="font-semibold text-gray-900">Recording（录音中）</h3>
            </div>
            <p className="text-sm text-gray-600 ml-7">正在录音，显示红色停止按钮、脉冲环、计时器、波形和进度条</p>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <h3 className="font-semibold text-gray-900">Processing（处理中）</h3>
            </div>
            <p className="text-sm text-gray-600 ml-7">录音完成，正在处理音频，显示旋转加载图标</p>
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
                <td className="px-6 py-4 text-sm font-mono text-purple-600">onRecordingComplete</td>
                <td className="px-6 py-4 text-sm text-gray-600">(blob: Blob) =&gt; void</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">录音完成回调</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">maxDuration</td>
                <td className="px-6 py-4 text-sm text-gray-600">number</td>
                <td className="px-6 py-4 text-sm text-gray-600">300</td>
                <td className="px-6 py-4 text-sm text-gray-600">最大录音时长（秒）</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-mono text-purple-600">state</td>
                <td className="px-6 py-4 text-sm text-gray-600">"idle" | "recording" | "processing"</td>
                <td className="px-6 py-4 text-sm text-gray-600">-</td>
                <td className="px-6 py-4 text-sm text-gray-600">控制状态（可选）</td>
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
            <code>{`import { VoiceRecorder } from "./components/VoiceRecorder";

function App() {
  const handleRecordingComplete = (audioBlob: Blob) => {
    console.log("Recording completed:", audioBlob);
    // Send audio to server or process it
  };

  return (
    <VoiceRecorder
      onRecordingComplete={handleRecordingComplete}
      maxDuration={180}
    />
  );
}`}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}