/**
 * Авто-эскалация диалога к администратору (Pass 5).
 * Чистая функция без побочных эффектов: по тексту гостя и ответу ИИ решает,
 * нужен ли человек, и возвращает короткий reason-код.
 *
 * Эскалация НЕ глушит ИИ — это только пометка needs_attention. ИИ продолжает
 * отвечать осторожно, пока администратор не нажмёт «Взять на себя».
 */

export type EscalationReason =
  | 'guest_requested'
  | 'discount'
  | 'complaint'
  | 'admin_decision'
  | 'low_confidence'
  | 'no_kb';

export interface EscalationResult {
  needsAttention: boolean;
  reason?: EscalationReason;
}

export interface EscalationAiSignal {
  confidence?: string;
  provider?: string;
}

// Ключевые слова/фразы по категориям. Порядок массива = приоритет (раньше = важнее).
// Намеренно НЕ включено одиночное «человек/человека», чтобы не эскалировать обычные
// брони с числом гостей («на двоих человек»). Явный запрос человека ловится по
// глаголам (позовите/соедините/свяжите) и фразам «живой человек», «с человеком».
const RULES: Array<{ reason: EscalationReason; keywords: string[] }> = [
  {
    reason: 'guest_requested',
    keywords: [
      'администратор', 'менеджер', 'оператор',
      'живой человек', 'с человеком', 'хочу с человеком',
      'позовите', 'соедините', 'свяжите',
    ],
  },
  {
    reason: 'complaint',
    keywords: [
      'жалоба', 'недоволен', 'недовольна', 'ужасно', 'плохо',
      'обман', 'верните деньги', 'возврат', 'претензия', 'разберитесь',
    ],
  },
  {
    reason: 'admin_decision',
    keywords: [
      'ранний заезд', 'поздний выезд', 'изменить бронь', 'отменить бронь',
      'перенести даты', 'возврат оплаты', 'подтвердите бронь', 'договор', 'оплата',
    ],
  },
  {
    reason: 'discount',
    keywords: [
      'скидка', 'скидку', 'дешевле', 'дорого', 'акция', 'промокод', 'торг', 'можно дешевле',
    ],
  },
];

export function detectEscalation(message: string, aiReply?: EscalationAiSignal): EscalationResult {
  const text = (message || '').toLowerCase();

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return { needsAttention: true, reason: rule.reason };
    }
  }

  // Сигналы от ИИ: нет данных в базе знаний (системный fallback) или низкая уверенность.
  if (aiReply?.provider === 'system-fallback') {
    return { needsAttention: true, reason: 'no_kb' };
  }
  if (aiReply?.confidence === 'low') {
    return { needsAttention: true, reason: 'low_confidence' };
  }

  return { needsAttention: false };
}
