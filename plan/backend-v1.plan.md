# backend-v5.plan.md

> Status: Draft
>
> This document defines the architecture and implementation plan of the Gleam backend.
>
> It is an engineering document rather than a product document. Product philosophy, interaction model and domain semantics are defined in `MANIFEST.md`. Whenever implementation details conflict with the Manifest, the Manifest always takes precedence.
>
> **Changes from v4:** Field naming unified to camelCase; top-level title/excerpt removed; derived fields stored in a separate table; Source.media supported; Repository module layer added; shared types clarified; Timeline semantic dimension acknowledged as deferred; Recall/Milestone/gleamd listed as future capabilities; importGleams removed; UUID v7 enforcement; delete operation removed; tags made non-optional; all scalar fields made non-nullable with defaults (empty string as the canonical "absent" value).

---

# 1. Goals

The backend extends Gleam from a local-first browser extension into a persistent knowledge archive.

Its purpose is intentionally narrow.

The backend **does not participate in knowledge creation**.

It accepts immutable Gleams produced by the client, stores them safely, indexes them for retrieval, and exposes a small set of APIs for searching and browsing accumulated knowledge.

**Version 1 focuses on three core capabilities:**

- Persist immutable Gleams (core data)
- Sync mutable derived data (tags, revisit tracking)
- Provide timeline retrieval (chronological only)
- Provide full-text search

**The following capabilities are explicitly deferred to future versions:**

- Blob storage (images, snapshots, files)
- Knowledge export (JSON, Markdown)
- AI Gateway
- Recall (contextual re-surfacing)
- Milestone identification
- gleamd background daemon

The architecture should remain simple enough to run comfortably on a personal laptop while leaving sufficient extension points for future deployment.

Version 1 intentionally excludes:

- Authentication
- Authorization
- Multi-user
- Collaboration
- Notifications
- Recommendation
- Background workers
- Distributed systems
- High availability
- Blob storage
- Export

The primary design objective is long-term maintainability rather than feature completeness.

---

# 2. Architecture Principles

## Local First

Capture always happens locally.

The browser extension remains the primary interaction environment.

The backend is an asynchronous archive.

Backend availability must never affect capture.

If the backend is unavailable, the client simply continues storing new Gleams locally until uploads become possible again.

---

## Immutable Core, Mutable Derived

A Gleam represents a completed moment of understanding.

Once captured, its core content — `thought`, `source`, `createdAt`, `id` — never changes.

The backend therefore exposes append semantics for core data. There are no update or delete operations on core fields.

However, the MANIFEST (ch.9 §三) explicitly allows editing metadata while preserving core content. Derived fields — `tags`, `revisitCount`, `lastRevisitedAt` — are mutable. The backend supports syncing these fields through a dedicated mutation.

This split is reflected at every layer: core data and derived data live in separate tables, follow different mutation rules, and are exposed through different GraphQL operations.

---

## Client Owns Domain Data

The client owns:

- UUID generation
- capture timestamp
- domain model construction

The backend never rewrites core user data.

Infrastructure metadata (e.g. `receivedAt`) is stored separately and never pollutes the domain model.

---

## Shared Type Definitions

Frontend and backend share **type-level** definitions of the domain model via `shared/types.ts`.

This file contains pure TypeScript interfaces — no runtime schema, no validation logic. Both projects import it for type safety.

Runtime validation is implemented independently by each end:

- **Client:** manual validation in `createGleam()` factory function.
- **Backend:** ArkType runtime schemas that are structurally compatible with the shared types.

This is a pragmatic constraint of the UserScript architecture: the client is a browser extension that cannot import backend npm packages at runtime. Type-level sharing ensures structural consistency without coupling runtime implementations.

The shared types are the single source of truth for the domain model's **shape**. If a field is added or renamed, it starts in `shared/types.ts`, then propagates to both the client's code and the backend's ArkType schema.

---

## Infrastructure Independence

Business logic must remain independent of infrastructure.

The domain layer must never depend on:

- GraphQL
- SQL
- Filesystem
- Blob storage
- AI providers

Infrastructure depends on the domain.

Never the reverse.

---

# 3. High-Level Architecture

```
                    Browser Extension
                             │
                     Local Store (GM_storage)
                             │
                     Background Upload
                             │
                     GraphQL over HTTPS
                             │
               ┌────────────────────────────┐
               │         Backend            │
               │                            │
               │     GraphQL Gateway        │
               │        │      │            │
               │        ▼      ▼            │
               │   Timeline    Search       │
               │    Service    Service      │
               │        │      │            │
               │        ▼      ▼            │
               │      Repository            │
               │     (IRepository)          │
               │             │              │
               │             ▼              │
               │    Database (SQLite)       │
               │    (Drizzle ORM)           │
               └────────────────────────────┘
```

Timeline and Search are business services that depend on Repository.

Repository is the sole data access layer. No service touches the database directly.

The database remains the single persistent storage.

---

# 4. Technology Stack

| Layer         | Technology          |
| ------------- | ------------------- |
| Runtime       | Bun                 |
| Language      | TypeScript          |
| Domain Schema | ArkType             |
| Shared Types  | `shared/types.ts`   |
| SQL           | Drizzle ORM         |
| Migration     | drizzle-kit         |
| GraphQL       | Pothos              |
| Database      | SQLite / PostgreSQL |
| Container     | Docker              |

---

## Runtime

The backend runs on Bun.

Reasons:

- native TypeScript
- fast startup
- lightweight deployment
- integrated package manager

Version 1 should avoid Node-specific APIs whenever practical.

---

## Database

SQLite is the default database.

SQLite already satisfies Version 1's expected scale.

PostgreSQL is supported as an alternative deployment target.

Business logic must remain identical regardless of the selected database.

---

## GraphQL

GraphQL is the only public API.

The backend intentionally exposes business capabilities rather than CRUD endpoints.

The client remains free to build higher-level APIs on top of GraphQL.

---

# 5. Schema Pipeline

## Shared Types

The pipeline originates from `shared/types.ts` — pure TypeScript interfaces shared by frontend and backend.

```
shared/types.ts  (pure types, zero runtime deps)
       │
       ├──→ Client: imports types, uses createGleam() for validation
       │
       └──→ Backend: ArkType schema (structurally compatible with shared types)
                    │
                    ├──→ Drizzle Schema (hand-written mapping)
                    │       │
                    │       ▼
                    │   SQL Migration (drizzle-kit generate)
                    │
                    └──→ Pothos GraphQL (via adaptor layer)
                            │
                            ▼
                        GraphQL Schema
```

The shared types define the domain model's shape. ArkType adds runtime validation on the backend. Drizzle maps the domain to database tables. Pothos exposes the domain through GraphQL.

