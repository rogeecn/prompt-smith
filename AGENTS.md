# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` contains the Next.js App Router pages, layouts, and route handlers.
- `src/app/globals.css` holds global styles; Tailwind utilities are used in JSX.
- `public/` stores static assets served at the root (e.g., `/logo.svg`).
- `prisma/schema.prisma` defines the database schema.
- Project configuration lives in `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, and `postcss.config.mjs`.

## Build, Test, and Development Commands
```bash
npm run dev    # Start the local dev server
npm run build  # Production build
npm run start  # Run the production server after build
npm run lint   # Run ESLint checks
```

## Coding Style & Naming Conventions
- TypeScript with strict typing; prefer `z.infer` types from Zod schemas.
- Use 2-space indentation, double quotes, and semicolons (follow existing files).
- React components: `PascalCase` in `*.tsx`. Hooks: `useThing` naming.
- Route segments are folder names under `src/app/` (match URL path).

## Data Contracts (Spec-Driven Development)
- Define Zod schemas first for API inputs/outputs, JSON fields, and env configs.
- Export TypeScript types via `z.infer<typeof Schema>`.
- Avoid `any`; prefer explicit types and narrow `unknown` with Zod parsing.

## Communication Language
- Use Chinese for the development system and for all collaboration/assistant interactions.
- Keep user-facing messages and documentation in Chinese unless a feature explicitly requires another language.

## Testing Guidelines
- No test framework is configured yet. If adding tests, introduce a runner (e.g., Vitest/Jest) and document it here.
- Name tests consistently with `*.test.ts` or `*.spec.ts` and colocate with source or under a `tests/` folder.

## Commit & Pull Request Guidelines
- Current Git history only includes “Initial commit from Create Next App”; no convention is established.
- Prefer short, imperative commit messages (e.g., “Add prompt schema validation”).
- PRs should include a clear description, linked issues if applicable, and screenshots for UI changes.
