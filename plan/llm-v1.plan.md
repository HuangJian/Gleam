# llm-v1.plan.md

> Status: Draft
>
> This document defines the architecture and implementation plan for introducing Intelligence capabilities into the Gleam backend.
>
> It extends `backend-v1.plan.md` while preserving its architectural principles. Product philosophy and the boundary between human understanding and artificial intelligence are defined in `MANIFEST.md` (Chapter 11 · AI 之界). Whenever implementation details conflict with the Manifest, the Manifest always takes precedence.
>
> Version 1 introduces **LLM-based semantic observation** as the first Intelligence capability. Future versions may incorporate additional analysis engines—including OCR, rule-based analysis, on-device models, and other semantic processing techniques—without changing the overall architecture.

---

# 1. Goals

The purpose of the Intelligence subsystem is not to generate knowledge.

Its purpose is to continuously observe the Repository and derive additional semantic information that helps users revisit, organize and understand their own Gleams.

The Repository remains the single source of truth.

Every piece of understanding continues to originate from the user.

Intelligence contributes only replaceable observations.

Version 1 introduces four capabilities.

- automatic tag generation
- automatic summary generation
- offline repository analysis
- infrastructure for future Reflection

These capabilities operate entirely in the background.

Capturing a Gleam never waits for semantic analysis.

Repository persistence completes immediately.

Intelligence gradually enriches Repository content afterwards.

This asynchronous model keeps the capture experience lightweight while allowing semantic understanding to improve continuously over time.

Several capabilities are intentionally deferred.

- semantic search
- contextual Recall
- automatic knowledge graph construction
- AI-generated Gleams
- conversational assistants
- autonomous Agents

Version 1 therefore focuses on building a durable Intelligence infrastructure rather than exposing AI as a primary user interaction.

---

# 2. Architecture Principles

## Repository Remains the Source of Truth

The Repository stores user-created understanding.

Intelligence never creates, modifies or replaces Repository data.

Fields such as:

- thought
- source
- creation time

always belong to the Repository.

Every semantic artifact produced by Intelligence exists only as derived information attached to an existing Gleam.

Deleting all derived information must leave the Repository fully functional.

---

## Intelligence Is Eventually Consistent

Semantic analysis is intentionally asynchronous.

Repository persistence always completes before any Intelligence processing begins.

A newly created Gleam becomes immediately available for browsing, editing and synchronization.

Semantic analysis may complete seconds or minutes later.

Repository operations therefore never depend on external AI providers.

Intelligence continuously observes Repository changes and gradually converges toward the latest available analysis.

This eventual consistency model separates user interaction from semantic computation while keeping both systems independently evolvable.

---

## Every Derived Artifact Is Independently Replaceable

Different semantic artifacts evolve independently.

Summaries, tags, embeddings and future Reflection metadata each maintain their own lifecycle.

Updating the Summary prompt must not invalidate existing Embeddings.

Likewise, improving Relation analysis must not require regenerating Tags.

Each derived artifact therefore owns its own:

- processing state
- prompt version
- generation timestamp

Future versions may additionally maintain independent model selection when different semantic capabilities require different LLMs.

This separation minimizes unnecessary recomputation while allowing every semantic capability to evolve at its own pace.

---

## Intelligence Depends on Infrastructure

Business modules depend only on abstract Intelligence capabilities.

Intelligence itself depends on Infrastructure.

Provider-specific implementations remain isolated behind the LLM Gateway.

```text
Business Modules
        │
        ▼
   Intelligence
        │
        ▼
   LLM Gateway
        │
        ▼
Provider Adapter
```

The Domain layer never imports provider SDKs or provider-specific request formats.

Replacing one provider with another must not require modifications to Repository logic.

---

## Prompts Are Product Assets

Prompts define product behavior rather than implementation details.

They are versioned together with source code.

Prompt files remain human-readable, reviewable and maintainable through normal version control.

Prompt evolution is expected throughout the lifetime of the product.

Changing a Prompt never modifies Repository data.

Instead, it changes how future semantic observations are produced.

Historical Prompt snapshots are preserved inside the local database to maintain long-term explainability of previously generated artifacts.

---

## Prefer Evolution Over Complexity

Version 1 intentionally targets personal knowledge repositories containing only several thousand Gleams.

The architecture therefore favors simplicity over scalability.

Background processing is driven by a lightweight polling scheduler.

Semantic computation executes inside a single backend process.

No distributed workers, message queues or workflow engines are introduced.

Future evolution should be driven by concrete requirements rather than speculative scalability concerns.

---

# 3. High-Level Architecture

The backend continues to revolve around the Repository.

Intelligence does not introduce another application core.

Instead, it continuously observes the Repository and gradually derives additional semantic information from it.

```text
                    Browser Extension
                           │
                    Background Upload
                           │
                     GraphQL Gateway
                           │
                  Application Services
                     │             │
                     ▼             ▼
               Repository    Intelligence
                     │             │
                     └──────┬──────┘
                            ▼
                     SQLite Database
```