No downstream layer should become the authoritative definition.

---

## Why ArkType (Backend Only)

ArkType provides the backend with:

- runtime schema validation
- static TypeScript types (inferred, compatible with shared types)

ArkType is **not** used by the client. The client uses pure TypeScript interfaces from `shared/types.ts` and manual validation in `createGleam()`.

Additional benefits for the backend:

- extremely concise syntax (approximately 40% less code than TypeBox)
- native TypeScript union support (`'a' | 'b'`)
- built-in formats (`string.url`, `string.date`)
- custom format support (UUID v7 enforcement)

---

## Domain → Drizzle Mapping

Since `drizzle-arktype` generates schemas in the opposite direction (DB → Schema), Version 1 implements a **lightweight hand-written mapping layer** from ArkType schemas to Drizzle table definitions.

This mapping layer serves as a **compile-time type check**: if the ArkType schema changes, the Drizzle table definition must be updated accordingly. The TypeScript compiler enforces this.

For Version 1, this manual mapping is acceptable because:

- the schema is small and stable
- the mapping is straightforward (1:1 field mapping for core; separate table for derived)
- automation can be introduced in a future phase if needed

---

## Domain → Pothos Adaptor

Pothos does not have an official ArkType plugin.

Version 1 implements a **lightweight adaptor** that converts ArkType schemas into Pothos object types.

This adaptor is approximately **50-80 lines of code** and serves as the single bridge between the domain schema and GraphQL.

---

## Schema Evolution

Every business change follows the same direction.

```
shared/types.ts  (shape definition)
     ↓
ArkType Schema   (runtime validation, backend)
     ↓
TypeScript Types (inferred, verified against shared types)
     ↓
Drizzle Mapping
     ↓
Migration (drizzle-kit)
     ↓
Pothos Adaptor
     ↓
GraphQL Schema
```

Schema evolution always begins with the shared type definitions.

Neither SQL nor GraphQL should introduce business concepts independently.

---

# 6. Project Structure

The project is organized around business capabilities. A `shared/` directory at the repository root contains type definitions consumed by both client and backend.

```
Gleam/
├── shared/
│   └── types.ts              ← Pure TS interfaces (Gleam, Source, etc.)
│
├── src/                      ← Client (browser extension)
│   └── ...
│
└── backend/
    ├── src/
    │
    ├── domain/
    │   ├── gleam.ts          ← ArkType schemas (compatible with shared/types.ts)
    │   ├── source.ts
    │   └── derived.ts        ← ArkType schema for derived data
    │
    ├── repository/
    │   ├── repository.ts     ← IRepository interface (backend)
    │   ├── sqlite-repository.ts
    │   └── postgres-repository.ts
    │
    ├── timeline/
    │   ├── timeline.ts
    │   └── pagination.ts
    │
    ├── search/
    │   ├── search.ts
    │   ├── tokenizer.ts
    │   ├── ranking.ts
    │   ├── adapter.ts
    │   └── highlight.ts
    │
    ├── graphql/
    │   ├── schema/
    │   ├── query/
    │   ├── mutation/
    │   └── scalar/
    │
    ├── database/
    │   ├── schema/
    │   ├── sqlite/
    │   ├── postgres/
    │   └── migration/
    │
    ├── config/
    │
    ├── util/
    │
    └── main.ts
```

Each top-level module should remain independently understandable.

Framework-specific code should remain isolated near the application boundary.

---

# 7. Domain Model

The domain model is defined in `shared/types.ts` and shared by frontend and backend.

## shared/types.ts

```typescript
// ── Source ──────────────────────────────────────────────

export type SourceType = 'url' | 'book' | 'conversation' | 'experience' | 'thought'

export type MediaKind = 'image' | 'audio' | 'video'

export interface SourceMedia {
  kind: MediaKind
  src: string
}

export interface Source {
  type: SourceType
  url: string // Default ''
  title: string // Default ''
  excerpt: string // Default ''
  media?: SourceMedia // Object reference; remains optional
}

// ── Gleam ───────────────────────────────────────────────

export interface Gleam {
  // Core fields — IMMUTABLE after creation
  id: string // UUID v7 (time-ordered)
  thought: string // User's understanding (never empty)
  source: Source // Reconstructable context
  createdAt: string // ISO 8601

  // Derived fields — MUTABLE
  tags: string[] // Non-optional, defaults to []
  revisitCount: number // Defaults to 0
  lastRevisitedAt: string // ISO 8601, defaults to '' (empty until first revisit)
}
```

**Key design decisions:**

- **camelCase** throughout. Field names are identical across client, backend, database JSON, and GraphQL.
- **No top-level `title` or `excerpt`.** These exist only inside `Source`. When the search layer needs to index them, it extracts from `source` JSON.
- **All scalar fields are non-nullable with defaults.** `tags` defaults to `[]`, `revisitCount` to `0`, `lastRevisitedAt` to `''`, and `Source.url` / `Source.title` / `Source.excerpt` to `''`. An empty string is the canonical "absent" representation — it carries no product meaning and never changes retrieval semantics. `media` (an object reference) is the only optional field.
- **`tags: string[]`** is non-optional but can be empty. `createGleam()` defaults it to `[]`.
- **`media`** on `Source` is a URL reference (`src: string`), not blob storage. The backend preserves it but does not host binary content.
- **`revisitCount` / `lastRevisitedAt`** are non-optional. `revisitCount` defaults to `0`; `lastRevisitedAt` defaults to `''` (empty until the gleam is first revisited).

> **Note — potential "retirement" feature (future, not implemented):**
> A future version may introduce a "retirement" (隐退) concept: a retired gleam remains visible but receives extremely low weight in review, recall, and timeline operations. This would be a derived field (e.g. `retiredAt?: string`), not a deletion. It is mentioned here for architectural awareness only — no interface, no schema field, and no implementation exists in V1.

---

## Backend ArkType Schemas

The backend defines ArkType schemas that are structurally compatible with the shared types. ArkType adds runtime validation.

