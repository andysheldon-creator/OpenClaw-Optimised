import { describe, it, expect } from 'vitest';
import {
	detectHighEntropyStrings,
	redactSecrets,
} from './entropy.js';

describe('entropy detection', () => {
	describe('detectHighEntropyStrings', () => {
		it('should detect OpenAI API keys', () => {
			const text = 'My API key is sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets).toHaveLength(1);
			expect(result.secrets[0].type).toBe('api_key');
			expect(result.secrets[0].pattern).toContain('OpenAI');
			expect(result.secrets[0].confidence).toBe('high');
		});

		it('should detect Anthropic API keys', () => {
			const text =
				'Use this: sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKlMnOpQrStUvWxYzAA';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets[0].type).toBe('api_key');
			expect(result.secrets[0].pattern).toContain('Anthropic');
		});

		it('should detect GitHub tokens', () => {
			const text = 'Token: ghp_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op5678Qr78Qr';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets[0].type).toBe('api_key');
			expect(result.secrets[0].pattern).toContain('GitHub');
		});

		it('should detect Bearer tokens', () => {
			const text = 'Authorization: Bearer AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets[0].type).toBe('bearer_token');
			expect(result.secrets[0].pattern).toContain('Bearer');
		});

		it('should detect JWT tokens', () => {
			const text =
				'JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets[0].type).toBe('jwt');
		});

		it('should detect private keys', () => {
			const text = 'Here is my key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIE...';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets[0].type).toBe('private_key');
		});

		it('should detect generic secret assignments', () => {
			const text = 'api_secret = "AbCdEfGhIjKlMnOpQrStUvWxYz0123"';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets[0].type).toBe('generic_secret');
		});

		it('should detect high-entropy strings without pattern match', () => {
			const text = 'Random secret: Kj8mN2pQ5rT9vXwZ3bC7dFgH1iLaMnOqPs4tUy6';
			const result = detectHighEntropyStrings(text, { minEntropyThreshold: 4.0, minLength: 20 });

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets.length).toBeGreaterThan(0);
		});

		it('should not flag UUIDs as secrets', () => {
			const text = 'Request ID: 550e8400-e29b-41d4-a716-446655440000';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(false);
		});

		it('should not flag base64 images as secrets', () => {
			const text = 'Image: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(false);
		});

		it('should not flag URLs as secrets', () => {
			const text = 'Visit https://example.com/path?query=param&key=value';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(false);
		});

		it('should not flag short strings', () => {
			const text = 'Short: abc123';
			const result = detectHighEntropyStrings(text, { minLength: 24 });

			expect(result.hasSecrets).toBe(false);
		});

		it('should respect custom entropy threshold', () => {
			const text = 'Medium entropy: abcdefghijklmnopqrstuvwxyz12345678';
			const lowThreshold = detectHighEntropyStrings(text, { minEntropyThreshold: 3.0 });
			const highThreshold = detectHighEntropyStrings(text, { minEntropyThreshold: 6.0 });

			expect(lowThreshold.hasSecrets).toBe(true);
			expect(highThreshold.hasSecrets).toBe(false);
		});

		it('should support custom patterns', () => {
			const text = 'Custom token: CUSTOM-Ab12Cd34Ef56Gh78Ij90Kl12';
			const result = detectHighEntropyStrings(text, {
				customPatterns: ['CUSTOM-[A-Za-z0-9]{24}'],
			});

			expect(result.hasSecrets).toBe(true);
		});

		it('should detect multiple secrets in one message', () => {
			const text =
				'OpenAI: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56 and GitHub: ghp_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op5678Qr';
			const result = detectHighEntropyStrings(text);

			expect(result.hasSecrets).toBe(true);
			expect(result.secrets.length).toBeGreaterThanOrEqual(2);
		});

		it('should sort secrets by position', () => {
			const text =
				'First: ghp_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op5678Qr Second: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56';
			const result = detectHighEntropyStrings(text);

			expect(result.secrets[0].start).toBeLessThan(result.secrets[1].start);
		});
	});

	describe('redactSecrets', () => {
		it('should redact detected secrets', () => {
			const text = 'My API key is sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56';
			const result = detectHighEntropyStrings(text);
			const redacted = redactSecrets(text, result.secrets);

			expect(redacted).toBe('My API key is [REDACTED]');
		});

		it('should use custom placeholder', () => {
			const text = 'Secret: ghp_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op5678Qr';
			const result = detectHighEntropyStrings(text);
			const redacted = redactSecrets(text, result.secrets, '***');

			expect(redacted).toBe('Secret: ***');
		});

		it('should redact multiple secrets', () => {
			const text =
				'Key1: sk-proj-Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12Wx34Yz56 Key2: ghp_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op5678Qr';
			const result = detectHighEntropyStrings(text);
			const redacted = redactSecrets(text, result.secrets);

			expect(redacted).toBe('Key1: [REDACTED] Key2: [REDACTED]');
		});

		it('should handle empty secrets array', () => {
			const text = 'No secrets here';
			const redacted = redactSecrets(text, []);

			expect(redacted).toBe(text);
		});
	});

});
