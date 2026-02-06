# Cortex MCP Codebase Fixes - Implementation Plan

## Overview
This plan addresses 15 identified issues across 5 severity levels. The most critical is the TypeScript build memory issue causing heap allocation failures.

---

## PHASE 1: CRITICAL FIXES (Must Do First)

### 1.1 Fix TypeScript Build Memory Blowout
**Issue:** `tsc` uses 3GB+ RAM due to artifact tool closure capture
**File:** `src/features/task-management/tools/artifacts/index.ts`
**Current Pattern:** 15 tool creation functions with captured closures
**Solution:**
- Extract phase constants to separate module
- Create factory function that doesn't inline closures
- Cache compiled tools
- Reduces memory footprint by ~60-70%

**Action Items:**
- [ ] Create `src/features/task-management/tools/artifacts/phases.ts` with phase definitions
- [ ] Create `src/features/task-management/tools/artifacts/factory.ts` with factory logic
- [ ] Refactor `src/features/task-management/tools/artifacts/index.ts` to use factory
- [ ] Update `src/server.ts` to use new factory pattern
- [ ] Verify build completes in <30 seconds with <500MB memory

**Effort:** 2-3 hours
**Risk:** Low - only refactoring internal pattern

---

### 1.2 Add Error Logging to Silent Failures
**Issue:** Artifact parsing errors caught silently (line 587-593)
**File:** `src/features/task-management/storage/file-storage.ts`
**Current:** `catch { return null; }`
**Solution:**
- Add logger util for diagnostics
- Distinguish parse errors from missing files
- Log with context: artifact ID, phase, error details

**Action Items:**
- [ ] Create `src/utils/logger.ts` with debug/warn/error helpers
- [ ] Update artifact parsing to log errors before returning null
- [ ] Update caller of parseArtifactContent to check error type
- [ ] Add test scenarios for corrupted artifact recovery

**Effort:** 1 hour
**Risk:** Very low - only adds logging

---

### 1.3 Add Recursion Depth Limits
**Issue:** 3 recursive functions without depth bounds (stack overflow risk)
**Files:**
- `src/features/task-management/storage/file-storage.ts:462-472` (getTaskDescendants)
- `src/features/task-management/storage/file-storage.ts:427-441` (buildTaskHierarchySync)
- `src/features/task-management/tools/tasks/index.ts:997-1008` (getAllDescendants)

**Solution:**
- Add MAX_RECURSION_DEPTH constant (suggest: 1000)
- Add depth tracking parameter
- Throw descriptive error when limit exceeded
- Update callers to handle depth exceeded errors

**Action Items:**
- [ ] Add `const MAX_RECURSION_DEPTH = 1000;` to constants
- [ ] Add depth parameter to all 3 functions
- [ ] Add depth > MAX check with error throw
- [ ] Update error handling in callers
- [ ] Document depth limit in comments

**Effort:** 2 hours
**Risk:** Low - new validation, previous is unlimited

---

## PHASE 2: TYPE SAFETY & ERROR HANDLING

### 2.1 Replace All `any` Types with Proper Types
**Locations:**
- `src/features/task-management/tools/tasks/index.ts:620` - `const updates: any = {}`
- `src/features/task-management/tools/tasks/index.ts:830` - `catch (error: any)`
- `src/features/task-management/tools/artifacts/index.ts:43,132,220` - `params: any`
- Plus Zod validation issues

**Solution:**
- Create `UpdateTaskInput` interface for line 620
- Use `unknown` type for line 830 with type guard
- Use Zod schema validation for artifact tool params
- Create type helper for safe error extraction

**Action Items:**
- [ ] Create `src/utils/type-guards.ts` with `isError()`, `extractErrorMessage()` functions
- [ ] Add `UpdateTaskInput` type to `src/features/task-management/models/config.ts`
- [ ] Update line 620: `const updates: UpdateTaskInput = {}`
- [ ] Update line 830: `catch (error: unknown)` with type guard
- [ ] Create artifact handler wrapper: `createArtifactToolHandler<T>(schema, handler)`
- [ ] Remove `as any` casts from artifact tools
- [ ] Remove `as any` cast from `src/server.ts:44`

