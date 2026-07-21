import SchemaBuilder from '@pothos/core'
import type { IRepository, IIntelligenceRepository } from '../repository/repository'
import type { TimelineService } from '../timeline/timeline'
import type { SearchService } from '../search/search'
import type { IntelligenceConfigView } from '../domain/gleam-ai'
import { encrypt, hasEncryptionSecret } from '../config/encryption'
import { createProviderForValidation } from '../gateway'
import { logger } from '../util/logger'

// ── Explicit interfaces for Preact object types ─────────
// (ArkType inferred types don't expose keys to Pothos properly)

interface GraphQLSourceMedia {
  kind: 'image' | 'audio' | 'video'
  src: string
}

interface GraphQLSource {
  type: 'url' | 'book' | 'conversation' | 'experience' | 'thought'
  url: string
  title: string
  excerpt: string
  media?: GraphQLSourceMedia
}

interface GraphQLGleam {
  id: string
  thought: string
  source: GraphQLSource
  createdAt: string
  tags: string[]
  revisitCount: number
  lastRevisitedAt: string
  // Intelligence fields (resolved via repository, not stored on Gleam)
  _gleamIdForIntelligence?: string
}

// ── Context ─────────────────────────────────────────────

export interface GraphQLContext {
  repository: IRepository
  intelligenceRepository: IIntelligenceRepository
  timelineService: TimelineService
  searchService: SearchService
}

// ── Schema Builder ──────────────────────────────────────

const builder = new SchemaBuilder<{
  Context: GraphQLContext
  Scalars: {
    DateTime: {
      Input: string
      Output: string
    }
  }
}>({})

// ── Scalars ─────────────────────────────────────────────

// Manual DateTime scalar (no @pothos/plugin-scalars dependency)
builder.scalarType('DateTime', {
  serialize: (value: unknown) => {
    if (typeof value !== 'string') {
      throw new Error('DateTime must be a string')
    }
    return value
  },
  parseValue: (value: unknown) => {
    if (typeof value !== 'string') {
      throw new Error('DateTime must be a string')
    }
    return value
  },
})

// ── Enums ───────────────────────────────────────────────

const SourceTypeEnum = builder.enumType('SourceType', {
  values: ['URL', 'BOOK', 'CONVERSATION', 'EXPERIENCE', 'THOUGHT'] as const,
})

const MediaKindEnum = builder.enumType('MediaKind', {
  values: ['IMAGE', 'AUDIO', 'VIDEO'] as const,
})

const UploadSourceEnum = builder.enumType('UploadSource', {
  values: ['CAPTURE', 'IMPORT'] as const,
})

const RelationOriginEnum = builder.enumType('RelationOrigin', {
  values: ['AI', 'USER'] as const,
})

const ArtifactTypeEnum = builder.enumType('ArtifactType', {
  values: ['SUMMARY', 'TAGS', 'EMBEDDING', 'RELATION'] as const,
})

// ── Object Types ────────────────────────────────────────

const SourceMediaType = builder.objectRef<GraphQLSourceMedia>('SourceMedia').implement({
  fields: (t) => ({
    kind: t.field({
      type: MediaKindEnum,
      resolve: (parent) => parent.kind.toUpperCase() as 'IMAGE' | 'AUDIO' | 'VIDEO',
    }),
    src: t.exposeString('src'),
  }),
})

const SourceType = builder.objectRef<GraphQLSource>('Source').implement({
  fields: (t) => ({
    type: t.field({
      type: SourceTypeEnum,
      resolve: (parent) =>
        parent.type.toUpperCase() as 'URL' | 'BOOK' | 'CONVERSATION' | 'EXPERIENCE' | 'THOUGHT',
    }),
    url: t.exposeString('url'),
    title: t.exposeString('title'),
    excerpt: t.exposeString('excerpt'),
    media: t.expose('media', { type: SourceMediaType, nullable: true }),
  }),
})

// ── Intelligence Types ──────────────────────────────────

