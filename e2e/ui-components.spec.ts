import { test, expect } from './fixtures';

test.describe('UI Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should have responsive design', async ({ page }) => {
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByRole('img', { name: /ACTiM/i })).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByRole('img', { name: /ACTiM/i })).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole('img', { name: /ACTiM/i })).toBeVisible();
  });

  test('should render buttons correctly', async ({ page }) => {
    const loginButton = page.getByRole('button', { name: /entrar/i });
    
    // Button should be visible and enabled
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toBeEnabled();
  });

  test('should render input fields with proper attributes', async ({ page }) => {
    const usernameInput = page.getByLabel(/usuário/i);
    const passwordInput = page.getByLabel(/senha/i);

    // Username field
    await expect(usernameInput).toBeVisible();
    await expect(usernameInput).toBeEnabled();

    // Password field
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeEnabled();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should handle form interactions', async ({ page }) => {
    // Fill form
    await page.getByLabel(/usuário/i).fill('testuser');
    await page.getByLabel(/senha/i).fill('password123');

    // Verify values
    await expect(page.getByLabel(/usuário/i)).toHaveValue('testuser');
    await expect(page.getByLabel(/senha/i)).toHaveValue('password123');

    // Clear form
    await page.getByLabel(/usuário/i).clear();
    await page.getByLabel(/senha/i).clear();

    // Verify cleared
    await expect(page.getByLabel(/usuário/i)).toHaveValue('');
    await expect(page.getByLabel(/senha/i)).toHaveValue('');
  });

  test('should have proper page title', async ({ page }) => {
    await expect(page).toHaveTitle(/ACTiM|Moodle|Monitor/i);
  });

  test('should load without console errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.waitForLoadState('networkidle');

    // Filter out known/acceptable errors (like network errors for backend calls)
    const criticalErrors = errors.filter(error => 
      !error.includes('Failed to fetch') && 
      !error.includes('NetworkError') &&
      !error.includes('404')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
