# Dependency Injection Container

**Status:** New Proposal
**Author:** Claude Opus 4.5
**Date:** 2026-02-04

---

## Summary

A lightweight dependency injection (DI) container that centralizes service instantiation, supports scoped lifetimes, and enables clean testing with mock injection. This replaces the current ad-hoc `createDefaultDeps` patterns scattered across the codebase.

---

## Problem Statement

The codebase currently uses several patterns for dependency management:

### Pattern 1: `createDefaultDeps` Functions

```ts
// src/some-module/index.ts
export function createDefaultDeps(): SomeDeps {
  return {
    config: getConfig(),
    logger: createLogger(),
    httpClient: createHttpClient(),
    // ...
  };
}

export async function doThing(input: Input, deps = createDefaultDeps()) {
  // use deps
}
```

**Problems:**

- Each module defines its own deps type
- Dependencies recreated on every call
- No lifetime management (singletons leak)
- Testing requires manually building partial deps

### Pattern 2: Global Singletons

```ts
// src/config/index.ts
let configSingleton: Config | null = null;

export function getConfig(): Config {
  if (!configSingleton) {
    configSingleton = loadConfig();
  }
  return configSingleton;
}
```

**Problems:**

- Hard to reset between tests
- Circular dependency issues
- Hidden state makes debugging difficult

### Pattern 3: Constructor Injection (Partial)

```ts
class AgentRuntime {
  constructor(
    private config: Config,
    private logger: Logger,
    private toolRegistry: ToolRegistry,
  ) {}
}

// Caller must know how to construct all deps
const runtime = new AgentRuntime(
  getConfig(),
  createLogger("agent"),
  createToolRegistry(getConfig()),
);
```

**Problems:**

- Manual wiring at call sites
- No centralized registration
- Deep dependency trees become unwieldy

---

## Goals

1. **Centralized registration** of all services
2. **Scoped lifetimes** (singleton, request, transient)
3. **Type-safe resolution** with compile-time checks
4. **Easy testing** with scoped overrides
5. **Lazy instantiation** to avoid startup cost
6. **Circular dependency detection**

## Non-Goals

- Runtime service discovery
- Dynamic registration after startup
- Distributed service resolution
- Complex lifecycle hooks

---

## Core Concepts

### Service Token

A unique identifier for a service type:

```ts
// Tokens are symbols with type information
const ConfigToken = createToken<Config>("Config");
const LoggerToken = createToken<Logger>("Logger");
const RuntimeToken = createToken<AgentRuntime>("AgentRuntime");
```

### Service Provider

Describes how to instantiate a service:

```ts
interface ServiceProvider<T> {
  token: ServiceToken<T>;
  lifetime: "singleton" | "scoped" | "transient";
  factory: (container: Container) => T;
}
```

### Container

The DI container that holds registrations and resolves services:

```ts
interface Container {
  register<T>(provider: ServiceProvider<T>): void;
  resolve<T>(token: ServiceToken<T>): T;
  createScope(): Container;
}
```

---

## API Design

### Registration

```ts
// src/container/registrations.ts
import { Container, createToken } from "./container";

// Define tokens
export const ConfigToken = createToken<OpenClawConfig>("Config");
export const LoggerToken = createToken<Logger>("Logger");
export const StateServiceToken = createToken<StateService>("StateService");
export const RuntimeResolverToken = createToken<RuntimeResolver>("RuntimeResolver");
export const ExecutionKernelToken = createToken<ExecutionKernel>("ExecutionKernel");

// Register services
export function registerServices(container: Container) {
  container.register({
    token: ConfigToken,
    lifetime: "singleton",
    factory: () => loadConfig(),
  });

  container.register({
    token: LoggerToken,
    lifetime: "transient", // New logger per resolve
    factory: (c) => createLogger(c.resolve(ConfigToken)),
  });

  container.register({
    token: StateServiceToken,
    lifetime: "singleton",
    factory: (c) => new StateService(c.resolve(ConfigToken), c.resolve(LoggerToken)),
  });

  container.register({
    token: RuntimeResolverToken,
    lifetime: "singleton",
    factory: (c) => new RuntimeResolver(c.resolve(ConfigToken), c.resolve(LoggerToken)),
  });

  container.register({
    token: ExecutionKernelToken,
    lifetime: "singleton",
    factory: (c) =>
      new ExecutionKernel(
        c.resolve(RuntimeResolverToken),
        c.resolve(StateServiceToken),
        c.resolve(LoggerToken),
      ),
  });
}
```