Unlike GraphQL requests, Intelligence is not initiated by external clients.

It operates autonomously inside the backend, periodically inspecting the Repository for semantic work that has not yet been completed.

This design preserves the architectural simplicity established by `backend-v1.plan.md`.

The Repository remains the center of the system.

Intelligence becomes an observer rather than another source of truth.

---

# 4. Intelligence Architecture

The Intelligence module encapsulates every capability responsible for semantic observation.

Version 1 introduces an LLM-powered semantic engine.

The module is intentionally designed so that future semantic engines may coexist without changing the surrounding architecture.

```text
Intelligence
│
├── Scheduler
│
├── Observation Pipeline
│
├── Prompt Registry
│
├── Intelligence Repository
│
├── LLM Gateway
│
└── Future Analysis Engines
        ├── OCR
        ├── Rule-based Analysis
        ├── Local Models
        └── ...
```

The Scheduler determines **when** semantic observation should occur.

The Observation Pipeline determines **how** semantic information is produced.

The Prompt Registry manages product-defined semantic behavior.

The Intelligence Repository persists derived artifacts independently from Repository data.

The LLM Gateway provides a stable abstraction over external language model providers.

Together these components establish a complete semantic runtime while keeping every responsibility narrowly focused.

Version 1 introduces only an LLM-based semantic engine.

Future analysis engines should integrate into the same architecture without requiring modifications to Repository or Application logic.

---

# 5. Repository Observation Model

The Repository is not merely persistent storage.

It is also the object being continuously observed by the Intelligence subsystem.

Whenever a new Gleam appears in the Repository, no immediate semantic computation is performed.

Instead, the Scheduler eventually discovers that this Gleam has not yet been observed.

It creates the corresponding derived-data record and begins semantic processing in the background.

The Repository therefore becomes both:

- the permanent record of user understanding;
- the scheduling source for semantic observation.

No dedicated task queue is introduced.

No explicit event system is required.

The existence and processing state of derived artifacts together define what remains to be observed.

This observation model reflects the product philosophy expressed in the Manifest.

Users create understanding.

The Repository preserves understanding.

Intelligence quietly observes understanding over time, gradually adding semantic interpretations without ever replacing the original thought.

# 6. Derived Data Model

The Repository stores permanent user knowledge.

The Intelligence subsystem stores semantic observations separately.

This separation preserves the distinction between immutable understanding and replaceable semantic interpretation.

```text
gleam
        │
        │ 1 : 1
        ▼
gleam_ai
```

Every Gleam may eventually own one corresponding semantic record.

The semantic record is created by the Scheduler rather than by Repository operations.

Repository creation therefore remains independent from Intelligence.

Deleting every record in `gleam_ai` must never affect Repository integrity.

---

## gleam_ai Lifecycle

Unlike Repository data, AI-derived data does not exist immediately.

Its lifecycle begins only after the Scheduler discovers that a Gleam has not yet been observed.

```text
New Gleam

↓

Scheduler discovers missing observation

↓

Create gleam_ai

↓

Semantic Observation

↓

Observation Complete
```

Repository persistence therefore never depends on Intelligence.

The existence of a `gleam_ai` record indicates that semantic observation has begun.

Its processing state indicates how far that observation has progressed.

---

## Schema

A simplified schema is shown below.

```text
gleam_ai

gleam_id

provider

model

summary

tags

embedding

summary_version

tag_version

relation_version

embedding_model

embedding_dimensions

summary_status

tag_status

embedding_status

relation_status

updated_at
```

The `relation` field is intentionally absent.

Relation data lives in a dedicated many-to-many table described in the Relations subsection below.

`relation_status` and `relation_version` remain in `gleam_ai` to track observation state independently from observation output.

Version 1 assumes a single active provider and model for all semantic capabilities.

This simplifies configuration while preserving a clear migration path toward capability-specific models in future versions.

Embedding metadata is recorded explicitly because different providers may generate vectors with different dimensions.

Future semantic retrieval must therefore be able to distinguish incompatible embedding spaces.

---

## Status Model

Each semantic artifact maintains its own processing state.

Version 1 defines four states.

```text
Pending

↓

Running

↓

Completed

↑

Failed
```

Pending indicates that computation has not yet started.

Running indicates that the Scheduler has claimed the work.

Completed indicates that the artifact has been successfully generated.

Failed indicates that computation did not complete successfully and may be retried later.

Each artifact (`summary_status`, `tag_status`, `embedding_status`, `relation_status`) maintains its own state independently.

Processing state belongs only to derived data.

Repository data itself never enters these states.

### No Stale State

Version 1 intentionally does not introduce a Stale state.

When a Prompt version changes, existing Completed artifacts remain in the Completed state.

They are not automatically marked as outdated.

Users may manually request regeneration through the GraphQL API.

