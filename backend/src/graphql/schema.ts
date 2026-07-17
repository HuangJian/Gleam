import SchemaBuilder from '@pothos/core'
import type { IRepository } from '../repository/repository'
import type { TimelineService } from '../timeline/timeline'
import type { SearchService } from '../search/search'

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
}

// ── Context ─────────────────────────────────────────────

export interface GraphQLContext {
  repository: IRepository
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

const GleamType = builder.objectRef<GraphQLGleam>('Gleam').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    thought: t.exposeString('thought'),
    source: t.expose('source', { type: SourceType }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    tags: t.exposeStringList('tags'),
    revisitCount: t.exposeInt('revisitCount'),
    // '' maps to null at the GraphQL boundary
    lastRevisitedAt: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (parent) => (parent.lastRevisitedAt === '' ? null : parent.lastRevisitedAt),
    }),
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
  }),
})

// ── Export schema ───────────────────────────────────────

export const schema = builder.toSchema()
