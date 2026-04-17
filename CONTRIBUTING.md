# Contributing to Web BPM

Thanks for your interest in contributing! This project is a realtime BPM tracker built for live musicians, and we welcome improvements of all kinds.

## Getting Set Up

1. **Fork** the repo on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/web-bpm.git
   cd web-bpm
   ```
3. **Install dependencies**:
   ```bash
   yarn install
   ```
4. **Start the dev server**:
   ```bash
   yarn dev
   ```
5. Open [http://localhost:5173/web-bpm/](http://localhost:5173/web-bpm/) in your browser

## Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes
3. Run the linter before committing:
   ```bash
   yarn lint
   ```
4. Test the build:
   ```bash
   yarn build
   ```
5. Commit with a clear message (see conventions below)
6. Push to your fork and open a **pull request** against `main`

## Code Style

- **Linter**: We use [oxlint](https://oxc.rs/docs/guide/usage/linter) (not ESLint). Run `yarn lint` to check.
- **TypeScript**: Strict mode is enabled. Fix all type errors before submitting.
- **Formatting**: Let your editor handle it, or run `yarn format` for auto-fixes.
- **Imports**: Prefer direct imports from individual modules — no barrel files (index.ts re-exports).

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add target BPM input field
fix: prevent audio context from leaking on unmount
docs: update browser compatibility table
chore: bump realtime-bpm-analyzer to 5.1.0
```

Prefix types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`.

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- If your PR includes UI changes, include a screenshot or screen recording
- Make sure `yarn build` succeeds and `yarn lint` is clean

## Reporting Issues

Open an issue on [GitHub Issues](https://github.com/mckelveygreg/web-bpm/issues). Include:

- What you expected to happen
- What actually happened
- Browser + OS version
- Steps to reproduce

## License

By contributing, you agree that your contributions will be licensed under the [GPL-3.0 License](LICENSE).
