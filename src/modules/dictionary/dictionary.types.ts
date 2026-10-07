/**
 * Types for Dictionary / Vocabulary
 * Structured to match ApiResponse format expected by Frontend
 */

export interface ApiDefinition {
  def: string;
  examples?: string[];
}

export interface ApiViExample {
  en: string;
  vn: string;
}

export interface ApiViSense {
  vn_meaning: string;
  def_detail?: string;
  examples: ApiViExample[];
}

export interface ApiPartOfSpeech {
  pos: string;
  notes?: string[];
  inflection?: string;
  definitions?: ApiDefinition[];
  senses?: ApiViSense[];
}

export interface ApiResponse {
  tabs: {
    en_en: {
      similar_terms: string[];
      part_of_speech: ApiPartOfSpeech[];
    };
    en_vi: {
      similar_terms: string[];
      part_of_speech: ApiPartOfSpeech[];
    };
    synonyms: {
      noun: string[];
      verb?: string[];
      adjective: string[];
      adverb?: string[];
    };
  };
  entry: {
    word: string;
    primary_meaning?: string;
    phonetics: {
      en_en?: string;
      en_vi?: string;
    };
    audio_endpoints?: {
      uk?: string;
      us?: string;
    };
  };
  source: string;
  fromCache?: boolean;
}

export interface OxfordRawSense {
  def: string;
  examples: string[];
}

export interface OxfordRawEntry {
  headword: string;
  pos: string;
  phonBr?: string;
  phonAm?: string;
  audioUk?: string;
  audioUs?: string;
  senses: OxfordRawSense[];
  similarTerms: string[];
}

export interface DictionarySuggestion {
  word: string;
  inDb: boolean;
  pos?: string;
  meaning?: string;
  phonetics?: string;
  fullData?: ApiResponse;
}