// Forward declaration of GleamRelationType so it can be referenced from
// GleamType.relations below. The implementation follows GleamType because
// it references GleamType in its `targetGleam` field (mutual recursion).
const GleamRelationType = builder.objectRef<{
  id: string
  sourceGleamId: string
  targetGleamId: string
  relationType: string
  strength: number | null
  origin: 'ai' | 'user'
  createdAt: string
}>('GleamRelation')

const GleamType = builder.objectRef<GraphQLGleam>('Gleam').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    thought: t.exposeString('thought'),
    source: t.expose('source', { type: SourceType }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    // `tags` returns the visible tag set (userTags + aiTags − removedTags)
    // rather than user tags alone. The repository computes this at read time.
    tags: t.exposeStringList('tags'),
    revisitCount: t.exposeInt('revisitCount'),
    // '' maps to null at the GraphQL boundary
    lastRevisitedAt: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (parent) => (parent.lastRevisitedAt === '' ? null : parent.lastRevisitedAt),
    }),

    // ── Intelligence fields ────────────────────────────
    summary: t.field({
      type: 'String',
      nullable: true,
      resolve: async (parent, _args, ctx) => {
        const ai = await ctx.intelligenceRepository.getGleamAI(parent.id)
        return ai?.summary ?? null
      },
    }),

    aiTags: t.field({
      type: ['String'],
      resolve: async (parent, _args, ctx) => {
        const { aiTags, removedTags } = await ctx.intelligenceRepository.getVisibleTags(parent.id)
        // aiTags returned to clients are the raw AI suggestions before user
        // removal — clients use this to display provenance indicators.
        // (Removed tags are excluded so clients don't show rejected tags.)
        return aiTags.filter((tag) => !removedTags.includes(tag))
      },
    }),

    relations: t.field({
      type: [GleamRelationType],
      resolve: async (parent, _args, ctx) => {
        return ctx.intelligenceRepository.getRelations(parent.id)
      },
    }),
  }),
})

// Implement GleamRelationType after GleamType (mutual recursion resolved).
GleamRelationType.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    targetGleam: t.field({
      type: GleamType,
      nullable: true,
      resolve: async (parent, _args, ctx) => {
        const gleam = await ctx.repository.getGleamById(parent.targetGleamId)
        // Orphaned relation (target deleted) — return null instead of throwing.
        // The client filters out relations where targetGleam is null.
        return gleam as unknown as GraphQLGleam | null
      },
    }),
    relationType: t.exposeString('relationType'),
    strength: t.exposeFloat('strength', { nullable: true }),
    origin: t.field({
      type: RelationOriginEnum,
      resolve: (parent) => parent.origin.toUpperCase() as 'AI' | 'USER',
    }),
  }),
})

const IntelligenceConfigType = builder
  .objectRef<IntelligenceConfigView>('IntelligenceConfig')
  .implement({
    fields: (t) => ({
      provider: t.exposeString('provider'),
      model: t.exposeString('model'),
      embeddingModel: t.exposeString('embeddingModel'),
      hasApiKey: t.exposeBoolean('hasApiKey'),
    }),
  })

// ── Search Types ────────────────────────────────────────

const SearchHitType = builder
  .objectRef<{
    gleam: GraphQLGleam
    score: number
    highlight: string | null
  }>('SearchHit')
  .implement({
    fields: (t) => ({
      gleam: t.expose('gleam', { type: GleamType }),
      score: t.exposeFloat('score'),
      highlight: t.exposeString('highlight', { nullable: true }),
    }),
  })

const SearchResultType = builder
  .objectRef<{
    total: number
    items: { gleam: GraphQLGleam; score: number; highlight: string | null }[]
  }>('SearchResult')
  .implement({
    fields: (t) => ({
      total: t.exposeInt('total'),
      items: t.expose('items', { type: [SearchHitType] }),
    }),
  })

// ── Timeline Types ──────────────────────────────────────

const TimelineConnectionType = builder
  .objectRef<{
    items: GraphQLGleam[]
    total: number
    hasMore: boolean
  }>('TimelineConnection')
  .implement({
    fields: (t) => ({
      items: t.expose('items', { type: [GleamType] }),
      total: t.exposeInt('total'),
      hasMore: t.exposeBoolean('hasMore'),
    }),
  })