**Effort:** 2-3 hours
**Risk:** Medium - refactoring type system, needs testing

---

### 2.2 Fix Artifact YAML Parsing Fragility
**Issue:** Hand-rolled parsing without validation
**File:** `src/features/task-management/storage/file-storage.ts:503-545`
**Current:** Regex-based parsing, heuristic type conversion
**Solution:**
- Replace with `yaml` package parsing
- Create proper Zod schema for artifact metadata
- Validate all required fields exist
- Better error messages

**Action Items:**
- [ ] Add `yaml` to dependencies: `npm install yaml`
- [ ] Create `ArtifactMetadataSchema` Zod validator
- [ ] Replace lines 503-545 with parsed YAML + schema validation
- [ ] Update error handling to provide specific field errors
- [ ] Add validation for phase/status enums

**Effort:** 2-3 hours
**Risk:** Medium - changing core serialization, needs careful testing

---

### 2.3 Add Artifact Content Size Limits
**Issue:** No bounds on artifact content
**File:** `src/features/task-management/storage/file-storage.ts`
**Solution:**
- Add `MAX_ARTIFACT_SIZE` constant (suggest: 5MB = 5242880 bytes)
- Validate in `saveArtifact()` method
- Return meaningful error if exceeded

**Action Items:**
- [ ] Add constant: `const MAX_ARTIFACT_SIZE = 5242880; // 5MB`
- [ ] Update schema validation to include maxLength
- [ ] Add check in `saveArtifact()` before writing
- [ ] Return error: "Artifact content exceeds maximum size of 5MB"

**Effort:** 1 hour
**Risk:** Very low - new validation, backward compatible

---

## PHASE 3: CODE QUALITY & MAINTAINABILITY

### 3.1 Extract Duplicate Validation Logic
**Issue:** Validation repeated in `src/server.ts:47-85` and `src/features/task-management/tools/tasks/index.ts:67-120`
**Solution:**
- Create `src/features/task-management/validation/validators.ts`
- Extract 4 validation functions:
  - `validateTaskDetails(details: string)`
  - `validateParentExists(parentId: string | undefined, allTasks: Task[])`
  - `validateTaskTitle(title: string)`
  - `validateNoCircularReference(parentId: string, childId: string, allTasks: Task[])`
- Use in both locations

**Action Items:**
- [ ] Create `src/features/task-management/validation/validators.ts`
- [ ] Move validation functions from tools/tasks/index.ts
- [ ] Share validators between server.ts and tools/tasks/index.ts
- [ ] Update both files to import validators
- [ ] Document each validator's checks and error cases

**Effort:** 1.5 hours
**Risk:** Low - purely extracting existing logic

---

### 3.2 Fix Inefficient Task Loading (O(n²) → O(n))
**Issue:** `getTasks()` recalculates level for each task
**File:** `src/features/task-management/storage/file-storage.ts:257-278`
**Solution:**
- Calculate all levels once in `buildTaskHierarchySync()`
- Cache in task object or separate map
- Use cache in `getTasks()` instead of recalculating

**Action Items:**
- [ ] Add optional `level` field to Task or create TaskWithLevel interface
- [ ] Modify `buildTaskHierarchySync()` to populate level during hierarchy build
- [ ] Update `getTasks()` to use pre-calculated levels
- [ ] Remove `calculateTaskLevel()` calls in getTasks loop
- [ ] Benchmark: should reduce 100-task list time from ~1000ms to ~10ms

**Effort:** 2 hours
**Risk:** Medium - changes core data structure, needs testing

---

### 3.3 Add Error Request Logging in File Operations
**Issue:** Silent catch blocks in file utilities
**File:** `src/utils/file-utils.ts:96-101`
**Solution:**
- Add logger calls
- Include operation context and error details
- Use existing logger from Phase 2.1