This decision keeps the state model simple and avoids automatic batch recomputation.

---

## Model Provenance

Every `gleam_ai` record stores the provider and model used during generation.

```text
provider

model
```

This metadata provides provenance and reproducibility information.

Version 1 does not track per-artifact model selection.

All semantic capabilities within a single observation use the same configured model.

When the configured model changes, existing artifacts remain unchanged.

Model changes do not trigger automatic staleness or regeneration.

Users may manually refresh individual artifacts if they wish to use a newer model.

This is an acceptable simplification for Version 1.

Future versions may introduce per-artifact model tracking when capability-specific models become necessary.

Embedding-specific metadata (`embedding_model`, `embedding_dimensions`) is tracked separately because different models produce vectors with incompatible dimensions.

This technical requirement is independent of the general model provenance field.

---

## Embedding Storage

Version 1 stores embeddings persistently even though semantic retrieval is not yet implemented.

Embeddings are serialized as binary Float32 arrays and stored as SQLite BLOB values.

```text
Float32Array

↓

ArrayBuffer

↓

SQLite BLOB
```

The corresponding vector dimension is stored alongside the embedding.

```text
embedding

embedding_dimensions

embedding_model
```

This representation minimizes storage overhead while remaining compatible with future vector indexing solutions such as `sqlite-vec`.

Until native vector indexing is introduced, all vector operations remain application-level computations.

---

## Relations

Relations represent semantic connections between Gleams.

They are stored in a dedicated many-to-many table rather than as a field inside `gleam_ai`.

This separation reflects the fundamental difference between per-Gleam observations (summary, tags, embedding) and inter-Gleam observations (relations).

### Relation Types

Relations may originate from different sources and represent different semantic connections.

```text
AI-identified
    semantic proximity
    causal (future)
    evolutionary (future)
    synonymous (future)
    refutation (future)

User-created
    finalization (future)
    errata (future)
    milestone summary (future)
```

Version 1 implements only semantic proximity relations.

### Relation vs Recall

Relations and Recall are fundamentally different despite both involving semantic similarity.

```text
Relation
    user-initiated
    passive
    shown during Review
    "here are Gleams related to this one"

Recall
    system-initiated
    proactive
    shown during browsing
    "this past Gleam might be relevant to what you're reading now"
```

Version 1 implements Relations.

Recall is explicitly excluded.

### Schema

```text
gleam_relations

id                  TEXT PK (UUID v7)

source_gleam_id     TEXT NOT NULL (FK → gleams.id)

target_gleam_id     TEXT NOT NULL (FK → gleams.id)

relation_type       TEXT NOT NULL DEFAULT 'semantic_proximity'

strength            REAL

origin              TEXT NOT NULL DEFAULT 'ai'

created_at          TEXT NOT NULL

UNIQUE(source_gleam_id, target_gleam_id, relation_type)
```

`strength` stores cosine similarity for AI-generated relations.

It is NULL for user-created relations where no numerical strength applies.

`origin` distinguishes AI-generated observations from user-created connections.

This field ensures that user-created relations survive AI regeneration while AI-generated relations can be safely replaced.

### Relation Lifecycle

AI-generated relations are created by the Relation Stage during observation.

When the Relation Stage re-runs for a Gleam, it replaces only AI-origin relations.

```text
Delete AI relations where source_gleam_id = this Gleam

↓

Insert new AI relations from latest similarity computation
```

User-created relations are never automatically modified or deleted.

### Observation Status

The Relation Stage tracks its observation status inside `gleam_ai.relation_status`.

This allows the Scheduler to determine whether relation observation has been performed for each Gleam.

The actual relation data lives in `gleam_relations`.

This split separates observation state from observation output.

---

# 7. Tag Ownership

Tags are jointly produced by users and Intelligence.

Ownership, however, remains explicit.

User-created tags always belong to the Repository.

AI-generated tags always belong to the Intelligence subsystem.

Neither side directly modifies the other.

```text
gleam_derived.tags

        +

gleam_ai.tags

        -

gleam_derived.removed_tags

↓

Visible Tags
```

The visible tag set is therefore computed rather than stored.

```text
visibleTags

=

unique(userTags + aiTags)

− removedTags
```

### Storage Format

`gleam_derived.removed_tags` uses the same storage format as `gleam_derived.tags`.

Both are JSON-serialized string arrays stored in TEXT columns.

Default value is `'[]'`.

`removed_tags` is managed exclusively by the backend through GraphQL mutations.

It is not synced from the client and does not appear in `shared/types.ts`.

### Migration

Adding `removed_tags` to `gleam_derived` requires a database migration.

The migration adds the column with a default value of `'[]'` to ensure existing rows remain valid.

This model preserves the complete AI observation while allowing users to permanently reject individual suggestions.

---

## User Operations

Adding a tag always creates Repository knowledge.

The new tag is written into:

```text
gleam_derived.tags
```

