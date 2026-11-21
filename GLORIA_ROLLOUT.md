# Gloria rollout notes

## Please check

- **`src-tauri/` is missing from this checkout.** It was deleted in commit `245ee69`; the last version is in `245ee69^`. The workflow runs `npx tauri build --no-bundle`, so it fails until `src-tauri/` is restored (for example `git checkout 245ee69^ -- src-tauri`). I did not restore it because that was outside this task.
- **Icon:** `gloria.toml` points to `src-tauri/icons/icon.ico`. That file only exists in history (`245ee69^`) and has the same restore requirement. There is no `Lwen.ico` and no other `.ico` or 256px `.png` in the checkout (`public/icon.svg` is an SVG, which the packer does not accept). I did not create or edit any icon file.
- **Version:** `1.0.0` comes from `package.json` (and the old `tauri.conf.json` / `Cargo.toml`). The launcher catalog lists `0.3.1`. The release tag overrides this when packing, so it only matters for local packs.
- **Main exe:** `lwen.exe`, from the old Cargo package name `lwen` (the old `tauri.conf.json` has `productName` Lwen, and Tauri names the exe after the Cargo package). Check this once `src-tauri/` is back.
- **Data folder:** `%APPDATA%\com.lwen.desktop`, the Tauri identifier, also listed in the README. `%LOCALAPPDATA%\com.lwen.desktop` was left out because nothing in the code or README says the app writes there (WebView2 may create it; add it if you want it removed on purge).
- **Runtime files:** only `lwen.exe`. The old Tauri config had no resources or sidecars; the frontend is embedded in the exe.
- **No `legacy_names`:** the old Tauri bundle used NSIS (`installMode: currentUser`). I found no sign it was ever published, so I left `legacy_names` out. If a build did ship with a product name of `Lwen`, it already matches `name`.
- **Build target:** the workflow builds with `--target x86_64-pc-windows-msvc`, so the exe is under `src-tauri/target/x86_64-pc-windows-msvc/release/`.
- **Secrets:** `WINDOWS_PFX_BASE64` and `WINDOWS_PFX_PASSWORD` must exist in the repo; if empty the setup is unsigned.
- **Not run:** nothing was built or tested locally, and nothing was pushed, tagged or released.
