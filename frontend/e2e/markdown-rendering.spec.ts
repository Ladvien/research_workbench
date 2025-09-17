import { test, expect } from '@playwright/test';

test.describe('Markdown Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render markdown headers correctly', async ({ page }) => {
    // Send a message with markdown headers
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me markdown headers');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check that headers are rendered as HTML elements
    const h1Elements = await page.locator('[data-testid="markdown-content"] h1').count();
    const h2Elements = await page.locator('[data-testid="markdown-content"] h2').count();

    expect(h1Elements).toBeGreaterThan(0);
    expect(h2Elements).toBeGreaterThan(0);
  });

  test('should render bold and italic text correctly', async ({ page }) => {
    // Send a message asking for text formatting
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me **bold** and *italic* text');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for bold and italic elements
    const strongElements = await page.locator('[data-testid="markdown-content"] strong').count();
    const emElements = await page.locator('[data-testid="markdown-content"] em').count();

    expect(strongElements).toBeGreaterThan(0);
    expect(emElements).toBeGreaterThan(0);
  });

  test('should render code blocks with syntax highlighting', async ({ page }) => {
    // Send a message asking for code
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me a JavaScript code example');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for code block elements
    const codeBlocks = await page.locator('[data-testid="markdown-content"] pre').count();
    expect(codeBlocks).toBeGreaterThan(0);

    // Check for syntax highlighter
    const syntaxHighlighter = await page.locator('[data-testid="markdown-content"] .prism-code').count();
    expect(syntaxHighlighter).toBeGreaterThan(0);
  });

  test('should render inline code correctly', async ({ page }) => {
    // Send a message with inline code
    await page.fill('textarea[placeholder*="Type your message"]', 'What is `console.log()`?');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for inline code elements
    const inlineCode = await page.locator('[data-testid="markdown-content"] code').count();
    expect(inlineCode).toBeGreaterThan(0);

    // Check that inline code has proper styling
    const codeElement = await page.locator('[data-testid="markdown-content"] code').first();
    const className = await codeElement.getAttribute('class');
    expect(className).toContain('bg-gray-100');
  });

  test('should render lists correctly', async ({ page }) => {
    // Send a message asking for lists
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me unordered and ordered lists');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for list elements
    const ulElements = await page.locator('[data-testid="markdown-content"] ul').count();
    const olElements = await page.locator('[data-testid="markdown-content"] ol').count();
    const liElements = await page.locator('[data-testid="markdown-content"] li').count();

    expect(ulElements).toBeGreaterThan(0);
    expect(olElements).toBeGreaterThan(0);
    expect(liElements).toBeGreaterThan(0);
  });

  test('should render links correctly', async ({ page }) => {
    // Send a message asking for links
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me a markdown link example');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for link elements
    const links = await page.locator('[data-testid="markdown-content"] a').count();
    expect(links).toBeGreaterThan(0);

    // Check link attributes
    const firstLink = await page.locator('[data-testid="markdown-content"] a').first();
    const target = await firstLink.getAttribute('target');
    const rel = await firstLink.getAttribute('rel');

    expect(target).toBe('_blank');
    expect(rel).toContain('noopener');
  });

  test('should render tables correctly', async ({ page }) => {
    // Send a message asking for tables
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me a markdown table');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for table elements
    const tables = await page.locator('[data-testid="markdown-content"] table').count();
    const tableHeaders = await page.locator('[data-testid="markdown-content"] th').count();
    const tableCells = await page.locator('[data-testid="markdown-content"] td').count();

    expect(tables).toBeGreaterThan(0);
    expect(tableHeaders).toBeGreaterThan(0);
    expect(tableCells).toBeGreaterThan(0);
  });

  test('should render blockquotes correctly', async ({ page }) => {
    // Send a message asking for blockquotes
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me a blockquote example');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for blockquote elements
    const blockquotes = await page.locator('[data-testid="markdown-content"] blockquote').count();
    expect(blockquotes).toBeGreaterThan(0);

    // Check blockquote styling
    const blockquote = await page.locator('[data-testid="markdown-content"] blockquote').first();
    const className = await blockquote.getAttribute('class');
    expect(className).toContain('border-l-4');
  });

  test('should render horizontal rules correctly', async ({ page }) => {
    // Send a message asking for horizontal rules
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me a horizontal rule ---');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for hr elements
    const hrs = await page.locator('[data-testid="markdown-content"] hr').count();
    expect(hrs).toBeGreaterThan(0);
  });

  test('should render task lists with checkboxes', async ({ page }) => {
    // Send a message asking for task lists
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me a task list with checkboxes');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for checkbox inputs
    const checkboxes = await page.locator('[data-testid="markdown-content"] input[type="checkbox"]').count();
    expect(checkboxes).toBeGreaterThan(0);

    // Check that checkboxes are disabled
    const firstCheckbox = await page.locator('[data-testid="markdown-content"] input[type="checkbox"]').first();
    const isDisabled = await firstCheckbox.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('should render math expressions with KaTeX', async ({ page }) => {
    // Send a message with math
    await page.fill('textarea[placeholder*="Type your message"]', 'Show me a math equation like $E=mc^2$');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check for KaTeX elements
    const katexElements = await page.locator('[data-testid="markdown-content"] .katex').count();
    expect(katexElements).toBeGreaterThan(0);
  });

  test('should handle streaming markdown correctly', async ({ page }) => {
    // Send a message
    await page.fill('textarea[placeholder*="Type your message"]', 'Tell me about markdown');
    await page.click('button:has-text("Send")');

    // Check for streaming indicator
    await page.waitForSelector('text=Streaming...', { timeout: 5000 });

    // Wait for streaming to complete
    await page.waitForSelector('text=Streaming...', { state: 'hidden', timeout: 10000 });

    // Verify markdown is properly rendered after streaming
    const markdownContent = await page.locator('[data-testid="markdown-content"]').last();
    const htmlContent = await markdownContent.innerHTML();

    // Should contain HTML elements, not raw markdown
    expect(htmlContent).not.toContain('##');
    expect(htmlContent).not.toContain('**');
    expect(htmlContent).toContain('<');
  });

  test('should preserve markdown formatting when editing messages', async ({ page }) => {
    // Send a message with markdown
    await page.fill('textarea[placeholder*="Type your message"]', '# Test Header');
    await page.click('button:has-text("Send")');

    // Wait for message to appear
    await page.waitForTimeout(2000);

    // Hover over user message to show edit button
    const userMessage = await page.locator('.bg-blue-500').first();
    await userMessage.hover();

    // Click edit button
    await page.click('button[title="Edit message"]');

    // Check that the edit textarea contains raw markdown
    const textarea = await page.locator('textarea').first();
    const content = await textarea.inputValue();
    expect(content).toBe('# Test Header');

    // Cancel edit
    await page.click('button:has-text("Cancel")');

    // Verify markdown is still rendered
    const h1 = await page.locator('[data-testid="markdown-content"] h1').count();
    expect(h1).toBeGreaterThan(0);
  });

  test('should handle complex nested markdown structures', async ({ page }) => {
    const complexMarkdown = `
# Main Header
## Subheader with **bold** and *italic*
- List item with \`inline code\`
  - Nested item with [link](https://example.com)
    - Double nested with ***bold italic***
> Blockquote with multiple lines
> And continuation

| Col1 | Col2 |
|------|------|
| Data | More |
    `;

    await page.fill('textarea[placeholder*="Type your message"]', complexMarkdown);
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Verify all elements are rendered
    const userMarkdown = await page.locator('[data-testid="markdown-content"]').nth(-2);

    const h1 = await userMarkdown.locator('h1').count();
    const h2 = await userMarkdown.locator('h2').count();
    const ul = await userMarkdown.locator('ul').count();
    const code = await userMarkdown.locator('code').count();
    const link = await userMarkdown.locator('a').count();
    const blockquote = await userMarkdown.locator('blockquote').count();
    const table = await userMarkdown.locator('table').count();

    expect(h1).toBe(1);
    expect(h2).toBe(1);
    expect(ul).toBeGreaterThan(0);
    expect(code).toBeGreaterThan(0);
    expect(link).toBeGreaterThan(0);
    expect(blockquote).toBe(1);
    expect(table).toBe(1);
  });

  test('should apply correct prose classes for different message roles', async ({ page }) => {
    // Send a message
    await page.fill('textarea[placeholder*="Type your message"]', 'Test message');
    await page.click('button:has-text("Send")');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check user message has correct variant classes
    const userMarkdown = await page.locator('.bg-blue-500 [data-testid="markdown-content"]').first();
    const userClasses = await userMarkdown.getAttribute('class');
    expect(userClasses).toContain('prose-invert');

    // Check assistant message has correct variant classes
    const assistantMarkdown = await page.locator('.bg-white [data-testid="markdown-content"]').first();
    const assistantClasses = await assistantMarkdown.getAttribute('class');
    expect(assistantClasses).toContain('prose');
  });
});