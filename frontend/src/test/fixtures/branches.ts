import type { BranchInfo } from '../../types/chat';

export const createMockBranchInfo = (overrides?: Partial<BranchInfo>): BranchInfo => ({
  parentId: 'test-parent-id',
  branchCount: 2,
  branches: [
    {
      id: 'branch-1',
      isActive: true,
      preview: 'First branch preview'
    },
    {
      id: 'branch-2',
      isActive: false,
      preview: 'Second branch preview'
    }
  ],
  ...overrides,
});

export const createMockSingleBranch = (): BranchInfo => ({
  parentId: 'test-parent-id',
  branchCount: 1,
  branches: [
    {
      id: 'branch-1',
      isActive: true,
      preview: 'Only branch preview'
    }
  ]
});

export const createMockMultipleBranches = (count: number = 3): BranchInfo => ({
  parentId: 'test-parent-id',
  branchCount: count,
  branches: Array.from({ length: count }, (_, i) => ({
    id: `branch-${i + 1}`,
    isActive: i === 0,
    preview: `Branch ${i + 1} preview`
  }))
});