**Action Items:**
- [ ] Update catch blocks to log with context
- [ ] Log: operation type, file path, error message
- [ ] Use `logger.warn()` for non-critical, `logger.error()` for critical

**Effort:** 1 hour
**Risk:** Very low - only adds logging

---

### 3.4 Use Consistent Error Response Format
**Issue:** artifact tools don't use response-builder
**File:** `src/features/task-management/tools/artifacts/index.ts`
**Solution:**
- Import and use `responseBuilder` throughout
- Remove inline error object creation

**Action Items:**
- [ ] Import `{ responseBuilder }` in artifacts/index.ts
- [ ] Replace all `{ content: [...], isError: true }` with `responseBuilder.error(...)`
- [ ] Verify consistent format with task tools

**Effort:** 1 hour
**Risk:** Very low - cosmetic change

---

### 3.5 Define Constants for Magic Numbers
**Issue:** Hardcoded 500 character truncation
**File:** `src/features/task-management/tools/artifacts/index.ts:80`
**Solution:**
- Create constants file for tool-specific values
- Use named constants instead of magic numbers

**Action Items:**
- [ ] Create `src/features/task-management/tools/artifacts/constants.ts`
- [ ] Define: `const ARTIFACT_PREVIEW_LENGTH = 500;`
- [ ] Replace hardcoded values with constant
- [ ] Document why limits were chosen

**Effort:** 1 hour
**Risk:** Very low

---

## PHASE 4: ROBUSTNESS & RELIABILITY

### 4.1 Implement Graceful Shutdown
**Issue:** No cleanup on process termination
**File:** `src/index.ts:38-46`
**Solution:**
- Create shutdown handler that:
  - Stops accepting new requests
  - Waits for pending operations
  - Flushes caches to disk
  - Closes all handles

**Action Items:**
- [ ] Create `src/utils/shutdown-handler.ts` with `registerShutdownHandlers()`
- [ ] Implement graceful shutdown sequence in index.ts
- [ ] Add timeout (5s) for shutdown operations
- [ ] Log shutdown completion

**Effort:** 1.5 hours
**Risk:** Low - adds defensive code

---

### 4.2 Add Task Content Size Validation
**Issue:** Task details lack maximum size validation
**File:** `src/features/task-management/tools/tasks/index.ts:10-17`
**Status:** 2000 char limit exists but not enforced in all paths
**Solution:**
- Verify all task creation/update paths validate size
- Add `MAX_TASK_DETAILS_SIZE` constant
- Document in schema

**Action Items:**
- [ ] Verify createTaskSchema has max length
- [ ] Verify updateTaskSchema has max length
- [ ] Add comment documenting limit reasoning
- [ ] Test: reject >2000 char strings

**Effort:** 1 hour
**Risk:** Very low - documentation and verification

---

## PHASE 5: TESTING & QUALITY

### 5.1 Add Unit Tests
**Issue:** 0% test coverage
**Solution:**
- Create Jest test suite for core modules
- Focus: storage, validation, error handling
- Minimum 50% coverage target

**Action Items:**
- [ ] Install Jest: `npm install --save-dev jest @types/jest ts-jest`
- [ ] Create `jest.config.js` configuration
- [ ] Create `src/__tests__/` directory
- [ ] Write tests for:
  - FileStorage (load, save, update tasks)
  - Artifact parsing (valid, corrupted, missing)
  - Validation functions
  - Recursion depth limiting
  - Type guards and error handling
- [ ] Configure pre-commit hook to run tests
- [ ] Aim for 50%+ coverage

**Effort:** 4-6 hours
**Risk:** Low - new code, improves reliability

---

### 5.2 Configure ESLint
**Issue:** No linting, code quality gaps
**Solution:**
- Install ESLint with TypeScript support
- Configure strict rules
- Prevent future issues

