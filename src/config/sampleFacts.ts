import type { SupportedLocale } from '../i18n';

export interface SampleFact {
  title: string;
  imageUrl: string;
  category: string;
  categoryColor: string;
}

// Shared image URLs — same facts across all locales, just translated titles
const SCIENCE_IMAGE = 'https://factsaday.com/uploads/images/20251130_003808_6z56wzd8.webp';
const NATURE_IMAGE = 'https://factsaday.com/uploads/images/20251130_004948_r7iz7jha.webp';
const SPACE_IMAGE = 'https://factsaday.com/uploads/images/20251130_224405_a2d9si0p.webp';
const HISTORY_IMAGE = 'https://factsaday.com/uploads/images/20251130_010155_chmwszea.webp';
const CULTURE_IMAGE = 'https://factsaday.com/uploads/images/20251130_002025_zs3nbe45.webp';

const SCIENCE_COLOR = '#4CAF50';
const NATURE_COLOR = '#8BC34A';
const SPACE_COLOR = '#3F51B5';
const HISTORY_COLOR = '#FF9800';
const CULTURE_COLOR = '#ff0055';

/**
 * Sample facts shown in the onboarding welcome carousel.
 * Sourced from the production database — real facts with real images.
 * Five diverse categories: Science, Nature, Space, History, Culture.
 */
