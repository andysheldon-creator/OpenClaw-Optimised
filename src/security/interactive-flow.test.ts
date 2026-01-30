import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processSecretsInMessage } from './process-secrets.js';
import {
	generatePromptKey,
	resolvePendingPrompt,
	clearAllPendingPrompts,
	hasPendingPrompt,
} from './interactive-prompts.js';
import type { FinalizedMsgContext } from '../auto-reply/templating.js';
import type { MoltbotConfig } from '../config/config.js';

describe('interactive security flow', () => {
	beforeEach(() => {
		clearAllPendingPrompts();
	});

	afterEach(() => {
		clearAllPendingPrompts();
	});

	// Mock dispatcher for testing
	function createMockDispatcher() {
		const sentMessages: string[] = [];
		return {
			sendText: async (text: string) => {
				sentMessages.push(text);
			},
			messages: sentMessages,
		};
	}

	// Mock config with interactive mode enabled
	const interactiveConfig: MoltbotConfig = {
		security: {
			secrets: {
				detection: {
					enabled: true,
				},
				handling: {
					interactive: true,
					defaultAction: 'redact',
					confirmationTimeoutMs: 5000,
				},
			},
		},
	};

	// Mock context
	function createMockContext(body: string): FinalizedMsgContext {
		return {
			Body: body,
			BodyForAgent: body,
			CommandBody: body,
			BodyForCommands: body,
			Provider: 'telegram',
			SenderId: 'user123',
			ChatType: 'dm',
			SessionKey: 'test-session',
			CommandAuthorized: true,
		};
	}

	it('should send prompt and wait for user response (redact action)', async () => {
		const ctx = createMockContext('My API key is sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56');
		const dispatcher = createMockDispatcher();

		// Start processing (this will block until user responds)
		const processPromise = processSecretsInMessage(ctx, interactiveConfig, dispatcher as any);

		// Wait a bit for the prompt to be registered
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Verify prompt was sent
		expect(dispatcher.messages.length).toBe(1);
		expect(dispatcher.messages[0]).toContain('🔒 **Security Alert**');
		expect(dispatcher.messages[0]).toContain('Reply with **1**, **2**, or **3**');

		// Verify pending prompt was registered
		const promptKey = generatePromptKey('telegram', 'user123');
		expect(hasPendingPrompt(promptKey)).toBe(true);

		// Simulate user responding with "1" (redact)
		resolvePendingPrompt(promptKey, 'redact');

		// Wait for processing to complete
		const result = await processPromise;

		// Verify result
		expect(result.detected).toBe(true);
		expect(result.modified).toBe(true);
		expect(result.blocked).toBe(false);
		expect(result.ctx.Body).toBe('My API key is [REDACTED]');
	});

	it('should send prompt and wait for user response (cancel action)', async () => {
		const ctx = createMockContext('Secret: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56');
		const dispatcher = createMockDispatcher();

		const processPromise = processSecretsInMessage(ctx, interactiveConfig, dispatcher as any);
		await new Promise((resolve) => setTimeout(resolve, 50));

		const promptKey = generatePromptKey('telegram', 'user123');
		resolvePendingPrompt(promptKey, 'cancel');

		const result = await processPromise;

		expect(result.detected).toBe(true);
		expect(result.modified).toBe(false);
		expect(result.blocked).toBe(true); // Message should be blocked
	});

	it('should send prompt and wait for user response (allow action)', async () => {
		const ctx = createMockContext('Key: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56');
		const dispatcher = createMockDispatcher();

		const processPromise = processSecretsInMessage(ctx, interactiveConfig, dispatcher as any);
		await new Promise((resolve) => setTimeout(resolve, 50));

		const promptKey = generatePromptKey('telegram', 'user123');
		resolvePendingPrompt(promptKey, 'allow');

		const result = await processPromise;

		expect(result.detected).toBe(true);
		expect(result.modified).toBe(false); // Not modified because allowed
		expect(result.blocked).toBe(false);
		expect(result.ctx.Body).toContain('sk-proj-'); // Secret still in message
	});

	it('should timeout and apply default action if no response', async () => {
		const config: MoltbotConfig = {
			security: {
				secrets: {
					detection: { enabled: true },
					handling: {
						interactive: true,
						defaultAction: 'redact',
						confirmationTimeoutMs: 100, // Short timeout for testing
					},
				},
			},
		};

		const ctx = createMockContext('API: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56');
		const dispatcher = createMockDispatcher();

		const result = await processSecretsInMessage(ctx, config, dispatcher as any);

		// Should have timed out and applied default action (redact)
		expect(result.detected).toBe(true);
		expect(result.modified).toBe(true);
		expect(result.blocked).toBe(false);
		expect(result.ctx.Body).toBe('API: [REDACTED]');
	});

	it('should fall back to default action when interactive mode is disabled', async () => {
		const config: MoltbotConfig = {
			security: {
				secrets: {
					detection: { enabled: true },
					handling: {
						interactive: false, // Disabled
						defaultAction: 'redact',
					},
				},
			},
		};

		const ctx = createMockContext('Key: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56');
		const dispatcher = createMockDispatcher();

		const result = await processSecretsInMessage(ctx, config, dispatcher as any);

		// Should have immediately applied default action without prompting
		expect(result.detected).toBe(true);
		expect(result.modified).toBe(true);
		expect(result.blocked).toBe(false);
		expect(result.ctx.Body).toBe('Key: [REDACTED]');
		expect(dispatcher.messages.length).toBe(0); // No prompt sent
	});

	it('should not detect secrets when detection is disabled', async () => {
		const config: MoltbotConfig = {
			security: {
				secrets: {
					detection: { enabled: false },
				},
			},
		};

		const ctx = createMockContext('Key: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56');
		const dispatcher = createMockDispatcher();

		const result = await processSecretsInMessage(ctx, config, dispatcher as any);

		expect(result.detected).toBe(false);
		expect(result.modified).toBe(false);
		expect(result.ctx.Body).toContain('sk-proj-'); // Secret still in message
	});
});
