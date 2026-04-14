import { motion } from "motion/react";
import { Check } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface InterestArea {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

interface InterestAreaSelectorProps {
  title?: string;
  subtitle?: string;
  selectedAreas?: string[];
  defaultInterests?: string[];
  maxSelection?: number;
  onChange?: (areaIds: string[]) => void;
}

const interestAreas: InterestArea[] = [
  { id: "travel", name: "旅行交流", description: "机场、酒店、餐厅等场景", emoji: "✈️" },
  { id: "business", name: "商务职场", description: "会议、面试、谈判技巧", emoji: "💼" },
  { id: "daily", name: "日常对话", description: "购物、问路、闲聊", emoji: "☕" },
  { id: "academic", name: "学术讨论", description: "演讲、辩论、写作", emoji: "📚" },
  { id: "social", name: "社交场合", description: "聚会、约会、交友", emoji: "🎉" },
  { id: "medical", name: "医疗就诊", description: "看病、问诊、买药", emoji: "🏥" },
];

export function InterestAreaSelector({
  title = "兴趣领域",
  subtitle = "选择你想重点练习的场景（可多选）",
  selectedAreas = [],
  defaultInterests = [],
  maxSelection = 3,
  onChange,
}: InterestAreaSelectorProps) {
  const tokens = designTokens.global;
  const activeAreas = selectedAreas.length > 0 ? selectedAreas : defaultInterests;

  const handleToggle = (areaId: string) => {
    if (activeAreas.includes(areaId)) {
      // Remove if already selected
      onChange?.(activeAreas.filter((id) => id !== areaId));
    } else {
      // Add if not at max capacity
      if (activeAreas.length < maxSelection) {
        onChange?.([...activeAreas, areaId]);
      }
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>
          <div className="text-sm text-gray-500">
            已选 <span className="font-semibold" style={{ color: tokens.color.primary.value }}>
              {activeAreas.length}
            </span> / {maxSelection}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {interestAreas.map((area) => {
          const isSelected = activeAreas.includes(area.id);
          const isDisabled = !isSelected && activeAreas.length >= maxSelection;
          
          return (
            <motion.button
              key={area.id}
              whileHover={!isDisabled ? { scale: 1.02, y: -2 } : {}}
              whileTap={!isDisabled ? { scale: 0.98 } : {}}
              onClick={() => !isDisabled && handleToggle(area.id)}
              disabled={isDisabled}
              className="relative p-6 rounded-2xl border-2 transition-all text-left"
              style={{
                borderColor: isSelected ? tokens.color.primary.value : "#e5e7eb",
                backgroundColor: isSelected ? `${tokens.color.primary.value}08` : "white",
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
              }}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: tokens.color.primary.value }}
                >
                  <Check className="w-4 h-4 text-white" />
                </motion.div>
              )}

              {/* Emoji */}
              <div className="text-4xl mb-3">{area.emoji}</div>

              {/* Area Info */}
              <h4 className="font-semibold text-gray-900 mb-1">{area.name}</h4>
              <p className="text-sm text-gray-500 leading-relaxed">{area.description}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}