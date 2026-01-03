import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeWebSearch } from './executor.js';
import { executeGeminiSearch } from './gemini-cli.js';

vi.mock('./gemini-cli.js', () => ({
  executeGeminiSearch: vi.fn(),
}));

describe('executeWebSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes CLI with query', async () => {
    vi.mocked(executeGeminiSearch).mockResolvedValue({
      response: 'Test result',
      session_id: 'abc-123',
      stats: { models: {} }
    });
    
    const result = await executeWebSearch('test query');
    
    expect(result.success).toBe(true);
    expect(result.result?.response).toBe('Test result');
    expect(vi.mocked(executeGeminiSearch)).toHaveBeenCalled();
  });
  
  it('handles timeout error', async () => {
    vi.mocked(executeGeminiSearch).mockRejectedValue(new Error('timeout'));
    
    const result = await executeWebSearch('test query');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('⏱️');
  });
  
  it('handles CLI not found error', async () => {
    vi.mocked(executeGeminiSearch).mockRejectedValue(new Error('not found'));
    
    const result = await executeWebSearch('test query');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('не найден');
  });
  
  it('handles permission error', async () => {
    vi.mocked(executeGeminiSearch).mockRejectedValue(new Error('Permission denied'));
    
    const result = await executeWebSearch('test query');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('failed');
  });
  
  it('supports dry run mode', async () => {
    const result = await executeWebSearch('test query', { dryRun: true });
    
    expect(result.success).toBe(true);
    expect(result.result?.response).toContain('DRY RUN');
    expect(vi.mocked(executeGeminiSearch)).not.toHaveBeenCalled();
  });
  
  it('escapes special characters', async () => {
    await executeWebSearch('query with "quotes" and $dollar');
    
    expect(vi.mocked(executeGeminiSearch)).toHaveBeenCalled();
  });
  
  it('handles API errors', async () => {
    vi.mocked(executeGeminiSearch).mockRejectedValue(new Error('API error'));
    
    const result = await executeWebSearch('test');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('failed');
  });
});