Deleting a user-created tag removes it from the user tag collection and records the deletion.

Deleting an AI-generated tag never modifies the AI observation itself.

Instead, the deleted tag is recorded inside:

```text
gleam_derived.removed_tags
```

Future AI regeneration therefore remains deterministic.

Even if the latest semantic observation produces the same tag again, the user's previous rejection continues to take effect.

If the user later decides to restore that tag manually, it is removed from `removed_tags` and inserted into the user-owned tag collection.

This model treats AI observations as immutable semantic output while preserving complete user ownership over the visible Repository.

---

# 8. Repository-Level Intelligence

Not every semantic artifact belongs to an individual Gleam.

Future semantic capabilities may derive information from the Repository as a whole.

Examples include:

- repository clustering
- topic evolution
- long-term Reflection
- timeline emergence

These observations do not naturally belong to a single Gleam.

Version 1 therefore reserves a repository-level semantic storage model.

```text
repository_ai
```

Version 1 does not define its schema.

The table is introduced only as an architectural placeholder.

Future semantic capabilities should persist repository-wide observations independently from per-Gleam semantic artifacts.

This separation avoids forcing fundamentally different semantic concepts into the `gleam_ai` table.

---

# 9. Prompt Management

Prompts define semantic behavior.

They are treated as versioned product assets rather than implementation details.

Prompt files remain part of the source tree.

A possible structure is shown below.

```text
prompts/

    summary/
        v1.md

    tags/
        v1.md

    relation/
        v1.md

    reflection/
        v1.md
```

Each semantic capability evolves independently.

Improving Summary prompts does not require changing Tag prompts.

Likewise, future Reflection prompts should evolve without affecting existing semantic generation.

---

## Prompt Registry

The Prompt Registry maps logical capabilities to the latest available prompt versions.

```text
summary

↓

v2
```

```text
tags

↓

v1
```

Pipeline stages never load prompt files directly.

Instead, they resolve prompts through the registry.

This indirection allows prompt evolution without changing processing logic.

---

## Prompt Snapshot

Prompt files describe the current product behavior.

However, historical semantic observations must remain explainable long after source code has evolved.

Version 1 therefore introduces persistent Prompt snapshots.

```text
prompt_history

capability

version

content

checksum

created_at
```

Whenever a Prompt version is used for the first time, its complete content is archived inside the local database.

The `checksum` field stores a hash of the Prompt content.

It serves three purposes:

- deduplication — identical Prompt content is stored only once;
- integrity verification — detects corruption or accidental modification;
- tamper detection — ensures archived content matches the original source.

Prompt snapshots are never consulted during normal execution.

Their purpose is historical explainability.

Years later, previously generated summaries remain traceable to the exact Prompt that produced them, even if the original source repository is no longer available.

---

## Prompt Evolution

Prompt upgrades affect only future semantic observations.

Existing derived artifacts remain valid.

When a new Prompt version becomes available:

- newly observed Gleams immediately use the latest Prompt;
- existing observations continue using their original version.

During Review, the frontend may detect that a newer Prompt exists.

Users may then explicitly request regeneration for an individual semantic artifact, such as refreshing only the Summary.

Version 1 intentionally avoids automatic batch regeneration.

Prompt evolution therefore remains user-driven rather than infrastructure-driven.

---

# 10. Observation Pipeline

The Observation Pipeline defines how semantic observations are produced.

Its responsibility is not scheduling.

Its responsibility is to coordinate semantic capabilities while respecting their dependencies.

Each semantic capability is implemented as an independent Observation Stage.

A stage owns exactly one semantic artifact.

For example:

```text
Embedding Stage

↓

produces embedding
```

```text
Summary Stage

↓

produces summary
```

Each stage reads Repository data together with previously generated semantic artifacts and decides whether additional computation is required.

Stages never modify artifacts owned by other stages.

This separation allows every semantic capability to evolve independently.

---

## Observation Context

Rather than repeatedly loading Repository state, every observation shares a single processing context.

A simplified context contains:

```text
ObservationContext

gleam

gleam_ai

provider

promptRegistry
```

The context exists only during one observation cycle.

It is never persisted.

Stages enrich the context as semantic computation progresses.

The Repository therefore remains the persistent state, while the Observation Context becomes the transient execution state.

---

## Stage Dependencies

Semantic capabilities are independent whenever possible.

Some capabilities, however, naturally depend on previous observations.

Version 1 defines the following dependency graph.

```text
Embedding

Summary

Tag

    │

    └────────────┐
                 ▼
             Relation
```

Embedding, Summary and Tag are independent.

Relation requires an existing embedding because semantic similarity is computed in embedding space.

The Relation Stage reads the current Gleam's embedding, computes cosine similarity against all other Gleam embeddings, and writes results above a similarity threshold into the `gleam_relations` table.

Only AI-origin relations for the current Gleam are replaced.

User-created relations remain untouched.

