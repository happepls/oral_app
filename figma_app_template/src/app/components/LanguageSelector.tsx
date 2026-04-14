import { motion } from "motion/react";
import { Check } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface Language {
  id: string;
  name: string;
  nativeName: string;
  flag: string;
  category: string;
}

interface LanguageSelectorProps {
  title?: string;
  subtitle?: string;
  selectedLanguage?: string;
  defaultLanguage?: string;
  onChange?: (languageId: string) => void;
}

const languages: Language[] = [
  // 中文
  { id: "zh-cn", name: "简体中文", nativeName: "简体中文", flag: "🇨🇳", category: "中文" },
  { id: "zh-tw", name: "繁体中文", nativeName: "繁體中文", flag: "🇹🇼", category: "中文" },
  
  // 亚洲
  { id: "ja", name: "日语", nativeName: "日本語", flag: "🇯🇵", category: "亚洲" },
  { id: "ko", name: "韩语", nativeName: "한국어", flag: "🇰🇷", category: "亚洲" },
  { id: "vi", name: "越南语", nativeName: "Tiếng Việt", flag: "🇻🇳", category: "亚洲" },
  { id: "th", name: "泰语", nativeName: "ภาษาไทย", flag: "🇹🇭", category: "亚洲" },
  { id: "id", name: "印尼语", nativeName: "Bahasa Indonesia", flag: "🇮🇩", category: "亚洲" },
  { id: "ms", name: "马来语", nativeName: "Bahasa Melayu", flag: "🇲🇾", category: "亚洲" },
  { id: "hi", name: "印地语", nativeName: "हिन्दी", flag: "🇮🇳", category: "亚洲" },
  { id: "bn", name: "孟加拉语", nativeName: "বাংলা", flag: "🇧🇩", category: "亚洲" },
  { id: "ur", name: "乌尔都语", nativeName: "اردو", flag: "🇵🇰", category: "亚洲" },
  
  // 西欧
  { id: "en", name: "英语", nativeName: "English", flag: "🇺🇸", category: "西欧" },
  { id: "fr", name: "法语", nativeName: "Français", flag: "🇫🇷", category: "西欧" },
  { id: "de", name: "德语", nativeName: "Deutsch", flag: "🇩🇪", category: "西欧" },
  { id: "nl", name: "荷兰语", nativeName: "Nederlands", flag: "🇳🇱", category: "西欧" },
  { id: "sv", name: "瑞典语", nativeName: "Svenska", flag: "🇸🇪", category: "西欧" },
  { id: "no", name: "挪威语", nativeName: "Norsk", flag: "🇳🇴", category: "西欧" },
  { id: "da", name: "丹麦语", nativeName: "Dansk", flag: "🇩🇰", category: "西欧" },
  
  // 南欧
  { id: "es", name: "西班牙语", nativeName: "Español", flag: "🇪🇸", category: "南欧" },
  { id: "it", name: "意大利语", nativeName: "Italiano", flag: "🇮🇹", category: "南欧" },
  { id: "pt", name: "葡萄牙语", nativeName: "Português", flag: "🇵🇹", category: "南欧" },
  { id: "el", name: "希腊语", nativeName: "Ελληνικά", flag: "🇬🇷", category: "南欧" },
  
  // 东欧
  { id: "ru", name: "俄语", nativeName: "Русский", flag: "🇷🇺", category: "东欧" },
  { id: "pl", name: "波兰语", nativeName: "Polski", flag: "🇵🇱", category: "东欧" },
  { id: "ro", name: "罗马尼亚语", nativeName: "Română", flag: "🇷🇴", category: "东欧" },
  { id: "cs", name: "捷克语", nativeName: "Čeština", flag: "🇨🇿", category: "东欧" },
  { id: "hu", name: "匈牙利语", nativeName: "Magyar", flag: "🇭🇺", category: "东欧" },
  
  // 中东
  { id: "ar", name: "阿拉伯语", nativeName: "العربية", flag: "🇸🇦", category: "中东" },
  { id: "he", name: "希伯来语", nativeName: "עברית", flag: "🇮🇱", category: "中东" },
  { id: "fa", name: "波斯语", nativeName: "فارسی", flag: "🇮🇷", category: "中东" },
  { id: "tr", name: "土耳其语", nativeName: "Türkçe", flag: "🇹🇷", category: "中东" },
];

// Group languages by category
const categories = ["中文", "亚洲", "西欧", "南欧", "东欧", "中东"];

export function LanguageSelector({
  title = "选择学习语言",
  subtitle = "开始你的语言学习之旅",
  selectedLanguage = "en",
  defaultLanguage = "en",
  onChange,
}: LanguageSelectorProps) {
  const tokens = designTokens.global;
  const activeLanguage = selectedLanguage || defaultLanguage;

  return (
    <div className="w-full">
      <div className="mb-6">
        <h3 className="text-2xl font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </div>

      <div className="space-y-8">
        {categories.map((category) => {
          const categoryLanguages = languages.filter((lang) => lang.category === category);
          
          return (
            <div key={category}>
              <h4 className="text-sm font-medium text-gray-500 mb-3 px-2">{category}</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {categoryLanguages.map((language) => {
                  const isSelected = activeLanguage === language.id;
                  
                  return (
                    <motion.button
                      key={language.id}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onChange?.(language.id)}
                      className="relative p-4 rounded-xl border-2 transition-all text-left"
                      style={{
                        borderColor: isSelected ? tokens.color.primary.value : "#e5e7eb",
                        backgroundColor: isSelected ? `${tokens.color.primary.value}08` : "white",
                      }}
                    >
                      {/* Selection Indicator */}
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: tokens.color.primary.value }}
                        >
                          <Check className="w-3 h-3 text-white" />
                        </motion.div>
                      )}

                      {/* Flag */}
                      <div className="text-3xl mb-2">{language.flag}</div>

                      {/* Language Name */}
                      <h4 className="font-medium text-gray-900 text-sm mb-0.5">{language.name}</h4>
                      <p className="text-xs text-gray-500 truncate">{language.nativeName}</p>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}