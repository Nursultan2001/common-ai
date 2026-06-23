// Intake form translations. The QUESTIONS (labels, titles, help) are translated
// so a KK/RU/EN reader understands them; ANSWERS (incl. dropdown option values)
// stay English so the Common App autofill keeps matching. A banner tells the
// filler to type in English.

export const INTAKE_LANGS = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "kk", label: "Қазақша" },
] as const;
export type IntakeLang = (typeof INTAKE_LANGS)[number]["code"];

export function normalizeLang(v?: string): IntakeLang {
  return v === "ru" || v === "kk" ? v : "en";
}

type Dict = Record<string, string>;

const en: Dict = {
  pageTitle: "College application intake",
  intro: "Fill what you can — it saves automatically and your counselor takes it from here.",
  forName: "For {name}.",
  submitted: "✓ Submitted — you can still edit.",
  fillEnglish: "⚠ Please type all your answers in English. The application is in English — these translations are only to help you understand the questions.",
  language: "Language",
  next: "Next →",
  saveContinue: "Save & continue →",
  add: "Add", del: "Delete",

  s_personal: "Personal", s_contact: "Contact & address", s_citizenship: "Citizenship",
  s_languages: "Languages", s_family: "Family", s_education: "Education", s_testing: "Testing",
  s_activities: "Activities", s_honors: "Honors", s_writing: "Writing", s_review: "Review & submit",

  legalFirst: "Legal first name", middle: "Middle name", legalLast: "Legal last name", suffix: "Suffix",
  preferredFirst: "Preferred first name", shareDifferent: "Share a different first name?",
  materialsFormer: "Materials under a former name?", formerLast: "Former last name",
  dob: "Date of birth", birthCity: "City of birth", birthCountry: "Country of birth",
  gender: "Gender", legalSex: "Legal sex", armed: "U.S. Armed Forces status",
  hispanic: "Hispanic or Latino/a/x?", pronouns: "Pronouns", race: "How do you identify? (race/ethnicity)",

  email: "Email", phoneType: "Phone type", phoneCountry: "Phone country (e.g. Kazakhstan)",
  phoneNumber: "Phone number", altPhone: "Alternate phone", altCountry: "Alt. country", altNumber: "Alt. number",
  addr1: "Address line 1", addr2: "Address line 2", city: "City", stateProv: "State/Province",
  postal: "Postal/Zip code", country: "Country",

  citStatus: "Citizenship status", citCountry: "Country of citizenship", yearsUS: "Years lived in the U.S.",
  holdVisa: "Currently hold a U.S. visa?", needVisa: "Will you need a U.S. visa?", visaType: "Visa type (e.g. F-1 Student)",

  languageField: "Language", proficiency: "Proficiency", addLanguage: "Add language", noLanguages: "No languages added.",

  household: "Household", marital: "Parents’ marital status", homeWith: "You make your permanent home with",
  haveChildren: "Do you have children?", saveHousehold: "Save household",
  parentN: "Parent / Guardian {n}", parentType: "Parent type", living: "Living?",
  firstName: "First name", lastName: "Last name", parentEmail: "Email",
  parentPhoneCountry: "Phone country", parentPhoneNumber: "Phone number",
  employment: "Employment status", occupation: "Occupation", parentEdu: "Highest education level",
  saveParentN: "Save parent {n}", siblings: "Siblings", ageGrade: "Age / grade",
  addSibling: "Add sibling", noSiblings: "No siblings added.",

  hsName: "High school name", dateEntry: "Date of entry", gradDate: "Graduation date", gradYear: "Graduation year",
  schoolType: "School type", schoolCountry: "School country", schoolCity: "School city",
  schoolAddress: "School address", schoolState: "School state/province", schoolZip: "School zip/postal",
  boarding: "Boarding school?", gradHere: "Did/will you graduate here?", gpa: "GPA", gpaScale: "GPA scale",
  classSize: "Graduating class size", rankReporting: "Class rank reporting", rankWeighting: "Class rank weighting",
  gpaWeighting: "GPA weighting", major: "Intended major", degree: "Highest degree intended", career: "Career interest",

  testingTitle: "Testing (self-reported)", selfReport: "Self-report scores or future test dates?",
  intlLeaving: "International: promotion by leaving exams?", testsReport: "Tests you wish to report",
  satIfAny: "SAT (if any)", satRW: "Reading & Writing", satRWDate: "R&W date", satMath: "Math", satMathDate: "Math date",
  actIfAny: "ACT (if any)", actComposite: "Composite", actCompositeDate: "Composite date",
  ieltsIfAny: "IELTS (if any)", listening: "Listening", reading: "Reading", writing: "Writing",
  speaking: "Speaking", overall: "Overall", dateField: "Date",

  activitiesTitle: "Activities", actHelper: "Up to 10. Describe each in your own words — your counselor polishes it later.",
  category: "Category", position: "Position / role", organization: "Organization",
  hoursWeek: "Hours/week", weeksYear: "Weeks/year", continueCollege: "Continue in college?",
  gradeLevels: "Grade levels", timing: "Timing", describeOwn: "Describe it (your own words)",
  addActivity: "Add activity", noActivities: "No activities yet.",

  honorsTitle: "Honors & awards", titleField: "Title", gradeLevelsH: "Grade level(s)",
  recognition: "Level(s) of recognition", contextOptional: "Context (optional)",
  addHonor: "Add honor", noHonors: "No honors yet.",

  writingTitle: "Personal essay", choosePrompt: "Choose a prompt",
  essayHelp: "Write as much as you can in your own words — your counselor will help refine it. Aim for 250–650 words, but anything is a great start.",
  essayLabel: "Your essay", addlInfoLabel: "Anything else colleges should know? (optional)",
  addlQualLabel: "Other details or qualifications not shown elsewhere (optional)",

  reviewTitle: "Review & submit",
  reviewHelper: "Everything saves as you go. Submitting just tells your counselor you’re done — you can still edit afterward.",
  rName: "Name", rEmail: "Email", rHS: "High school", rCounts: "Languages: {l} · Activities: {a} · Honors: {h}",
  submitCounselor: "Submit to my counselor", resubmit: "Re-submit",
};

