---
name: void-repo-rules
description: Use when doing any work in the void-userscript-loader repository — applies to every task, file read, edit, search, or navigation action in this repo
---

# Void Repo Rules

## Rule: Never touch archive files

The `archive/` directory contains obsolete monolithic code that has been superseded by the modular loader. It exists as a historical reference only.

**Never:**
- Read any file under `archive/`
- Grep or search within `archive/`
- Reference archive code as a basis for changes
- Suggest looking at archive files for context

**If you think you need to look at archive files:** you don't. All active code is in `loader.user.js`, `modules/`, `manifest.json`, and `cloudflare/`.


## Rule: Keep README.md and SCRIPTS.md current

`README.md` has a `## Modules` section and `SCRIPTS.md` is the developer module catalog. Both must stay in sync with `manifest.json`.

**When adding a new module:**
- Add an entry to `manifest.json`
- Add an entry to the correct category group in the `## Modules` section of `README.md` (icon + bold name + 2–3 line description)
- Add a full section to `SCRIPTS.md` (ID, category, file path, descriptive paragraph), inserted in manifest order within the category

**When updating an existing module** (description change, category change, rename):
- Update the existing entry in both `README.md` and `SCRIPTS.md` — do not add a duplicate

**Never:**
- Add a new module to `manifest.json` without updating both doc files
- Leave placeholder text ("TBD", "coming soon") in either doc file
