PNPM := pnpm

.PHONY: install build lint lint-fix format format-check test test-watch coverage package verify clean stage-dist push-major-tag release-patch release-minor release-major

install: ## Install dependencies
	$(PNPM) install --frozen-lockfile

build: ## Type-check the project
	$(PNPM) run build

lint: ## Lint the project
	$(PNPM) run lint

lint-fix: ## Lint and auto-fix what can be fixed
	$(PNPM) run lint:fix

format: ## Format the project with Prettier
	$(PNPM) run format

format-check: ## Check formatting without writing changes
	$(PNPM) run format:check

test: ## Run the test suite once
	$(PNPM) run test

test-watch: ## Run the test suite in watch mode
	$(PNPM) run test:watch

coverage: ## Run the test suite with coverage
	$(PNPM) run coverage

package: ## Bundle src/main.ts into dist/index.js
	$(PNPM) run package

verify: format-check lint test build package ## Run everything CI runs

clean: ## Remove build artifacts
	rm -rf dist coverage lib

# dist/ is committed to the repo: GitHub runs dist/index.js directly for anyone using
# `uses: yanovian/update-dependencies-action@vX`, with no build step of their own. `pnpm
# version` refuses to run against a dirty working tree, so the freshly built dist/ from `verify`
# must be committed before it runs; this only creates a commit when dist/ actually changed.
stage-dist:
	git add dist
	git diff --cached --quiet -- dist || git commit -m "chore: rebuild dist"

# Consumers reference this Action as `uses: yanovian/update-dependencies-action@v1`, a
# moving major tag, not the exact `vX.Y.Z` release tag that `pnpm version` creates. Without this,
# `@v1` never exists (or never advances past the first v1.0.0), and every consumer workflow fails
# to resolve it. Force-moves the local and remote major tag to the commit just released.
push-major-tag:
	@major=v$$(node -p "require('./package.json').version.split('.')[0]"); \
	git tag -f $$major; \
	git push origin $$major --force

# Pushing the vX.Y.Z tag below is what actually triggers .github/workflows/release.yml, which
# creates the GitHub Release itself using the workflow's own token, no local gh CLI needed.
release-patch: verify stage-dist ## Bump patch version, tag vX.Y.Z, push, move the vX tag (GitHub Actions creates the release)
	$(PNPM) version patch -m "Release v%s"
	git push origin HEAD --follow-tags
	$(MAKE) push-major-tag

release-minor: verify stage-dist ## Bump minor version, tag vX.Y.Z, push, move the vX tag (GitHub Actions creates the release)
	$(PNPM) version minor -m "Release v%s"
	git push origin HEAD --follow-tags
	$(MAKE) push-major-tag

release-major: verify stage-dist ## Bump major version, tag vX.Y.Z, push, move the vX tag (GitHub Actions creates the release)
	$(PNPM) version major -m "Release v%s"
	git push origin HEAD --follow-tags
	$(MAKE) push-major-tag