The pipeline therefore represents dependency ordering rather than execution ordering.

---

## Execution Strategy

Version 1 executes every stage sequentially.

```text
for stage

    if dependencies satisfied

        execute
```

Although sequential execution is sufficient for the expected Repository size, the dependency graph intentionally permits future parallel execution.

For example:

```text
Embedding

Summary

Tag

(parallel)

↓

Relation
```

No architectural changes are required when concurrency is introduced.

The dependency graph remains unchanged.

---

## Stage Failure

Failure of one semantic capability must not prevent others from progressing.

For example:

```text
Embedding

✓

Summary

✓

Tag

✗

Relation

skipped
```

Tag may be retried later.

Summary remains available immediately.

Relation is skipped because one of its required dependencies is unavailable.

Each semantic artifact therefore maintains its own lifecycle independently.

---

# 11. Scheduler Runtime

The Scheduler continuously observes the Repository.

Unlike GraphQL requests, Scheduler execution is autonomous.

Version 1 adopts a lightweight polling strategy.

Every fixed interval, the Scheduler performs one observation cycle.

```text
Scan

↓

Claim

↓

Observe

↓

Persist

↓

Sleep
```

The polling interval is expected to be approximately thirty seconds.

Latency is intentionally measured in seconds rather than milliseconds.

Semantic observation is a background activity.

Immediate execution is not part of the user interaction model.

---

## Startup

The Scheduler starts together with the backend.

Initialization performs the following steps.

```text
Load Prompt Registry

↓

Recover Running Observations

↓

Start Polling Loop
```

Repository startup never waits for pending semantic work to complete.

Observation resumes gradually after initialization.

---

## Discovering Work

The Scheduler does not consume a dedicated task queue.

Instead, it derives work directly from Repository state.

For every observation cycle, it performs two queries.

First, discover Gleams that have never been observed.

```text
gleam

LEFT JOIN

gleam_ai

↓

missing
```

For each missing record, the Scheduler creates a corresponding `gleam_ai` entry.

Second, discover semantic artifacts whose processing state indicates pending work.

Examples include:

- Pending
- Failed (retry)

The Repository itself therefore becomes the scheduling source.

---

## Observation Lock

Version 1 executes only one observation cycle at a time.

If one observation cycle is still running when the next polling interval arrives, the new cycle is skipped.

```text
tick

↓

already running ?

↓

yes

↓

return
```

This coarse-grained lock keeps the implementation simple while preventing overlapping observations.

Given the expected Repository size, a single observation worker is sufficient.

---

## Provider Not Configured

When no provider configuration exists, the Scheduler skips the observation cycle entirely.

```text
tick

↓

provider configured ?

↓

no

↓

return
```

All pending artifacts remain in their current state.

No artifact transitions to Failed due to missing provider configuration.

When a provider is configured later, the Scheduler resumes normal operation and begins processing pending work.

---

## Recovery

Unexpected backend termination may leave observations in the Running state.

During startup, the Scheduler scans for stale Running records.

These records are safely returned to Pending before polling begins.

```text
Running

↓

Backend Restart

↓

Pending
```

No manual recovery is required.

Observation eventually resumes automatically.

---

## Retry Policy

Transient failures are expected.

Version 1 distinguishes retryable failures from permanent failures.

Retryable examples include:

- network interruption
- provider timeout
- temporary service unavailable

Non-retryable examples include:

- invalid API key
- unsupported model
- malformed configuration

Retryable failures use exponential backoff.

A simplified strategy is:

```text
1 min

↓

5 min

↓

30 min

↓

2 hours
```

After the maximum retry count is exceeded, the artifact remains in the Failed state.

Further processing requires explicit user action, such as updating provider configuration or requesting regeneration.

---

# 12. Intelligence Repository Interface

The Intelligence subsystem never accesses SQLite directly.

Like every other backend component, it communicates through repository interfaces.

Version 1 introduces a dedicated `IIntelligenceRepository` interface.

The existing `SqliteRepository` class implements both `IRepository` and `IIntelligenceRepository`.