// ── Input Types ────────────────────────────────────────

const SourceMediaInput = builder.inputType('SourceMediaInput', {
  fields: (t) => ({
    kind: t.field({ type: MediaKindEnum, required: true }),
    src: t.string({ required: true }),
  }),
})

const SourceInput = builder.inputType('SourceInput', {
  fields: (t) => ({
    type: t.field({ type: SourceTypeEnum, required: true }),
    url: t.string({ defaultValue: '' }),
    title: t.string({ defaultValue: '' }),
    excerpt: t.string({ defaultValue: '' }),
    media: t.field({ type: SourceMediaInput }),
  }),
})

const GleamInput = builder.inputType('GleamInput', {
  fields: (t) => ({
    id: t.id({ required: true }),
    thought: t.string({ required: true }),
    source: t.field({ type: SourceInput, required: true }),
    createdAt: t.field({ type: 'DateTime', required: true }),
    tags: t.stringList(),
    revisitCount: t.int(),
    lastRevisitedAt: t.field({ type: 'DateTime' }),
  }),
})

const AppendGleamsInput = builder.inputType('AppendGleamsInput', {
  fields: (t) => ({
    gleams: t.field({ type: [GleamInput], required: true }),
    source: t.field({ type: UploadSourceEnum, defaultValue: 'CAPTURE' as const }),
  }),
})

const UpdateDerivedFieldsInput = builder.inputType('UpdateDerivedFieldsInput', {
  fields: (t) => ({
    gleamId: t.id({ required: true }),
    tags: t.stringList(),
    revisitCount: t.int(),
    lastRevisitedAt: t.field({ type: 'DateTime' }),
  }),
})

const RenameTagInput = builder.inputType('RenameTagInput', {
  fields: (t) => ({
    oldTag: t.string({ required: true }),
    newTag: t.string({ required: true }),
  }),
})

const TimelineInput = builder.inputType('TimelineInput', {
  fields: (t) => ({
    limit: t.int({ defaultValue: 50 }),
    offset: t.int({ defaultValue: 0 }),
    from: t.field({ type: 'DateTime' }),
    to: t.field({ type: 'DateTime' }),
  }),
})

const SearchInput = builder.inputType('SearchInput', {
  fields: (t) => ({
    query: t.string({ required: true }),
    limit: t.int({ defaultValue: 20 }),
    offset: t.int({ defaultValue: 0 }),
  }),
})

// ── Intelligence Input Types ────────────────────────────

const ConfigureProviderInput = builder.inputType('ConfigureProviderInput', {
  fields: (t) => ({
    provider: t.string({ required: true }),
    model: t.string({ required: true }),
    embeddingModel: t.string({ required: true }),
    apiKey: t.string({ required: true }),
  }),
})

const RemoveTagInput = builder.inputType('RemoveTagInput', {
  fields: (t) => ({
    gleamId: t.id({ required: true }),
    tag: t.string({ required: true }),
  }),
})

const RegenerateArtifactInput = builder.inputType('RegenerateArtifactInput', {
  fields: (t) => ({
    gleamId: t.id({ required: true }),
    artifact: t.field({ type: ArtifactTypeEnum, required: true }),
  }),
})

// ── Payload Types ───────────────────────────────────────

const AppendErrorType = builder
  .objectRef<{ id: string | null; message: string }>('AppendError')
  .implement({
    fields: (t) => ({
      id: t.exposeString('id', { nullable: true }),
      message: t.exposeString('message'),
    }),
  })

const AppendGleamsPayloadType = builder
  .objectRef<{
    accepted: number
    skipped: number
    rejected: number
    errors: { id: string | null; message: string }[]
  }>('AppendGleamsPayload')
  .implement({
    fields: (t) => ({
      accepted: t.exposeInt('accepted'),
      skipped: t.exposeInt('skipped'),
      rejected: t.exposeInt('rejected'),
      errors: t.expose('errors', { type: [AppendErrorType] }),
    }),
  })

const UpdateDerivedFieldsPayloadType = builder
  .objectRef<{
    gleamId: string
    success: boolean
  }>('UpdateDerivedFieldsPayload')
  .implement({
    fields: (t) => ({
      gleamId: t.exposeID('gleamId'),
      success: t.exposeBoolean('success'),
    }),
  })

