import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applySettingsFromUrl } from './app-settings';
import { saveSettings } from './storage';

// Mock storage
vi.mock('./storage', () => ({
  saveSettings: vi.fn(),
}));

describe('applySettingsFromUrl', () => {
  
  beforeEach(() => {
    // Reset URL to clean state
    window.history.pushState({}, '', '/');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('applies token from URL and cleans it up', () => {
    // Set URL with token
    window.history.pushState({}, '', '/?token=my-secret-token');

    // Spy on history.replaceState to verify cleanup
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    const host: any = {
      settings: { token: '', sessionKey: 'main' },
    };

    applySettingsFromUrl(host);

    // Should update host settings
    expect(host.settings.token).toBe('my-secret-token');
    
    // Should call saveSettings
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      token: 'my-secret-token'
    }));

    // Should clean URL
    expect(replaceStateSpy).toHaveBeenCalled();
    
    // Check current location search after cleanup
    // applySettingsFromUrl calls replaceState which updates the location
    const currentUrl = new URL(window.location.href);
    expect(currentUrl.searchParams.has('token')).toBe(false);
  });
  
  it('applies gatewayUrl from URL', () => {
      // Set URL with gatewayUrl
      // Note: ws:// is not a valid protocol for http/https location in some browsers if we try to set pathname? 
      // But query param is just a string.
      // encodeURIComponent might be needed if using pushState manually but here we just pass string?
      // pushState 3rd arg is "url". 
      window.history.pushState({}, '', '/?gatewayUrl=ws://test:1234');
      
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      const host: any = {
          settings: { gatewayUrl: 'ws://default', sessionKey: 'main' },
          pendingGatewayUrl: null,
      };

      applySettingsFromUrl(host);

      expect(host.pendingGatewayUrl).toBe('ws://test:1234');
      expect(replaceStateSpy).toHaveBeenCalled();
      
      const currentUrl = new URL(window.location.href);
      expect(currentUrl.searchParams.has('gatewayUrl')).toBe(false);
  });
});