### Resolution

```ts
// Usage in application code
const container = createContainer();
registerServices(container);

const kernel = container.resolve(ExecutionKernelToken);
const result = await kernel.execute(request);
```

### Scoped Lifetimes

```ts
// Request-scoped services
container.register({
  token: RequestContextToken,
  lifetime: "scoped",
  factory: () => new RequestContext(),
});

// Each scope gets its own instance
async function handleRequest(request: Request) {
  const scope = container.createScope();

  // All services resolved within this scope share the same RequestContext
  const kernel = scope.resolve(ExecutionKernelToken);
  const result = await kernel.execute(request);

  // Scope is disposed, scoped services are cleaned up
}
```

---

## Lifetime Behaviors

### Singleton

- Created once per container
- Shared across all resolutions
- Lives until container is disposed

```ts
container.register({
  token: ConfigToken,
  lifetime: "singleton",
  factory: () => loadConfig(),
});

const config1 = container.resolve(ConfigToken);
const config2 = container.resolve(ConfigToken);
assert(config1 === config2); // Same instance
```

### Scoped

- Created once per scope
- Shared within the scope
- Disposed when scope ends

```ts
container.register({
  token: SessionToken,
  lifetime: "scoped",
  factory: () => new Session(),
});

const scope1 = container.createScope();
const scope2 = container.createScope();

const session1a = scope1.resolve(SessionToken);
const session1b = scope1.resolve(SessionToken);
const session2 = scope2.resolve(SessionToken);

assert(session1a === session1b); // Same within scope
assert(session1a !== session2); // Different across scopes
```

### Transient

- Created on every resolution
- No sharing
- Caller responsible for disposal

```ts
container.register({
  token: LoggerToken,
  lifetime: "transient",
  factory: (c) => new Logger(c.resolve(ConfigToken)),
});

const logger1 = container.resolve(LoggerToken);
const logger2 = container.resolve(LoggerToken);
assert(logger1 !== logger2); // Different instances
```

---

## Testing Support

### Scoped Overrides

Replace services within a test scope:

```ts
test("execution with mock runtime", async () => {
  const testScope = container.createScope();

  // Override runtime resolver with mock
  testScope.override(RuntimeResolverToken, {
    resolve: () => mockRuntimeContext,
  });

  const kernel = testScope.resolve(ExecutionKernelToken);
  const result = await kernel.execute(testRequest);

  expect(result.success).toBe(true);
});
```

### Test Container Factory

Create isolated containers for tests:

```ts
// test/helpers/container.ts
export function createTestContainer(overrides?: Partial<ServiceOverrides>) {
  const container = createContainer();
  registerServices(container);

  // Apply test overrides
  if (overrides?.config) {
    container.override(ConfigToken, overrides.config);
  }
  if (overrides?.logger) {
    container.override(LoggerToken, overrides.logger);
  }

  return container;
}

// In tests
test("feature with custom config", async () => {
  const container = createTestContainer({
    config: { ...defaultConfig, feature: true },
  });

  const service = container.resolve(MyServiceToken);
  // ...
});
```

---

## Circular Dependency Detection

The container detects circular dependencies at resolution time:

```ts
container.register({
  token: ServiceAToken,
  lifetime: "singleton",
  factory: (c) => new ServiceA(c.resolve(ServiceBToken)),
});

container.register({
  token: ServiceBToken,
  lifetime: "singleton",
  factory: (c) => new ServiceB(c.resolve(ServiceAToken)), // Circular!
});

container.resolve(ServiceAToken);
// Throws: CircularDependencyError: ServiceA -> ServiceB -> ServiceA
```

---

## Migration Plan

### Phase 1: Foundation

1. Implement `Container` class with basic registration and resolution
2. Implement lifetime management (singleton, transient)
3. Add circular dependency detection
4. Add type-safe token system

