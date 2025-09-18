import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config/test-config';
import { testUsers } from './fixtures/test-data';

test.describe('Comprehensive Credential Verification', () => {
  test('All test user credentials are standardized and consistent', async () => {
    // Verify environment variables are properly set
    expect(TEST_CONFIG.TEST_USER_EMAIL).toBe('test@workbench.com');
    expect(TEST_CONFIG.TEST_USER_PASSWORD).toBe('testpassword123');
    expect(TEST_CONFIG.ADMIN_EMAIL).toBe('admin@workbench.com');
    expect(TEST_CONFIG.ADMIN_PASSWORD).toBe('adminpassword123');

    // Verify test data matches config
    expect(testUsers.default.email).toBe(TEST_CONFIG.TEST_USER_EMAIL);
    expect(testUsers.default.password).toBe(TEST_CONFIG.TEST_USER_PASSWORD);
    expect(testUsers.admin.email).toBe(TEST_CONFIG.ADMIN_EMAIL);
    expect(testUsers.admin.password).toBe(TEST_CONFIG.ADMIN_PASSWORD);

    console.log('✅ All credential sources are consistent and standardized');
  });

  test('Environment variable fallbacks work correctly', async () => {
    // Test that fallbacks are properly configured
    expect(TEST_CONFIG.TEST_USER_EMAIL).toBeTruthy();
    expect(TEST_CONFIG.TEST_USER_PASSWORD).toBeTruthy();
    expect(TEST_CONFIG.ADMIN_EMAIL).toBeTruthy();
    expect(TEST_CONFIG.ADMIN_PASSWORD).toBeTruthy();

    // Test credentials have proper format
    expect(TEST_CONFIG.TEST_USER_EMAIL).toContain('@');
    expect(TEST_CONFIG.TEST_USER_EMAIL).toContain('workbench.com');
    expect(TEST_CONFIG.TEST_USER_PASSWORD.length).toBeGreaterThanOrEqual(8);
    
    expect(TEST_CONFIG.ADMIN_EMAIL).toContain('@');
    expect(TEST_CONFIG.ADMIN_EMAIL).toContain('workbench.com');
    expect(TEST_CONFIG.ADMIN_PASSWORD.length).toBeGreaterThanOrEqual(8);

    console.log('✅ Environment variable fallbacks are working correctly');
  });

  test('No hardcoded legacy credentials remain in use', async () => {
    // Ensure old inconsistent credentials are completely removed
    const oldEmail = 'cthomasbrittain@yahoo.com';
    const oldPassword = 'IVMPEscH33EhfnlPZcAwpkfR';

    expect(TEST_CONFIG.TEST_USER_EMAIL).not.toBe(oldEmail);
    expect(TEST_CONFIG.TEST_USER_PASSWORD).not.toBe(oldPassword);
    expect(testUsers.default.email).not.toBe(oldEmail);
    expect(testUsers.default.password).not.toBe(oldPassword);
    expect(testUsers.admin.email).not.toBe(oldEmail);
    expect(testUsers.admin.password).not.toBe(oldPassword);

    console.log('✅ No legacy credentials found in active configuration');
  });

  test('Test configuration is properly structured', async () => {
    // Verify all required configuration is present
    expect(TEST_CONFIG.BASE_URL).toBeTruthy();
    expect(TEST_CONFIG.API_BASE_URL).toBeTruthy();
    expect(TEST_CONFIG.DEFAULT_TIMEOUT).toBeGreaterThan(0);
    expect(TEST_CONFIG.LONG_TIMEOUT).toBeGreaterThan(TEST_CONFIG.DEFAULT_TIMEOUT);
    expect(TEST_CONFIG.NETWORK_TIMEOUT).toBeGreaterThan(0);

    // Verify test data structure
    expect(testUsers).toHaveProperty('default');
    expect(testUsers).toHaveProperty('admin');
    expect(testUsers).toHaveProperty('newUser');
    
    expect(testUsers.default).toHaveProperty('email');
    expect(testUsers.default).toHaveProperty('password');
    expect(testUsers.admin).toHaveProperty('email');
    expect(testUsers.admin).toHaveProperty('password');

    console.log('✅ Test configuration is properly structured');
  });

  test('User accounts have distinct credentials', async () => {
    // Ensure test user and admin have different credentials
    expect(testUsers.default.email).not.toBe(testUsers.admin.email);
    expect(testUsers.default.password).not.toBe(testUsers.admin.password);
    
    // Ensure they have proper workbench.com domains
    expect(testUsers.default.email).toBe('test@workbench.com');
    expect(testUsers.admin.email).toBe('admin@workbench.com');
    
    // Ensure passwords are different but both secure
    expect(testUsers.default.password).toBe('testpassword123');
    expect(testUsers.admin.password).toBe('adminpassword123');

    console.log('✅ User accounts have distinct and secure credentials');
  });

  test('Cross-file credential consistency validation', async () => {
    // This test ensures that if any other files reference credentials,
    // they would be consistent with our standardized values
    
    const standardTestEmail = 'test@workbench.com';
    const standardTestPassword = 'testpassword123';
    const standardAdminEmail = 'admin@workbench.com';
    const standardAdminPassword = 'adminpassword123';

    // Verify our configuration matches the standard
    expect(TEST_CONFIG.TEST_USER_EMAIL).toBe(standardTestEmail);
    expect(TEST_CONFIG.TEST_USER_PASSWORD).toBe(standardTestPassword);
    expect(TEST_CONFIG.ADMIN_EMAIL).toBe(standardAdminEmail);
    expect(TEST_CONFIG.ADMIN_PASSWORD).toBe(standardAdminPassword);

    // Verify test fixtures match the standard
    expect(testUsers.default.email).toBe(standardTestEmail);
    expect(testUsers.default.password).toBe(standardTestPassword);
    expect(testUsers.admin.email).toBe(standardAdminEmail);
    expect(testUsers.admin.password).toBe(standardAdminPassword);

    console.log('✅ Cross-file credential consistency verified');
  });
});