export { authHandlers } from './auth';
export { conversationHandlers } from './conversations';
export { messageHandlers } from './messages';

// Combined handlers for MSW
import { authHandlers } from './auth';
import { conversationHandlers } from './conversations';
import { messageHandlers } from './messages';

export const handlers = [
  ...authHandlers,
  ...conversationHandlers,
  ...messageHandlers,
];
