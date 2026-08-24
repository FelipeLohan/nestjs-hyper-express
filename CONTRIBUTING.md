# Contributing to nestjs-hyper-express

Thanks for your interest in contributing! This document covers how to set up the project locally and the workflow expected for pull requests.

## Getting Started

1. Fork and clone the repository.
2. Use the Node.js version pinned in [`.nvmrc`](./.nvmrc) (e.g. `nvm use`).
3. Install dependencies:

   ```bash
   npm install
   ```

## Project Structure

- `src/adapter` — the `HyperExpressAdapter` and `HyperExpressHttpServer` implementations
- `src/utils` — request/response translation, routing and middleware helpers
- `test/unit` — unit tests for each module in `src`
- `test/e2e` — end-to-end tests exercising the adapter through a real NestJS application
- `examples` — minimal runnable usage examples

## Development Workflow

Run the unit tests:

```bash
npm test
```

Run the end-to-end tests:

```bash
npm run test:e2e
```

Lint and auto-fix the codebase:

```bash
npm run lint
```

Build the package (CJS + ESM + type declarations):

```bash
npm run build
```

## Making Changes

1. Create a branch from `main` describing the change (e.g. `fix/route-params`, `feat/websocket-support`).
2. Keep changes focused — prefer smaller, reviewable pull requests over large ones.
3. Add or update tests covering your change. New behavior should be covered by unit tests, and adapter-level behavior should be covered by an e2e test when applicable.
4. Make sure `npm test`, `npm run test:e2e` and `npm run lint` all pass before opening a pull request.
5. Do not commit build output (`dist/`) or `node_modules/` — these are generated and already covered by `.gitignore`.

### Commit Messages

Follow the existing convention used in this repository: a short type prefix followed by a concise description, for example:

```
fix: handle missing content-type header in body parser
feat: add support for wildcard routes
docs: update installation instructions
```

## Pull Requests

- Describe what the change does and why.
- Link any related issue.
- Ensure CI (tests and lint) passes before requesting review.

## Reporting Issues

When reporting a bug, please include:

- The version of `nestjs-hyper-express`, `hyper-express`, `@nestjs/core` and Node.js you're using
- Steps to reproduce the issue
- What you expected to happen vs. what actually happened

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
