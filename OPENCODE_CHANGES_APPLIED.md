# opencode.json Changes Applied - Quick Reference

## Summary
All 5 workflow subagents have been updated with correct permissions.

## Changes Made

### 1. explore (Line 132-149)
```diff
  "permission": {
    "glob": "allow",
    "list": "allow",
    "read": "allow",
    "grep": "allow",
+   "cortex_get_task": "allow",
    "cortex*explore": "allow",
  }
```
**Why:** explore now can read task details and requirements

---

### 2. plan (Line 150-167)
```diff
  "permission": {
-   "bash": "allow",
    "glob": "allow",
    "list": "allow",
    "read": "allow",
    "grep": "allow",
+   "cortex_get_task": "allow",
    "cortex*plan": "allow",
  }
```
**Why:** plan can read task/explore AND removed bash (planning doesn't run commands)

---

### 3. build (Line 168-187)
```diff
  "permission": {
    "bash": "allow",
    "glob": "allow",
    "list": "allow",
    "read": "allow",
    "grep": "allow",
    "write": "allow",
    "edit": "allow",
+   "cortex_get_task": "allow",
    "cortex*build": "allow",
  }
```
**Why:** build now can read plan to know what to implement

---

### 4. search (Line 190-209)
```diff
  "permission": {
    "glob": "deny",
    "list": "deny",
    "read": "deny",
    "grep": "deny",
-   "write": "allow",
+   "write": "deny",
    "webfetch": "allow",
    "exa*": "allow",
+   "cortex_get_task": "allow",
    "cortex*search": "allow",
  }
```
**Why:** 
- search can read task unknowns
- Cannot write local files (research-only)

---

### 5. test (Line 211-230)
```diff
  "permission": {
    "bash": "allow",
    "glob": "allow",
    "list": "allow",
    "read": "allow",
    "grep": "allow",
-   "write": "allow",
+   "write": "deny",
-   "edit": "allow",
+   "edit": "deny",
    "chrome*": "allow",
+   "cortex_get_task": "allow",
    "cortex*test": "allow",
  }
```
**Why:** 
- test can read plan and build artifacts
- Cannot modify files (verification-only, not fix-only)
- This was the KEY fix for test2's "PASS with issues" bug

---

## Impact of Each Change

| Change | Before | After | Benefit |
|--------|--------|-------|---------|
| explore + cortex_get_task | Can't read task | Can read task | Know what to analyze |
| plan + cortex_get_task | Can't read task/explore | Can read both | Know requirements + findings |
| plan - bash | Can run commands | Can't run | Stays in planning phase |
| build + cortex_get_task | Can't read plan | Can read plan | Know what to implement |
| search + cortex_get_task | Can't read task | Can read task | Know what to research |
| search - write | Can write files | Can't write | Research-only enforcement |
| test + cortex_get_task | Can't read plan | Can read plan | Know what to test |
| test - write | Can create files | Can't create | Verification-only enforcement |
| test - edit | Can fix code | Can't fix | Report bugs, don't hide them |

---

## How This Fixes Test2 Issues

### Issue: Wrong Language (Python instead of Node.js)
**Root:** Plan couldn't read task → didn't know "Node.js" was required
**Fix:** Plan now has `cortex_get_task` → sees requirement → uses Node.js

### Issue: Search Phase Skipped
**Root:** No way to know which unknowns needed research
**Fix:** Search now has `cortex_get_task` → orchestrator can see unknowns → triggers search

### Issue: Test Marked PASS with Bug
**Root:** Test had `edit: allow` → could have fixed bug but didn't → marked PASS anyway
**Fix:** Test now has `edit: deny` → CANNOT hide bugs → must report FAIL

### Issue: Subagents Flying Blind
**Root:** None could read task or previous findings
**Fix:** All now have `cortex_get_task` → full context flow

---

## Verification

File: `/home/geanatz/.config/opencode/opencode.json`

To verify changes were applied, check:
```bash
grep -A 10 '"explore":' ~/.config/opencode/opencode.json | grep cortex_get_task
grep -A 10 '"test":' ~/.config/opencode/opencode.json | grep 'write.*deny'
grep -A 10 '"test":' ~/.config/opencode/opencode.json | grep 'edit.*deny'
```

All three should show the new/changed permissions.

---

## Next Steps

1. **Restart opencode** to apply permission changes
2. **Run Test3** with:
   ```
   Goal: Create a simple Node.js CLI counter utility with persistent JSON storage
   ```
3. **Verify** that:
   - ✅ Orchestrator captures "Node.js"
   - ✅ Build creates .js files
   - ✅ Test passes with no issues
   - ✅ Language matches request

---

Generated: February 4, 2026
Status: All changes applied and verified
