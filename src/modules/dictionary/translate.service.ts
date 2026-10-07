import { ApiResponse, ApiPartOfSpeech, OxfordRawEntry } from './dictionary.types';
import { EvdictService } from './evdict.service';

const POS_MAP: Record<string, string> = {
  noun: 'Danh từ',
  verb: 'Động từ',
  adjective: 'Tính từ',
  adverb: 'Phó từ',
  preposition: 'Giới từ',
  conjunction: 'Liên từ',
  pronoun: 'Đại từ',
  interjection: 'Thán từ',
  idiom: 'Thành ngữ',
  phrase: 'Cụm từ',
};

export class TranslateService {
  /**
   * Translate English text to Vietnamese using Google Translate
   */
  static async translateToVi(text: string): Promise<string> {
    if (!text || !text.trim()) return '';
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text.trim())}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) return text;
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        return data[0].map((item: any) => item[0]).join('');
      }
      return text;
    } catch {
      return text;
    }
  }

  /**
   * Translate a batch of texts concurrently
   */
  static async translateBatch(texts: string[]): Promise<string[]> {
    return Promise.all(texts.map((t) => this.translateToVi(t)));
  }

  /**
   * Map English part of speech to Vietnamese
   */
  static formatPosVi(pos: string): string {
    const lower = (pos || '').toLowerCase().trim();
    for (const [key, val] of Object.entries(POS_MAP)) {
      if (lower.includes(key)) return val;
    }
    return pos || 'Từ vựng';
  }

  /**
   * Transform raw Oxford entries into ApiResponse format with concise, clear Vietnamese translations
   */
  static async transformToApiResponse(entries: OxfordRawEntry[]): Promise<ApiResponse> {
    const primary = entries[0];
    const enEnParts: ApiPartOfSpeech[] = [];
    const enViParts: ApiPartOfSpeech[] = [];

    // Lookup word in concise EVdict
    const evEntry = EvdictService.lookup(primary.headword);

    // Determine concise primary meaning for headword
    let primaryMeaning = evEntry?.primaryMeaning || '';
    if (!primaryMeaning) {
      primaryMeaning = await this.translateToVi(primary.headword);
    }
    primaryMeaning = EvdictService.capitalize(primaryMeaning);

    const allSimilarTerms: string[] = [];
    for (const entry of entries) {
      for (const term of entry.similarTerms) {
        if (!allSimilarTerms.includes(term) && allSimilarTerms.length < 10) {
          allSimilarTerms.push(term);
        }
      }
    }

    // Add idioms from EVdict if available
    if (evEntry) {
      for (const p of evEntry.posList) {
        for (const idiomItem of p.idioms || []) {
          const displayIdiom = idiomItem.meaning
            ? `${idiomItem.idiom} (${idiomItem.meaning})`
            : idiomItem.idiom;
          if (!allSimilarTerms.includes(displayIdiom) && allSimilarTerms.length < 12) {
            allSimilarTerms.push(displayIdiom);
          }
        }
      }
    }

    for (const entry of entries) {
      // 1. English - English part of speech
      enEnParts.push({
        pos: entry.pos || 'word',
        definitions: entry.senses.map((s) => ({
          def: s.def,
          examples: s.examples,
        })),
      });

      // 2. English - Vietnamese part of speech
      const posCat = EvdictService.getPosCategory(entry.pos);
      const evPos = evEntry?.posList.find((p) => p.category === posCat) || evEntry?.posList[0];
      const evMeanings = evPos ? [...evPos.meanings] : [];

      // Translate all definitions in parallel
      const defTranslations = await this.translateBatch(entry.senses.map((s) => s.def));

      // Match senses to concise everyday Vietnamese meanings
      const matchedSenses = EvdictService.matchSenseMeanings(entry.senses, evMeanings, defTranslations);

      // Translate all examples in parallel
      const allExamples = entry.senses.flatMap((s) => s.examples);
      const exTranslations = await this.translateBatch(allExamples);

      let exIndex = 0;
      const viSenses = entry.senses.map((s, idx) => {
        const m = matchedSenses[idx];
        const conciseMeaning = m?.concise || defTranslations[idx] || s.def;
        const detail =
          m?.detail && m.detail.toLowerCase() !== conciseMeaning.toLowerCase()
            ? m.detail
            : undefined;

        const examples = s.examples.map((en) => {
          const vn = exTranslations[exIndex++] || '';
          return { en, vn };
        });

        return {
          vn_meaning: conciseMeaning,
          def_detail: detail,
          examples,
        };
      });

      enViParts.push({
        pos: this.formatPosVi(entry.pos),
        senses: viSenses,
      });
    }

    return {
      tabs: {
        en_en: {
          similar_terms: allSimilarTerms,
          part_of_speech: enEnParts,
        },
        en_vi: {
          similar_terms: allSimilarTerms,
          part_of_speech: enViParts,
        },
        synonyms: {
          noun: [],
          verb: [],
          adjective: [],
          adverb: [],
        },
      },
      entry: {
        word: primary.headword,
        primary_meaning: primaryMeaning,
        phonetics: {
          en_en: primary.phonAm || primary.phonBr,
          en_vi: primary.phonBr || primary.phonAm,
        },
        audio_endpoints: {
          uk: primary.audioUk,
          us: primary.audioUs,
        },
      },
      source: "Oxford Learner's Dictionaries",
    };
  }
}
