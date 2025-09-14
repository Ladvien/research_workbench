// Import vi for mocking
import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock scrollIntoView method
Element.prototype.scrollIntoView = vi.fn();