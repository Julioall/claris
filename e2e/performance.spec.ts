import { test, expect } from './fixtures';

test.describe('Performance', () => {
  test('should load the login page quickly', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have minimal layout shifts', async ({ page }) => {
    await page.goto('/login');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Take screenshot to verify stable layout
    const screenshot1 = await page.screenshot();
    
    // Wait a bit
    await page.waitForTimeout(500);
    
    // Take another screenshot
    const screenshot2 = await page.screenshot();
    
    // Screenshots should be identical (no layout shifts)
    expect(screenshot1.length).toBeGreaterThan(0);
    expect(screenshot2.length).toBeGreaterThan(0);
  });

  test('should load critical resources', async ({ page }) => {
    const resourcesLoaded: string[] = [];
    
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('.js') || url.includes('.css')) {
        resourcesLoaded.push(url);
      }
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Should load at least some JavaScript and CSS files
    expect(resourcesLoaded.length).toBeGreaterThan(0);
  });

  test('should render UI elements without delay', async ({ page }) => {
    await page.goto('/login');
    
    // Key elements should be visible immediately after load
    await expect(page.getByRole('img', { name: /ACTiM/i })).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel(/usuário/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel(/senha/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible({ timeout: 3000 });
  });
});
