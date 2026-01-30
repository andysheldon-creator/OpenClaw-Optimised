import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	generatePromptKey,
	registerPendingPrompt,
	hasPendingPrompt,
	getPendingPrompt,
	resolvePendingPrompt,
	cancelPendingPrompt,
	parsePromptResponse,
	clearAllPendingPrompts,
	getPendingPromptCount,
} from './interactive-prompts.js';
import type { DetectedSecret } from './entropy.js';

describe('interactive-prompts', () => {
	beforeEach(() => {
		clearAllPendingPrompts();
	});

	afterEach(() => {
		clearAllPendingPrompts();
	});

	describe('generatePromptKey', () => {
		it('should generate a unique key from channel and senderId', () => {
			const key = generatePromptKey('telegram', 'user123');
			expect(key).toBe('telegram:user123');
		});

		it('should generate different keys for different users', () => {
			const key1 = generatePromptKey('telegram', 'user123');
			const key2 = generatePromptKey('telegram', 'user456');
			expect(key1).not.toBe(key2);
		});
	});

	describe('registerPendingPrompt', () => {
		it('should register a pending prompt', async () => {
			const secrets: DetectedSecret[] = [
				{
					value: 'sk-abc123',
					type: 'api_key',
					start: 0,
					end: 10,
					entropy: 4.5,
					confidence: 'high',
				},
			];

			const key = 'telegram:user123';
			const promise = registerPendingPrompt(key, secrets, 5000);

			expect(hasPendingPrompt(key)).toBe(true);
			expect(getPendingPromptCount()).toBe(1);

			// Resolve it
			resolvePendingPrompt(key, 'redact');
			const result = await promise;
			expect(result).toBe('redact');
			expect(hasPendingPrompt(key)).toBe(false);
		});

		it('should timeout and resolve with null', async () => {
			const secrets: DetectedSecret[] = [
				{
					value: 'sk-abc123',
					type: 'api_key',
					start: 0,
					end: 10,
					entropy: 4.5,
					confidence: 'high',
				},
			];

			const key = 'telegram:user123';
			const promise = registerPendingPrompt(key, secrets, 100); // 100ms timeout

			expect(hasPendingPrompt(key)).toBe(true);

			// Wait for timeout
			const result = await promise;
			expect(result).toBeNull();
			expect(hasPendingPrompt(key)).toBe(false);
		});

		it('should replace existing prompt for same user', async () => {
			const secrets1: DetectedSecret[] = [
				{
					value: 'sk-abc123',
					type: 'api_key',
					start: 0,
					end: 10,
					entropy: 4.5,
					confidence: 'high',
				},
			];
			const secrets2: DetectedSecret[] = [
				{
					value: 'ghp-xyz789',
					type: 'api_key',
					start: 0,
					end: 10,
					entropy: 4.5,
					confidence: 'high',
				},
			];

			const key = 'telegram:user123';
			const promise1 = registerPendingPrompt(key, secrets1, 5000);
			const promise2 = registerPendingPrompt(key, secrets2, 5000);

			// First promise should resolve with null (replaced)
			const result1 = await promise1;
			expect(result1).toBeNull();

			// Second promise should still be pending
			expect(hasPendingPrompt(key)).toBe(true);

			// Resolve second
			resolvePendingPrompt(key, 'redact');
			const result2 = await promise2;
			expect(result2).toBe('redact');
		});
	});

	describe('resolvePendingPrompt', () => {
		it('should resolve a pending prompt with chosen action', async () => {
			const secrets: DetectedSecret[] = [
				{
					value: 'sk-abc123',
					type: 'api_key',
					start: 0,
					end: 10,
					entropy: 4.5,
					confidence: 'high',
				},
			];

			const key = 'telegram:user123';
			const promise = registerPendingPrompt(key, secrets, 5000);

			const resolved = resolvePendingPrompt(key, 'redact');
			expect(resolved).toBe(true);

			const result = await promise;
			expect(result).toBe('redact');
			expect(hasPendingPrompt(key)).toBe(false);
		});

		it('should return false if no pending prompt exists', () => {
			const resolved = resolvePendingPrompt('nonexistent:key', 'store');
			expect(resolved).toBe(false);
		});
	});

	describe('cancelPendingPrompt', () => {
		it('should cancel a pending prompt', async () => {
			const secrets: DetectedSecret[] = [
				{
					value: 'sk-abc123',
					type: 'api_key',
					start: 0,
					end: 10,
					entropy: 4.5,
					confidence: 'high',
				},
			];

			const key = 'telegram:user123';
			const promise = registerPendingPrompt(key, secrets, 5000);

			const cancelled = cancelPendingPrompt(key);
			expect(cancelled).toBe(true);

			const result = await promise;
			expect(result).toBeNull();
			expect(hasPendingPrompt(key)).toBe(false);
		});
	});

	describe('parsePromptResponse', () => {
		it('should parse numeric responses', () => {
			expect(parsePromptResponse('1')).toBe('redact');
			expect(parsePromptResponse('2')).toBe('cancel');
			expect(parsePromptResponse('3')).toBe('allow');
		});

		it('should parse responses with periods', () => {
			expect(parsePromptResponse('1.')).toBe('redact');
			expect(parsePromptResponse('2.')).toBe('cancel');
			expect(parsePromptResponse('3.')).toBe('allow');
		});

		it('should parse "option N" responses', () => {
			expect(parsePromptResponse('option 1')).toBe('redact');
			expect(parsePromptResponse('option 2')).toBe('cancel');
			expect(parsePromptResponse('option 3')).toBe('allow');
		});

		it('should parse keyword responses', () => {
			expect(parsePromptResponse('redact')).toBe('redact');
			expect(parsePromptResponse('hide')).toBe('redact');
			expect(parsePromptResponse('cancel')).toBe('cancel');
			expect(parsePromptResponse('abort')).toBe('cancel');
			expect(parsePromptResponse('allow')).toBe('allow');
			expect(parsePromptResponse('continue')).toBe('allow');
		});

		it('should be case-insensitive', () => {
			expect(parsePromptResponse('REDACT')).toBe('redact');
			expect(parsePromptResponse('Cancel')).toBe('cancel');
			expect(parsePromptResponse('ALLOW')).toBe('allow');
		});

		it('should ignore whitespace', () => {
			expect(parsePromptResponse('  1  ')).toBe('redact');
			expect(parsePromptResponse('\n2\n')).toBe('cancel');
		});

		it('should return null for invalid responses', () => {
			expect(parsePromptResponse('4')).toBeNull();
			expect(parsePromptResponse('invalid')).toBeNull();
			expect(parsePromptResponse('yes')).toBeNull();
			expect(parsePromptResponse('')).toBeNull();
		});
	});

	describe('clearAllPendingPrompts', () => {
		it('should clear all pending prompts', async () => {
			const secrets: DetectedSecret[] = [
				{
					value: 'sk-abc123',
					type: 'api_key',
					start: 0,
					end: 10,
					entropy: 4.5,
					confidence: 'high',
				},
			];

			const promise1 = registerPendingPrompt('telegram:user1', secrets, 5000);
			const promise2 = registerPendingPrompt('discord:user2', secrets, 5000);

			expect(getPendingPromptCount()).toBe(2);

			clearAllPendingPrompts();

			expect(getPendingPromptCount()).toBe(0);
			expect(await promise1).toBeNull();
			expect(await promise2).toBeNull();
		});
	});
});
