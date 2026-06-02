export class LeadExtractor {
  public static isPotentialLead(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    const leadKeywords = [
      'цена', 'стоимость', 'сколько стоит', 'почем',
      'забронировать', 'бронь', 'бронирование',
      'номер на', 'хотим номер', 'есть места',
      'человек', 'двоих', 'троих',
      'вид на море', 'стандарт',
      'позвоните', 'свяжитесь'
    ];

    for (const keyword of leadKeywords) {
      if (lowerMessage.includes(keyword)) {
        return true;
      }
    }

    // RegEx для дат: "15 июля", "с 10 по 12 августа"
    if (/(?:с\s+)?\d{1,2}\s*(?:по\s+\d{1,2}\s*)?(янв|фев|мар|апр|ма[яй]|июн|июл|авг|сен|окт|ноя|дек)/i.test(lowerMessage)) {
      // Если есть дата, проверяем, связан ли вопрос с размещением
      if (/(номер|свободн|мест|прие|останов|заезд)/i.test(lowerMessage)) {
        return true;
      }
    }

    // RegEx для количества гостей: "нас двое", "2 взрослых"
    if (/(нас\s+(двое|трое|четверо)|\d\s*(взросл|человек|гост))/i.test(lowerMessage)) {
      return true;
    }

    return false;
  }

  public static generateSummary(message: string): string {
    return `Потенциальный лид: гость спрашивает: "${message}"`;
  }
}
