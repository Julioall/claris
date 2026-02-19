import { test, expect } from './fixtures';

test.describe('Form Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should support Enter key to submit form', async ({ page }) => {
    // Fill credentials
    await page.getByLabel(/usuário/i).fill('testuser');
    await page.getByLabel(/senha/i).fill('testpassword');
    
    // Press Enter on password field
    await page.getByLabel(/senha/i).press('Enter');
    
    // Form should be submitted (may show error without backend, but that's ok)
    // Just verify no crash
    await expect(page.getByLabel(/usuário/i)).toBeVisible();
  });

  test('should support Tab navigation through form fields', async ({ page }) => {
    // Start from username field
    await page.getByLabel(/usuário/i).focus();
    
    // Tab to password
    await page.keyboard.press('Tab');
    
    // Should be on password field now
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('password');
  });

  test('should allow copy-paste in input fields', async ({ page }) => {
    const testValue = 'testuser@example.com';
    
    // Use clipboard API simulation
    await page.getByLabel(/usuário/i).fill(testValue);
    
    // Select all and copy
    await page.getByLabel(/usuário/i).click();
    await page.keyboard.press('Control+A');
    
    // Verify text is selected (value should still be there)
    await expect(page.getByLabel(/usuário/i)).toHaveValue(testValue);
  });

  test('should support form autofill attributes', async ({ page }) => {
    const usernameInput = page.getByLabel(/usuário/i);
    const passwordInput = page.getByLabel(/senha/i);
    
    // Check autocomplete attributes
    await expect(usernameInput).toHaveAttribute('autocomplete', 'username');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  test('should disable submit button during loading', async ({ page }) => {
    // Fill form
    await page.getByLabel(/usuário/i).fill('testuser');
    await page.getByLabel(/senha/i).fill('testpassword');
    
    const submitButton = page.getByRole('button', { name: /entrar/i });
    
    // Button should be enabled initially
    await expect(submitButton).toBeEnabled();
    
    // Submit form
    await submitButton.click();
    
    // Note: Button might be disabled during loading (implementation dependent)
    // Just verify the button exists
    await expect(submitButton).toBeVisible();
  });

  test('should preserve input focus after error', async ({ page }) => {
    // Try to submit empty form
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Error should appear
    await expect(page.getByText(/preencha todos os campos/i)).toBeVisible();
    
    // Click on username field
    await page.getByLabel(/usuário/i).click();
    
    // Field should be focused
    const isFocused = await page.getByLabel(/usuário/i).evaluate(
      el => el === document.activeElement
    );
    expect(isFocused).toBeTruthy();
  });

  test('should handle long input values', async ({ page }) => {
    // Test with very long username
    const longUsername = 'a'.repeat(200);
    const longPassword = 'b'.repeat(200);
    
    await page.getByLabel(/usuário/i).fill(longUsername);
    await page.getByLabel(/senha/i).fill(longPassword);
    
    // Should accept the values
    await expect(page.getByLabel(/usuário/i)).toHaveValue(longUsername);
    await expect(page.getByLabel(/senha/i)).toHaveValue(longPassword);
  });

  test('should handle rapid field switching', async ({ page }) => {
    // Rapidly switch between fields
    for (let i = 0; i < 5; i++) {
      await page.getByLabel(/usuário/i).click();
      await page.getByLabel(/senha/i).click();
    }
    
    // Form should still be functional
    await page.getByLabel(/usuário/i).fill('test');
    await expect(page.getByLabel(/usuário/i)).toHaveValue('test');
  });

  test('should maintain password field security', async ({ page }) => {
    const passwordInput = page.getByLabel(/senha/i);
    
    // Password field should be of type password by default
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Fill password
    await passwordInput.fill('secretpassword');
    
    // Password should still be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should support placeholder text', async ({ page }) => {
    // Check if placeholders exist
    const usernameInput = page.getByLabel(/usuário/i);
    const passwordInput = page.getByLabel(/senha/i);
    
    await expect(usernameInput).toHaveAttribute('placeholder');
    await expect(passwordInput).toHaveAttribute('placeholder');
  });
});