export const sampleFacts: Record<SupportedLocale, SampleFact[]> = {
  en: [
    {
      title: 'The center of our galaxy tastes like raspberries',
      imageUrl: SCIENCE_IMAGE,
      category: 'Science',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: 'This jellyfish can live forever',
      imageUrl: NATURE_IMAGE,
      category: 'Nature',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'A day on Venus is longer than its year',
      imageUrl: SPACE_IMAGE,
      category: 'Space',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'Cleopatra lived closer to the iPhone than the pyramids',
      imageUrl: HISTORY_IMAGE,
      category: 'History',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: 'The Taj Mahal changes colors with the sun',
      imageUrl: CULTURE_IMAGE,
      category: 'Culture',
      categoryColor: CULTURE_COLOR,
    },
  ],
  de: [
    {
      title: 'Das zentrum unserer galaxie schmeckt nach himbeeren',
      imageUrl: SCIENCE_IMAGE,
      category: 'Wissenschaft',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: 'Diese Qualle kann ewig leben',
      imageUrl: NATURE_IMAGE,
      category: 'Natur',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Ein Tag auf der Venus ist länger als ihr Jahr',
      imageUrl: SPACE_IMAGE,
      category: 'Weltraum',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'Kleopatra lebte näher am iPhone als an den Pyramiden',
      imageUrl: HISTORY_IMAGE,
      category: 'Geschichte',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: 'Der Taj Mahal ändert seine farben mit der sonne',
      imageUrl: CULTURE_IMAGE,
      category: 'Kultur',
      categoryColor: CULTURE_COLOR,
    },
  ],
  es: [
    {
      title: 'El centro de nuestra galaxia sabe a frambuesas',
      imageUrl: SCIENCE_IMAGE,
      category: 'Ciencia',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: 'Esta medusa puede vivir para siempre',
      imageUrl: NATURE_IMAGE,
      category: 'Naturaleza',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Un día en Venus es más largo que su año',
      imageUrl: SPACE_IMAGE,
      category: 'Espacio',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'Cleopatra vivió más cerca del iPhone que de las pirámides',
      imageUrl: HISTORY_IMAGE,
      category: 'Historia',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: 'El Taj Mahal cambia de color con el sol',
      imageUrl: CULTURE_IMAGE,
      category: 'Cultura',
      categoryColor: CULTURE_COLOR,
    },
  ],
  fr: [
    {
      title: 'Le centre de notre galaxie a un goût de framboise',
      imageUrl: SCIENCE_IMAGE,
      category: 'Sciences',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: 'Cette méduse peut vivre éternellement',
      imageUrl: NATURE_IMAGE,
      category: 'Nature',
      categoryColor: NATURE_COLOR,
    },
    {
      title: 'Un jour sur Vénus est plus long que son année',
      imageUrl: SPACE_IMAGE,
      category: 'Espace',
      categoryColor: SPACE_COLOR,
    },
    {
      title: "Cléopâtre a vécu plus près de l'iPhone que des pyramides",
      imageUrl: HISTORY_IMAGE,
      category: 'Histoire',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: 'Le Taj Mahal change de couleur avec le soleil',
      imageUrl: CULTURE_IMAGE,
      category: 'Culture',
      categoryColor: CULTURE_COLOR,
    },
  ],
  ja: [
    {
      title: '私たちの銀河の中心はラズベリーの味がする',
      imageUrl: SCIENCE_IMAGE,
      category: '科学',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: 'このクラゲは永遠に生きられる',
      imageUrl: NATURE_IMAGE,
      category: '自然',
      categoryColor: NATURE_COLOR,
    },
    {
      title: '金星の1日は1年より長い',
      imageUrl: SPACE_IMAGE,
      category: '宇宙',
      categoryColor: SPACE_COLOR,
    },
    {
      title: 'クレオパトラはピラミッドよりもiPhoneに近い時代に生きていた',
      imageUrl: HISTORY_IMAGE,
      category: '歴史',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: '太陽によって色を変えるタージ・マハル',
      imageUrl: CULTURE_IMAGE,
      category: '文化',
      categoryColor: CULTURE_COLOR,
    },
  ],
  ko: [
    {
      title: '우리 은하의 중심은 라즈베리 맛이 난다',
      imageUrl: SCIENCE_IMAGE,
      category: '과학',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: '이 해파리는 영원히 살 수 있습니다',
      imageUrl: NATURE_IMAGE,
      category: '자연',
      categoryColor: NATURE_COLOR,
    },
    {
      title: '금성의 하루는 1년보다 길다',
      imageUrl: SPACE_IMAGE,
      category: '우주',
      categoryColor: SPACE_COLOR,
    },
    {
      title: '클레오파트라는 피라미드보다 아이폰에 더 가까운 시대에 살았다',
      imageUrl: HISTORY_IMAGE,
      category: '역사',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: '타지마할은 태양에 따라 색이 변합니다',
      imageUrl: CULTURE_IMAGE,
      category: '문화',
      categoryColor: CULTURE_COLOR,
    },
  ],
  tr: [
    {
      title: 'Galaksimizin merkezi ahududu gibi kokuyor',
      imageUrl: SCIENCE_IMAGE,
      category: 'Bilim',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: 'Bu denizanası sonsuza dek yaşayabilir',
      imageUrl: NATURE_IMAGE,
      category: 'Doğa',
      categoryColor: NATURE_COLOR,
    },
    {
      title: "Venüs'te bir gün, bir yıldan daha uzundur",
      imageUrl: SPACE_IMAGE,
      category: 'Uzay',
      categoryColor: SPACE_COLOR,
    },
    {
      title: "Kleopatra, piramitlerden çok iPhone'a daha yakın yaşadı",
      imageUrl: HISTORY_IMAGE,
      category: 'Tarih',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: 'Tac Mahal güneşle renk değiştirir',
      imageUrl: CULTURE_IMAGE,
      category: 'Kültür',
      categoryColor: CULTURE_COLOR,
    },
  ],
  zh: [
    {
      title: '我们银河系的中心尝起来像覆盆子',
      imageUrl: SCIENCE_IMAGE,
      category: '科学',
      categoryColor: SCIENCE_COLOR,
    },
    {
      title: '这种水母可以永生',
      imageUrl: NATURE_IMAGE,
      category: '自然',
      categoryColor: NATURE_COLOR,
    },
    {
      title: '金星上的一天比一年还长',
      imageUrl: SPACE_IMAGE,
      category: '太空',
      categoryColor: SPACE_COLOR,
    },
    {
      title: '克利奥帕特拉离iPhone的时代比离金字塔更近',
      imageUrl: HISTORY_IMAGE,
      category: '历史',
      categoryColor: HISTORY_COLOR,
    },
    {
      title: '泰姬陵随太阳变色',
      imageUrl: CULTURE_IMAGE,
      category: '文化',
      categoryColor: CULTURE_COLOR,
    },
  ],
};