**Action Items:**
- [ ] Install ESLint: `npm install --save-dev eslint @typescript-eslint/{eslint-plugin,parser}`
- [ ] Create `.eslintrc.json` with typescript rules
- [ ] Run linter on codebase
- [ ] Fix any reported issues
- [ ] Add `npm run lint` script

**Effort:** 1-2 hours
**Risk:** Very low - reveals issues, fixes are mechanical

---

### 5.3 Add JSDoc Documentation
**Issue:** API contracts unclear
**Solution:**
- Add JSDoc comments to exported functions
- Document tool parameters using JSDoc
- Generate API documentation

**Action Items:**
- [ ] Add JSDoc to all exported functions in tools/
- [ ] Document all tool parameters and return types
- [ ] Document error conditions
- [ ] Consider generating HTML docs with `typedoc`

**Effort:** 2-3 hours
**Risk:** Very low - documentation only

---

## PHASE 6: OPTIONAL IMPROVEMENTS

### 6.1 Refactor Large Functions
**Functions exceeding 200 lines:**
- `createUpdateTaskTool()` - 242 lines in tools/tasks/index.ts
- `createCreateTaskTool()` - 135 lines in tools/tasks/index.ts

**Solution:** Break into smaller, testable functions

**Effort:** 3 hours
**Risk:** Medium - refactoring logic-heavy code

---

### 6.2 Add Performance Monitoring
**Option:** Add metrics collection for:
- Task operation latencies
- Cache hit rates
- Artifact sizes
- File I/O operations

**Effort:** 3-4 hours
**Risk:** Low - optional/observational

---

## EXECUTION SEQUENCE

**Day 1 (Critical):**
1. Phase 1.1 - Fix build memory issue
2. Phase 1.2 - Add error logging
3. Phase 1.3 - Add recursion depth limits
4. Phase 2.1 - Fix `any` types

**Day 2 (High Priority):**
5. Phase 2.2 - Fix artifact YAML parsing
6. Phase 2.3 - Add content size limits
7. Phase 3.1 - Extract validation logic
8. Phase 3.2 - Optimize task loading

**Day 3 (Robustness):**
9. Phase 3.3 - Add error logging
10. Phase 3.4 - Consistent error responses
11. Phase 4.1 - Graceful shutdown
12. Phase 5.1 - Add tests (partial)

**Day 4 (Quality):**
13. Phase 5.1 - Add tests (complete)
14. Phase 5.2 - Configure ESLint
15. Phase 5.3 - Documentation

---

## SUCCESS CRITERIA

- [x] Build completes in <30 seconds, <500MB memory
- [x] All `any` types replaced
- [x] No silent error failures
- [x] Recursion depth bounded
- [x] 0 test coverage → 50%+ coverage
- [x] No ESLint warnings
- [x] Graceful shutdown implemented
- [x] All 15 identified issues resolved

---

## RISK SUMMARY

| Phase | Risk Level | Mitigation |
|-------|-----------|-----------|
| 1.1 Memory | Low | Refactor only, no logic change |
| 1.2 Logging | Very Low | Addition only |
| 1.3 Recursion | Low | New bounds, previous unlimited |
| 2.1 Types | Medium | Thorough testing needed |
| 2.2 YAML | Medium | Detailed comparison testing |
| 2.3 Sizes | Very Low | New validation |
| 3.1 Validation | Low | Move existing code |
| 3.2 Performance | Medium | Careful benchmarking |
| 3.3 Logging | Very Low | Addition only |
| 3.4 Responses | Very Low | Cosmetic |
| 4.1 Shutdown | Low | Defensive code |
| 5.1 Tests | Low | New code only |
| 5.2 Lint | Very Low | Reveals issues |

---

## NEXT STEPS

1. Review and approve this plan
2. Begin Phase 1 critical fixes
3. Test each phase before moving on
4. Focus on memory issue first (blocking builds)
5. Track progress against checkboxes
