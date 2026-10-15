# Repository Guidelines

## Project Structure & Module Organization

Lwen is a local-first Ollama client using React 19, Vite, and Tailwind CSS 4, with a Tauri integration.

- `src/main.jsx` mounts the app; `src/App.jsx` composes providers and views.
- `src/components/` groups UI by feature: `auth/`, `chat/`, `dashboard/`, `project/`, `library/`, and shared `ui/`.
- `src/hooks/` handles streaming, model lifecycle, indexing, and notifications.
- `src/state/` contains account, library, and statistics state.
- `src/lib/` contains backend calls, file extraction, relevance scoring, and context budgeting.
- `src/styles/index.css` defines shared styles and theme tokens. `public/brands/` accepts family-key SVGs such as `qwen.svg`.
- `dist/` is generated output. The README describes `src-tauri/`, but that directory is absent from this checkout.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: start Vite on port 1420; the port must be available.
- `npm run build`: compile the frontend into `dist/`.
- `npm run preview`: serve the compiled frontend locally.
- `npm run tauri dev` / `npm run tauri build`: desktop development/build commands; require the missing `src-tauri/` project and platform prerequisites described in the README.

Browser serving alone cannot provide a working desktop session: startup invokes Tauri's `runtime_info` command.

## Coding Style & Naming Conventions

Follow existing JavaScript ES modules: two-space indentation, single-quoted strings, and no statement-ending semicolons. Use PascalCase component filenames (`ChatView.jsx`), `use`-prefixed hooks (`useChat.js`), and camelCase functions and variables. Keep backend invocations behind `src/lib/backend.js`. Reuse shared UI components and theme tokens. No ESLint or Prettier configuration is present.

## Testing Guidelines

No automated test suite, test script, or coverage threshold is configured. Run `npm run build` for frontend changes. When the desktop backend is available, manually check affected flows such as account switching, project selection, attachments, streaming cancellation, and persistence after restart. Record checks and any blocked validation in the PR.

## Commit & Pull Request Guidelines

Existing commit subjects are only `V`, so history provides no useful naming convention. Write concise, imperative subjects describing the change, such as `Fix streaming cancellation`. Keep PRs focused; include purpose, behavior changes, validation results, linked issues when applicable, and screenshots for UI changes. Exclude generated output, dependencies, and personal account or conversation data.
