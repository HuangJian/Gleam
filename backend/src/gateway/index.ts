import type { LLMProvider } from './llm-provider'
import { OpenAIProvider } from './openai-provider'
import { decrypt } from '../config/encryption'
import type { IntelligenceConfig } from '../domain/gleam-ai'
import { LLMError } from './llm-provider'

/**
 * Default embedding model per provider. Kept here (not in config) so that
 * adding a new provider only requires touching this factory.
 */
const DEFAULT_EMBEDDING_MODEL: Record<string, string> = {
  openai: 'text-embedding-3-small',
}

/**
 * Constructs an `LLMProvider` instance from a stored IntelligenceConfig.
 *
 * The Gateway is the only place where the API key is decrypted. The
 * plaintext key is held in memory only by the returned provider instance
 * and is never logged.
 *
 * Throws if the provider is unknown or encryption is unavailable.
 */
export function createProvider(config: IntelligenceConfig): LLMProvider {
  const apiKey = decrypt({
    ciphertext: config.encryptedApiKey,
    iv: config.apiKeyIv,
  })

  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider({
        apiKey,
        model: config.model,
        embeddingModel: DEFAULT_EMBEDDING_MODEL.openai,
      })
    default:
      throw new LLMError(`Unknown provider: ${config.provider}`, false)
  }
}

/**
 * Constructs a provider for validation only — used by `configureProvider`
 * before persisting the configuration. Validates that the credentials
 * are usable.
 *
 * `provider` and `model` come from the GraphQL input; `apiKey` is the
 * plaintext key entered by the user (not yet encrypted).
 */
export function createProviderForValidation(
  provider: string,
  model: string,
  apiKey: string,
): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider({
        apiKey,
        model,
        embeddingModel: DEFAULT_EMBEDDING_MODEL.openai,
      })
    default:
      throw new LLMError(`Unknown provider: ${provider}`, false)
  }
}

export { LLMError } from './llm-provider'
export type {
  LLMProvider,
  LLMInput,
  SummarizeResult,
  TagsResult,
  EmbeddingResult,
} from './llm-provider'
