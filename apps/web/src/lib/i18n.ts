// Landing-page translations: English, Russian, Kazakh.
// Brand name "Common AI" and "Common App" are kept untranslated.

export type Lang = "en" | "ru" | "kk";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ru", label: "RU" },
  { code: "kk", label: "KK" },
];

export interface Dict {
  nav: { how: string; waitlist: string; signin: string };
  pill: string;
  title1: string;
  title2: string;
  subtitle: string;
  form: {
    title: string;
    desc: string;
    email: string;
    name: string;
    iam: string;
    student: string;
    counselor: string;
    note: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successBody: string;
  };
  disclaimer: string;
  marquee: string;
  features: { title: string; sub: string };
  f: { t: string; d: string }[];
  steps: { title: string };
  s: { t: string; d: string }[];
  footer: string;
}

export const DICT: Record<Lang, Dict> = {
  en: {
    nav: { how: "How it works", waitlist: "Waitlist", signin: "Sign in" },
    pill: "Coming soon · onboarding in batches",
    title1: "Your college applications,",
    title2: "on autopilot.",
    subtitle:
      "AI fills the Common App and university portals from one simple profile — activities, honors, essays, documents. You review every field and submit yourself. $5 per application.",
    form: {
      title: "Join the waitlist",
      desc: "We’re onboarding students and counselors in batches. Drop your email and we’ll reach out.",
      email: "Email",
      name: "Name (optional)",
      iam: "I am a…",
      student: "Applicant",
      counselor: "Counselor / Agency",
      note: "Anything you want us to know? (optional)",
      submit: "Join the waitlist",
      submitting: "Joining…",
      successTitle: "You’re on the list",
      successBody: "Thanks — we’ll email you the moment Common AI opens up.",
    },
    disclaimer:
      "Not affiliated with or endorsed by the Common Application or any university. You remain the author and submitter of your application.",
    marquee: "Built for applications to",
    features: {
      title: "Built for the whole application",
      sub: "One profile in. Polished, accurate applications out — grounded only in what you actually tell us.",
    },
    f: [
      { t: "Smart intake", d: "Answer once. We structure your identity, education, and scores into a single source of truth." },
      { t: "Activities & honors, polished", d: "AI tightens your descriptions to the exact character limits — using your facts, never invented ones." },
      { t: "Essay coaching", d: "From your real stories to an outline and draft you rewrite in your own voice." },
      { t: "Autofill extension", d: "Fills Common App & portals in your own session, highlights every field, and waits for your review." },
      { t: "Encrypted vault", d: "Transcripts and documents are encrypted at rest and attached automatically when a portal asks." },
      { t: "For agencies", d: "Counselors manage many students with discounted per-application pricing from one dashboard." },
    ],
    steps: { title: "How it works" },
    s: [
      { t: "Fill your profile", d: "A simple questionnaire — once." },
      { t: "AI prepares everything", d: "Activities, honors, and essay drafts from your details." },
      { t: "Unlock a university", d: "$5 each. Agencies get a discount." },
      { t: "Review & submit", d: "The extension fills it; you check and submit." },
    ],
    footer: "Common AI · You review and submit — always.",
  },

  ru: {
    nav: { how: "Как это работает", waitlist: "Лист ожидания", signin: "Войти" },
    pill: "Скоро запуск · подключаем волнами",
    title1: "Ваши заявки в вузы —",
    title2: "на автопилоте.",
    subtitle:
      "ИИ заполняет Common App и порталы университетов из одного простого профиля — внеучебная деятельность, награды, эссе, документы. Вы проверяете каждое поле и отправляете сами. $5 за заявку.",
    form: {
      title: "Записаться в лист ожидания",
      desc: "Мы подключаем абитуриентов и консультантов волнами. Оставьте email — и мы свяжемся с вами.",
      email: "Электронная почта",
      name: "Имя (необязательно)",
      iam: "Я —",
      student: "Абитуриент",
      counselor: "Консультант / Агентство",
      note: "Хотите что-то добавить? (необязательно)",
      submit: "Записаться",
      submitting: "Отправка…",
      successTitle: "Вы в списке",
      successBody: "Спасибо! Мы напишем вам, как только Common AI откроется.",
    },
    disclaimer:
      "Не аффилировано с Common Application или каким-либо университетом и не одобрено ими. Вы остаётесь автором и отправителем своей заявки.",
    marquee: "Создано для поступления в",
    features: {
      title: "Создано для всей заявки целиком",
      sub: "Один профиль на входе — аккуратные, отшлифованные заявки на выходе, основанные только на том, что вы указали.",
    },
    f: [
      { t: "Умная анкета", d: "Заполните один раз. Мы соберём ваши данные, образование и баллы в единый источник правды." },
      { t: "Деятельность и награды — отшлифованы", d: "ИИ подгоняет описания под точные лимиты символов, используя только ваши факты и ничего не выдумывая." },
      { t: "Помощь с эссе", d: "От ваших реальных историй к плану и черновику, который вы перепишете своими словами." },
      { t: "Расширение для автозаполнения", d: "Заполняет Common App и порталы в вашей сессии, подсвечивает каждое поле и ждёт вашей проверки." },
      { t: "Зашифрованное хранилище", d: "Транскрипты и документы шифруются и прикрепляются автоматически, когда портал их запрашивает." },
      { t: "Для агентств", d: "Консультанты ведут многих студентов со скидкой на заявку из одной панели." },
    ],
    steps: { title: "Как это работает" },
    s: [
      { t: "Заполните профиль", d: "Простая анкета — один раз." },
      { t: "ИИ всё подготовит", d: "Деятельность, награды и черновики эссе на основе ваших данных." },
      { t: "Откройте университет", d: "$5 за каждый. Агентствам — скидка." },
      { t: "Проверьте и отправьте", d: "Расширение заполнит, вы проверяете и отправляете." },
    ],
    footer: "Common AI · Вы проверяете и отправляете — всегда.",
  },

  kk: {
    nav: { how: "Қалай жұмыс істейді", waitlist: "Күту тізімі", signin: "Кіру" },
    pill: "Жақында · кезең-кезеңімен қосамыз",
    title1: "Университетке өтінімдеріңіз —",
    title2: "автопилотта.",
    subtitle:
      "Жасанды интеллект бір қарапайым профильден Common App пен университет порталдарын толтырады — белсенділік, марапаттар, эссе, құжаттар. Әр өрісті өзіңіз тексеріп, өзіңіз жібересіз. Әр өтінім — $5.",
    form: {
      title: "Күту тізіміне жазылу",
      desc: "Біз талапкерлер мен кеңесшілерді кезең-кезеңімен қосамыз. Email қалдырыңыз — біз сізбен хабарласамыз.",
      email: "Электрондық пошта",
      name: "Аты-жөні (міндетті емес)",
      iam: "Мен —",
      student: "Талапкер",
      counselor: "Кеңесші / Агенттік",
      note: "Бізге айтқыңыз келетін нәрсе бар ма? (міндетті емес)",
      submit: "Жазылу",
      submitting: "Жіберілуде…",
      successTitle: "Сіз тізімдесіз",
      successBody: "Рахмет! Common AI ашылған сәтте сізге email жібереміз.",
    },
    disclaimer:
      "Common Application-мен немесе кез келген университетпен байланысты емес әрі олардың мақұлдауы жоқ. Сіз өз өтініміңіздің авторы әрі жіберушісі болып қала бересіз.",
    marquee: "Мына университеттерге түсуге арналған",
    features: {
      title: "Бүкіл өтінімге арналған",
      sub: "Кіреберісте бір профиль — шығуда тек өзіңіз берген деректерге негізделген ұқыпты, жетілдірілген өтінімдер.",
    },
    f: [
      { t: "Ақылды сауалнама", d: "Бір рет толтырыңыз. Деректеріңізді, біліміңізді және баллдарыңызды біртұтас дереккөзге жинаймыз." },
      { t: "Белсенділік пен марапаттар — жетілдірілген", d: "Жасанды интеллект сипаттамаларды нақты таңбалар шегіне сай етіп, тек сіздің фактілеріңізді қолданып, ештеңе ойдан шығармай реттейді." },
      { t: "Эссеге көмек", d: "Нақты әңгімелеріңізден өзіңіз өз сөзіңізбен қайта жазатын жоспар мен жобаға дейін." },
      { t: "Автотолтыру кеңейтімі", d: "Common App пен порталдарды өз сессияңызда толтырады, әр өрісті бөлектеп, сіздің тексеруіңізді күтеді." },
      { t: "Шифрланған қойма", d: "Транскрипттер мен құжаттар шифрланып сақталады және портал сұрағанда автоматты түрде тіркеледі." },
      { t: "Агенттіктер үшін", d: "Кеңесшілер бір панельден көп студентті өтінімге жеңілдікпен басқарады." },
    ],
    steps: { title: "Қалай жұмыс істейді" },
    s: [
      { t: "Профиліңізді толтырыңыз", d: "Қарапайым сауалнама — бір рет." },
      { t: "Жасанды интеллект бәрін дайындайды", d: "Деректеріңіз негізінде белсенділік, марапаттар және эссе жобалары." },
      { t: "Университетті ашыңыз", d: "Әрқайсысы $5. Агенттіктерге жеңілдік." },
      { t: "Тексеріп, жіберіңіз", d: "Кеңейтім толтырады; сіз тексеріп, жібересіз." },
    ],
    footer: "Common AI · Сіз әрқашан тексеріп, өзіңіз жібересіз.",
  },
};
