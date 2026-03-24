import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

const quotes = {
  zh: '"学习另一门语言不仅是学会对相同事物用不同的词表达，更是学会用另一种方式去思考。" – Flora Lewis',
  en: '"Learning another language is not only learning different words for the same things, but learning another way to think about things." – Flora Lewis',
  es: '"Aprender otro idioma no es solo aprender diferentes palabras para las mismas cosas, sino aprender otra forma de pensar sobre las cosas." – Flora Lewis',
  fr: '"Apprendre une autre langue, ce n\'est pas seulement apprendre d\'autres mots pour désigner les mêmes choses, c\'est apprendre une autre façon de penser." – Flora Lewis',
  ja: '"外国語を学ぶことは、同じ物事を表す違う言葉を覚えるだけでなく、物事の捉え方そのものを学ぶことである。" – Flora Lewis',
  ko: '"다른 언어를 배운다는 것은 같은 사물에 다른 단어를 사용하는 것을 배우는 것이 아니라, 다른 방식으로 생각하는 법을 배우는 것이다." – Flora Lewis',
  de: '"Eine weitere Sprache zu lernen bedeutet nicht nur, andere Wörter für dieselben Dinge zu lernen, sondern eine andere Art zu denken." – Flora Lewis',
  pt: '"Aprender outro idioma não é apenas aprender palavras diferentes para as mesmas coisas, mas aprender uma outra forma de pensar sobre as coisas." – Flora Lewis',
  ru: '"Изучение другого языка — это не просто изучение других слов для тех же самых вещей, но изучение другого способа думать о вещах." – Flora Lewis',
};

function Welcome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (user) {
      if (user.native_language) {
        navigate('/discovery');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, navigate]);

  const currentLang = i18n.language?.split('-')[0] || 'zh';
  const quote = quotes[currentLang] || quotes.en;

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center text-center flex-grow">
        <div className="flex w-full grow flex-col items-center justify-center p-4">
          <div className="w-24 gap-1 overflow-hidden bg-transparent aspect-square rounded-lg flex">
            <div className="w-full bg-center bg-no-repeat bg-cover aspect-auto rounded-none flex-1"
                 style={{backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}></div>
          </div>
          <h1 className="text-slate-900 dark:text-white tracking-light text-[32px] font-bold leading-tight pt-4">Guaji AI</h1>
          <p className="text-slate-600 dark:text-slate-400 text-base mt-2">{t('welcome_subtitle')}</p>

          <div className="mt-8 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium italic leading-relaxed">
              {quote}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col items-center">
          <div className="flex w-full flex-col items-stretch gap-3 max-w-[480px] px-4 py-3">
            <button
              onClick={() => navigate('/register')}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary text-white text-base font-bold leading-normal tracking-[0.015em] w-full hover:bg-primary/90 transition-colors">
              <span className="truncate">{t('welcome_create')}</span>
            </button>
            <button
              onClick={() => navigate('/login')}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-base font-bold leading-normal tracking-[0.015em] w-full hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
              <span className="truncate">{t('welcome_login')}</span>
            </button>
          </div>
        </div>

        <p className="text-slate-500 dark:text-slate-500 text-sm font-normal leading-normal pt-6 pb-4 px-4 text-center">{t('welcome_or')}</p>

        <div className="flex w-full items-center justify-center gap-4 px-4">
          <button className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 bg-background-light dark:bg-background-dark text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span className="material-symbols-outlined">account_circle</span>
          </button>
        </div>

        {/* Language selector — reuses shared LanguageSwitcher */}
        <div className="w-full max-w-md px-4 pt-8 pb-4">
          <LanguageSwitcher className="w-full text-center" />
        </div>
      </div>
    </div>
  );
}

export default Welcome;
