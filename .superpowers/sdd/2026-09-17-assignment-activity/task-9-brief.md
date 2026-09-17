### Task 9: Closing sweep

- [ ] **Step 1:** `python -m pytest tests -q` — all PASS.
- [ ] **Step 2:** Build the sample into a scratch dir (`cd %TEMP% && python D:\Programming\lesson-notebook-pipeline\v2\build.py D:\Programming\lesson-notebook-pipeline\v2\sample\lesson-demo`), open `Week4-Demo-Notebook.html`, verify by hand: Begin/resume, fullscreen + Exit, nav lock, dots, watermark fill, selection blocked in deck + textareas typeable, PrintScreen/blur cover, submit validation messages, downloaded filename `… - Week 4 - Management Science.json`, decrypt.py round-trip on that file using `build/key/keys.pem`.
- [ ] **Step 3:** Confirm `git status` clean; commit any sweep fixes as:

```bash
git add -A; git commit -m "fix(v2.5): post-sweep corrections"
```
