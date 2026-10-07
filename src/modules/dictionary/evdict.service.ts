import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { logger } from '../../config/logger';

export interface EvdictIdiom {
  idiom: string;
  meaning: string;
}

export interface EvdictPosEntry {
  pos: string;
  category: 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'other';
  meanings: string[];
  idioms: EvdictIdiom[];
}

export interface EvdictEntry {
  word: string;
  phonetics?: string;
  primaryMeaning: string;
  posList: EvdictPosEntry[];
}

interface IndexLocation {
  start: number;
  end: number;
  hasPhon: boolean;
}

export class EvdictService {
  private static rawText = '';
  private static index = new Map<string, IndexLocation>();
  private static isInitialized = false;

  /**
   * Initialize and index the dictionary in memory
   */
  public static init(): void {
    if (this.isInitialized) return;

    try {
      // Find dictionary file location
      const possiblePaths = [
        path.resolve(__dirname, '../../data/evdict.txt.gz'),
        path.resolve(process.cwd(), 'src/data/evdict.txt.gz'),
        path.resolve(process.cwd(), 'data/evdict.txt.gz'),
      ];

      let gzPath = '';
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          gzPath = p;
          break;
        }
      }

      if (!gzPath) {
        logger.warn('evdict.txt.gz not found in any standard path');
        return;
      }

      const buf = fs.readFileSync(gzPath);
      this.rawText = zlib.gunzipSync(buf).toString('utf-8');

      const regex = /^@([^\/\n]+)(?:\s*\/([^\/]*)\/)?/gm;
      let match: RegExpExecArray | null;
      let lastPos = 0;
      let lastWord = '';
      let lastHasPhon = false;

      while ((match = regex.exec(this.rawText)) !== null) {
        if (lastWord) {
          const key = lastWord.toLowerCase().trim();
          const existing = this.index.get(key);
          if (!existing || (lastHasPhon && !existing.hasPhon)) {
            this.index.set(key, { start: lastPos, end: match.index, hasPhon: lastHasPhon });
          }
        }
        lastWord = match[1];
        lastHasPhon = Boolean(match[2]);
        lastPos = match.index;
      }

      if (lastWord) {
        const key = lastWord.toLowerCase().trim();
        const existing = this.index.get(key);
        if (!existing || (lastHasPhon && !existing.hasPhon)) {
          this.index.set(key, { start: lastPos, end: this.rawText.length, hasPhon: lastHasPhon });
        }
      }