```typescript
import { type } from 'arktype'

// ── Source ──────────────────────────────────────────────

export const SourceType = type("'url' | 'book' | 'conversation' | 'experience' | 'thought'")

export const MediaKind = type("'image' | 'audio' | 'video'")

export const SourceMediaSchema = type({
  kind: MediaKind,
  src: 'string.url',
})

export const SourceSchema = type({
  type: SourceType,
  url: "'' | string.url = ''",   // empty allowed; non-empty must be a valid URL
  title: "string = ''",          // empty allowed
  excerpt: "string = ''",        // empty allowed
  media: SourceMediaSchema?,
})

// ── Gleam (core) ────────────────────────────────────────

export const GleamCoreSchema = type({
  id: 'string.uuid',           // validated as UUID v7 at repository layer
  createdAt: 'string.date',
  thought: 'string >= 1 <= 10000',
  source: SourceSchema,
})

// ── Gleam (derived) ─────────────────────────────────────

export const GleamDerivedSchema = type({
  tags: 'string[] = []',                  // non-optional, defaults to []
  revisitCount: 'number >= 0 = 0',        // defaults to 0
  lastRevisitedAt: "'' | string.date = ''", // empty allowed; non-empty must be valid ISO 8601
})

// Full Gleam = core + derived
export const GleamSchema = GleamCoreSchema.and(GleamDerivedSchema)

export type Gleam = typeof GleamSchema.infer
export type GleamCore = typeof GleamCoreSchema.infer
export type GleamDerived = typeof GleamDerivedSchema.infer
export type Source = typeof SourceSchema.infer
```

**UUID v7 validation** is enforced at the repository layer (not in ArkType, which only validates generic UUID format):

```typescript
// repository.ts
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validateUuidV7(id: string): void {
  if (!UUID_V7_REGEX.test(id)) {
    throw new Error(`Invalid UUID v7: ${id}`)
  }
}
```

---

## Infrastructure Metadata

Infrastructure metadata is represented separately and never pollutes the domain model.

```typescript
export interface StoredGleam {
  core: GleamCore // immutable, from client
  content: string // original JSON as received (immutable archive)
  receivedAt: string // server receive time (ISO 8601)
}

export interface StoredDerived {
  gleamId: string // FK → gleams.id
  tags: string[]
  revisitCount: number
  lastRevisitedAt: string // '' until first revisit (never null)
}
```

Business objects remain free from infrastructure concerns.

---

# 8. Database Schema

The database persists domain objects.

It does not define them.

Every table should be derived from the shared domain schema rather than becoming an independent source of truth.

Version 1 contains two primary tables and one search index.

---

## Table: `gleams` (core, immutable)

The canonical storage of all captured knowledge. Core fields only — no derived data.

| Column      | Type    | Description                          |
| ----------- | ------- | ------------------------------------ |
| id          | TEXT PK | Client-generated UUID v7             |
| created_at  | TEXT    | Capture time (ISO 8601, from client) |
| thought     | TEXT    | Primary searchable text              |
| source      | TEXT    | Serialized Source JSON               |
| content     | TEXT    | Original Gleam JSON as received      |
| received_at | TEXT    | Server receive time (ISO 8601)       |

**Notes:**

- No `title` or `excerpt` columns. These live inside `source` JSON and are extracted by the search layer when needed.
- `content` stores the exact JSON payload received from the client. It is write-once and never modified. This is the immutable archive.
- `source` is a denormalized copy of `content`'s `source` field, extracted into its own column for efficient querying without JSON parsing.
- DB column names use `snake_case` (SQL convention). The Drizzle mapping layer converts between `snake_case` columns and `camelCase` domain fields.

---

## Table: `gleam_derived` (derived, mutable)

Mutable per-gleam metadata. One-to-one relationship with `gleams`.

| Column            | Type    | Description                                               |
| ----------------- | ------- | --------------------------------------------------------- |
| gleam_id          | TEXT PK | FK → `gleams.id`, ON DELETE CASCADE                       |
| tags              | TEXT    | Serialized tag array JSON, default `[]`                   |
| revisit_count     | INTEGER | Default 0                                                 |
| last_revisited_at | TEXT    | NOT NULL DEFAULT '', ISO 8601 (empty until first revisit) |

**Notes:**

- A row is created when a gleam is first uploaded (via `appendGleams`) or when derived fields are first synced (via `updateGleamDerivedFields`).
- `tags` is stored as a JSON array string for SQLite compatibility. PostgreSQL can use `jsonb`.
- This table is the mutable counterpart to the immutable `gleams` table. Core immutability is preserved; only derived data is editable.
- **Concurrency:** Multiple devices may update derived fields concurrently. V1 uses last-write-wins semantics. This is acceptable for a single-user system. Future versions may introduce version vectors if needed.

---

## Search Index

Full-text search requires different physical implementation on SQLite and PostgreSQL.

This difference should remain entirely inside the search layer.

The search index covers fields from both tables:

| Indexed field  | Source table       | Weight |
| -------------- | ------------------ | ------ |
| thought        | gleams             | 10     |
| source.title   | gleams (from JSON) | 6      |
| tags           | gleam_derived      | 4      |
| source.excerpt | gleams (from JSON) | 2      |
| source.url     | gleams (from JSON) | 1      |

The search adapter is responsible for constructing FTS queries that join or denormalize data from both tables. For SQLite FTS5, an external content table approach is recommended: the FTS index is populated from a view that joins `gleams` and `gleam_derived`.

When derived fields are updated (e.g. tags change), the FTS index entry for that gleam must be refreshed. This happens synchronously in V1.

Search indices are disposable.

They may be rebuilt at any time from the canonical `gleams` and `gleam_derived` tables.

The search index must never become another source of truth.

---

# 9. Upload Protocol

Unlike traditional synchronization systems, the backend is **not** responsible for synchronizing mutable state between devices.

Its responsibility is simpler: accept Gleams whenever the client is able to upload them, and sync derived metadata.

---

## Upload Flow

```
Capture
    ↓
Local Repository (GM_storage)
    ↓
Upload Queue
    ↓
appendGleams()
    ↓
  ┌─────────┴─────────┐
  ▼                   ▼
gleams (core)    gleam_derived (derived)
(insert if new)  (upsert always)
    ↓
Done
```

The client guarantees capture.

The backend guarantees persistence.

---

## Core Idempotency

Core data uploads must be idempotent.

The backend identifies Gleams by UUID.

If a UUID already exists in `gleams`, the core insert is skipped. The existing core data is never modified.

This greatly simplifies retry logic.

```
appendGleams()
    ↓
UUID exists in gleams?
    ↓ Yes
Skip core insert (idempotent)
    ↓
Upsert gleam_derived (sync latest derived from client)
    ↓
Success

    ↓ No
Insert into gleams (core + content)
    ↓
Insert into gleam_derived (derived from input, or defaults)
    ↓
Success
```

The client never needs to determine whether a core upload previously succeeded.

It may safely retry.

---

## Derived Data Sync

Derived fields (`tags`, `revisitCount`, `lastRevisitedAt`) are mutable. The client is the source of truth for derived data (local-first).

Two mechanisms sync derived data:

1. **`appendGleams`**: When uploading a gleam, the input includes derived fields. The backend upserts these into `gleam_derived`. On retry, core is skipped but derived is re-synced.

