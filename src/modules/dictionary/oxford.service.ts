import * as cheerio from 'cheerio';
import { OxfordRawEntry, OxfordRawSense } from './dictionary.types';
import { logger } from '../../config/logger';

const OXFORD_BASE_URL = 'https://www.oxfordlearnersdictionaries.com/definition/english';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

export class OxfordService {
  /**
   * Scrape word details from Oxford Learner's Dictionaries
   */
  static async fetchFromOxford(word: string): Promise<OxfordRawEntry[] | null> {
    const cleanWord = word.trim().toLowerCase();
    const slug = cleanWord.replace(/\s+/g, '-');
    let url = `${OXFORD_BASE_URL}/${encodeURIComponent(slug)}`;

    try {
      let res = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
      });

      if (res.status === 404 && slug !== cleanWord) {
        url = `${OXFORD_BASE_URL}/${encodeURIComponent(cleanWord)}`;
        res = await fetch(url, {
          headers: HEADERS,
          redirect: 'follow',
        });
      }

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        logger.warn({ status: res.status, word: cleanWord }, 'Oxford request failed with non-200 status');
        return null;
      }

      const html = await res.text();
      const primaryEntry = this.parseHtml(html, cleanWord);

      if (!primaryEntry) {
        return null;
      }

      const entries: OxfordRawEntry[] = [primaryEntry];

      // If the URL was redirected to e.g. /run_1 or /love_1, check if _2 exists to get additional POS
      const finalUrl = res.url || '';
      if (finalUrl.includes(`${cleanWord}_1`)) {
        try {
          const secondUrl = `${OXFORD_BASE_URL}/${encodeURIComponent(cleanWord)}_2`;
          const secondRes = await fetch(secondUrl, {
            headers: HEADERS,
            redirect: 'follow',
          });

          if (secondRes.ok) {
            const secondHtml = await secondRes.text();
            const secondEntry = this.parseHtml(secondHtml, cleanWord);
            if (secondEntry && secondEntry.pos !== primaryEntry.pos) {
              entries.push(secondEntry);
            }
          }
        } catch {
          // ignore secondary fetch failure
        }
      }

      return entries;
    } catch (err: any) {
      logger.error({ err: err.message, word: cleanWord }, 'Error scraping Oxford dictionary');
      throw new Error('DICTIONARY_LOOKUP_FAILED');
    }
  }

  /**
   * Parse Oxford HTML into OxfordRawEntry
   */
  private static parseHtml(html: string, fallbackWord: string): OxfordRawEntry | null {
    const $ = cheerio.load(html);

    const headword = $('h1.headword').first().text().trim() || fallbackWord;
    const pos = $('.webtop .pos').first().text().trim() || '';

    if (!headword && !pos) {
      return null;
    }

    // Phonetics: UK (BrE) and US (NAmE)
    const phonBr = $('.phons_br .phon').first().text().trim();
    const phonAm = $('.phons_n_am .phon').first().text().trim();

    // Audio MP3 endpoints
    const audioUk = $('.phons_br [data-src-mp3]').first().attr('data-src-mp3');
    const audioUs = $('.phons_n_am [data-src-mp3]').first().attr('data-src-mp3');

    // Senses and definitions
    const senses: OxfordRawSense[] = [];
    $('ol.senses_multiple > li.sense, ol.sense_single > li.sense, li.sense').each((_i, el) => {
      if (senses.length >= 5) return; // Limit to 5 senses per entry for performance
      const $sense = $(el);
      const def = $sense.find('.def').first().text().trim();
      if (!def) return;

      const examples: string[] = [];
      $sense.find('ul.examples li').each((_j, exEl) => {
        if (examples.length >= 2) return; // Limit to 2 examples per sense
        const $ex = $(exEl);
        const exText = $ex.find('.x').text().trim() || $ex.text().trim();
        if (exText) {
          examples.push(exText);
        }
      });

      senses.push({
        def,
        examples,
      });
    });

    // Similar / nearby terms
    const similarTerms: string[] = [];
    $('.nearby li a, #relatedentries li a').each((_i, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (
        text &&
        text.toLowerCase() !== headword.toLowerCase() &&
        !similarTerms.includes(text) &&
        similarTerms.length < 8
      ) {
        similarTerms.push(text);
      }
    });

    return {
      headword,
      pos,
      phonBr: phonBr || undefined,
      phonAm: phonAm || undefined,
      audioUk: audioUk || undefined,
      audioUs: audioUs || undefined,
      senses,
      similarTerms,
    };
  }

  /**
   * Fetch word autocomplete suggestions from Oxford Learner's Dictionary
   * with Datamuse API fallback
   */
  static async getAutocomplete(query: string): Promise<string[]> {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [];

    try {
      const url = `https://www.oxfordlearnersdictionaries.com/autocomplete/english/?q=${encodeURIComponent(cleanQuery)}`;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          const words = data.results
            .map((r: any) => r.searchtext?.trim())
            .filter((w: string) => Boolean(w) && !w.includes('...'));
          if (words.length > 0) {
            return words.slice(0, 10);
          }
        }
      }
    } catch (err: any) {
      logger.warn({ query: cleanQuery, err: err.message }, 'Oxford autocomplete failed, trying Datamuse fallback');
    }

    // Fallback to Datamuse
    try {
      const fallbackUrl = `https://api.datamuse.com/sug?s=${encodeURIComponent(cleanQuery)}&max=8`;
      const res = await fetch(fallbackUrl, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((item: any) => item.word?.trim()).filter(Boolean);
        }
      }
    } catch {
      // ignore
    }

    return [];
  }
}

