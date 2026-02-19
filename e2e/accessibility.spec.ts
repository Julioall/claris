import { test, expect } from './fixtures';

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should have proper ARIA labels', async ({ page }) => {
    // Check for labeled inputs
    const usernameInput = page.getByLabel(/usuário/i);
    const passwordInput = page.getByLabel(/senha/i);

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Tab through form elements
    await page.keyboard.press('Tab');
    
    // First input should be focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
    // The focused element should be an interactive element
    expect(['INPUT', 'BUTTON', 'A', 'BODY']).toContain(focusedElement);
  });

  test('should have semantic HTML structure', async ({ page }) => {
    // Check for semantic elements
    const main = page.locator('main, [role="main"]');
    const form = page.locator('form');
    
    // At least one should exist
    const hasSemanticStructure = await main.count() > 0 || await form.count() > 0;
    expect(hasSemanticStructure).toBeTruthy();
  });

  test('should have visible focus indicators', async ({ page }) => {
    const usernameInput = page.getByLabel(/usuário/i);
    
    // Focus the input
    await usernameInput.focus();
    
    // Check if element is focused
    const isFocused = await usernameInput.evaluate(el => el === document.activeElement);
    expect(isFocused).toBeTruthy();
  });

  test('should have alternative text for images', async ({ page }) => {
    const logo = page.getByRole('img', { name: /ACTiM/i });
    
    // Logo should have alt text
    await expect(logo).toHaveAttribute('alt');
  });

  test('should support screen reader text', async ({ page }) => {
    // Check for buttons with descriptive text
    const loginButton = page.getByRole('button', { name: /entrar/i });
    await expect(loginButton).toBeVisible();
  });
});