const RenameTagPayloadType = builder
  .objectRef<{ affectedCount: number }>('RenameTagPayload')
  .implement({
    fields: (t) => ({
      affectedCount: t.exposeInt('affectedCount'),
    }),
  })

const ConfigureProviderPayloadType = builder
  .objectRef<{ provider: string; model: string; success: boolean }>('ConfigureProviderPayload')
  .implement({
    fields: (t) => ({
      provider: t.exposeString('provider'),
      model: t.exposeString('model'),
      success: t.exposeBoolean('success'),
    }),
  })

const RemoveProviderPayloadType = builder
  .objectRef<{ success: boolean }>('RemoveProviderPayload')
  .implement({
    fields: (t) => ({
      success: t.exposeBoolean('success'),
    }),
  })

const RemoveTagPayloadType = builder
  .objectRef<{ gleamId: string; success: boolean }>('RemoveTagPayload')
  .implement({
    fields: (t) => ({
      gleamId: t.exposeID('gleamId'),
      success: t.exposeBoolean('success'),
    }),
  })

const RegenerateArtifactPayloadType = builder
  .objectRef<{ gleamId: string; artifact: string; success: boolean }>('RegenerateArtifactPayload')
  .implement({
    fields: (t) => ({
      gleamId: t.exposeID('gleamId'),
      artifact: t.exposeString('artifact'),
      success: t.exposeBoolean('success'),
    }),
  })

// ── Queries ─────────────────────────────────────────────

