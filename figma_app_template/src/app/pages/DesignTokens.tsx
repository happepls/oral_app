import designTokens from "../../imports/design-tokens.json";

export function DesignTokens() {
  const tokens = designTokens.global;

  const colors = [
    {
      name: "Primary",
      value: tokens.color.primary.value,
      usage: "主要操作按钮、链接、品牌色",
      variants: [
        { name: "Light", value: tokens.color["primary-light"].value },
        { name: "Default", value: tokens.color.primary.value },
        { name: "Dark", value: tokens.color["primary-dark"].value },
      ],
    },
    {
      name: "Secondary",
      value: tokens.color.secondary.value,
      usage: "次要操作、辅助色、紫色强调",
      variants: [],
    },
    {
      name: "Success",
      value: tokens.color.success.value,
      usage: "成功状态、确认提示、正向反馈",
      variants: [],
    },
    {
      name: "Warning",
      value: tokens.color.warning.value,
      usage: "警告提示、需要注意的信息",
      variants: [],
    },
    {
      name: "Error",
      value: tokens.color.error.value,
      usage: "错误状态、危险操作、删除按钮",
      variants: [],
    },
  ];

  const shadows = [
    {
      name: "Default",
      value: `0 ${tokens.shadow.y.value} ${tokens.shadow.blur.value} rgba(${tokens.shadow.color.value}, ${tokens.shadow.opacity.value})`,
      description: "基础阴影效果，用于卡片和悬浮元素",
    },
    {
      name: "Small",
      value: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      description: "轻微阴影，用于细微的层次感",
    },
    {
      name: "Medium",
      value: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      description: "中等阴影，用于按钮和输入框",
    },
    {
      name: "Large",
      value: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
      description: "较大阴影，用于模态框和弹出层",
    },
  ];

  const borderRadius = [
    { name: "Small", value: tokens.radius.sm.value, usage: "小按钮、标签" },
    { name: "Medium", value: tokens.radius.md.value, usage: "输入框、卡片" },
    { name: "Large", value: tokens.radius.lg.value, usage: "大卡片、容器" },
    { name: "XLarge", value: tokens.radius.xl.value, usage: "特大容器、模态框" },
  ];

  const typography = [
    { name: "Display", size: "48px", weight: "700", usage: "页面标题、品牌标题" },
    { name: "Heading 1", size: "36px", weight: "600", usage: "主标题、章节标题" },
    { name: "Heading 2", size: "30px", weight: "600", usage: "次标题、小节标题" },
    { name: "Heading 3", size: "24px", weight: "500", usage: "小标题、卡片标题" },
    { name: "Body Large", size: "18px", weight: "400", usage: "重要正文、引言" },
    { name: "Body", size: "16px", weight: "400", usage: "默认正文、段落文字" },
    { name: "Body Small", size: "14px", weight: "400", usage: "辅助文字、说明文字" },
    { name: "Caption", size: "12px", weight: "400", usage: "标签、时间戳、小字" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">🎨 Design Tokens</h1>
        <p className="text-gray-600">Oral AI 设计系统的基础设计令牌</p>
      </div>

      {/* Colors */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">颜色 (Colors)</h2>
        <div className="space-y-6">
          {colors.map((color) => (
            <div key={color.name} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6">
                <div className="flex items-start gap-6">
                  {/* Main Color */}
                  <div className="flex-shrink-0">
                    <div
                      className="w-24 h-24 rounded-lg shadow-md"
                      style={{ backgroundColor: color.value }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{color.name}</h3>
                    <p className="text-sm text-gray-500 font-mono mb-2">{color.value.toUpperCase()}</p>
                    <p className="text-sm text-gray-600">{color.usage}</p>

                    {/* Variants */}
                    {color.variants && color.variants.length > 0 && (
                      <div className="mt-4 flex items-center gap-2">
                        {color.variants.map((variant) => (
                          <div key={variant.name} className="text-center">
                            <div
                              className="w-12 h-12 rounded-lg border border-gray-200"
                              style={{ backgroundColor: variant.value }}
                            />
                            <p className="text-xs text-gray-500 mt-1">{variant.name}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">字体 (Typography)</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-200">
          {typography.map((type) => (
            <div key={type.name} className="p-6">
              <div className="flex items-baseline justify-between mb-3">
                <span style={{ fontSize: type.size, fontWeight: type.weight, lineHeight: 1 }}>
                  Aa 字体
                </span>
                <div className="text-right text-sm">
                  <p className="font-semibold text-gray-900">{type.name}</p>
                  <p className="text-gray-500 font-mono">{type.size} / {type.weight}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600">{type.usage}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Shadows */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">阴影 (Shadows)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {shadows.map((shadow) => (
            <div key={shadow.name} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-center mb-4 min-h-[120px]">
                <div
                  className="w-24 h-24 rounded-xl"
                  style={{
                    backgroundColor: tokens.color.primary.value,
                    boxShadow: shadow.value,
                  }}
                />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{shadow.name}</h3>
              <p className="text-xs text-gray-500 font-mono mb-2 break-all">{shadow.value}</p>
              <p className="text-sm text-gray-600">{shadow.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Border Radius */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">圆角 (Border Radius)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {borderRadius.map((radius) => (
            <div key={radius.name} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-center mb-4 min-h-[100px]">
                <div
                  className="w-20 h-20"
                  style={{
                    backgroundColor: tokens.color["primary-light"].value,
                    borderRadius: radius.value,
                  }}
                />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{radius.name}</h3>
              <p className="text-sm text-gray-500 font-mono mb-2">{radius.value}</p>
              <p className="text-xs text-gray-600">{radius.usage}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Spacing */}
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">间距 (Spacing)</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="space-y-4">
            {[4, 8, 12, 16, 24, 32, 48, 64].map((space) => (
              <div key={space} className="flex items-center gap-4">
                <div className="w-16 text-sm text-gray-600 font-mono">{space}px</div>
                <div
                  className="h-8 rounded"
                  style={{
                    width: `${space}px`,
                    backgroundColor: tokens.color.primary.value,
                  }}
                />
                <div className="text-xs text-gray-500">{space / 4}rem</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}