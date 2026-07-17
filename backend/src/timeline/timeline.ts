import type { IRepository, TimelineOptions, TimelineResult } from '../repository/repository'

/**
 * Timeline service — the primary retrieval model.
 *
 * V1 implements only the time axis (chronological, descending).
 * Semantic clustering is deferred to a future version.
 *
 * MANIFEST ch.5 §二 defines Timeline as dual-axis (time + semantics).
 * This is an explicit scope decision, not a contradiction.
 */
export class TimelineService {
  constructor(private readonly repository: IRepository) {}

  async getTimeline(options: TimelineOptions): Promise<TimelineResult> {
    return this.repository.getTimeline(options)
  }
}
