import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * 国家区号下拉。全量 ISO 国家拨号码列表 —— 任何国家的用户都能选到自己的区号登录。
 * 「分离式」设计：本组件只承载国家区号（如 +86），手机号输入框只填本国号码。
 * 提交时由父组件拼接成 E.164（dialCode + localNumber）。
 *
 * 含搜索框：按国家名（本地化 / 英文）或区号即时过滤，便于在长列表中快速定位。
 * 国家名按当前 UI 语言本地化（i18n key: country_<iso2>），无 key 时回退英文名。
 */
export const COUNTRIES = [
  { iso2: 'AF', dial: '+93', flag: '🇦🇫', en: 'Afghanistan' },
  { iso2: 'AL', dial: '+355', flag: '🇦🇱', en: 'Albania' },
  { iso2: 'DZ', dial: '+213', flag: '🇩🇿', en: 'Algeria' },
  { iso2: 'AD', dial: '+376', flag: '🇦🇩', en: 'Andorra' },
  { iso2: 'AO', dial: '+244', flag: '🇦🇴', en: 'Angola' },
  { iso2: 'AR', dial: '+54', flag: '🇦🇷', en: 'Argentina' },
  { iso2: 'AM', dial: '+374', flag: '🇦🇲', en: 'Armenia' },
  { iso2: 'AU', dial: '+61', flag: '🇦🇺', en: 'Australia' },
  { iso2: 'AT', dial: '+43', flag: '🇦🇹', en: 'Austria' },
  { iso2: 'AZ', dial: '+994', flag: '🇦🇿', en: 'Azerbaijan' },
  { iso2: 'BH', dial: '+973', flag: '🇧🇭', en: 'Bahrain' },
  { iso2: 'BD', dial: '+880', flag: '🇧🇩', en: 'Bangladesh' },
  { iso2: 'BY', dial: '+375', flag: '🇧🇾', en: 'Belarus' },
  { iso2: 'BE', dial: '+32', flag: '🇧🇪', en: 'Belgium' },
  { iso2: 'BZ', dial: '+501', flag: '🇧🇿', en: 'Belize' },
  { iso2: 'BJ', dial: '+229', flag: '🇧🇯', en: 'Benin' },
  { iso2: 'BT', dial: '+975', flag: '🇧🇹', en: 'Bhutan' },
  { iso2: 'BO', dial: '+591', flag: '🇧🇴', en: 'Bolivia' },
  { iso2: 'BA', dial: '+387', flag: '🇧🇦', en: 'Bosnia and Herzegovina' },
  { iso2: 'BW', dial: '+267', flag: '🇧🇼', en: 'Botswana' },
  { iso2: 'BR', dial: '+55', flag: '🇧🇷', en: 'Brazil' },
  { iso2: 'BN', dial: '+673', flag: '🇧🇳', en: 'Brunei' },
  { iso2: 'BG', dial: '+359', flag: '🇧🇬', en: 'Bulgaria' },
  { iso2: 'BF', dial: '+226', flag: '🇧🇫', en: 'Burkina Faso' },
  { iso2: 'BI', dial: '+257', flag: '🇧🇮', en: 'Burundi' },
  { iso2: 'KH', dial: '+855', flag: '🇰🇭', en: 'Cambodia' },
  { iso2: 'CM', dial: '+237', flag: '🇨🇲', en: 'Cameroon' },
  { iso2: 'CA', dial: '+1', flag: '🇨🇦', en: 'Canada' },
  { iso2: 'CV', dial: '+238', flag: '🇨🇻', en: 'Cape Verde' },
  { iso2: 'CF', dial: '+236', flag: '🇨🇫', en: 'Central African Republic' },
  { iso2: 'TD', dial: '+235', flag: '🇹🇩', en: 'Chad' },
  { iso2: 'CL', dial: '+56', flag: '🇨🇱', en: 'Chile' },
  { iso2: 'CN', dial: '+86', flag: '🇨🇳', en: 'China' },
  { iso2: 'CO', dial: '+57', flag: '🇨🇴', en: 'Colombia' },
  { iso2: 'KM', dial: '+269', flag: '🇰🇲', en: 'Comoros' },
  { iso2: 'CG', dial: '+242', flag: '🇨🇬', en: 'Congo' },
  { iso2: 'CD', dial: '+243', flag: '🇨🇩', en: 'Congo (DRC)' },
  { iso2: 'CR', dial: '+506', flag: '🇨🇷', en: 'Costa Rica' },
  { iso2: 'CI', dial: '+225', flag: '🇨🇮', en: "Côte d'Ivoire" },
  { iso2: 'HR', dial: '+385', flag: '🇭🇷', en: 'Croatia' },
  { iso2: 'CU', dial: '+53', flag: '🇨🇺', en: 'Cuba' },
  { iso2: 'CY', dial: '+357', flag: '🇨🇾', en: 'Cyprus' },
  { iso2: 'CZ', dial: '+420', flag: '🇨🇿', en: 'Czechia' },
  { iso2: 'DK', dial: '+45', flag: '🇩🇰', en: 'Denmark' },
  { iso2: 'DJ', dial: '+253', flag: '🇩🇯', en: 'Djibouti' },
  { iso2: 'DO', dial: '+1', flag: '🇩🇴', en: 'Dominican Republic' },
  { iso2: 'EC', dial: '+593', flag: '🇪🇨', en: 'Ecuador' },
  { iso2: 'EG', dial: '+20', flag: '🇪🇬', en: 'Egypt' },
  { iso2: 'SV', dial: '+503', flag: '🇸🇻', en: 'El Salvador' },
  { iso2: 'GQ', dial: '+240', flag: '🇬🇶', en: 'Equatorial Guinea' },
  { iso2: 'ER', dial: '+291', flag: '🇪🇷', en: 'Eritrea' },
  { iso2: 'EE', dial: '+372', flag: '🇪🇪', en: 'Estonia' },
  { iso2: 'ET', dial: '+251', flag: '🇪🇹', en: 'Ethiopia' },
  { iso2: 'FJ', dial: '+679', flag: '🇫🇯', en: 'Fiji' },
  { iso2: 'FI', dial: '+358', flag: '🇫🇮', en: 'Finland' },
  { iso2: 'FR', dial: '+33', flag: '🇫🇷', en: 'France' },
  { iso2: 'GA', dial: '+241', flag: '🇬🇦', en: 'Gabon' },
  { iso2: 'GM', dial: '+220', flag: '🇬🇲', en: 'Gambia' },
  { iso2: 'GE', dial: '+995', flag: '🇬🇪', en: 'Georgia' },
  { iso2: 'DE', dial: '+49', flag: '🇩🇪', en: 'Germany' },
  { iso2: 'GH', dial: '+233', flag: '🇬🇭', en: 'Ghana' },
  { iso2: 'GR', dial: '+30', flag: '🇬🇷', en: 'Greece' },
  { iso2: 'GT', dial: '+502', flag: '🇬🇹', en: 'Guatemala' },
  { iso2: 'GN', dial: '+224', flag: '🇬🇳', en: 'Guinea' },
  { iso2: 'GY', dial: '+592', flag: '🇬🇾', en: 'Guyana' },
  { iso2: 'HT', dial: '+509', flag: '🇭🇹', en: 'Haiti' },
  { iso2: 'HN', dial: '+504', flag: '🇭🇳', en: 'Honduras' },
  { iso2: 'HK', dial: '+852', flag: '🇭🇰', en: 'Hong Kong' },
  { iso2: 'HU', dial: '+36', flag: '🇭🇺', en: 'Hungary' },
  { iso2: 'IS', dial: '+354', flag: '🇮🇸', en: 'Iceland' },
  { iso2: 'IN', dial: '+91', flag: '🇮🇳', en: 'India' },
  { iso2: 'ID', dial: '+62', flag: '🇮🇩', en: 'Indonesia' },
  { iso2: 'IR', dial: '+98', flag: '🇮🇷', en: 'Iran' },
  { iso2: 'IQ', dial: '+964', flag: '🇮🇶', en: 'Iraq' },
  { iso2: 'IE', dial: '+353', flag: '🇮🇪', en: 'Ireland' },
  { iso2: 'IL', dial: '+972', flag: '🇮🇱', en: 'Israel' },
  { iso2: 'IT', dial: '+39', flag: '🇮🇹', en: 'Italy' },
  { iso2: 'JM', dial: '+1', flag: '🇯🇲', en: 'Jamaica' },
  { iso2: 'JP', dial: '+81', flag: '🇯🇵', en: 'Japan' },
  { iso2: 'JO', dial: '+962', flag: '🇯🇴', en: 'Jordan' },
  { iso2: 'KZ', dial: '+7', flag: '🇰🇿', en: 'Kazakhstan' },
  { iso2: 'KE', dial: '+254', flag: '🇰🇪', en: 'Kenya' },
  { iso2: 'KW', dial: '+965', flag: '🇰🇼', en: 'Kuwait' },
  { iso2: 'KG', dial: '+996', flag: '🇰🇬', en: 'Kyrgyzstan' },
  { iso2: 'LA', dial: '+856', flag: '🇱🇦', en: 'Laos' },
  { iso2: 'LV', dial: '+371', flag: '🇱🇻', en: 'Latvia' },
  { iso2: 'LB', dial: '+961', flag: '🇱🇧', en: 'Lebanon' },
  { iso2: 'LS', dial: '+266', flag: '🇱🇸', en: 'Lesotho' },
  { iso2: 'LR', dial: '+231', flag: '🇱🇷', en: 'Liberia' },
  { iso2: 'LY', dial: '+218', flag: '🇱🇾', en: 'Libya' },
  { iso2: 'LI', dial: '+423', flag: '🇱🇮', en: 'Liechtenstein' },
  { iso2: 'LT', dial: '+370', flag: '🇱🇹', en: 'Lithuania' },
  { iso2: 'LU', dial: '+352', flag: '🇱🇺', en: 'Luxembourg' },
  { iso2: 'MO', dial: '+853', flag: '🇲🇴', en: 'Macau' },
  { iso2: 'MG', dial: '+261', flag: '🇲🇬', en: 'Madagascar' },
  { iso2: 'MW', dial: '+265', flag: '🇲🇼', en: 'Malawi' },
  { iso2: 'MY', dial: '+60', flag: '🇲🇾', en: 'Malaysia' },
  { iso2: 'MV', dial: '+960', flag: '🇲🇻', en: 'Maldives' },
  { iso2: 'ML', dial: '+223', flag: '🇲🇱', en: 'Mali' },
  { iso2: 'MT', dial: '+356', flag: '🇲🇹', en: 'Malta' },
  { iso2: 'MR', dial: '+222', flag: '🇲🇷', en: 'Mauritania' },
  { iso2: 'MU', dial: '+230', flag: '🇲🇺', en: 'Mauritius' },
  { iso2: 'MX', dial: '+52', flag: '🇲🇽', en: 'Mexico' },
  { iso2: 'MD', dial: '+373', flag: '🇲🇩', en: 'Moldova' },
  { iso2: 'MC', dial: '+377', flag: '🇲🇨', en: 'Monaco' },
  { iso2: 'MN', dial: '+976', flag: '🇲🇳', en: 'Mongolia' },
  { iso2: 'ME', dial: '+382', flag: '🇲🇪', en: 'Montenegro' },
  { iso2: 'MA', dial: '+212', flag: '🇲🇦', en: 'Morocco' },
  { iso2: 'MZ', dial: '+258', flag: '🇲🇿', en: 'Mozambique' },
  { iso2: 'MM', dial: '+95', flag: '🇲🇲', en: 'Myanmar' },
  { iso2: 'NA', dial: '+264', flag: '🇳🇦', en: 'Namibia' },
  { iso2: 'NP', dial: '+977', flag: '🇳🇵', en: 'Nepal' },
  { iso2: 'NL', dial: '+31', flag: '🇳🇱', en: 'Netherlands' },
  { iso2: 'NZ', dial: '+64', flag: '🇳🇿', en: 'New Zealand' },
  { iso2: 'NI', dial: '+505', flag: '🇳🇮', en: 'Nicaragua' },
  { iso2: 'NE', dial: '+227', flag: '🇳🇪', en: 'Niger' },
  { iso2: 'NG', dial: '+234', flag: '🇳🇬', en: 'Nigeria' },
  { iso2: 'KP', dial: '+850', flag: '🇰🇵', en: 'North Korea' },
  { iso2: 'MK', dial: '+389', flag: '🇲🇰', en: 'North Macedonia' },
  { iso2: 'NO', dial: '+47', flag: '🇳🇴', en: 'Norway' },
  { iso2: 'OM', dial: '+968', flag: '🇴🇲', en: 'Oman' },
  { iso2: 'PK', dial: '+92', flag: '🇵🇰', en: 'Pakistan' },
  { iso2: 'PS', dial: '+970', flag: '🇵🇸', en: 'Palestine' },
  { iso2: 'PA', dial: '+507', flag: '🇵🇦', en: 'Panama' },
  { iso2: 'PG', dial: '+675', flag: '🇵🇬', en: 'Papua New Guinea' },
  { iso2: 'PY', dial: '+595', flag: '🇵🇾', en: 'Paraguay' },
  { iso2: 'PE', dial: '+51', flag: '🇵🇪', en: 'Peru' },
  { iso2: 'PH', dial: '+63', flag: '🇵🇭', en: 'Philippines' },
  { iso2: 'PL', dial: '+48', flag: '🇵🇱', en: 'Poland' },
  { iso2: 'PT', dial: '+351', flag: '🇵🇹', en: 'Portugal' },
  { iso2: 'QA', dial: '+974', flag: '🇶🇦', en: 'Qatar' },
  { iso2: 'RO', dial: '+40', flag: '🇷🇴', en: 'Romania' },
  { iso2: 'RU', dial: '+7', flag: '🇷🇺', en: 'Russia' },
  { iso2: 'RW', dial: '+250', flag: '🇷🇼', en: 'Rwanda' },
  { iso2: 'SA', dial: '+966', flag: '🇸🇦', en: 'Saudi Arabia' },
  { iso2: 'SN', dial: '+221', flag: '🇸🇳', en: 'Senegal' },
  { iso2: 'RS', dial: '+381', flag: '🇷🇸', en: 'Serbia' },
  { iso2: 'SC', dial: '+248', flag: '🇸🇨', en: 'Seychelles' },
  { iso2: 'SL', dial: '+232', flag: '🇸🇱', en: 'Sierra Leone' },
  { iso2: 'SG', dial: '+65', flag: '🇸🇬', en: 'Singapore' },
  { iso2: 'SK', dial: '+421', flag: '🇸🇰', en: 'Slovakia' },
  { iso2: 'SI', dial: '+386', flag: '🇸🇮', en: 'Slovenia' },
  { iso2: 'SO', dial: '+252', flag: '🇸🇴', en: 'Somalia' },
  { iso2: 'ZA', dial: '+27', flag: '🇿🇦', en: 'South Africa' },
  { iso2: 'KR', dial: '+82', flag: '🇰🇷', en: 'South Korea' },
  { iso2: 'SS', dial: '+211', flag: '🇸🇸', en: 'South Sudan' },
  { iso2: 'ES', dial: '+34', flag: '🇪🇸', en: 'Spain' },
  { iso2: 'LK', dial: '+94', flag: '🇱🇰', en: 'Sri Lanka' },
  { iso2: 'SD', dial: '+249', flag: '🇸🇩', en: 'Sudan' },
  { iso2: 'SE', dial: '+46', flag: '🇸🇪', en: 'Sweden' },
  { iso2: 'CH', dial: '+41', flag: '🇨🇭', en: 'Switzerland' },
  { iso2: 'SY', dial: '+963', flag: '🇸🇾', en: 'Syria' },
  { iso2: 'TW', dial: '+886', flag: '🇹🇼', en: 'Taiwan' },
  { iso2: 'TJ', dial: '+992', flag: '🇹🇯', en: 'Tajikistan' },
  { iso2: 'TZ', dial: '+255', flag: '🇹🇿', en: 'Tanzania' },
  { iso2: 'TH', dial: '+66', flag: '🇹🇭', en: 'Thailand' },
  { iso2: 'TG', dial: '+228', flag: '🇹🇬', en: 'Togo' },
  { iso2: 'TT', dial: '+1', flag: '🇹🇹', en: 'Trinidad and Tobago' },
  { iso2: 'TN', dial: '+216', flag: '🇹🇳', en: 'Tunisia' },
  { iso2: 'TR', dial: '+90', flag: '🇹🇷', en: 'Turkey' },
  { iso2: 'TM', dial: '+993', flag: '🇹🇲', en: 'Turkmenistan' },
  { iso2: 'UG', dial: '+256', flag: '🇺🇬', en: 'Uganda' },
  { iso2: 'UA', dial: '+380', flag: '🇺🇦', en: 'Ukraine' },
  { iso2: 'AE', dial: '+971', flag: '🇦🇪', en: 'United Arab Emirates' },
  { iso2: 'GB', dial: '+44', flag: '🇬🇧', en: 'United Kingdom' },
  { iso2: 'US', dial: '+1', flag: '🇺🇸', en: 'United States' },
  { iso2: 'UY', dial: '+598', flag: '🇺🇾', en: 'Uruguay' },
  { iso2: 'UZ', dial: '+998', flag: '🇺🇿', en: 'Uzbekistan' },
  { iso2: 'VE', dial: '+58', flag: '🇻🇪', en: 'Venezuela' },
  { iso2: 'VN', dial: '+84', flag: '🇻🇳', en: 'Vietnam' },
  { iso2: 'YE', dial: '+967', flag: '🇾🇪', en: 'Yemen' },
  { iso2: 'ZM', dial: '+260', flag: '🇿🇲', en: 'Zambia' },
  { iso2: 'ZW', dial: '+263', flag: '🇿🇼', en: 'Zimbabwe' },
];

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.iso2 === 'CN') || COUNTRIES[0];