```typescript
interface IIntelligenceRepository {
  // Observation lifecycle
  findUnobservedGleams(limit: number): Promise<string[]>
  findPendingArtifacts(limit: number): Promise<PendingArtifact[]>
  createGleamAI(gleamId: string): Promise<void>
  recoverRunningObservations(): Promise<number>

  // Artifact updates
  updateSummary(
    gleamId: string,
    summary: string,
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void>
  updateTags(
    gleamId: string,
    tags: string[],
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void>
  updateEmbedding(
    gleamId: string,
    embedding: Buffer,
    dimensions: number,
    provider: string,
    model: string,
  ): Promise<void>
  updateRelationObservation(
    gleamId: string,
    provider: string,
    model: string,
    promptVersion: string,
  ): Promise<void>

  // Status management
  setArtifactStatus(
    gleamId: string,
    artifact: ArtifactType,
    status: ObservationStatus,
  ): Promise<void>
  getGleamAI(gleamId: string): Promise<GleamAI | null>

  // Relations
  findSimilarGleams(
    gleamId: string,
    threshold: number,
    limit: number,
  ): Promise<Array<{ gleamId: string; similarity: number }>>
  replaceAIRelations(
    sourceGleamId: string,
    relations: Array<{ targetGleamId: string; strength: number }>,
  ): Promise<void>
  getRelations(gleamId: string): Promise<GleamRelation[]>

  // Provider configuration
  getIntelligenceConfig(): Promise<IntelligenceConfig | null>
  saveIntelligenceConfig(config: IntelligenceConfig): Promise<void>
  removeIntelligenceConfig(): Promise<void>

  // Prompt history
  savePromptSnapshot(
    capability: string,
    version: string,
    content: string,
    checksum: string,
  ): Promise<void>
  getPromptSnapshot(capability: string, version: string): Promise<PromptSnapshot | null>
}
```

The repository remains responsible for persistence.

The Intelligence subsystem remains responsible only for semantic computation.

This preserves the dependency direction established by `backend-v1.plan.md`.

---

# 13. GraphQL Integration

GraphQL exposes semantic observations as ordinary Repository data.

Clients do not communicate with LLM providers directly.

Instead, they read and configure Intelligence through GraphQL.

---

## Gleam Type Extensions

The `Gleam` type is extended with Intelligence fields.

`tags` returns the visible tag set (user tags + AI tags − removed tags) rather than user tags alone.

This semantic change means clients automatically receive the effective tag set without reconstructing ownership rules.

`aiTags` returns AI-generated tags before user removal, allowing clients to display provenance indicators.

```graphql
extend type Gleam {
  summary: String
  aiTags: [String!]!
  relations: [GleamRelation!]!
}

type GleamRelation {
  id: ID!
  targetGleam: Gleam!
  relationType: String!
  strength: Float
  origin: RelationOrigin!
}

enum RelationOrigin {
  AI
  USER
}
```

---

## Intelligence Configuration

```graphql
type IntelligenceConfig {
  provider: String
  model: String
  hasApiKey: Boolean!
}
```

`hasApiKey` indicates whether an API key is configured.

The key itself is never returned.

---

## Provider Configuration Mutations

```graphql
input ConfigureProviderInput {
  provider: String!
  model: String!
  apiKey: String!
}

type ConfigureProviderPayload {
  provider: String!
  model: String!
  success: Boolean!
}

type RemoveProviderPayload {
  success: Boolean!
}
```

API keys are write-only.

GraphQL never returns decrypted credentials.

`configureProvider` validates the configuration before persisting.

Replacing an API key immediately affects future observations.

Previously generated semantic artifacts remain unchanged.

`removeProvider` disables future semantic observation while preserving existing derived artifacts.

All pending artifacts remain in their current state — none transition to Failed.

---

## Tag Management

```graphql
input RemoveTagInput {
  gleamId: ID!
  tag: String!
}

type RemoveTagPayload {
  gleamId: ID!
  success: Boolean!
}
```

`removeTag` handles both user and AI tags:

- if the tag exists in `gleam_derived.tags`, it is removed and added to `removed_tags`;
- if the tag exists only in `gleam_ai.tags`, it is added to `removed_tags` without modifying the AI observation.

When `updateGleamDerivedFields` adds a tag that was previously in `removed_tags`, the tag is automatically removed from `removed_tags`.

This restores the tag's visibility without requiring a separate mutation.

---

## Regeneration Mutations

```graphql
input RegenerateArtifactInput {
  gleamId: ID!
  artifact: ArtifactType!
}

enum ArtifactType {
  SUMMARY
  TAGS
  EMBEDDING
  RELATION
}

type RegenerateArtifactPayload {
  gleamId: ID!
  artifact: ArtifactType!
  success: Boolean!
}
```

These operations simply mark the corresponding artifact as Pending.

The Scheduler discovers the new work during a later observation cycle.

GraphQL therefore never invokes semantic computation directly.

It only changes Repository state.

The Scheduler remains the sole execution engine.

---

## Schema Extensions

```graphql
extend type Query {
  intelligenceConfig: IntelligenceConfig
}

extend type Mutation {
  configureProvider(input: ConfigureProviderInput!): ConfigureProviderPayload!
  removeProvider: RemoveProviderPayload!
  removeTag(input: RemoveTagInput!): RemoveTagPayload!
  regenerateArtifact(input: RegenerateArtifactInput!): RegenerateArtifactPayload!
}
```

# 14. LLM Gateway

The LLM Gateway encapsulates every interaction with external language model providers.

Its responsibility is to translate provider-independent semantic requests into provider-specific API calls.

Business modules never communicate with providers directly.

Instead, every semantic capability invokes the Gateway through a stable abstraction.