2. **`updateGleamDerivedFields`**: When derived fields change after the initial upload (e.g. user adds a tag, records a revisit), the client calls this mutation to sync the latest derived state.

This split ensures:

- Core data is strictly append-only (idempotent).
- Derived data is always synced to the client's latest state.
- The client can batch-upload initial data and incrementally sync changes.

---

## Backend Unavailable

If the backend is unavailable, the upload queue simply pauses.

The browser continues capturing normally.

When connectivity returns, the queued Gleams are uploaded in chronological order.

No user intervention is required.

---

## No Synchronization Protocol

Version 1 intentionally does **not** implement:

- client identifiers
- synchronization cursors
- download phase
- conflict resolution (beyond last-write-wins on derived data)
- merge algorithms

These concepts solve problems that do not exist in Gleam's append-only core model.

The backend behaves as an archive rather than a synchronization authority.

---

## Data Recovery

Since the backend has no download API, data recovery is handled through **explicit re-upload**.

The client can export its local repository as JSON (through existing client functionality) and re-upload it via `appendGleams` with `source: IMPORT`.

```
mutation AppendGleams($gleams: [GleamInput!]!) {
  appendGleams(input: { gleams: $gleams, source: IMPORT }) {
    accepted
    skipped
    rejected
  }
}
```

This approach:

- preserves the "no download" simplification
- gives users full control over data migration
- provides a clear path for recovering from catastrophic client data loss
- uses the same mutation as normal upload (no separate `importGleams` needed)

The `source` parameter distinguishes normal capture uploads from bulk imports. In V1, both follow identical processing logic. The parameter exists for future observability and rate-limiting differentiation.

---

## Batch Size Limit

`appendGleams` accepts a maximum of **100 Gleams per request**.

Requests exceeding this limit are rejected with a validation error.

This prevents abuse and keeps request processing time bounded.

---

# 10. GraphQL API

GraphQL exposes business capabilities.

It should remain small, stable and independent of storage details.

Version 1 contains two query domains and three mutations:

- **Query:** Timeline, Search
- **Mutation:** appendGleams, updateGleamDerivedFields, renameTag

---

## Query

```graphql
type Query {
  timeline(input: TimelineInput!): TimelineConnection!

  search(input: SearchInput!): SearchResult!
}
```

The API intentionally avoids exposing low-level database queries.

Clients retrieve knowledge through business concepts rather than storage structures.

---

## Mutation

```graphql
type Mutation {
  appendGleams(input: AppendGleamsInput!): AppendGleamsPayload!

  updateGleamDerivedFields(input: UpdateDerivedFieldsInput!): UpdateDerivedFieldsPayload!

  renameTag(input: RenameTagInput!): RenameTagPayload!
}
```

There are intentionally no mutations named:

```graphql
createGleam
updateGleam      # no core updates — ever
deleteGleam      # no deletion — ever
```

The backend never creates knowledge.

It only accepts completed knowledge objects and syncs their derived metadata.

---

## Input Types

```graphql
input GleamInput {
  # Core (immutable)
  id: ID! # UUID v7
  thought: String!
  source: SourceInput!
  createdAt: DateTime!

  # Derived (mutable, optional on upload — defaults applied if absent)
  tags: [String!]
  revisitCount: Int
  lastRevisitedAt: DateTime # '' accepted (means "not yet revisited")
}

input SourceInput {
  type: SourceType!
  url: String! = ""
  title: String! = ""
  excerpt: String! = ""
  media: SourceMediaInput
}

input SourceMediaInput {
  kind: MediaKind!
  src: String!
}

input AppendGleamsInput {
  gleams: [GleamInput!]! # max 100 per request
  source: UploadSource # default: CAPTURE
}

enum UploadSource {
  CAPTURE
  IMPORT
}

input UpdateDerivedFieldsInput {
  gleamId: ID!
  tags: [String!]
  revisitCount: Int
  lastRevisitedAt: DateTime
}

input RenameTagInput {
  oldTag: String!
  newTag: String!
}
```

---

## Payload Types

```graphql
type AppendGleamsPayload {
  accepted: Int! # new gleams inserted
  skipped: Int! # duplicates (core skipped, derived synced)
  rejected: Int! # validation failures
  errors: [AppendError!]
}

type AppendError {
  id: String # gleam ID that failed (if available)
  message: String!
}

type UpdateDerivedFieldsPayload {
  gleamId: ID!
  success: Boolean!
}

type RenameTagPayload {
  affectedCount: Int!
}
```

---

## Timeline Types

```graphql
type TimelineConnection {
  items: [Gleam!]!
  total: Int!
  hasMore: Boolean!
}

input TimelineInput {
  limit: Int = 50
  offset: Int = 0
  from: DateTime
  to: DateTime
  # Future: topic: String (semantic clustering, not implemented in V1)
}
```

**Note:** `nextCursor` is intentionally omitted. V1 uses offset/limit pagination. `hasMore` is computed as `offset + items.length < total`. Cursor-based pagination may be introduced in future versions without breaking the API (by adding `nextCursor` as an optional field).

Timeline returns a chronological list of Gleams sorted by creation time in descending order (most recent first).

No grouping or session detection is performed in V1.

---

## Search Types

```graphql
type SearchResult {
  total: Int!
  items: [SearchHit!]!
}

type SearchHit {
  gleam: Gleam!
  score: Float!
  highlight: String
}

input SearchInput {
  query: String!
  limit: Int = 20
  offset: Int = 0
}
```

Search metadata supplements the returned Gleam.

The complete Gleam object (core + derived) is always returned.

---

## Gleam Type (GraphQL)

```graphql
type Gleam {
  # Core (immutable)
  id: ID!
  thought: String!
  source: Source!
  createdAt: DateTime!

  # Derived (mutable)
  tags: [String!]!
  revisitCount: Int!
  lastRevisitedAt: DateTime # nullable at the boundary: resolver maps '' → null
}

type Source {
  type: SourceType!
  url: String!
  title: String!
  excerpt: String!
  media: SourceMedia
}

type SourceMedia {
  kind: MediaKind!
  src: String!
}

enum SourceType {
  URL
  BOOK
  CONVERSATION
  EXPERIENCE
  THOUGHT
}

enum MediaKind {
  IMAGE
  AUDIO
  VIDEO
}
```

The Gleam resolver joins `gleams` (core) and `gleam_derived` (derived) to produce the complete type.

---

## Schema Generation

The GraphQL schema is generated from the shared domain model via the Pothos adaptor.

```
shared/types.ts
     ↓
ArkType Schema
     ↓
Pothos Adaptor
     ↓
GraphQL SDL
```

Business concepts should never be redefined inside GraphQL.

