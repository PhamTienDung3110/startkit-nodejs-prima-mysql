import { prisma } from '../../db/prisma';
import { OxfordService } from './oxford.service';
import { TranslateService } from './translate.service';
import { ApiResponse, DictionarySuggestion } from './dictionary.types';
import { logger } from '../../config/logger';

export class DictionaryService {
  /**
   * Lookup a word:
   * 1. Check if word exists in database (Cache hit)
   * 2. If not, scrape Oxford Learner's Dictionary
   * 3. Translate to Vietnamese (definitions & examples)
   * 4. Save to database for subsequent lookups
   * 5. Return structured ApiResponse
   */
  static async lookup(rawWord: string): Promise<ApiResponse> {
    const word = rawWord.trim().toLowerCase();
    if (!word) {
      throw new Error('INVALID_INPUT');
    }

    // 1. Check Database
    const existing = await prisma.dictionaryWord.findUnique({
      where: { word },
    });

    if (existing) {
      logger.info({ word }, 'Dictionary cache hit from database');
      const cachedData = existing.data as unknown as ApiResponse;
      return {
        ...cachedData,
        fromCache: true,
      };
    }

    // 2. Fetch from Oxford Learner's Dictionaries
    logger.info({ word }, 'Dictionary cache miss. Fetching from Oxford...');
    const oxfordEntries = await OxfordService.fetchFromOxford(word);

    if (!oxfordEntries || oxfordEntries.length === 0) {
      throw new Error('WORD_NOT_FOUND');
    }

    // 3. Translate definitions and examples to Vietnamese
    const apiResponse = await TranslateService.transformToApiResponse(oxfordEntries);

    // 4. Save to Database
    try {
      await prisma.dictionaryWord.create({
        data: {
          word,
          phoneticUk: apiResponse.entry.phonetics.en_vi,
          phoneticUs: apiResponse.entry.phonetics.en_en,
          audioUk: apiResponse.entry.audio_endpoints?.uk,
          audioUs: apiResponse.entry.audio_endpoints?.us,
          data: apiResponse as any,
          source: "Oxford Learner's Dictionaries",
        },
      });
      logger.info({ word }, 'Saved new word to database dictionary');
    } catch (saveError: any) {
      // If concurrent request inserted already, ignore duplicate key error
      logger.warn({ word, err: saveError.message }, 'Could not save word to DB (might be duplicate)');
    }

    return {
      ...apiResponse,
      fromCache: false,
    };
  }

  /**
   * Get suggestions combining Database + Oxford Autocomplete
   */
  static async getSuggestions(query: string): Promise<DictionarySuggestion[]> {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      // Return top 8 recent words from DB
      const recents = await prisma.dictionaryWord.findMany({
        take: 8,
        orderBy: { updatedAt: 'desc' },
      });
      return recents.map((item: any) => {
        const data = item.data as unknown as ApiResponse;
        return {
          word: item.word,
          inDb: true,
          pos: data.tabs?.en_vi?.part_of_speech?.[0]?.pos,
          meaning: data.tabs?.en_vi?.part_of_speech?.[0]?.senses?.[0]?.vn_meaning,
          phonetics: item.phoneticUk || item.phoneticUs,
          fullData: data,
        };
      });
    }

    // 1. Search Database matches
    const dbMatches = await prisma.dictionaryWord.findMany({
      where: {
        word: {
          contains: cleanQuery,
        },
      },
      take: 6,
      orderBy: { word: 'asc' },
    });

    const suggestions: DictionarySuggestion[] = dbMatches.map((item: any) => {
      const data = item.data as unknown as ApiResponse;
      return {
        word: item.word,
        inDb: true,
        pos: data.tabs?.en_vi?.part_of_speech?.[0]?.pos,
        meaning: data.tabs?.en_vi?.part_of_speech?.[0]?.senses?.[0]?.vn_meaning,
        phonetics: item.phoneticUk || item.phoneticUs,
        fullData: data,
      };
    });

    const existingWordSet = new Set(suggestions.map((s) => s.word.toLowerCase()));

    // 2. Fetch external Oxford autocomplete (with Datamuse fallback)
    try {
      const externalWords = await OxfordService.getAutocomplete(cleanQuery);
      for (const extWord of externalWords) {
        const lower = extWord.toLowerCase();
        if (!existingWordSet.has(lower) && suggestions.length < 10) {
          existingWordSet.add(lower);
          suggestions.push({
            word: extWord,
            inDb: false,
          });
        }
      }
    } catch (err: any) {
      logger.warn({ query: cleanQuery, err: err.message }, 'Failed to fetch external suggestions');
    }

    return suggestions;
  }

  /**
   * Get popular / recently searched words from DB
   */
  static async getPopularWords(): Promise<string[]> {
    const words = await prisma.dictionaryWord.findMany({
      take: 8,
      orderBy: { updatedAt: 'desc' },
      select: { word: true },
    });

    if (words.length > 0) {
      return words.map((w: any) => w.word);
    }

    return ['resilient', 'follow', 'beautiful', 'important', 'technology', 'success'];
  }
}