```text
Intelligence

        │

        ▼

LLM Gateway

        │

   ┌────┴────┐

   ▼         ▼

OpenAI   Gemini   ...
```

Version 1 defines semantic operations rather than provider APIs.

Representative operations include:

- generate summary
- generate tags
- generate embedding
- generate relation

Future providers should implement the same interface without affecting higher-level Intelligence components.

---

## Provider Adapter

Every provider implements a common interface.

```text
LLMProvider

summarize()

generateTags()

generateEmbedding()

generateRelation()
```

Different providers may expose different HTTP APIs, authentication methods or response formats.

These differences remain entirely inside the provider adapter.

The Intelligence subsystem never depends on provider-specific SDKs.

---

## Runtime Configuration

Provider configuration is managed through backend APIs.

Configuration includes:

- provider
- model
- encrypted API key

Version 1 assumes that all semantic capabilities share the same configured model.

Future versions may introduce capability-specific model selection without changing the surrounding architecture.

---

# 15. Prompt Runtime

Prompt files are part of the product source tree.

During backend startup, the Prompt Registry scans the prompt directory and loads every available Prompt into memory.

```text
prompts/

summary/

tags/

relation/

reflection/
```

The registry builds an in-memory mapping from capability to the latest available version.

Observation stages resolve prompts through this registry.

Prompt files are therefore loaded once during startup rather than read repeatedly during observation.

---

## Packaging

Prompt files are treated as runtime resources.

Development builds load Prompt files directly from the source tree.

Production builds package Prompt files together with backend resources.

Docker images therefore contain both executable code and Prompt assets.

Prompt files remain ordinary Markdown documents throughout the deployment process.

No code generation step is required.

---

## Version Evolution

Prompt evolution follows normal software release cycles.

Each new application release may introduce newer Prompt versions.

For newly observed Gleams:

```text
latest Prompt

↓

used immediately
```

For previously observed Gleams:

```text
existing Prompt

↓

preserved
```

Prompt upgrades therefore never invalidate historical semantic observations automatically.

Users remain in control of regeneration.

---

# 16. Security Model

Intelligence communicates with external providers.

Repository data may therefore leave the local device.

Version 1 assumes that users explicitly choose their own provider.

The backend provides the necessary infrastructure while avoiding unnecessary persistence of sensitive information.

---

## Provider Configuration

The backend exposes write-only configuration APIs.

A typical flow is:

```text
User

↓

Provider

↓

Model

↓

API Key

↓

Validate

↓

Encrypt

↓

Persist
```

Validation occurs before persistence.

Only usable provider configurations are stored.

Invalid credentials are rejected immediately.

---

## Encryption

API keys are encrypted before entering the database.

Version 1 uses AES-256-GCM authenticated encryption.

A random 12-byte initialization vector (IV) is generated for each encryption operation.

The IV is stored alongside the ciphertext to enable decryption.

The authentication tag ensures ciphertext integrity.

```text
APP_SECRET (environment variable)

↓

derive encryption key

↓

AES-256-GCM

↓

{ ciphertext, IV, authTag }

↓

SQLite
```

The backend decrypts credentials only when issuing provider requests.

Plaintext API keys are never written into logs or returned through GraphQL.

Decryption occurs only within the Gateway at the point of provider invocation.

---

## Configuration Storage

A dedicated configuration table stores Intelligence settings.

A simplified schema is:

```text
intelligence_config

provider

model

encrypted_api_key

api_key_iv

updated_at
```

This table contains at most one row.

The `api_key_iv` field stores the base64-encoded initialization vector used during encryption.

Removing the provider configuration disables future semantic observation.

Previously generated semantic artifacts remain untouched.

No additional consent state is stored.

Choosing an external provider is itself treated as explicit acknowledgement that Repository content may be transmitted to that provider.

---

# 17. Testing Strategy

Semantic computation differs fundamentally from ordinary backend logic.

Provider responses are nondeterministic.

Requests are slow.

External APIs consume quota.

Version 1 therefore separates semantic testing from provider testing.

---

## Mock Provider

Every unit test uses a mock implementation of the LLM Provider interface.

For example:

```text
MockProvider

↓

Fixed Summary

Fixed Tags

Fixed Embedding
```

The Intelligence subsystem therefore remains completely deterministic during automated testing.

---

## Repository Integration Tests

Pipeline integration tests follow the same testing philosophy established in `backend-v1.plan.md`.

Each test creates a temporary SQLite database.

The Repository uses real persistence.

The LLM Gateway uses a mock provider.

This approach verifies the interaction between:

- Repository
- Scheduler
- Observation Pipeline

without introducing external dependencies.

---

## Scheduler Testing

Scheduler execution is exposed through an explicit `tick()` method.

Unit tests invoke `tick()` directly.

No real timers are required.

This makes Scheduler behavior deterministic while avoiding unnecessary waiting during automated tests.

---

## Manual Verification

