export class LeadExtractor {
  public static isPotentialLead(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    const leadKeywords = [
      'свободны', 'свободен', 'свободно',
      'цена', 'стоимость', 'сколько стоит', 'почем',
      'забронировать', 'бронь', 'бронирование',
      'номер на', 'хотим номер', 'места', 'есть места',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', // dates
      'человек', 'двоих', 'троих',
      'вид на море', 'стандарт',
      'позвоните', 'свяжитесь', 'контакт'
    ];

    for (const keyword of leadKeywords) {
      if (lowerMessage.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  public static generateSummary(message: string): string {
    return `Потенциальный лид: гость спрашивает: "${message}"`;
  }
}