### Phase 2: Core Services

1. Define tokens for core services (Config, Logger, etc.)
2. Create registration module
3. Migrate `getConfig()` to container resolution
4. Migrate logger creation

### Phase 3: Execution Layer

1. Register Execution Layer services
2. Update entry points to use container
3. Remove `createDefaultDeps` patterns

### Phase 4: Testing Infrastructure

1. Add scope override support
2. Create test container factory
3. Migrate existing tests to use container
4. Document testing patterns

### Phase 5: Adoption

1. Migrate remaining modules to container
2. Remove legacy singleton patterns
3. Document all registered services

---

## Implementation Details

### Container Implementation

```ts
export class Container {
  private providers = new Map<symbol, ServiceProvider<unknown>>();
  private singletons = new Map<symbol, unknown>();
  private scopedInstances = new Map<symbol, unknown>();
  private resolutionStack: symbol[] = [];
  private parent?: Container;

  register<T>(provider: ServiceProvider<T>): void {
    this.providers.set(provider.token.symbol, provider);
  }

  resolve<T>(token: ServiceToken<T>): T {
    const provider = this.getProvider(token);

    // Check for circular dependency
    if (this.resolutionStack.includes(token.symbol)) {
      const cycle = [...this.resolutionStack, token.symbol]
        .map((s) => this.providers.get(s)?.token.name)
        .join(" -> ");
      throw new CircularDependencyError(cycle);
    }

    // Check existing instances
    if (provider.lifetime === "singleton" && this.singletons.has(token.symbol)) {
      return this.singletons.get(token.symbol) as T;
    }
    if (provider.lifetime === "scoped" && this.scopedInstances.has(token.symbol)) {
      return this.scopedInstances.get(token.symbol) as T;
    }

    // Create instance
    this.resolutionStack.push(token.symbol);
    try {
      const instance = provider.factory(this);

      // Store based on lifetime
      if (provider.lifetime === "singleton") {
        this.singletons.set(token.symbol, instance);
      } else if (provider.lifetime === "scoped") {
        this.scopedInstances.set(token.symbol, instance);
      }

      return instance;
    } finally {
      this.resolutionStack.pop();
    }
  }

  createScope(): Container {
    const scope = new Container();
    scope.parent = this;
    scope.providers = this.providers; // Share registrations
    scope.singletons = this.singletons; // Share singletons
    // scopedInstances is fresh for the new scope
    return scope;
  }

  private getProvider<T>(token: ServiceToken<T>): ServiceProvider<T> {
    const provider = this.providers.get(token.symbol) ?? this.parent?.providers.get(token.symbol);
    if (!provider) {
      throw new ServiceNotRegisteredError(token.name);
    }
    return provider as ServiceProvider<T>;
  }
}
```

---

## Risks and Mitigations

| Risk                                     | Mitigation                                         |
| ---------------------------------------- | -------------------------------------------------- |
| Over-engineering simple cases            | Keep API minimal; direct instantiation still valid |
| Learning curve                           | Clear documentation, migration guide               |
| Runtime errors for missing registrations | Startup validation, type-safe tokens               |
| Performance overhead                     | Lazy resolution, singleton caching                 |

---

## Success Criteria

1. All core services registered in container
2. No `createDefaultDeps` patterns in new code
3. Tests use scoped overrides instead of manual mocking
4. Circular dependency errors caught at dev time
5. Clear service lifetime documentation

---

## Comparison with Alternatives

### Why Not TSyringe/InversifyJS?

- Heavy decorator syntax
- Complex configuration
- Overkill for our needs
- We want explicit registration, not auto-discovery

### Why Not Simple Factory Functions?

- No lifetime management
- Manual wiring at every call site
- No scoped testing support

### This Proposal

- Minimal API surface
- Explicit registration
- Type-safe without decorators
- Built-in testing support
- Lightweight implementation

---

## Related Docs

- [Agent Execution Layer](/design/plans/opus/01-agent-execution-layer)
- [Observable Pipeline Abstraction](/design/plans/opus/02-observable-pipeline-abstraction)