Only a small number of manual acceptance tests communicate with real providers.

Typical verification scenarios include:

- provider configuration
- API key validation
- Prompt rendering
- end-to-end semantic generation

These tests verify external compatibility rather than application logic.

---

# 18. Development Roadmap

Implementation proceeds incrementally.

Each milestone establishes one architectural capability before introducing additional semantic behavior.

---

## Milestone 1 · Intelligence Foundation

Introduce the Intelligence runtime.

Deliverables:

- Intelligence module
- Scheduler
- Observation Context
- Repository interfaces

At the completion of this milestone, the backend understands semantic observation conceptually but performs no AI computation.

---

## Milestone 2 · Derived Data

Introduce persistent semantic storage.

Deliverables:

- `gleam_ai`
- `gleam_relations`
- `prompt_history`
- `intelligence_config`
- `gleam_derived` migration (add `removed_tags`)

Repository data and semantic observations are now stored independently.

---

## Milestone 3 · Prompt Runtime

Introduce Prompt infrastructure.

Deliverables:

- Prompt Registry
- Prompt loading
- Prompt snapshot persistence
- Prompt version management

Semantic behavior becomes versioned product assets.

---

## Milestone 4 · LLM Gateway

Introduce provider abstraction.

Deliverables:

- Gateway interface
- OpenAI reference implementation
- provider configuration
- encrypted credential storage

At this stage, the backend can communicate with external language model providers.

---

## Milestone 5 · Observation Runtime

Connect Scheduler, Pipeline and Gateway.

Deliverables:

- Observation Pipeline
- dependency scheduling
- retry mechanism
- startup recovery
- observation locking

The backend now continuously observes Repository changes in the background.

---

## Milestone 6 · Semantic Generation

Introduce Version 1 semantic capabilities.

Deliverables:

- Embedding generation
- Summary generation
- Tag generation
- Relation generation
- GraphQL integration

Newly created Gleams gradually acquire semantic observations after background processing completes.

Users remain free to ignore, edit or selectively regenerate these observations.

---

## Milestone 7 · Reflection Foundation

Prepare repository-level semantic infrastructure.

Deliverables:

- `repository_ai` table
- repository-level observation framework
- clustering infrastructure
- timeline analysis interfaces
- Reflection runtime foundation

Version 1 intentionally stops at the infrastructure boundary.

No Reflection user interface is introduced.

The purpose of this milestone is to ensure that future Reflection capabilities emerge by extending the existing Intelligence runtime rather than restructuring it.

---

# Appendix A. Project Structure

Intelligence-related code integrates into the existing backend layout.

```text
backend/
  src/
    domain/
      gleam.ts               # existing
      gleam-ai.ts            # NEW: GleamAI, GleamRelation, ObservationStatus types

    intelligence/             # NEW: Intelligence module
      scheduler.ts            # polling loop, tick(), recovery
      pipeline.ts             # observation pipeline orchestration
      observation-context.ts  # transient processing context
      prompt-registry.ts      # prompt loading and version mapping
      stages/
        embedding-stage.ts
        summary-stage.ts
        tag-stage.ts
        relation-stage.ts

    gateway/                  # NEW: LLM Gateway (infrastructure)
      llm-provider.ts         # LLMProvider interface
      openai-provider.ts      # reference implementation

    repository/
      repository.ts           # extended with IIntelligenceRepository
      sqlite-repository.ts    # extended with AI operations

    database/
      schema.ts               # extended: gleam_ai, gleam_relations, etc.

    graphql/
      schema.ts               # extended: Intelligence types and mutations

    config/
      encryption.ts           # NEW: AES-256-GCM encrypt/decrypt utilities

  prompts/                    # NEW: versioned prompt assets
    summary/
      v1.md
    tags/
      v1.md
    relation/
      v1.md
```

The `intelligence/` module contains business logic.

The `gateway/` module contains provider-specific infrastructure.

Both are new additions that follow the dependency direction established by `backend-v1.plan.md`.

Prompt files live under `backend/prompts/` and are loaded during startup.

---

# Appendix B. Shared Type Definitions

Version 1 does not extend `shared/types.ts` with Intelligence-specific types.

AI-derived data types (`GleamAI`, `GleamRelation`, `ObservationStatus`) are defined exclusively in the backend.

The client reads Intelligence data through GraphQL.

Client-side type definitions for AI data will be introduced when the client begins integrating Intelligence features in a future version.

This decision keeps `shared/types.ts` focused on the core domain model during the Intelligence infrastructure phase.

---

# 19. Out of Scope

The following capabilities are intentionally excluded from Version 1.

- semantic search
- contextual Recall
- automatic knowledge graph construction
- autonomous Agents
- conversational interaction
- repository-wide automatic regeneration
- distributed schedulers
- multi-process execution
- vector database integration
- capability-specific model selection

These capabilities are expected to evolve naturally from the Intelligence architecture introduced in this document.
