import { afterEach, beforeEach, vi } from 'vitest';
import { reviewBoundedUpdateSet } from '../../../src/review/update-set-adapter.js';
import { ReviewTestScope } from './review-test-scope.js';

/** Shared by the adapter suite and its actual-framework-timeout regression. */
export function installAdapterReviewScope(): typeof reviewBoundedUpdateSet {
  let scope: ReviewTestScope;
  beforeEach(context => {
    const owned = new ReviewTestScope(context.signal); scope = owned;
    context.onTestFinished(() => { Object.assign(context.task.meta, { bp5_review_lifecycle: owned.diagnostics() }); });
  });
  afterEach(async () => {
    // Keep injected I/O and clock semantics intact until the real adapter finally releases admission.
    try { await scope.close(); }
    finally { vi.restoreAllMocks(); vi.useRealTimers(); }
  });
  return (client, input, options) => scope.review(client, input, options);
}