GraphQL presents the domain.

It does not own the domain.

---

# 11. Timeline

Timeline is the primary retrieval model of Gleam.

Search answers:

> "Find something."

Timeline answers:

> "Show me what I was thinking about."

These are fundamentally different retrieval behaviors.

---

## MANIFEST Alignment

The MANIFEST (ch.5 §二) defines Timeline as a dual-axis structure: **time as primary axis, semantics as auxiliary axis**.

> "它选取若干在语义上具有相似性的 gleam，将它们按照时间顺序排列"

**V1 implements only the time axis.** The semantic axis (topic clustering, semantic similarity grouping) is deferred to a future version when the Intelligence module is available.

This is an explicit scope decision, not a contradiction of the MANIFEST. The API is designed to accommodate the semantic axis in the future without breaking changes (via the reserved `topic` parameter in `TimelineInput`).

---

## Responsibilities

Timeline is responsible for:

- chronological traversal (descending by `createdAt`)
- pagination (offset/limit)
- date range filtering (optional)

Timeline is **not** responsible for (in V1):

- semantic grouping
- session detection
- semantic clustering
- keyword search
- AI summarization

---

## Pagination

Version 1 uses offset/limit pagination.

```graphql
input TimelineInput {
  limit: Int = 50
  offset: Int = 0
  from: DateTime
  to: DateTime
}
```

For Gleam's expected data scale (thousands of Gleams), offset pagination is sufficient.

---

## Sorting

Timeline returns Gleams in descending chronological order.

Most recent Gleams appear first.

This is the only sorting supported by Version 1.

---

# 12. Search

Search is the secondary retrieval model.

Where Timeline follows the natural flow of time, Search begins with an explicit question.

The purpose of Search is not to organize knowledge, but to locate it quickly.

---

## Responsibilities

Search is responsible for:

- indexing
- keyword retrieval
- result ranking
- highlight generation

Search never owns data.

The canonical sources remain the `gleams` and `gleam_derived` tables.

---

## Search Scope

Version 1 indexes the following fields.

| Field          | Source             | Weight |
| -------------- | ------------------ | ------ |
| thought        | gleams             | 10     |
| source.title   | gleams (from JSON) | 6      |
| tags           | gleam_derived      | 4      |
| source.excerpt | gleams (from JSON) | 2      |
| source.url     | gleams (from JSON) | 1      |

The weighting strategy should remain configurable.

Future versions may adjust ranking without affecting the API.

---

## Search Pipeline

```
Query
    ↓
Tokenizer
    ↓
Search Adapter
    ↓
Candidate Gleams (join gleams + gleam_derived)
    ↓
Ranking
    ↓
Highlight
    ↓
GraphQL
```

Each stage has a single responsibility.

This separation makes it possible to improve ranking or tokenization independently.

---

## Tokenizer

Tokenizer is replaceable.

```typescript
interface Tokenizer {
  tokenize(text: string): Token[]
}
```

Search depends only on this interface.

Chinese segmentation libraries should remain implementation details.

---

## Search Adapter

SQLite and PostgreSQL expose different full-text search capabilities.

Rather than exposing these differences upward, Search delegates them to adapters.

```
Search
    │
    ▼
Search Adapter
    │
 ┌──┴────────────┐
 ▼               ▼
SQLite FTS5     PostgreSQL FTS
```

Each adapter is responsible only for:

- query construction
- candidate retrieval (including join with `gleam_derived` for tags)
- relevance score

Everything else remains database independent.

---

## Ranking

Ranking combines:

- database relevance
- field weight

Version 1 intentionally excludes:

- click history
- personalization
- popularity
- AI ranking

Search results should remain deterministic.

---

## Highlight

Highlight generation belongs to the application layer rather than the database.

Database-specific functions such as:

- `snippet()`
- `ts_headline()`

are intentionally not used.

Instead, Search generates highlights in TypeScript.

Advantages:

- identical output across databases
- identical rendering across clients
- simpler testing
- easier future migration

For Gleam's expected scale, this trade-off is preferable to relying on vendor-specific SQL.

---

## Future Semantic Search

Version 1 performs lexical retrieval only.

Semantic retrieval is intentionally postponed.

When embeddings become available, Search should evolve into:

```
Lexical Search
    +
Semantic Search
    ↓
Hybrid Ranking
```

The public API should remain unchanged.

---

# 13. Future Capabilities

The following capabilities are **not implemented in V1** but are documented here to ensure the architecture supports their future addition.

---

## Recall

MANIFEST ch.10 defines Recall as a distinct capability from Search:

> "检索是用户向系统提问，Recall 是系统向用户提示一个可能值得关注的联系。两者的方向不同。"

Recall is the system proactively surfacing relevant past gleams based on the user's current context — without the user explicitly searching.

**V1 status:** Not implemented. Search (user-initiated) is the only retrieval capability.

**Architecture readiness:**

- The GraphQL API can accommodate a future `recall` query without breaking existing operations.
- Recall will depend on the Intelligence module (semantic vectors) and possibly gleamd (background indexing).
- Recall results follow the same `Gleam` type, ensuring no schema changes are needed.

**Future API (not implemented):**

```graphql
type Query {
  # ...existing queries...
  # recall(input: RecallInput!): RecallResult!   # future
}
```

---

## Milestone

MANIFEST ch.5 §四 defines Milestone as a structural position marker on a Timeline — a point where understanding has temporarily stabilized.

**V1 status:** Not implemented. Timeline is a flat chronological list.

**Architecture readiness:**

- Milestones are derived data (system-computed positions), not core gleam data.
- A future `milestones` table can store milestone markers without touching the `gleams` or `gleam_derived` schema.
- Milestone identification requires semantic analysis (deferred to the Intelligence module era).

---

## gleamd

MANIFEST ch.13 defines gleamd as a background daemon that maintains repository order: updating indices, computing semantic vectors, running clustering analysis, detecting potential milestones.

**V1 status:** Not implemented. All indexing is synchronous (FTS index updated on upload/derived-sync).

**Architecture readiness:**

- The search index is already designed as disposable and rebuildable.
- The derived data table is separate from core data, so background writes to derived/derived-metadata tables cannot corrupt core data.
- gleamd's "read and derive-write only" constraint (ch.13 §四) is naturally enforced by the core/derived split.

**V1 trade-off:** Synchronous indexing is acceptable for the expected scale (thousands of gleams). As the repository grows and semantic processing is introduced, gleamd will become necessary.

---

# 14. Development Rules

The backend is expected to evolve over many years.

These rules exist to preserve architectural consistency rather than enforce coding style.

---

## Rule 1 — Identify the Business Module First

Before implementing a new feature, determine which business capability owns it.