const ru: Dict = {
  pageTitle: "Анкета для поступления в колледж",
  intro: "Заполните, что можете — данные сохраняются автоматически, дальше всё сделает ваш консультант.",
  forName: "Для: {name}.",
  submitted: "✓ Отправлено — вы всё ещё можете редактировать.",
  fillEnglish: "⚠ Пожалуйста, вводите все ответы на английском языке. Заявление — на английском; переводы нужны только для понимания вопросов.",
  language: "Язык",
  next: "Далее →",
  saveContinue: "Сохранить и продолжить →",
  add: "Добавить", del: "Удалить",

  s_personal: "Личные данные", s_contact: "Контакты и адрес", s_citizenship: "Гражданство",
  s_languages: "Языки", s_family: "Семья", s_education: "Образование", s_testing: "Тесты",
  s_activities: "Деятельность", s_honors: "Награды", s_writing: "Эссе", s_review: "Проверка и отправка",

  legalFirst: "Имя (по документам)", middle: "Отчество / среднее имя", legalLast: "Фамилия (по документам)", suffix: "Суффикс",
  preferredFirst: "Предпочитаемое имя", shareDifferent: "Указать другое имя?",
  materialsFormer: "Есть документы на прежнюю фамилию?", formerLast: "Прежняя фамилия",
  dob: "Дата рождения", birthCity: "Город рождения", birthCountry: "Страна рождения",
  gender: "Пол (гендер)", legalSex: "Пол (юридический)", armed: "Статус в Вооружённых силах США",
  hispanic: "Латиноамериканец/латиноамериканка?", pronouns: "Местоимения", race: "Раса / этническая принадлежность",

  email: "Электронная почта", phoneType: "Тип телефона", phoneCountry: "Страна телефона (напр. Казахстан)",
  phoneNumber: "Номер телефона", altPhone: "Запасной телефон", altCountry: "Страна (запасной)", altNumber: "Номер (запасной)",
  addr1: "Адрес, строка 1", addr2: "Адрес, строка 2", city: "Город", stateProv: "Область/штат",
  postal: "Почтовый индекс", country: "Страна",

  citStatus: "Статус гражданства", citCountry: "Страна гражданства", yearsUS: "Сколько лет живёте в США",
  holdVisa: "Есть ли виза США сейчас?", needVisa: "Понадобится ли виза США?", visaType: "Тип визы (напр. F-1 Student)",

  languageField: "Язык", proficiency: "Уровень владения", addLanguage: "Добавить язык", noLanguages: "Языки не добавлены.",

  household: "Семья / домохозяйство", marital: "Семейное положение родителей", homeWith: "С кем вы постоянно живёте",
  haveChildren: "У вас есть дети?", saveHousehold: "Сохранить",
  parentN: "Родитель / опекун {n}", parentType: "Кто это", living: "Жив(а)?",
  firstName: "Имя", lastName: "Фамилия", parentEmail: "Эл. почта",
  parentPhoneCountry: "Страна телефона", parentPhoneNumber: "Номер телефона",
  employment: "Занятость", occupation: "Профессия", parentEdu: "Высший уровень образования",
  saveParentN: "Сохранить родителя {n}", siblings: "Братья и сёстры", ageGrade: "Возраст / класс",
  addSibling: "Добавить", noSiblings: "Не добавлены.",

  hsName: "Название школы", dateEntry: "Дата поступления", gradDate: "Дата окончания", gradYear: "Год окончания",
  schoolType: "Тип школы", schoolCountry: "Страна школы", schoolCity: "Город школы",
  schoolAddress: "Адрес школы", schoolState: "Область/штат школы", schoolZip: "Индекс школы",
  boarding: "Школа-пансион?", gradHere: "Окончите/окончили эту школу?", gpa: "Средний балл (GPA)", gpaScale: "Шкала GPA",
  classSize: "Размер выпускного класса", rankReporting: "Формат рейтинга в классе", rankWeighting: "Взвешивание рейтинга",
  gpaWeighting: "Взвешивание GPA", major: "Желаемая специальность", degree: "Желаемая степень", career: "Карьерные интересы",

  testingTitle: "Тесты (самостоятельно)", selfReport: "Указать баллы или будущие даты тестов?",
  intlLeaving: "Международные: перевод по выпускным экзаменам?", testsReport: "Какие тесты указать",
  satIfAny: "SAT (если есть)", satRW: "Чтение и письмо", satRWDate: "Дата (чтение/письмо)", satMath: "Математика", satMathDate: "Дата (математика)",
  actIfAny: "ACT (если есть)", actComposite: "Композитный балл", actCompositeDate: "Дата (композит)",
  ieltsIfAny: "IELTS (если есть)", listening: "Аудирование", reading: "Чтение", writing: "Письмо",
  speaking: "Говорение", overall: "Общий балл", dateField: "Дата",

  activitiesTitle: "Деятельность", actHelper: "До 10. Опишите каждую своими словами — консультант доработает текст.",
  category: "Категория", position: "Должность / роль", organization: "Организация",
  hoursWeek: "Часов в неделю", weeksYear: "Недель в году", continueCollege: "Продолжите в колледже?",
  gradeLevels: "Классы участия", timing: "Когда", describeOwn: "Опишите своими словами",
  addActivity: "Добавить", noActivities: "Пока ничего нет.",

  honorsTitle: "Награды и достижения", titleField: "Название", gradeLevelsH: "Класс(ы)",
  recognition: "Уровень признания", contextOptional: "Контекст (необязательно)",
  addHonor: "Добавить", noHonors: "Пока ничего нет.",

  writingTitle: "Личное эссе", choosePrompt: "Выберите тему",
  essayHelp: "Напишите как можно больше своими словами — консультант поможет доработать. Ориентир 250–650 слов, но любой текст — хорошее начало.",
  essayLabel: "Ваше эссе", addlInfoLabel: "Что ещё стоит знать колледжам? (необязательно)",
  addlQualLabel: "Другие сведения или качества, не указанные выше (необязательно)",

  reviewTitle: "Проверка и отправка",
  reviewHelper: "Всё сохраняется по ходу. Отправка просто сообщает консультанту, что вы закончили — редактировать можно и дальше.",
  rName: "Имя", rEmail: "Эл. почта", rHS: "Школа", rCounts: "Языки: {l} · Деятельность: {a} · Награды: {h}",
  submitCounselor: "Отправить консультанту", resubmit: "Отправить снова",
};

