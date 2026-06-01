import { BaseAdapter } from './baseAdapter';
import { TelegramAdapter } from './telegramAdapter';
import { VkAdapter } from './vkAdapter';
import { WebchatAdapter } from './webchatAdapter';

class AdapterManager {
  private adapters: BaseAdapter[] = [];

  constructor() {
    this.adapters = [
      new TelegramAdapter(),
      new VkAdapter(),
      new WebchatAdapter(),
    ];
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
