import { BaseAdapter } from './baseAdapter';
import { TelegramAdapter } from './telegramAdapter';
import { VkAdapter } from './vkAdapter';
import { WebchatAdapter } from './webchatAdapter';

class AdapterManager {
  private adapters: BaseAdapter[] = [];
  private telegram: TelegramAdapter;
  private vk: VkAdapter;

  constructor() {
    this.telegram = new TelegramAdapter();
    this.vk = new VkAdapter();
    this.adapters = [
      this.telegram,
      this.vk,
      new WebchatAdapter(),
    ];
  }

  /** Доступ к запущенному Telegram-адаптеру (для ручного ответа через Operator API). */
  public getTelegramAdapter(): TelegramAdapter {
    return this.telegram;
  }

  /** Доступ к VK-адаптеру (для ручного ответа через Operator API). */
  public getVkAdapter(): VkAdapter {
    return this.vk;
  }

  /**
   * Инициализирует и запускает все включенные адаптеры.
   * @param app Экземпляр Express для регистрации webhook-ов (опционально)
   */
  public async startAll(app?: any): Promise<void> {
    console.log('[AdapterManager] Starting adapters...');
    for (const adapter of this.adapters) {
      await adapter.start(app);
    }
    console.log('[AdapterManager] All enabled adapters started.');
  }

  /**
   * Останавливает все адаптеры.
   */
  public async stopAll(): Promise<void> {
    console.log('[AdapterManager] Stopping adapters...');
    for (const adapter of this.adapters) {
      await adapter.stop();
    }
  }
}

export const adapterManager = new AdapterManager();