const kk: Dict = {
  pageTitle: "Колледжге өтінім анкетасы",
  intro: "Қолыңыздан келгенін толтырыңыз — деректер автоматты сақталады, қалғанын кеңесшіңіз жасайды.",
  forName: "Кімге: {name}.",
  submitted: "✓ Жіберілді — әлі де өңдей аласыз.",
  fillEnglish: "⚠ Барлық жауаптарды ағылшын тілінде жазыңыз. Өтінім ағылшынша; аудармалар тек сұрақтарды түсіну үшін.",
  language: "Тіл",
  next: "Келесі →",
  saveContinue: "Сақтап, жалғастыру →",
  add: "Қосу", del: "Жою",

  s_personal: "Жеке деректер", s_contact: "Байланыс және мекенжай", s_citizenship: "Азаматтық",
  s_languages: "Тілдер", s_family: "Отбасы", s_education: "Білім", s_testing: "Тесттер",
  s_activities: "Қызмет", s_honors: "Марапаттар", s_writing: "Эссе", s_review: "Тексеру және жіберу",

  legalFirst: "Аты (құжат бойынша)", middle: "Әкесінің аты / орта аты", legalLast: "Тегі (құжат бойынша)", suffix: "Жұрнақ (suffix)",
  preferredFirst: "Қалаған аты", shareDifferent: "Басқа атты көрсету керек пе?",
  materialsFormer: "Бұрынғы тегіңізбен құжаттар бар ма?", formerLast: "Бұрынғы тегі",
  dob: "Туған күні", birthCity: "Туған қаласы", birthCountry: "Туған елі",
  gender: "Жынысы (гендер)", legalSex: "Жынысы (заңды)", armed: "АҚШ Қарулы күштеріндегі мәртебе",
  hispanic: "Латынамерикалық тектіңіз бе?", pronouns: "Есімдіктер", race: "Нәсілі / этникалық тегі",

  email: "Электрондық пошта", phoneType: "Телефон түрі", phoneCountry: "Телефон елі (мыс. Қазақстан)",
  phoneNumber: "Телефон нөмірі", altPhone: "Қосымша телефон", altCountry: "Ел (қосымша)", altNumber: "Нөмір (қосымша)",
  addr1: "Мекенжай, 1-жол", addr2: "Мекенжай, 2-жол", city: "Қала", stateProv: "Облыс/штат",
  postal: "Пошта индексі", country: "Ел",

  citStatus: "Азаматтық мәртебесі", citCountry: "Азаматтық елі", yearsUS: "АҚШ-та неше жыл тұрасыз",
  holdVisa: "Қазір АҚШ визасы бар ма?", needVisa: "АҚШ визасы қажет пе?", visaType: "Виза түрі (мыс. F-1 Student)",

  languageField: "Тіл", proficiency: "Меңгеру деңгейі", addLanguage: "Тіл қосу", noLanguages: "Тілдер қосылмаған.",

  household: "Отбасы / үй шаруашылығы", marital: "Ата-ананың отбасылық жағдайы", homeWith: "Тұрақты кіммен тұрасыз",
  haveChildren: "Балаларыңыз бар ма?", saveHousehold: "Сақтау",
  parentN: "Ата-ана / қамқоршы {n}", parentType: "Кім", living: "Тірі ме?",
  firstName: "Аты", lastName: "Тегі", parentEmail: "Эл. пошта",
  parentPhoneCountry: "Телефон елі", parentPhoneNumber: "Телефон нөмірі",
  employment: "Жұмыспен қамтылуы", occupation: "Мамандығы", parentEdu: "Ең жоғары білім деңгейі",
  saveParentN: "{n}-ата-ананы сақтау", siblings: "Аға-іні, апа-сіңлі", ageGrade: "Жасы / сыныбы",
  addSibling: "Қосу", noSiblings: "Қосылмаған.",

  hsName: "Мектеп атауы", dateEntry: "Оқуға кірген күні", gradDate: "Бітіру күні", gradYear: "Бітіру жылы",
  schoolType: "Мектеп түрі", schoolCountry: "Мектеп елі", schoolCity: "Мектеп қаласы",
  schoolAddress: "Мектеп мекенжайы", schoolState: "Мектеп облысы/штаты", schoolZip: "Мектеп индексі",
  boarding: "Интернат па?", gradHere: "Осы мектепті бітіресіз/бітірдіңіз бе?", gpa: "Орташа балл (GPA)", gpaScale: "GPA шкаласы",
  classSize: "Бітіруші сынып саны", rankReporting: "Сыныптағы рейтинг форматы", rankWeighting: "Рейтинг салмағы",
  gpaWeighting: "GPA салмағы", major: "Қалаған мамандық", degree: "Қалаған дәреже", career: "Мансаптық қызығушылық",

  testingTitle: "Тесттер (өзіндік)", selfReport: "Балл не болашақ тест күндерін көрсету керек пе?",
  intlLeaving: "Халықаралық: бітіру емтихандары бойынша ауысу?", testsReport: "Қай тесттерді көрсету",
  satIfAny: "SAT (бар болса)", satRW: "Оқу және жазу", satRWDate: "Күні (оқу/жазу)", satMath: "Математика", satMathDate: "Күні (математика)",
  actIfAny: "ACT (бар болса)", actComposite: "Жалпы балл", actCompositeDate: "Күні (жалпы)",
  ieltsIfAny: "IELTS (бар болса)", listening: "Тыңдалым", reading: "Оқылым", writing: "Жазылым",
  speaking: "Сөйлеу", overall: "Жалпы балл", dateField: "Күні",

  activitiesTitle: "Қызмет", actHelper: "10-ға дейін. Әрқайсысын өз сөзіңізбен жазыңыз — кеңесші мәтінді жетілдіреді.",
  category: "Санат", position: "Лауазым / рөл", organization: "Ұйым",
  hoursWeek: "Аптасына сағат", weeksYear: "Жылына апта", continueCollege: "Колледжде жалғастырасыз ба?",
  gradeLevels: "Қатысқан сыныптар", timing: "Қашан", describeOwn: "Өз сөзіңізбен сипаттаңыз",
  addActivity: "Қосу", noActivities: "Әзірге жоқ.",

  honorsTitle: "Марапаттар мен жетістіктер", titleField: "Атауы", gradeLevelsH: "Сынып(тар)",
  recognition: "Тану деңгейі", contextOptional: "Мәтінмән (міндетті емес)",
  addHonor: "Қосу", noHonors: "Әзірге жоқ.",

  writingTitle: "Жеке эссе", choosePrompt: "Тақырып таңдаңыз",
  essayHelp: "Қолыңыздан келгенше өз сөзіңізбен жазыңыз — кеңесші жетілдіруге көмектеседі. 250–650 сөз шамасында, бірақ кез келген мәтін — жақсы бастама.",
  essayLabel: "Сіздің эссеңіз", addlInfoLabel: "Колледждер білуі керек тағы не бар? (міндетті емес)",
  addlQualLabel: "Жоғарыда көрсетілмеген басқа мәліметтер немесе қасиеттер (міндетті емес)",

  reviewTitle: "Тексеру және жіберу",
  reviewHelper: "Бәрі жол-жөнекей сақталады. Жіберу — кеңесшіге дайын екеніңізді білдіреді; кейін де өңдей аласыз.",
  rName: "Аты", rEmail: "Эл. пошта", rHS: "Мектеп", rCounts: "Тілдер: {l} · Қызмет: {a} · Марапаттар: {h}",
  submitCounselor: "Кеңесшіге жіберу", resubmit: "Қайта жіберу",
};

const TR: Record<IntakeLang, Dict> = { en, ru, kk };

export function tr(lang: IntakeLang) {
  return TR[lang];
}
