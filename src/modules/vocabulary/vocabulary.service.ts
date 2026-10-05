import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';

export interface CreateVocabularyInput {
  word: string;
  meaning: string;
  phonetics?: string;
  audioUrl?: string;
}

export interface UpdateVocabularyInput {
  word?: string;
  meaning?: string;
  phonetics?: string;
  audioUrl?: string;
  level?: number;
}

const SPACED_REPETITION_INTERVALS: Record<number, number> = {
  1: 1, // 1 ngày
  2: 2, // 2 ngày
  3: 5, // 5 ngày
  4: 9, // 9 ngày
  5: 15, // 15 ngày
};

const LEVEL_THRESHOLDS = {
  UP: { 1: 2, 2: 3, 3: 4, 4: 5 } as Record<number, number>,
  DOWN: { 2: 2, 3: 2, 4: 2, 5: 2 } as Record<number, number>,
};

function calculateNextReview(level: number): Date {
  const days = SPACED_REPETITION_INTERVALS[level] || 1;
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
}

export class VocabularyService {
  /**
   * Lấy danh sách từ vựng của người dùng
   * Nếu người dùng chưa có từ nào, tự động sync từ các từ thật đã có trong dictionary_word
   */
  static async getWords(userId: string = 'default_user') {
    let words = await prisma.userVocabulary.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Nếu kho từ rỗng, tự động lấy các từ thật đã tra cứu trong dictionary_word
    if (words.length === 0) {
      const dictWords = await prisma.dictionaryWord.findMany({
        take: 20,
        orderBy: { updatedAt: 'desc' },
      });

      if (dictWords.length > 0) {
        logger.info({ count: dictWords.length }, 'Seeding UserVocabulary from existing dictionary_word');
        for (const dw of dictWords) {
          try {
            const data: any = dw.data;
            const viMeaning = data?.tabs?.en_vi?.part_of_speech?.[0]?.senses?.[0]?.vn_meaning
              || data?.tabs?.en_en?.part_of_speech?.[0]?.definitions?.[0]?.def
              || dw.word;

            await prisma.userVocabulary.create({
              data: {
                userId,
                word: dw.word,
                meaning: viMeaning,
                phonetics: dw.phoneticUs || dw.phoneticUk,
                audioUrl: dw.audioUs || dw.audioUk,
                level: 1,
                nextReview: new Date(Date.now() - 1000), // sẵn sàng ôn tập
              },
            });
          } catch {
            // ignore duplicate
          }
        }

        words = await prisma.userVocabulary.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    return words;
  }

  /**
   * Thêm từ mới vào kho từ vựng cá nhân
   */
  static async addWord(input: CreateVocabularyInput, userId: string = 'default_user') {
    const cleanWord = input.word.trim().toLowerCase();

    // Check xem từ đã có trong kho từ của user chưa
    const existing = await prisma.userVocabulary.findFirst({
      where: {
        userId,
        word: cleanWord,
      },
    });

    if (existing) {
      return existing;
    }

    return prisma.userVocabulary.create({
      data: {
        userId,
        word: cleanWord,
        meaning: input.meaning.trim(),
        phonetics: input.phonetics?.trim(),
        audioUrl: input.audioUrl?.trim(),
        level: 1,
        nextReview: new Date(Date.now() - 1000), // Sẵn sàng ôn tập ngay
      },
    });
  }

  /**
   * Cập nhật thông tin từ vựng
   */
  static async updateWord(id: string, updates: UpdateVocabularyInput, userId: string = 'default_user') {
    return prisma.userVocabulary.updateMany({
      where: { id, userId },
      data: {
        ...(updates.word && { word: updates.word.trim().toLowerCase() }),
        ...(updates.meaning && { meaning: updates.meaning.trim() }),
        ...(updates.phonetics && { phonetics: updates.phonetics.trim() }),
        ...(updates.audioUrl && { audioUrl: updates.audioUrl.trim() }),
        ...(updates.level !== undefined && { level: updates.level }),
      },
    });
  }

  /**
   * Xóa từ khỏi kho từ vựng
   */
  static async deleteWord(id: string, userId: string = 'default_user') {
    return prisma.userVocabulary.deleteMany({
      where: { id, userId },
    });
  }

  /**
   * Đánh dấu ôn tập (Đúng / Sai) theo thuật toán Leitner Spaced Repetition
   */
  static async markLearned(id: string, isCorrect: boolean, userId: string = 'default_user') {
    const word = await prisma.userVocabulary.findFirst({
      where: { id, userId },
    });

    if (!word) {
      throw new Error('WORD_NOT_FOUND');
    }

    let newLevel = word.level;
    let newConsecutiveCorrect = isCorrect ? word.consecutiveCorrect + 1 : 0;
    let newConsecutiveWrong = !isCorrect ? word.consecutiveWrong + 1 : 0;

    if (isCorrect) {
      // Khi trả lời đúng: Thăng cấp ngay lên Level tiếp theo (Tối đa Level 5)
      newLevel = Math.min(5, word.level + 1);
    } else {
      // Khi trả lời sai: Hạ 1 cấp độ (Tối thiểu Level 1)
      newLevel = Math.max(1, word.level - 1);
    }

    const nextReview = isCorrect ? calculateNextReview(newLevel) : calculateNextReview(1);

    return prisma.userVocabulary.update({
      where: { id },
      data: {
        level: newLevel,
        correctCount: isCorrect ? word.correctCount + 1 : word.correctCount,
        totalAttempts: word.totalAttempts + 1,
        consecutiveCorrect: newConsecutiveCorrect,
        consecutiveWrong: newConsecutiveWrong,
        nextReview,
        lastStudied: new Date(),
      },
    });
  }
}