Every feature should belong to exactly one of:

- Timeline
- Search
- Repository
- Infrastructure

If ownership is unclear, the design should be reconsidered before implementation.

---

## Rule 2 — The Domain Is the Source of Truth

Every business change begins with `shared/types.ts`, then propagates to ArkType schemas, Drizzle mappings, migrations, and the Pothos adaptor.

SQL schemas, GraphQL schemas, and generated types must never evolve independently.

---

## Rule 3 — Do Not Pollute the Domain

Infrastructure concerns should never appear inside business objects.

Examples of infrastructure metadata include:

- upload time (`receivedAt`)
- search score
- storage path

These belong to storage or transport layers, not to `Gleam`.

---

## Rule 4 — Business Logic Lives Outside GraphQL

GraphQL is an interface layer.

Resolvers should only:

- validate input
- invoke business modules
- map results

Resolvers should not contain:

- SQL
- ranking logic
- grouping logic
- filesystem operations

---

## Rule 5 — Infrastructure Must Remain Replaceable

The following components should always be abstracted:

- Tokenizer
- Search Adapter
- Repository implementation

Replacing an implementation should not require changes to business modules.

---

## Rule 6 — Prefer Deterministic Algorithms

Timeline sorting, search ranking, duplicate detection should produce identical output for identical input.

Deterministic behavior simplifies testing, debugging, and long-term maintenance.

---

## Rule 7 — Avoid Premature Abstraction

Version 1 intentionally favors clarity over flexibility.

Do not introduce additional architectural layers until a concrete need exists.

Examples to avoid:

- Generic service hierarchies
- Event buses
- Plugin systems
- Domain event frameworks

Simple code is easier to evolve than speculative abstractions.

---

## Rule 8 — Core Is Immutable, Derived Is Mutable

This rule is non-negotiable.

- `gleams` table: insert-only. No UPDATE, no DELETE.
- `gleam_derived` table: upsert allowed. This is the only table that accepts mutations.
- `content` column: write-once. Stores the original JSON as received.
- Any code path that modifies `thought`, `source`, `createdAt`, or `id` is a bug.

---

# 15. Deployment

Version 1 targets a single-machine deployment.

The entire backend runs as a single process.

```
Bun
    ↓
GraphQL
    ↓
Repository
    ↓
SQLite
```

No additional services are required.

---

## Docker

A Docker image should be provided early.

Recommended persistent layout:

```
database.sqlite
config/
```

Persisting these directories is sufficient to restore the complete backend.

---

## Configuration

Runtime configuration should remain centralized.

Typical configuration includes:

```
DATABASE_URL
PORT
LOG_LEVEL
```

Environment variables should be read only during startup.

Business modules receive configuration through dependency injection.

---

## PostgreSQL Compatibility

Supporting PostgreSQL should require changing only:

- database adapter
- migration target
- search adapter

Timeline, Search, Repository interface, and GraphQL should remain unchanged.

---

# 16. Development Roadmap

Development proceeds through independently usable milestones.

Every phase should leave the backend in a working state.

---

## Phase 0 — Shared Types & Client Migration

**Prerequisite.** Must complete before backend work begins.

Deliverables:

- Create `shared/types.ts` with camelCase domain types.
- Refactor client `src/domain/gleam.ts` to import from `shared/types.ts`.
- Refactor all client code (services, infra, UI, tests) to use camelCase field names.
- Write a one-time data migration script that transforms existing GM_storage data from snake_case to camelCase.
- Remove `delete()` from `IRepository` interface and `GMStorageAdapter`.
- Run migration script manually, verify data integrity.

At the end of this phase, the client uses camelCase exclusively and has no `delete` operation.

---

## Phase 1 — Project Bootstrap

Deliverables:

- Bun project
- ArkType schemas (compatible with `shared/types.ts`)
- Drizzle ORM setup
- Pothos GraphQL server
- migration framework (drizzle-kit)
- SQLite initialization
- Repository module (interface + SQLite implementation)

At the end of this phase, the backend starts successfully and can execute basic Repository operations.

---

## Phase 2 — Persistence

Deliverables:

- `gleams` table (core, immutable)
- `gleam_derived` table (derived, mutable)
- `appendGleams` mutation (core insert + derived upsert)
- `updateGleamDerivedFields` mutation
- `renameTag` mutation
- UUID v7 validation
- duplicate detection (idempotent core)
- batch size limit enforcement

The backend now functions as an append-only archive with derived data sync.

---

## Phase 3 — Timeline

Deliverables:

- timeline query
- pagination (offset/limit)
- date range filtering
- Gleam resolver (joins gleams + gleam_derived)

The primary retrieval experience becomes available.

---

## Phase 4 — Search

Deliverables:

- tokenizer
- SQLite FTS5 adapter (joins gleams + gleam_derived)
- PostgreSQL FTS adapter
- ranking
- highlighting
- FTS index refresh on derived field updates

Knowledge becomes searchable.

---

## Phase 5 — Infrastructure

Deliverables:

- structured logging
- integration tests
- Docker image
- PostgreSQL verification

The backend becomes suitable for long-term personal deployment.

---

## Phase 6 — Future Evolution

Potential future capabilities include:

- Recall (contextual re-surfacing)
- Milestone identification
- gleamd background daemon
- Blob storage (LocalBlobStore, S3, R2)
- Knowledge export (JSON, Markdown)
- Semantic search
- Embedding generation
- AI Gateway implementation
- Timeline semantic clustering
- Multi-device optimization
- Multi-user architecture
- Gleam "retirement" (隐退)

These features should extend the architecture rather than reshape it.

The core principles established in this document should remain stable.

---

# Appendix A. Non-goals

The following capabilities are intentionally excluded from Version 1.

## Product

- User accounts
- Authentication
- Authorization
- Collaboration
- Sharing
- Notifications
- Recycle Bin
- Deletion of any kind
- Editing core gleam fields
- Blob storage (binary hosting)
- Export

## Infrastructure

- Microservices
- Message queues
- Event sourcing
- Distributed databases
- Distributed cache
- High availability
- Monitoring platforms
- Autoscaling

## AI

- Vendor-specific integrations
- Prompt orchestration
- Agent frameworks
- Workflow engines

These capabilities are intentionally postponed to keep Version 1 focused, understandable and maintainable.

---

# Appendix B. Guiding Philosophy

The backend exists to preserve knowledge rather than manage users.

It should remain quiet, predictable and durable.

The browser is where ideas are born.

The backend is where they continue to exist.

As the product evolves, new capabilities should strengthen this principle rather than compete with it.

---

# Appendix C. Architecture Decisions

## ADR-1: ArkType as Backend Domain Schema

