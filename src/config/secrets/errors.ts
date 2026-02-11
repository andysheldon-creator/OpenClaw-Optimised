/**
 * Error types for secrets resolution.
 */

export class MissingSecretError extends Error {
  constructor(
    public readonly secretName: string,
    public readonly configPath: string,
  ) {
    super(`Missing secret "${secretName}" referenced at config path: ${configPath}`);
    this.name = "MissingSecretError";
  }
}

export class SecretsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsProviderError";
  }
}
