import { AIProvider } from './aiProvider';
import { MockProvider } from './mockProvider';
import { OpenRouterProvider } from './openRouterProvider';
import { DeepSeekProvider } from './deepSeekProvider';
import { config } from '../config';

export class AIProviderFactory {
  public static getProvider(providerName?: string): AIProvider {
    const name = providerName || config.aiProvider;

    switch (name.toLowerCase()) {
      case 'openrouter':
        return new OpenRouterProvider();
      case 'deepseek':
        return new DeepSeekProvider();
      case 'mock':
      default:
        return new MockProvider();
    }
  }
}