**Status:** Accepted (updated in v5)

**Context:** The backend requires runtime validation for incoming Gleam data. The chosen schema library must provide validation and TypeScript type inference compatible with shared types.

**Decision:** Use ArkType on the backend only. The client uses pure TypeScript interfaces from `shared/types.ts` with manual validation.

**Rationale:**

- ArkType provides runtime validation + type inference for the backend.
- The client (UserScript) cannot import backend npm packages at runtime.
- Type-level sharing via `shared/types.ts` ensures structural consistency without runtime coupling.
- ArkType's concise syntax and performance are suitable for backend validation needs.

**Consequences:**

- Pothos integration requires a custom adaptor (~50-80 lines).
- Drizzle integration uses hand-written mapping layer.
- Two validation implementations exist (client manual, backend ArkType) but both conform to the same shared types.

---

## ADR-2: Append-Only Core with Mutable Derived

**Status:** Accepted (updated in v5)

**Context:** The MANIFEST (ch.9 §三) requires core gleam immutability but explicitly permits metadata editing. A strict append-only model would prevent syncing tags and revisit data to the backend.

**Decision:** Split data into two tables: `gleams` (immutable, insert-only) and `gleam_derived` (mutable, upsert). Core uploads are idempotent. Derived data syncs via dedicated mutations.

**Rationale:**

- Preserves core immutability (MANIFEST ch.9 §三) without sacrificing derived data sync.
- Tags, revisit tracking, and other metadata are mutable by design.
- Separate tables make the immutability boundary physically explicit.
- Last-write-wins on derived data is acceptable for a single-user system.

**Consequences:**

- Two tables per gleam (core + derived).
- `appendGleams` handles both core insert (idempotent) and derived upsert.
- `updateGleamDerivedFields` handles incremental derived sync.
- Search index must join both tables.
- Future multi-device sync may need version vectors for derived data.

---

## ADR-3: Timeline Simplified to Chronological List (V1)

**Status:** Accepted (updated in v5)

**Context:** The MANIFEST (ch.5 §二) defines Timeline as a dual-axis structure (time + semantics). Full semantic clustering requires the Intelligence module, which is not available in V1.

**Decision:** V1 Timeline returns a simple chronological list with pagination. Semantic clustering is deferred. The API reserves a `topic` parameter for future use.

**Rationale:**

- Semantic clustering requires embedding/analysis capabilities not available in V1.
- Pure chronological ordering is useful immediately and covers the primary use case.
- The API is designed to accommodate the semantic axis without breaking changes.
- This is an explicit scope decision, acknowledged as a deviation from the full MANIFEST definition.

**Consequences:**

- V1 Timeline is a time-sorted list, not a MANIFEST-complete Timeline.
- Future semantic clustering can be added via the reserved `topic` parameter.
- Documentation must clearly distinguish "V1 Timeline API" from "MANIFEST Timeline concept".

---

## ADR-4: Media URL References Allowed, Blob Storage Deferred

**Status:** Accepted (updated in v5)

**Context:** The client already supports `SourceMedia` (a URL reference to media). V1 excludes blob storage but should not reject gleams that reference external media.

**Decision:** V1 preserves `Source.media` (URL reference only). No blob hosting. ADR-4 from v4 is amended: "V1 does not provide blob storage, but Source media URL references are fully preserved."

**Rationale:**

- `SourceMedia.src` is a string URL, not binary data.
- Rejecting media-containing gleams would cause data loss during upload.
- MANIFEST ch.3 §四 explicitly mentions screenshots as valid Source content.

**Consequences:**

- Media URLs are stored in the `source` JSON and `content` column.
- No media-specific indexing in V1.
- Future blob storage can provide local mirrors for these URLs.

---

## ADR-5: Shared Type Definitions via shared/types.ts

**Status:** Accepted (new in v5)

**Context:** The plan declares "frontend and backend share exactly one domain model." However, the client is a UserScript that cannot import backend npm packages at runtime. Full runtime schema sharing is not feasible.

**Decision:** Share type definitions only, via `shared/types.ts`. Both projects import this file for TypeScript types. Runtime validation is implemented independently.

**Rationale:**

- UserScript build pipeline cannot consume backend npm packages at runtime.
- Type-level sharing is sufficient to ensure structural consistency.
- The shared types file is the single source of truth for the domain model's shape.
- Each end retains freedom in runtime validation strategy.

**Consequences:**

- `shared/types.ts` must be updated first for any domain model change.
- Two runtime validation implementations (client manual, backend ArkType) must stay in sync with shared types.
- TypeScript compiler enforces structural compatibility.

---

## ADR-6: UUID v7 Enforcement

**Status:** Accepted (new in v5)

**Context:** The client uses UUID v7 (time-ordered) for all gleam IDs. Generic UUID validation would accept non-v7 UUIDs, potentially breaking time-ordering assumptions.

**Decision:** The repository layer validates that all gleam IDs match the UUID v7 format (version nibble = 7, variant bits = 10xx).

**Rationale:**

- UUID v7 ensures chronological sortability, consistent with `createdAt`.
- Prevents corrupted or non-standard UUIDs from entering the archive.
- Simple regex validation, no external dependency.

**Consequences:**

- Any client producing non-v7 UUIDs will have uploads rejected.
- The client's `generateUUIDv7()` already complies.
- Future import paths must ensure UUID v7 compliance.

---

## ADR-7: No Deletion — Retirement Concept (Future)

**Status:** Accepted (new in v5)

**Context:** The client previously had a `delete()` operation. The backend has no delete. MANIFEST ch.9 does not discuss deletion. Complete removal of delete is the V1 decision.

**Decision:** Remove `delete()` from the client's `IRepository` interface and `GMStorageAdapter`. The backend has no delete operation. A future "retirement" (隐退) concept may be introduced as a derived field — retired gleams remain visible but receive low weight in retrieval operations.

**Rationale:**

- Deletion conflicts with the archive's purpose of preserving knowledge.
- The MANIFEST's immutability principle extends to preservation: once captured, a gleam should not be lost.
- Retirement (future) provides a softer alternative: reduce visibility without destroying data.
- V1 implements neither deletion nor retirement. Retirement is mentioned for architectural awareness only.

**Consequences:**

- Client `IRepository` no longer has `delete()`.
- Client UI must remove any delete affordances.
- Future retirement would be a derived field (`retiredAt?: string`), stored in `gleam_derived`.
- No interface or schema field for retirement exists in V1.

---

## ADR-8: Remove importGleams, Unify on appendGleams

**Status:** Accepted (new in v5)

**Context:** v4 defined both `appendGleams` and `importGleams` with identical semantics (idempotent, append-only). The redundancy added API surface without value.

