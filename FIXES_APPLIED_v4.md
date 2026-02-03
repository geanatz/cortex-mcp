# Cortex-MCP v4.0.0 - Test2 Issues & Fixes Applied

**Date:** February 4, 2026
**Status:** ✅ ALL FIXES APPLIED & READY FOR TEST3

---

## 📋 Test2 Analysis Summary

### Issues Found
1. **CRITICAL: Wrong Language** - User requested Node.js, got Python
2. **HIGH: Search Phase Skipped** - Unknown tech not researched
3. **HIGH: Plan Made Autonomous Tech Decision** - Chose Python without authority
4. **HIGH: Test Marked PASS Despite Bug** - Found TypeError but reported "PASS (with minor issue)"
5. **HIGH: Orchestrator Validation Gaps** - Didn't catch wrong language or false positive test

### Root Causes
- Task details didn't capture language requirement → context lost between phases
- Subagents couldn't read task or artifacts (missing `cortex_get_task` permission)
- Search phase never triggered when tech was unknown
- Plan had no guard against autonomous tech decisions
- Test could edit code (shouldn't have `edit` permission) and had lenient pass criteria
- Orchestrator didn't validate implementation against requirements

---

## ✅ Fixes Applied

### 1. Agent Instructions Updated

#### orchestrate.md
- ✅ Added "CRITICAL: Requirements Capture" section
- ✅ Extracts language/framework from user request before creating task
- ✅ Passes requirements in task details so they won't be lost
- ✅ Passes full requirements to each subagent prompt
- ✅ Added "Test Phase Verdict Interpretation" - treats "PASS with issues" as FAIL
- ✅ Added conditional search phase trigger for unknown tech
- ✅ Added technology verification in final validation
- ✅ Expanded validation checklists for all phases

#### plan.md
- ✅ Added "NEVER CHOOSE TECHNOLOGY AUTONOMOUSLY" rule
- ✅ Added technology verification step (must be known before planning)
- ✅ Blocks planning with "BLOCKED: Technology not specified" if unknown
- ✅ Removed unnecessary bash permission requirement (plan doesn't run commands)
- ✅ Updated process to require tech confirmation first
- ✅ Updated checklist to verify tech matches task

#### test.md
- ✅ Added strict PASS/FAIL criteria (no "PASS with issues")
- ✅ Binary outcome only: either PASS or FAIL
- ✅ Any bug/crash/exception triggers FAIL
- ✅ Clear decision tree for status selection
- ✅ Removed support for ambiguous verdicts

### 2. Permissions Fixed in opencode.json

#### ALL Subagents
- ✅ **ADDED** `"cortex_get_task": "allow"` to explore, plan, build, search, test
  - Now they can read task details, requirements, and prior artifacts
  - This fixes the "flying blind" problem

#### explore
- ✅ Can read task via `cortex_get_task`
- ✅ Remains read-only (no bash, write, edit)

#### plan
- ✅ Can read task and explore findings via `cortex_get_task`
- ✅ **REMOVED** `"bash": "allow"` (planning only, no command execution)
- ✅ Still design-only (no write, edit)

#### build
- ✅ Can read plan via `cortex_get_task`
- ✅ Retains full implementation permissions (bash, write, edit)

#### search
- ✅ Can read task unknowns via `cortex_get_task`
- ✅ **CHANGED** `"write": "deny"` (was "allow" - research-only)
- ✅ Research-only: webfetch and exa only, no local file access

#### test
- ✅ Can read plan via `cortex_get_task`
- ✅ **CHANGED** `"write": "deny"` (was "allow" - verification-only)
- ✅ **CHANGED** `"edit": "deny"` (was "allow" - CRITICAL: test was fixing code!)
- ✅ Verification-only: bash and read for test execution, no file modification

---

## 🎯 Expected Improvements in Test3

### Fix 1: Correct Language Selection
**Before (Test2):** 
- User said "Node.js" → orchestrator created task without capturing it → plan picked Python

**After (Test3):**
- User says "Node.js" → orchestrator captures "Node.js" in task details → passes to all subagents → plan sees requirement and uses Node.js
- ✅ Correct language used

### Fix 2: Search Phase Triggered
**Before (Test2):**
- Explore: "Tech: Unknown" → Plan: *directly* (no search) → Plan guessed Python

**After (Test3):**
- Explore: "Tech: Unknown" → Orchestrator checks "Is tech specified in task?" → NO → Triggers search or asks user
- ✅ Technology decision made properly

### Fix 3: Plan Cannot Choose Technology
**Before (Test2):**
- Plan received "Tech: Unknown" and picked Python autonomously

**After (Test3):**
- Plan receives full task details including technology (from task or search)
- Plan MUST verify tech is known before planning
- If unknown, plan reports: "BLOCKED: Technology not specified"
- ✅ No autonomous tech decisions

### Fix 4: Test Reports Failures Correctly
**Before (Test2):**
- Test found TypeError but marked "PASS (with minor issue)"
- Had `edit: allow` permission so could have fixed it

**After (Test3):**
- Test has `edit: deny` - CANNOT fix code
- Test finds TypeError → MUST report FAIL
- Orchestrator sees FAIL, re-invokes build to fix
- ✅ Bugs don't slip through

### Fix 5: Orchestrator Validates Requirements
**Before (Test2):**
- Built Python, tested found bug, marked DONE anyway

**After (Test3):**
- Orchestrator checks: "Does implementation match requirements?"
- Catches wrong language before marking complete
- Catches test failures and re-invokes build
- ✅ Quality gates enforced

---

## 📊 Changes Summary

| Component | Changes | Impact |
|-----------|---------|--------|
| orchestrate.md | +150 lines | Context preservation, validation |
| plan.md | +80 lines | Technology gate, decision blocking |
| test.md | +50 lines | Strict PASS/FAIL, no edge cases |
| opencode.json | 5 agents updated | Subagent visibility into task context |

### Specific File Changes

**opencode.json (5 edits):**
1. explore: added `cortex_get_task: allow`
2. plan: added `cortex_get_task: allow`, removed `bash: allow`
3. build: added `cortex_get_task: allow`
4. search: added `cortex_get_task: allow`, changed `write: deny`
5. test: added `cortex_get_task: allow`, changed `write: deny`, changed `edit: deny`

---

## 🧪 Ready for Test3

All fixes are in place and ready to test. To run test3:

```
Goal: Create a simple Node.js CLI counter utility with persistent JSON storage
Delivery: Complete Node.js implementation with tests passing
```

### Expected Outcome
- ✅ Orchestrator captures "Node.js" requirement
- ✅ Explore analyzes without implementing
- ✅ Search resolves technology unknowns (or orchestrator asks user)
- ✅ Plan designs using Node.js (not Python!)
- ✅ Build creates .js files and implements correctly
- ✅ Test runs and reports TRUE status (PASS if all pass, FAIL if any bug)
- ✅ Orchestrator validates language matches and test passes before marking complete
- ✅ Result: Node.js CLI counter, fully working, tests passing

### Validation Checklist
- [ ] Orchestrator created task with "Node.js" in details
- [ ] Explore could read task via `cortex_get_task`
- [ ] Plan received technology requirement
- [ ] Build created .js/.ts files (not .py)
- [ ] Test marked FAIL if any issues found (not "PASS with issues")
- [ ] Orchestrator validated language matches request
- [ ] Task marked complete only when all checks pass

---

## 📝 Notes

### Why These Fixes Matter
1. **cortex_get_task for all subagents** - Without it, agents can't read the task or prior findings. This was blocking proper context flow.
2. **Strict PASS/FAIL in test** - Ambiguous results ("PASS with issues") hide bugs that cascade into wrong decisions.
3. **Technology gate in plan** - Prevents arbitrary choices when language is unspecified.
4. **Task requirements capture** - Ensures user intent (like "Node.js") isn't lost after orchestrator reads it.
5. **Removing write/edit from test** - Test's job is to verify, not fix. Prevents test from silently fixing issues.

### Architecture Improvements
- **Information Flow**: Each phase can now read prior findings via `cortex_get_task`
- **Decision Gates**: Plan cannot proceed without confirmed technology
- **Quality Gates**: Test must report binary outcome, orchestrator validates against requirements
- **Phase Boundaries**: Explicit constraints prevent phases from exceeding their role

---

## 🔄 Previous Test Results

### Test1 (Before Fixes)
- Phase boundary violations (explore implementing code)
- Addressed by updated agent instructions

### Test2 (Before Permission Fixes, After Phase Boundary Fixes)
- Wrong language selected
- Search phase skipped
- Test marked PASS with known bug
- Addressed by:
  - Requirements capture in orchestrate.md
  - cortex_get_task permissions
  - Strict PASS/FAIL in test.md

### Test3 (Current - With All Fixes)
- Expected to demonstrate correct workflow
- Should validate all improvements work together

---

**Status: Ready for Test3** ✅
