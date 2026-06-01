export abstract class BaseAdapter {
  protected enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Инициализация и запуск прослушивания событий канала.
   */
  public abstract start(app?: any): void | Promise<void>;

  /**
   * Остановка адаптера и закрытие соединений.
   */
  public abstract stop(): void | Promise<void>;

  public isEnabled(): boolean {
    return this.enabled;
  }
}
