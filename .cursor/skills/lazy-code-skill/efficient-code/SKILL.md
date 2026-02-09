---
name: efficient-quality-coding
description: Enforce writing high-quality and high-performance code without unnecessary overhead. Use when generating, refactoring, or reviewing code to avoid repeated initialization, unnecessary loops, excessive memory usage, and premature optimizations, while never sacrificing code quality for speed.
---

# Efficient & High-Quality Coding

This skill ensures that any generated or reviewed code is **both efficient and high-quality**.  
Performance improvements must **never** reduce readability, correctness, maintainability, or safety.

## Core Principles (Non-Negotiable)

1. **Quality first, performance always**
   - Never trade correctness, clarity, or maintainability for raw speed.
   - Optimizations must be explainable and justified.

2. **No unnecessary work**
   - Do not initialize objects, clients, configs, or connections repeatedly.
   - Avoid loops, computations, or allocations that do not change the outcome.

3. **Predictable resource usage**
   - Avoid excessive memory allocation.
   - Prefer streaming, iterators, generators, or batching when appropriate.
   - Reuse objects safely when lifecycle allows.

4. **Measure before optimizing**
   - Optimize only when there is a clear cost (time, memory, CPU, I/O).
   - If performance impact is unclear, favor clarity.

---

## Mandatory Coding Rules

### Initialization

- Initialize expensive resources **once**, not inside loops or hot paths.
- Cache immutable or reusable objects.
- Lazy-initialize only when it meaningfully reduces cost.

✅ Good:

```python
client = DatabaseClient()

for item in items:
    client.process(item)
```

❌ Bad:

```python
for item in items:
    client = DatabaseClient()
    client.process(item)
```

---

### Looping & Control Flow

- Avoid nested loops when a single pass is sufficient.
- Do not loop if a vectorized, batched, or built-in operation exists.
- Exit early when conditions are met.

✅ Good:

```python
for x in data:
    if x == target:
        return True
return False
```

❌ Bad:

```python
found = False
for i in range(len(data)):
    for j in range(1):
        if data[i] == target:
            found = True
```

---

### Memory Usage

- Avoid building large temporary lists when streaming is enough.
- Prefer generators / iterators for large data.
- Do not copy data structures unless required.

✅ Good:

```python
total = sum(x.value for x in records)
```

❌ Bad:

```python
values = [x.value for x in records]
total = sum(values)
```

---

### Data Structures

- Choose data structures based on access patterns.
  - Lookup → `dict` / `set`
  - Order matters → `list`
  - Frequent membership checks → `set`
- Never use a slower structure for convenience.

---

### I/O and External Calls

- Batch external calls when possible.
- Never call network / disk / DB operations inside tight loops unless unavoidable.
- Clearly separate compute logic from I/O logic.

---

## Optimization Boundaries

Only optimize when **all** conditions are met:

- The code is correct.
- The code is readable.
- The bottleneck is identified or obvious.
- The optimization does not reduce maintainability.

If forced to choose:

> **Readable + correct + fast enough** beats **clever + fast + fragile**.

---

## Review Checklist (Always Apply)

Before finalizing code, verify:

- [ ] No repeated initialization in loops
- [ ] No unnecessary loops or nested loops
- [ ] Memory usage is proportional to problem size
- [ ] Data structures are appropriate
- [ ] No premature or speculative optimizations
- [ ] Code is readable and maintainable
- [ ] Performance improvements are justified

---

## Output Expectations

When generating or reviewing code:

- Prefer clear structure over clever tricks.
- Add brief comments only where performance decisions are non-obvious.
- If optimization is applied, ensure it is safe and explainable.

This skill must be applied automatically whenever writing, refactoring, or reviewing code.
