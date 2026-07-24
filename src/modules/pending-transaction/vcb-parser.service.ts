import { TransactionType } from '@prisma/client';

export interface ParsedVCBTransaction {
  amount: number;
  type: TransactionType;
  accountNumber?: string;
  beneficiaryName?: string;
  beneficiaryAccount?: string;
  note: string;
  balance?: number;
  transactionDate: Date;
  bankName: string;
  rawText: string;
}

export class VCBParser {
  public static parse(text: string): ParsedVCBTransaction | null {
    if (!text || typeof text !== 'string') return null;

    // Strip HTML tags if HTML format is passed
    const cleanText = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<td[^>]*>/gi, '\t')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ');

    const normalizedText = cleanText.replace(/\r\n/g, '\n').replace(/\*/g, '');
    const lowers = normalizedText.toLowerCase();

    // Check if email is from Vietcombank (contains vietcombank, vcb, or receipt keywords)
    const isVCB = lowers.includes('vietcombank') ||
      lowers.includes('vcb') ||
      lowers.includes('vcbnews') ||
      lowers.includes('biên lai chuyển tiền') ||
      lowers.includes('payment receipt');

    if (!isVCB) {
      return null;
    }

    // 1. Determine Transaction Type (income vs expense)
    let type: TransactionType = 'expense'; // Default for payment receipts

    const isIncome = lowers.includes('biên lai nhận tiền') ||
      lowers.includes('cộng tiền') ||
      lowers.includes('nhận được') ||
      lowers.includes('tiền vào') ||
      lowers.includes('nộp tiền');

    const isExpense = lowers.includes('biên lai chuyển tiền') ||
      lowers.includes('chuyển tiền qua tài khoản') ||
      lowers.includes('tài khoản nguồn') ||
      lowers.includes('debit account') ||
      lowers.includes('thanh toán') ||
      lowers.includes('trừ tiền');

    if (isIncome && !isExpense) {
      type = 'income';
    } else if (isExpense) {
      type = 'expense';
    }

    // Check sign in text if explicitly + or -
    if (normalizedText.includes('+') && !normalizedText.includes('-')) {
      type = 'income';
    } else if (normalizedText.includes('-') && !normalizedText.includes('+')) {
      type = 'expense';
    }

    // 2. Extract Amount
    let amount = 0;
    const amountMatch = normalizedText.match(/(số tiền|amount)[^\d\+\-]*([\+\-])?\s*([\d\.,]+)\s*(VND|đ|D|vnd)/i) ||
      normalizedText.match(/([\+\-])\s*([\d\.,]+)\s*(VND|đ|D|vnd)/i) ||
      normalizedText.match(/([\d\.,]{4,})\s*(VND|đ|D|vnd)/i);

    if (amountMatch) {
      const numGroup = amountMatch.find(g => g && /^[\d\.,]{4,}$/.test(g.trim()));
      if (numGroup) {
        const cleanNumStr = numGroup.trim().replace(/,/g, '').replace(/\.(?=\d{3})/g, '');
        const parsedNum = parseFloat(cleanNumStr);
        if (!isNaN(parsedNum)) amount = Math.abs(parsedNum);
      }
    }

    // 3. Extract Account Number (Debit Account / Tài khoản nguồn)
    let accountNumber: string | undefined;
    const accountMatch = normalizedText.match(/(debit account|tài khoản nguồn|tài khoản|tai khoan|tk|sd tk)\s*[\t:\s]*(\d{6,15})/i);
    if (accountMatch) {
      accountNumber = accountMatch[2];
    }

    // 4. Extract Beneficiary Name & Beneficiary Account (Tên người hưởng / Tài khoản người hưởng)
    let beneficiaryName: string | undefined;
    let beneficiaryAccount: string | undefined;

    const benNameMatch = normalizedText.match(/(?:tên người hưởng\n?)?beneficiary name[\t:\s]+([^\n\r]+)/i) ||
      normalizedText.match(/tên người hưởng[\t:\s]+([^\n\r]+)/i);

    if (benNameMatch && benNameMatch[1].trim()) {
      beneficiaryName = benNameMatch[1].replace(/beneficiary name\t?/i, '').trim();
    }

    const benAccMatch = normalizedText.match(/(?:tài khoản người hưởng\n?)?credit account[\t:\s]+(\d{6,15})/i) ||
      normalizedText.match(/tài khoản người hưởng[\t:\s]+(\d{6,15})/i);

    if (benAccMatch) {
      beneficiaryAccount = benAccMatch[1];
    }

    // 5. Extract Note / Details of Payment
    let noteContent = '';
    const detailsMatch = normalizedText.match(/(?:nội dung chuyển tiền\n?)?details of payment[\t:\s]+([^\n\r]+)/i) ||
      normalizedText.match(/nội dung chuyển tiền[\t:\s]+([^\n\r]+)/i) ||
      normalizedText.match(/(?:nội dung|noi dung|nd)\s*[\t:\s]+([^\n\r]+)/i);

    if (detailsMatch && detailsMatch[1].trim()) {
      noteContent = detailsMatch[1].replace(/details of payment\t?/i, '').trim();
    }

    const note = noteContent ? noteContent : 'Giao dịch Vietcombank';

    // 6. Extract Balance after transaction (if present)
    let balance: number | undefined;
    const balanceMatch = normalizedText.match(/(số dư|so du|sd)\s*[\t:\s]*([\d\.,]+)\s*(VND|đ|D|vnd)/i);
    if (balanceMatch) {
      const cleanBalStr = balanceMatch[2].replace(/,/g, '').replace(/\.(?=\d{3})/g, '');
      const parsedBal = parseFloat(cleanBalStr);
      if (!isNaN(parsedBal)) balance = parsedBal;
    }

    // 7. Extract Transaction Date & Time
    let transactionDate = new Date();

    const dateMatch = normalizedText.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s+(?:thứ\s+\d+|chủ\ nhật)?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
      normalizedText.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/i) ||
      normalizedText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);

    if (dateMatch) {
      let timeStr = '00:00:00';
      let dateStr = '';

      if (dateMatch[1].includes('/')) {
        dateStr = dateMatch[1];
        timeStr = dateMatch[2] || '00:00:00';
      } else if (dateMatch[2]?.includes('/')) {
        timeStr = dateMatch[1];
        dateStr = dateMatch[2];
      } else {
        dateStr = dateMatch[1];
      }

      const [d, m, y] = dateStr.split('/').map(Number);
      const timeParts = timeStr.split(':').map(Number);
      const parsedDate = new Date(y, m - 1, d, timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);

      if (!isNaN(parsedDate.getTime())) {
        transactionDate = parsedDate;
      }
    }

    return {
      amount: amount || 0,
      type,
      accountNumber,
      beneficiaryName,
      beneficiaryAccount,
      note,
      balance,
      transactionDate,
      bankName: 'Vietcombank',
      rawText: normalizedText
    };
  }
}
