import { test as base, expect } from '@playwright/test';

/**
 * Extend base test with custom fixtures and helpers
 */
export const test = base.extend({
  // Add custom fixtures here if needed in the future
});

export { expect };
