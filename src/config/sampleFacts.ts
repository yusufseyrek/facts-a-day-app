import type { ImageSource } from 'expo-image';

import type { SupportedLocale } from '../i18n';

export interface SampleFact {
  title: string;
  image: ImageSource;
  category: string;
  categoryColor: string;
}

// Bundled images — available offline, no network required
const NATURE_IMAGE = require('../../assets/onboarding/nature.webp') as ImageSource;
const SPACE_IMAGE = require('../../assets/onboarding/space.webp') as ImageSource;
const CULTURE_IMAGE = require('../../assets/onboarding/culture.webp') as ImageSource;
const HISTORY_IMAGE = require('../../assets/onboarding/history.webp') as ImageSource;
const FOOD_IMAGE = require('../../assets/onboarding/food.webp') as ImageSource;
const TECHNOLOGY_IMAGE = require('../../assets/onboarding/technology.webp') as ImageSource;

const NATURE_COLOR = '#8BC34A';
const SPACE_COLOR = '#3F51B5';
const CULTURE_COLOR = '#ff0055';
const HISTORY_COLOR = '#FF9800';
const FOOD_COLOR = '#FF6F00';
const TECHNOLOGY_COLOR = '#2196F3';

/**
 * Sample facts shown in the onboarding welcome carousel.
 * Sourced from the production database — real article-sourced facts with bundled images.
 */