**Decision:** Remove `importGleams`. Use `appendGleams` with a `source: UploadSource` enum (`CAPTURE` | `IMPORT`) to distinguish upload contexts. Both follow identical processing logic in V1.

**Rationale:**

- Identical semantics do not justify two mutations.
- The `source` parameter provides observability and future rate-limiting differentiation.
- Fewer mutations = simpler API surface.

**Consequences:**

- One upload mutation instead of two.
- `source` parameter is optional (defaults to `CAPTURE`).
- Future versions can differentiate processing logic based on `source` if needed.

---

# Appendix D. Additional Issues & Recommendations

Issues identified during the v4→v5 review that are addressed in this plan or require ongoing attention.

---

## D-1: Pagination API Inconsistency (Fixed in v5)

**Issue:** v4's `TimelineConnection` included `nextCursor: String` but `TimelineInput` used offset/limit. These are incompatible pagination models.

**Resolution:** Removed `nextCursor` from `TimelineConnection`. V1 uses offset/limit exclusively. `hasMore` is computed from offset + items.length vs total. Cursor-based pagination can be added later as an optional field without breaking changes.

---

## D-2: Search Index with Derived Table

**Issue:** With `tags` in `gleam_derived` (separate from `gleams`), the FTS index must include data from both tables.

**Resolution:** The search adapter is responsible for constructing FTS queries that join or denormalize both tables. For SQLite FTS5, an external content table populated from a joined view is recommended. When derived fields are updated, the FTS entry for that gleam is refreshed synchronously. This is an implementation detail confined to the search layer.

---

## D-3: Timestamp / UUID v7 Consistency (Optional)

**Issue:** A gleam's `createdAt` timestamp and its UUID v7 embedded timestamp should roughly correspond. A significant mismatch could indicate data corruption or tampering.

**Recommendation:** V1 does not enforce consistency between `createdAt` and the UUID v7 timestamp. The client generates both at capture time, so they should naturally align. If future versions need anti-tampering checks, a validation can be added at the repository layer. This is intentionally not enforced in V1 to avoid rejecting edge-case data (e.g. imported gleams with slightly misaligned timestamps).

---

## D-4: Content JSON Column Consistency

**Issue:** The `content` column stores the original Gleam JSON as received from the client. With camelCase migration, this JSON uses camelCase field names.

**Resolution:** The `content` column is write-once and stores whatever JSON the client sends. After the client migrates to camelCase (Phase 0), all new uploads will use camelCase JSON. Pre-migration data does not exist on the backend (it's a new backend). No backend-side migration is needed for `content`.

---

## D-5: Concurrency on Derived Table

**Issue:** Multiple devices may update the same gleam's derived fields concurrently (e.g. adding tags on laptop and phone simultaneously).

**Resolution:** V1 uses last-write-wins. The `updateGleamDerivedFields` mutation overwrites the entire derived row with the client's latest state. This is acceptable for a single-user system with infrequent concurrent edits. Future versions may introduce version vectors or timestamps for conflict resolution if needed.

---

## D-6: Client-Side Migration Dependency

**Issue:** Phase 0 (client migration to camelCase + delete removal) must complete before backend integration testing can begin. The backend assumes camelCase field names and no delete operation.

**Resolution:** Phase 0 is explicitly listed as a prerequisite in the roadmap. The migration script transforms existing GM_storage data from snake_case to camelCase. The user runs this script manually after refactoring the client code. Backend development (Phases 1-5) can proceed in parallel with Phase 0, but integration testing requires Phase 0 completion.

---

## D-7: FTS Index Refresh Strategy

**Issue:** When `updateGleamDerivedFields` changes tags, the FTS index must be updated. V1 does this synchronously, but this adds latency to the mutation.

**Resolution:** Synchronous FTS refresh is acceptable for V1's scale (thousands of gleams, infrequent tag changes). The refresh is confined to the search adapter and does not block core data operations. If latency becomes an issue, gleamd can take over asynchronous index maintenance in a future version.

---

## D-8: Repository Interface Divergence

**Issue:** The client's `IRepository` and the backend's `IRepository` serve different needs. The client interface has `save()`, `getById()`, `getAll()`, `updateDerivedFields()`, `renameTag()`. The backend needs `appendGleam()`, `getGleams(pagination)`, `searchGleams()`, etc.

**Resolution:** The two interfaces are intentionally different. They share the same domain types (`Gleam`, `Source`) from `shared/types.ts`, but their operation sets reflect their different contexts (local synchronous storage vs. remote paginated archive). No attempt is made to force a single IRepository interface across both ends. The backend's Repository interface is defined in `backend/src/repository/repository.ts`.

---

# Appendix E. Client-Side Dependencies

The following client-side changes are prerequisites for backend integration. They are tracked here for visibility but are not part of the backend implementation plan.

---

## E-1: camelCase Migration

- Refactor `src/domain/gleam.ts` to use camelCase field names (`createdAt`, `revisitCount`, `lastRevisitedAt`).
- Refactor all files that reference gleam fields: `src/services/*`, `src/infra/gm-storage.ts`, `src/ui/**/*`, `src/__tests__/*`.
- Update `createGleam()` factory to produce camelCase objects.
- Write a one-time migration script that reads GM_storage data and transforms field names.
- Run migration script manually, verify data integrity.

## E-2: Remove delete()

- Remove `delete(id: string): Promise<void>` from `IRepository` interface.
- Remove `delete()` implementation from `GMStorageAdapter`.
- Remove any UI affordances that call delete (if any exist).
- Update tests that reference delete.

## E-3: Import from shared/types.ts

- Create `shared/types.ts` at repository root.
- Update `src/domain/gleam.ts` to import and re-export from `shared/types.ts`.
- Ensure `tsconfig.json` includes `shared/` in its compilation scope.

## E-4: Non-Nullable Fields with Defaults

Make every scalar field non-nullable by giving it a default value, so serialized
Gleams never carry `undefined`. `media` (an object) remains optional.

- `tags`: `tags?: string[]` → `tags: string[]`, default `[]` (already set by `createGleam()`).
- `revisitCount`: `revisitCount?: number` → `revisitCount: number`, default `0`.
- `lastRevisitedAt`: `lastRevisitedAt?: string` → `lastRevisitedAt: string`, default `''`.
- `Source.url` / `Source.title` / `Source.excerpt`: `?: string` → `: string`, default `''`.
- Audit all reads of these fields: `gleam.tags ?? []` simplifies to `gleam.tags`;
  `gleam.revisitCount ?? 0` simplifies to `gleam.revisitCount`; treat `''` as
  "absent" for `lastRevisitedAt` / `url` / `title` / `excerpt`.
