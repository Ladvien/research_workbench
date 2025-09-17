import { test, expect } from '@playwright/test';

test.describe('Markdown Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://workbench.lolzlab.com');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');
  });

  test('renders markdown headings correctly', async ({ page }) => {
    // Start a new conversation with markdown content
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('# Heading 1\n## Heading 2\n### Heading 3');
    await input.press('Enter');

    // Wait for the message to appear
    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    // Check that markdown is rendered as HTML
    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Verify headings are rendered
    await expect(messageContent.locator('h1')).toContainText('Heading 1');
    await expect(messageContent.locator('h2')).toContainText('Heading 2');
    await expect(messageContent.locator('h3')).toContainText('Heading 3');
  });

  test('renders bold and italic text', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('**Bold text** and *italic text* and ***bold italic***');
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for bold and italic elements
    await expect(messageContent.locator('strong')).toContainText('Bold text');
    await expect(messageContent.locator('em')).toContainText('italic text');
    await expect(messageContent.locator('strong em, em strong')).toContainText('bold italic');
  });

  test('renders code blocks with syntax highlighting', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    const codeMessage = '```javascript\nconst greeting = "Hello World";\nconsole.log(greeting);\n```';
    await input.fill(codeMessage);
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for code block
    const codeBlock = messageContent.locator('pre code');
    await expect(codeBlock).toBeVisible();
    await expect(codeBlock).toContainText('const greeting');
    await expect(codeBlock).toContainText('console.log');
  });

  test('renders inline code', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Use `npm install` to install dependencies');
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for inline code
    await expect(messageContent.locator('code')).toContainText('npm install');
  });

  test('renders lists correctly', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    const listMessage = `
Unordered list:
- Item 1
- Item 2
- Item 3

Ordered list:
1. First item
2. Second item
3. Third item
`;
    await input.fill(listMessage);
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for unordered list
    const ulList = messageContent.locator('ul');
    await expect(ulList).toBeVisible();
    await expect(ulList.locator('li')).toHaveCount(3);

    // Check for ordered list
    const olList = messageContent.locator('ol');
    await expect(olList).toBeVisible();
    await expect(olList.locator('li')).toHaveCount(3);
  });

  test('renders links as clickable', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('[Click here](https://example.com) to visit the site');
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for link
    const link = messageContent.locator('a');
    await expect(link).toContainText('Click here');
    await expect(link).toHaveAttribute('href', 'https://example.com');
  });

  test('renders blockquotes', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('> This is a blockquote\n> with multiple lines');
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for blockquote
    const blockquote = messageContent.locator('blockquote');
    await expect(blockquote).toBeVisible();
    await expect(blockquote).toContainText('This is a blockquote');
  });

  test('renders horizontal rules', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Text above\n\n---\n\nText below');
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for horizontal rule
    const hr = messageContent.locator('hr');
    await expect(hr).toBeVisible();
  });

  test('renders tables', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    const tableMessage = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`;
    await input.fill(tableMessage);
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check for table
    const table = messageContent.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead th')).toHaveCount(2);
    await expect(table.locator('tbody tr')).toHaveCount(2);
  });

  test('preserves markdown in edit mode', async ({ page }) => {
    // Send a message with markdown
    const input = page.locator('textarea[placeholder*="Type your message"]');
    const originalMarkdown = '# Title\n**Bold** and *italic*';
    await input.fill(originalMarkdown);
    await input.press('Enter');

    // Wait for message to appear
    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });

    // Enter edit mode
    const editButton = page.locator('button[title="Edit message"]').first();
    await editButton.hover(); // Buttons appear on hover
    await editButton.click();

    // Check that textarea contains original markdown
    const editTextarea = page.locator('textarea[placeholder="Edit your message..."]');
    await expect(editTextarea).toHaveValue(originalMarkdown);

    // Modify the markdown
    await editTextarea.fill('## Updated Title\n***Bold and italic***');
    await page.locator('button:has-text("Save")').click();

    // Check that updated markdown is rendered
    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });
    const updatedContent = page.locator('[data-testid="markdown-content"]').first();
    await expect(updatedContent.locator('h2')).toContainText('Updated Title');
    await expect(updatedContent.locator('strong em, em strong')).toContainText('Bold and italic');
  });

  test('handles malformed markdown gracefully', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    const malformedMarkdown = '**Unclosed bold and [unclosed link and `unclosed code';
    await input.fill(malformedMarkdown);
    await input.press('Enter');

    // Should still display the content without crashing
    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });
    const messageContent = page.locator('[data-testid="markdown-content"]').first();
    await expect(messageContent).toBeVisible();

    // Content should be present even if not perfectly formatted
    await expect(messageContent).toContainText('Unclosed bold');
  });

  test('renders emoji in markdown', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Hello 👋 **World** 🌍');
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });
    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Check that emojis are preserved
    await expect(messageContent).toContainText('👋');
    await expect(messageContent).toContainText('🌍');
    await expect(messageContent.locator('strong')).toContainText('World');
  });

  test('handles mixed content types', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');
    const mixedContent = `
# Documentation

This is a **paragraph** with *various* formatting.

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`

> Important note: Remember to test everything!

- [x] Completed task
- [ ] Pending task

Visit [our website](https://example.com) for more info.
`;
    await input.fill(mixedContent);
    await input.press('Enter');

    await page.waitForSelector('[data-testid="markdown-content"]', { timeout: 5000 });
    const messageContent = page.locator('[data-testid="markdown-content"]').first();

    // Verify multiple markdown elements are rendered
    await expect(messageContent.locator('h1')).toContainText('Documentation');
    await expect(messageContent.locator('strong')).toContainText('paragraph');
    await expect(messageContent.locator('em')).toContainText('various');
    await expect(messageContent.locator('pre code')).toContainText('def hello()');
    await expect(messageContent.locator('blockquote')).toContainText('Important note');
    await expect(messageContent.locator('ul li')).toHaveCount(2);
    await expect(messageContent.locator('a')).toContainText('our website');
  });
});