function CountryCodeSelect({ value, onChange, disabled, t }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);

  const current = COUNTRIES.find((c) => c.iso2 === value) || DEFAULT_COUNTRY;

  const label = (c) => {
    const key = `country_${c.iso2.toLowerCase()}`;
    return t && t(key) !== key ? t(key) : c.en;
  };

  // 过滤：按本地化名 / 英文名 / 区号匹配
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) =>
      label(c).toLowerCase().includes(q) ||
      c.en.toLowerCase().includes(q) ||
      c.dial.replace('+', '').includes(q.replace('+', '')) ||
      c.iso2.toLowerCase().includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // 打开时自动聚焦搜索框
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const pick = (c) => { onChange(c.iso2); setOpen(false); setQuery(''); };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-full px-3 py-3 rounded-l-xl border border-r-0 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none disabled:opacity-50 transition whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-lg leading-none">{current.flag}</span>
        <span className="text-sm font-medium">{current.dial}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 left-0 w-72 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t && t('country_search') !== 'country_search' ? t('country_search') : 'Search country or code'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-primary"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-sm text-slate-400 text-center">
                {t && t('country_no_match') !== 'country_no_match' ? t('country_no_match') : 'No match'}
              </li>
            )}
            {filtered.map((c) => (
              <li key={c.iso2}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition ${c.iso2 === current.iso2 ? 'bg-slate-50 dark:bg-slate-700/60' : ''}`}
                >
                  <span className="text-lg leading-none">{c.flag}</span>
                  <span className="flex-1 text-slate-700 dark:text-slate-200 truncate">{label(c)}</span>
                  <span className="text-slate-400 tabular-nums">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CountryCodeSelect;
