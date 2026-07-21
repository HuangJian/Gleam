import type { LLMProvider } from './llm-provider'
import { OpenAICompatibleProvider } from './openai-compatible-provider'
import { decrypt } from '../config/encryption'
import type { IntelligenceConfig } from '../domain/gleam-ai'
import { LLMError } from './llm-provider'

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
    case 'openai-compatible':
      return new OpenAICompatibleProvider({
        apiKey,
        model: config.model,
        embeddingModel: config.embeddingModel,
        endpoint: config.endpoint,
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
 * `provider`, `model`, `embeddingModel`, and `endpoint` come from the GraphQL input;
 * `apiKey` is the plaintext key entered by the user (not yet encrypted).
 * The embedding model is always user-supplied — there is no server default.
 */
export function createProviderForValidation(
  provider: string,
  model: string,
  apiKey: string,
  embeddingModel: string,
  endpoint: string,
): LLMProvider {
  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return new OpenAICompatibleProvider({
        apiKey,
        model,
        embeddingModel,
        endpoint,
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