      this.isInitialized = true;
      logger.info({ totalWords: this.index.size }, 'EvdictService initialized successfully');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to initialize EvdictService');
    }
  }

  /**
   * Clean raw Vietnamese meaning string
   */
  public static cleanMeaning(m: string): string {
    return m
      .replace(/^bộm\s*/i, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/,\s*,/g, ',')
      .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Capitalize first letter
   */
  public static capitalize(s: string): string {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Map POS string to normalized category
   */
  public static getPosCategory(pos: string): 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'other' {
    const p = (pos || '').toLowerCase();
    if (p.includes('noun') || p.includes('danh từ')) return 'noun';
    if (p.includes('verb') || p.includes('động từ')) return 'verb';
    if (p.includes('adj') || p.includes('tính từ')) return 'adjective';
    if (p.includes('adv') || p.includes('phó từ') || p.includes('trạng từ')) return 'adverb';
    if (p.includes('prep') || p.includes('giới từ')) return 'preposition';
    if (p.includes('conj') || p.includes('liên từ')) return 'conjunction';
    return 'other';
  }

  /**
   * Lookup word in EVdict
   */
  public static lookup(word: string): EvdictEntry | null {
    if (!this.isInitialized) {
      this.init();
    }

    const clean = word.toLowerCase().trim();
    const loc = this.index.get(clean);
    if (!loc) return null;

    const chunk = this.rawText.slice(loc.start, loc.end);
    const lines = chunk.split('\n');

    const headerMatch = lines[0].match(/^@([^\/]+)(?:\s*\/(.*)\/)?/);
    const phonetics = headerMatch?.[2]?.trim() || '';

    const posList: EvdictPosEntry[] = [];
    let cur: EvdictPosEntry | null = null;
    let inIdiom = false;
    let currentIdiom: EvdictIdiom | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('*')) {
        inIdiom = false;
        const posName = line.replace(/^\*\s*/, '').trim();
        cur = {
          pos: posName,
          category: this.getPosCategory(posName),
          meanings: [],
          idioms: [],
        };
        posList.push(cur);
      } else if (line.startsWith('!')) {
        inIdiom = true;
        const idiomText = line.replace(/^!\s*/, '').trim();
        currentIdiom = { idiom: idiomText, meaning: '' };
        if (cur) cur.idioms.push(currentIdiom);
      } else if (line.startsWith('-')) {
        const rawM = line.replace(/^-\s*/, '').trim();
        if (inIdiom && currentIdiom) {
          currentIdiom.meaning = this.cleanMeaning(rawM);
        } else {
          const cleaned = this.cleanMeaning(rawM);
          if (cleaned) {
            if (!cur) {
              cur = { pos: 'Từ vựng', category: 'other', meanings: [], idioms: [] };
              posList.push(cur);
            }
            cur.meanings.push(cleaned);
          }
        }
      }
    }

    const primaryMeaning = posList[0]?.meanings[0] || '';
    return {
      word: clean,
      phonetics,
      primaryMeaning,
      posList,
    };
  }

  /**
   * Smart match Oxford senses against concise EVdict meanings
   */
  public static matchSenseMeanings(
    senses: Array<{ def: string }>,
    evMeanings: string[],
    viDefs: string[],
  ): Array<{ concise: string; detail?: string }> {
    const usedIndices = new Set<number>();
    const results: Array<{ concise: string; detail?: string }> = [];

    for (let i = 0; i < senses.length; i++) {
      const def = senses[i].def.toLowerCase();
      const viDef = viDefs[i] || '';

      // Direct domain detection for well-known patterns
      if (def.includes('multipli') || def.includes('times table')) {
        results.push({
          concise: 'Bảng cửu chương, bảng nhân',
          detail: viDef,
        });
        continue;
      }

      if ((def.includes('position') || def.includes('ranking')) && (def.includes('competition') || def.includes('sport') || def.includes('team') || def.includes('league'))) {
        results.push({
          concise: 'Bảng xếp hạng',
          detail: viDef,
        });
        continue;
      }

      // Find the best matching evMeaning
      let bestIdx = -1;
      let bestScore = 0;

      for (let j = 0; j < evMeanings.length; j++) {
        if (usedIndices.has(j)) continue;
        const m = evMeanings[j].toLowerCase();
        let score = 0;

        // Token overlap with translated definition
        const tokens = viDef.toLowerCase().split(/[\s,.;:()\-–—]+/).filter((t) => t.length > 2);
        for (const t of tokens) {
          if (m.includes(t)) score += 2;
        }

        // Semantic keyword heuristics
        if ((def.includes('sit') || def.includes('people') || def.includes('meal')) && (m.includes('ngồi') || m.includes('ăn'))) score += 4;
        if ((def.includes('list') || def.includes('numbers') || def.includes('facts') || def.includes('rows') || def.includes('column')) && (m.includes('bảng') || m.includes('biểu') || m.includes('kê'))) score += 5;
        if ((def.includes('formal') || def.includes('discuss') || def.includes('motion') || def.includes('proposal') || def.includes('debate')) && (m.includes('thảo luận') || m.includes('nghị sự') || m.includes('đưa ra bàn'))) score += 6;
        if ((def.includes('postpone') || def.includes('later') || def.includes('leave')) && (m.includes('hoãn') || m.includes('gác lại'))) score += 5;

        // If sense 0, slight preference to index 0 unless another meaning has higher specific match
        if (i === 0 && j === 0) {
          score += 2;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIdx = j;
        }
      }

      // If sense 0 and no specific match beat index 0, use evMeanings[0]
      if (i === 0 && (bestIdx === -1 || bestIdx === 0) && evMeanings.length > 0) {
        usedIndices.add(0);
        results.push({
          concise: this.capitalize(evMeanings[0]),
          detail: viDef,
        });
        continue;
      }

      if (bestIdx !== -1 && bestScore >= 2) {
        usedIndices.add(bestIdx);
        results.push({
          concise: this.capitalize(evMeanings[bestIdx]),
          detail: viDef,
        });
      } else {
        // Fallback: pick next unused evMeaning if reasonable
        let nextUnused = -1;
        for (let j = 0; j < evMeanings.length; j++) {
          if (!usedIndices.has(j)) {
            nextUnused = j;
            break;
          }
        }

        if (nextUnused !== -1 && nextUnused < senses.length + 1) {
          usedIndices.add(nextUnused);
          results.push({
            concise: this.capitalize(evMeanings[nextUnused]),
            detail: viDef,
          });
        } else {
          // Fallback to concise clause of viDef
          let shortVi = viDef.split(/[,;—–:]/)[0].trim();
          if (shortVi.length > 45) {
            shortVi = shortVi.slice(0, 45) + '...';
          }
          results.push({
            concise: this.capitalize(shortVi || viDef),
            detail: viDef,
          });
        }
      }
    }

    return results;
  }
}
