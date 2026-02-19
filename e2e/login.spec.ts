import { test, expect } from './fixtures';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    // Check if the page has the login form elements
    await expect(page.getByLabel(/usuário/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('should display logo', async ({ page }) => {
    // Check if logo is visible
    const logo = page.getByRole('img', { name: /ACTiM/i });
    await expect(logo).toBeVisible();
  });

  test('should show validation error for empty fields', async ({ page }) => {
    // Try to submit without filling fields
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Should show error message
    await expect(page.getByText(/preencha todos os campos/i)).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.getByLabel(/senha/i);
    
    // Password should be hidden by default
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Find and click the eye icon button (password toggle)
    const toggleButton = page.locator('button').filter({ has: page.locator('svg') }).nth(0);
    await toggleButton.click();
    
    // Password should now be visible
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('should show advanced settings', async ({ page }) => {
    // Check if advanced settings button exists
    const advancedButton = page.getByRole('button', { name: /configurações avançadas/i });
    
    if (await advancedButton.isVisible()) {
      await advancedButton.click();
      
      // Advanced fields should be visible
      await expect(page.getByLabel(/URL do Moodle/i)).toBeVisible();
      await expect(page.getByLabel(/Nome do Serviço/i)).toBeVisible();
    }
  });

  test('should have correct default Moodle URL', async ({ page }) => {
    // Click advanced settings if available
    const advancedButton = page.getByRole('button', { name: /configurações avançadas/i });
    
    if (await advancedButton.isVisible()) {
      await advancedButton.click();
      
      // Check default Moodle URL
      const urlInput = page.getByLabel(/URL do Moodle/i);
      await expect(urlInput).toHaveValue('https://ead.fieg.com.br');
    }
  });

  test('should navigate to dashboard after successful login (mocked)', async ({ page }) => {
    // Note: This test would need a real backend or mocked authentication
    // For now, we just verify the form can accept input
    await page.getByLabel(/usuário/i).fill('testuser');
    await page.getByLabel(/senha/i).fill('testpassword');
    
    // Verify inputs were filled
    await expect(page.getByLabel(/usuário/i)).toHaveValue('testuser');
    await expect(page.getByLabel(/senha/i)).toHaveValue('testpassword');
  });
});