builder.queryType({
  fields: (t) => ({
    timeline: t.field({
      type: TimelineConnectionType,
      args: {
        input: t.arg({ type: TimelineInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const input = args.input
        return ctx.timelineService.getTimeline({
          limit: input.limit ?? 50,
          offset: input.offset ?? 0,
          from: input.from ?? undefined,
          to: input.to ?? undefined,
        })
      },
    }),

    search: t.field({
      type: SearchResultType,
      args: {
        input: t.arg({ type: SearchInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const input = args.input
        return ctx.searchService.search(input.query, input.limit ?? 20, input.offset ?? 0)
      },
    }),

    intelligenceConfig: t.field({
      type: IntelligenceConfigType,
      nullable: true,
      resolve: async (_root, _args, ctx) => {
        return ctx.intelligenceRepository.getIntelligenceConfigView()
      },
    }),

    gleamRelations: t.field({
      type: [GleamRelationType],
      args: {
        gleamId: t.arg({ type: 'ID', required: true }),
      },
      resolve: async (_root, args, ctx) => {
        return ctx.intelligenceRepository.getRelations(args.gleamId)
      },
    }),
  }),
})

// ── Mutations ───────────────────────────────────────────

builder.mutationType({
  fields: (t) => ({
    appendGleams: t.field({
      type: AppendGleamsPayloadType,
      args: {
        input: t.arg({ type: AppendGleamsInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const input = args.input
        const gleams: GraphQLGleam[] = input.gleams.map((g) => ({
          id: g.id,
          thought: g.thought,
          source: {
            type: g.source.type.toLowerCase() as
              | 'url'
              | 'book'
              | 'conversation'
              | 'experience'
              | 'thought',
            url: g.source.url ?? '',
            title: g.source.title ?? '',
            excerpt: g.source.excerpt ?? '',
            media: g.source.media
              ? {
                  kind: g.source.media.kind.toLowerCase() as 'image' | 'audio' | 'video',
                  src: g.source.media.src,
                }
              : undefined,
          },
          createdAt: g.createdAt,
          tags: g.tags ?? [],
          revisitCount: g.revisitCount ?? 0,
          lastRevisitedAt: g.lastRevisitedAt ?? '',
        }))

        return ctx.repository.appendGleams(gleams, input.source ?? 'CAPTURE')
      },
    }),

    updateGleamDerivedFields: t.field({
      type: UpdateDerivedFieldsPayloadType,
      args: {
        input: t.arg({ type: UpdateDerivedFieldsInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const input = args.input
        return ctx.repository.updateGleamDerivedFields(input.gleamId, {
          tags: input.tags ?? undefined,
          revisitCount: input.revisitCount ?? undefined,
          lastRevisitedAt: input.lastRevisitedAt ?? undefined,
        })
      },
    }),

    renameTag: t.field({
      type: RenameTagPayloadType,
      args: {
        input: t.arg({ type: RenameTagInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const input = args.input
        return ctx.repository.renameTag(input.oldTag, input.newTag)
      },
    }),

    // ── Intelligence mutations ──────────────────────────

    configureProvider: t.field({
      type: ConfigureProviderPayloadType,
      args: {
        input: t.arg({ type: ConfigureProviderInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const { provider, model, embeddingModel, apiKey } = args.input

        if (!hasEncryptionSecret()) {
          throw new Error(
            'GLEAM_BACKEND_SECRET environment variable is required to configure a provider. ' +
              'Set it to a stable, secret string (e.g. `openssl rand -hex 32`).',
          )
        }

        // Validate before persisting — invalid credentials are rejected
        // immediately. Only usable provider configurations are stored.
        const probe = createProviderForValidation(provider, model, apiKey, embeddingModel)
        try {
          await probe.validateConfig()
        } catch (e) {
          logger.warn('Provider validation failed', {
            provider,
            model,
            embeddingModel,
            error: e instanceof Error ? e.message : String(e),
          })
          throw new Error(
            `Provider validation failed: ${e instanceof Error ? e.message : String(e)}`,
            { cause: e },
          )
        }

        // Changing the embedding model invalidates every existing embedding
        // (different vector space). Reset all embeddings — and relations, which
        // depend on them — to pending so the Scheduler regenerates them. Only
        // reset when a prior config existed; the first save has nothing to reset.
        const existing = await ctx.intelligenceRepository.getIntelligenceConfig()
        if (existing) {
          if (existing.embeddingModel !== embeddingModel) {
            await ctx.intelligenceRepository.resetAllEmbeddings()
            logger.info('Embedding model changed — resetting all embeddings', {
              from: existing.embeddingModel,
              to: embeddingModel,
            })
          }
        }

        const encrypted = encrypt(apiKey)
        await ctx.intelligenceRepository.saveIntelligenceConfig({
          provider,
          model,
          embeddingModel,
          encryptedApiKey: encrypted.ciphertext,
          apiKeyIv: encrypted.iv,
          updatedAt: new Date().toISOString(),
        })

        logger.info('Provider configured', { provider, model, embeddingModel })
        return { provider, model, success: true }
      },
    }),

    removeProvider: t.field({
      type: RemoveProviderPayloadType,
      resolve: async (_root, _args, ctx) => {
        await ctx.intelligenceRepository.removeIntelligenceConfig()
        logger.info('Provider removed')
        return { success: true }
      },
    }),

    removeTag: t.field({
      type: RemoveTagPayloadType,
      args: {
        input: t.arg({ type: RemoveTagInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const { gleamId, tag } = args.input
        return ctx.repository.removeTag(gleamId, tag)
      },
    }),

    regenerateArtifact: t.field({
      type: RegenerateArtifactPayloadType,
      args: {
        input: t.arg({ type: RegenerateArtifactInput, required: true }),
      },
      resolve: async (_, args, ctx) => {
        const { gleamId, artifact } = args.input
        // GraphQL never invokes semantic computation directly — it only
        // changes Repository state. The Scheduler discovers the new
        // work during a later observation cycle.
        const artifactLower = artifact.toLowerCase() as
          | 'summary'
          | 'tags'
          | 'embedding'
          | 'relation'

        // Ensure a gleam_ai row exists for this Gleam.
        await ctx.intelligenceRepository.createGleamAI(gleamId)
        await ctx.intelligenceRepository.setArtifactStatus(gleamId, artifactLower, 'pending')

        logger.info('Artifact scheduled for regeneration', { gleamId, artifact })
        return { gleamId, artifact, success: true }
      },
    }),
  }),
})

// ── Export schema ───────────────────────────────────────

export const schema = builder.toSchema()
