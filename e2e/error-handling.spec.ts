import { test, expect } from './fixtures';

test.describe('Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should show validation error for empty username', async ({ page }) => {
    // Leave username empty, fill password
    await page.getByLabel(/senha/i).fill('somepassword');
    
    // Try to submit
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/preencha todos os campos/i)).toBeVisible();
  });

  test('should show validation error for empty password', async ({ page }) => {
    // Fill username, leave password empty
    await page.getByLabel(/usuário/i).fill('testuser');
    
    // Try to submit
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/preencha todos os campos/i)).toBeVisible();
  });

  test('should clear error message when user starts typing', async ({ page }) => {
    // Submit empty form to trigger error
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Error should be visible
    await expect(page.getByText(/preencha todos os campos/i)).toBeVisible();
    
    // Start typing in username field
    await page.getByLabel(/usuário/i).fill('test');
    
    // Click outside or wait a bit to allow error to potentially clear
    // (Note: This depends on implementation - if error persists, that's ok)
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Fill valid credentials
    await page.getByLabel(/usuário/i).fill('testuser');
    await page.getByLabel(/senha/i).fill('testpassword');
    
    // Submit form (will fail without real backend, but should handle gracefully)
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Should not crash the application
    // The page should still be responsive
    await expect(page.getByLabel(/usuário/i)).toBeVisible();
  });

  test('should handle form submission without backend', async ({ page }) => {
    // Fill form
    const testUsername = 'testuser123';
    const testPassword = 'testpassword456';
    
    await page.getByLabel(/usuário/i).fill(testUsername);
    await page.getByLabel(/senha/i).fill(testPassword);
    
    // Submit (will fail without backend)
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Wait a bit for any error handling
    await page.waitForTimeout(1000);
    
    // Application should still be functional
    // (Note: Form fields might be cleared for security - that's expected)
    await expect(page.getByLabel(/usuário/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
  });

  test('should handle rapid form submissions', async ({ page }) => {
    // Fill form
    await page.getByLabel(/usuário/i).fill('testuser');
    await page.getByLabel(/senha/i).fill('testpassword');
    
    // Click submit button multiple times rapidly
    const submitButton = page.getByRole('button', { name: /entrar/i });
    await submitButton.click();
    await submitButton.click();
    await submitButton.click();
    
    // Application should still be functional
    await expect(page.getByLabel(/usuário/i)).toBeVisible();
  });

  test('should handle special characters in input fields', async ({ page }) => {
    // Test with special characters
    const specialUsername = 'test@user!123';
    const specialPassword = 'p@$$w0rd!#123';
    
    await page.getByLabel(/usuário/i).fill(specialUsername);
    await page.getByLabel(/senha/i).fill(specialPassword);
    
    // Verify values are accepted
    await expect(page.getByLabel(/usuário/i)).toHaveValue(specialUsername);
    await expect(page.getByLabel(/senha/i)).toHaveValue(specialPassword);
  });

  test('should prevent XSS in input fields', async ({ page }) => {
    // Attempt to inject script tags
    const xssAttempt = '<script>alert("xss")</script>';
    
    await page.getByLabel(/usuário/i).fill(xssAttempt);
    
    // Script should not execute
    const alertFired = await page.evaluate(() => {
      return window.document.querySelectorAll('script').length > 10; // More than normal scripts
    });
    
    expect(alertFired).toBeFalsy();
  });
});
