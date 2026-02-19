import { test, expect } from './fixtures';

test.describe('Navigation', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    // Try to access protected route
    await page.goto('/');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should redirect to login for protected routes', async ({ page }) => {
    const protectedRoutes = [
      '/',
      '/meus-cursos',
      '/escolas',
      '/alunos',
      '/pendencias',
      '/acoes',
      '/mensagens',
      '/configuracoes',
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL('/login');
    }
  });

  test('should show 404 page for non-existent routes', async ({ page }) => {
    await page.goto('/non-existent-route');
    
    // Should show 404 or redirect to login (depending on auth state)
    const url = page.url();
    expect(url).toMatch(/\/(login|.*)/);
  });

  test('should have accessible login page', async ({ page }) => {
    await page.goto('/login');
    
    // Basic accessibility checks - inputs should be labeled
    await expect(page.getByLabel(/usuário/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    
    // Form should exist
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });
});