export const sampleFacts: Record<SupportedLocale, SampleFact[]> = {
  en: [
    {
      title: 'Some fighter jets can fly faster than sound without using extra fuel',
      image: TECHNOLOGY_IMAGE,
      category: 'Technology',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title: 'A savory cheese dish became so popular it earned a national holiday',
      image: FOOD_IMAGE,
      category: 'Food',
      categoryColor: FOOD_COLOR,
    },
    {
      title: "The dinosaur named 'egg thief' was actually a devoted parent",
      image: NATURE_IMAGE,
      category: 'Nature',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Japan honors 47 samurai who chose death over dishonor in 1703',
      image: CULTURE_IMAGE,
      category: 'Culture',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: 'Small dust storms on Mars can catapult water into space',
      image: SPACE_IMAGE,
      category: 'Space',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'A four-year-old boy became the emperor of China in 1875',
      image: HISTORY_IMAGE,
      category: 'History',
      categoryColor: HISTORY_COLOR,
    },
  ],
  de: [
    {
      title: 'Einige Kampfjets fliegen ohne zusätzlichen Treibstoff schneller als der Schall',
      image: TECHNOLOGY_IMAGE,
      category: 'Technologie',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title:
        'Ein herzhaftes Käsegericht wurde so beliebt, dass es einen nationalen Feiertag erhielt',
      image: FOOD_IMAGE,
      category: 'Essen',
      categoryColor: FOOD_COLOR,
    },
    {
      title: "Der als 'Eierdieb' benannte Dinosaurier war tatsächlich ein fürsorgliches Elternteil",
      image: NATURE_IMAGE,
      category: 'Natur',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Japan ehrt 47 Samurai, die im Jahr 1703 den Tod der Ehrlosigkeit vorzogen',
      image: CULTURE_IMAGE,
      category: 'Kultur',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: 'Kleine Staubstürme auf dem Mars können Wasser ins All schleudern',
      image: SPACE_IMAGE,
      category: 'Weltraum',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'Ein vierjähriger Junge wurde 1875 Kaiser von China',
      image: HISTORY_IMAGE,
      category: 'Geschichte',
      categoryColor: HISTORY_COLOR,
    },
  ],
  es: [
    {
      title:
        'Algunos aviones de combate pueden volar más rápido que el sonido sin usar combustible extra',
      image: TECHNOLOGY_IMAGE,
      category: 'Tecnología',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title: 'Un sabroso plato de queso se volvió tan popular que ganó un día nacional',
      image: FOOD_IMAGE,
      category: 'Comida',
      categoryColor: FOOD_COLOR,
    },
    {
      title: "El dinosaurio llamado 'ladrón de huevos' era en realidad un padre dedicado",
      image: NATURE_IMAGE,
      category: 'Naturaleza',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Japón honra a 47 samuráis que eligieron la muerte antes que el deshonor en 1703',
      image: CULTURE_IMAGE,
      category: 'Cultura',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: 'Las pequeñas tormentas de polvo en Marte pueden lanzar agua al espacio',
      image: SPACE_IMAGE,
      category: 'Espacio',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'Un niño de cuatro años se convirtió en emperador de China en 1875',
      image: HISTORY_IMAGE,
      category: 'Historia',
      categoryColor: HISTORY_COLOR,
    },
  ],
  fr: [
    {
      title: 'Certains avions de chasse volent plus vite que le son sans carburant supplémentaire',
      image: TECHNOLOGY_IMAGE,
      category: 'Technologie',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title:
        "Un plat au fromage savoureux est devenu si populaire qu'il a obtenu sa fête nationale",
      image: FOOD_IMAGE,
      category: 'Cuisine',
      categoryColor: FOOD_COLOR,
    },
    {
      title: "Le dinosaure nommé 'voleur d'œufs' était en fait un parent dévoué",
      image: NATURE_IMAGE,
      category: 'Nature',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Le Japon honore 47 samouraïs qui ont choisi la mort plutôt que le déshonneur en 1703',
      image: CULTURE_IMAGE,
      category: 'Culture',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: "De petites tempêtes de poussière sur Mars peuvent catapulter l'eau dans l'espace",
      image: SPACE_IMAGE,
      category: 'Espace',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'Un garçon de quatre ans est devenu empereur de Chine en 1875',
      image: HISTORY_IMAGE,
      category: 'Histoire',
      categoryColor: HISTORY_COLOR,
    },
  ],
  ja: [
    {
      title: '一部の戦闘機は追加の燃料なしで音速を超えて飛行できる',
      image: TECHNOLOGY_IMAGE,
      category: 'テクノロジー',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title: 'ある美味しいチーズ料理が人気を博し、記念日が制定されました',
      image: FOOD_IMAGE,
      category: '料理',
      categoryColor: FOOD_COLOR,
    },
    {
      title: '「卵泥棒」と呼ばれた恐竜は、実は献身的な親でした',
      image: NATURE_IMAGE,
      category: '自然',
      categoryColor: NATURE_COLOR,
    },
    {
      title: '日本は1703年に不名誉よりも死を選んだ47人の侍を称えています',
      image: CULTURE_IMAGE,
      category: '文化',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: '火星の小さな砂嵐が水を宇宙へ放り出す',
      image: SPACE_IMAGE,
      category: '宇宙',
      categoryColor: SPACE_COLOR,
    },
    {
      title: '1875年、4歳の少年が中国の皇帝に即位しました',
      image: HISTORY_IMAGE,
      category: '歴史',
      categoryColor: HISTORY_COLOR,
    },
  ],
  ko: [
    {
      title: '일부 전투기는 추가 연료 없이 소리보다 빠르게 비행할 수 있습니다',
      image: TECHNOLOGY_IMAGE,
      category: '기술',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title: '풍미 가득한 치즈 요리가 큰 인기를 얻어 국가 기념일이 되었습니다',
      image: FOOD_IMAGE,
      category: '음식',
      categoryColor: FOOD_COLOR,
    },
    {
      title: "'알 도둑'이라 불린 공룡은 사실 헌신적인 부모였습니다",
      image: NATURE_IMAGE,
      category: '자연',
      categoryColor: NATURE_COLOR,
    },
    {
      title: '일본은 1703년 불명예 대신 죽음을 택한 47인의 사무라이를 기립니다',
      image: CULTURE_IMAGE,
      category: '문화',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: '화성의 작은 먼지 폭풍이 물을 우주로 날려 보낼 수 있습니다',
      image: SPACE_IMAGE,
      category: '우주',
      categoryColor: SPACE_COLOR,
    },
    {
      title: '1875년 네 살 소년이 중국의 황제가 되었습니다',
      image: HISTORY_IMAGE,
      category: '역사',
      categoryColor: HISTORY_COLOR,
    },
  ],
  tr: [
    {
      title: 'Bazı savaş uçakları ekstra yakıt kullanmadan sesten hızlı uçabilir',
      image: TECHNOLOGY_IMAGE,
      category: 'Teknoloji',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title: 'Lezzetli bir peynir yemeği ulusal bir bayram kazanacak kadar popülerleşti',
      image: FOOD_IMAGE,
      category: 'Yemek',
      categoryColor: FOOD_COLOR,
    },
    {
      title: "'Yumurta hırsızı' adlı dinozor aslında fedakar bir ebeveynmiş",
      image: NATURE_IMAGE,
      category: 'Doğa',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Japonya 1703 yılında onursuzluk yerine ölümü seçen 47 samurayı anıyor',
      image: CULTURE_IMAGE,
      category: 'Kültür',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: "Mars'taki küçük toz fırtınaları suyu uzaya fırlatabiliyor",
      image: SPACE_IMAGE,
      category: 'Uzay',
      categoryColor: SPACE_COLOR,
    },
    {
      title: "Dört yaşındaki bir çocuk 1875'te Çin imparatoru oldu",
      image: HISTORY_IMAGE,
      category: 'Tarih',
      categoryColor: HISTORY_COLOR,
    },
  ],
  zh: [
    {
      title: '部分战斗机无需额外燃料即可实现超音速飞行',
      image: TECHNOLOGY_IMAGE,
      category: '技术',
      categoryColor: TECHNOLOGY_COLOR,
    },
    {
      title: '一道美味的奶酪菜肴因大受欢迎而获得了全国性节日',
      image: FOOD_IMAGE,
      category: '美食',
      categoryColor: FOOD_COLOR,
    },
    {
      title: "名为'偷蛋贼'的恐龙其实是尽职的父母",
      image: NATURE_IMAGE,
      category: '自然',
      categoryColor: NATURE_COLOR,
    },
    {
      title: '日本纪念在1703年选择死亡而非屈辱的47名武士',
      image: CULTURE_IMAGE,
      category: '文化',
      categoryColor: CULTURE_COLOR,
    },
    {
      title: '火星上的小型沙尘暴会将水抛向太空',
      image: SPACE_IMAGE,
      category: '太空',
      categoryColor: SPACE_COLOR,
    },
    {
      title: '1875年，一名四岁男孩成为了中国皇帝',
      image: HISTORY_IMAGE,
      category: '历史',
      categoryColor: HISTORY_COLOR,
    },
  ],
};
