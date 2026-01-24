import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const quotes = {
  zh: [
    "“学习另一门语言不仅是学会对相同事物用不同的词表达，更是学会用另一种方式去思考。” – Flora Lewis",
    "“语言是文化的路线图。它告诉你那里的人从哪里来，又要到哪里去。” – Rita Mae Brown",
    "“拥有一门第二语言，就拥有了第二个灵魂。” – Charlemagne",
    "“学习语言的限制就是我对世界认知的限制。” – Ludwig Wittgenstein",
    "“如果我用你听得懂的语言和你交流，话语会进入你的大脑。如果我用你的母语和你交流，话语会进入你的心灵。” – Nelson Mandela"
  ],
  en: [
    "“Learning another language is not only learning different words for the same things, but learning another way to think about things.” – Flora Lewis",
    "“Language is the road map of a culture. It tells you where its people come from and where they are going.” – Rita Mae Brown",
    "“To have another language is to possess a second soul.” – Charlemagne",
    "“The limits of my language mean the limits of my world.” – Ludwig Wittgenstein",
    "“If you talk to a man in a language he understands, that goes to his head. If you talk to him in his language, that goes to his heart.” – Nelson Mandela"
  ],
  es: [
    "“Aprender otro idioma no es solo aprender diferentes palabras para las mismas cosas, sino aprender otra forma de pensar sobre las cosas.” – Flora Lewis",
    "“El lenguaje es el mapa de carreteras de una cultura. Te dice de dónde viene su gente y hacia dónde se dirige.” – Rita Mae Brown",
    "“Tener otro idioma es poseer una segunda alma.” – Charlemagne",
    "“Los límites de mi lenguaje significan los límites de mi mundo.” – Ludwig Wittgenstein",
    "“Si hablas con un hombre en un idioma que comprende, eso llega a su cabeza. Si le hablas en su idioma, eso llega a su corazón.” – Nelson Mandela"
  ],
  fr: [
    "“Apprendre une autre langue, ce n'est pas seulement apprendre d'autres mots pour désigner les mêmes choses, c'est apprendre une autre façon de penser.” – Flora Lewis",
    "“La langue est la carte routière d'une culture. Elle vous dit d'où viennent ses habitants et où ils vont.” – Rita Mae Brown",
    "“Avoir une autre langue, c'est posséder une deuxième âme.” – Charlemagne",
    "“Les limites de ma langue signifient les limites de mon monde.” – Ludwig Wittgenstein",
    "“Si vous parlez à un homme dans une langue qu'il comprend, cela va à sa tête. Si vous lui parlez dans sa langue, cela va à son cœur.” – Nelson Mandela"
  ],
  ja: [
    "“外国語を学ぶことは、同じ物事を表す違う言葉を覚えるだけでなく、物事の捉え方そのものを学ぶことである。” – Flora Lewis",
    "“言語は文化のロードマップである。それは、その人々がどこから来て、どこへ行くのかを教えてくれる。” – Rita Mae Brown",
    "“第二の言語を持つことは、第二の魂を持つことである。” – Charlemagne",
    "“私の言語の限界は、私の世界の限界を意味する。” – Ludwig Wittgenstein",
    "“相手が理解できる言葉で話せば、それは相手の頭に入る。相手の母国語で話せば、それは相手の心に響く。” – Nelson Mandela"
  ]
};

const SplashScreen = ({ onComplete }) => {
  const { user } = useAuth();
  const [quote, setQuote] = useState("");
  const [fade, setFade] = useState(false);

  useEffect(() => {
    // Determine Language
    let lang = 'en';
    if (user && user.native_language) {
      const langMap = { 'Chinese': 'zh', 'Mandarin': 'zh', 'English': 'en', 'Spanish': 'es', 'French': 'fr', 'Japanese': 'ja' };
      const userLang = user.native_language;
      if (quotes[userLang]) lang = userLang;
      else if (langMap[userLang]) lang = langMap[userLang];
    } else {
        const browserLang = navigator.language.split('-')[0];
        if (quotes[browserLang]) lang = browserLang;
    }

    // Select Random Quote
    const langQuotes = quotes[lang] || quotes['en'];
    const randomQuote = langQuotes[Math.floor(Math.random() * langQuotes.length)];
    setQuote(randomQuote);

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
        setFade(true);
        setTimeout(onComplete, 500); // Wait for fade out
    }, 3000);

    return () => clearTimeout(timer);
  }, [user, onComplete]);

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background-light dark:bg-slate-900 transition-opacity duration-500 ${fade ? 'opacity-0' : 'opacity-100'}`}>
        <div className="p-8 text-center max-w-lg animate-in fade-in zoom-in duration-700">
             <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mx-auto mb-6 shadow-xl flex items-center justify-center">
                 <span className="material-symbols-outlined text-white text-4xl">school</span>
             </div>
             <blockquote className="text-xl font-medium text-slate-700 dark:text-slate-200 italic leading-relaxed font-serif">
                {quote}
             </blockquote>
             <p className="mt-8 text-sm text-slate-400 font-sans tracking-widest uppercase">Guaji AI</p>
        </div>
    </div>
  );
};

export default SplashScreen;
