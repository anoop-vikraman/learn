# Git + GitLab CI extra: commands, a full pipeline, Q&A

## Git commands you should know cold

```bash
# Inspect
git status
git log --oneline --graph --all     # visual history
git diff                            # unstaged changes
git diff --staged                   # staged changes
git blame src/App.tsx               # who changed each line
git show <sha>                      # what a commit changed

# Branching
git switch -c feature/login         # create + switch (modern form of checkout -b)
git branch -d feature/login         # delete a merged branch
git push -u origin feature/login    # push and set upstream

# Syncing
git fetch origin                    # download, don't touch your branch
git pull --rebase                   # fetch + rebase your commits on top (clean history)

# Stash (park unfinished work)
git stash push -m "wip navbar"
git stash list
git stash pop                       # re-apply + drop
git stash apply stash@{1}           # re-apply, keep in the list

# Rewrite your own (unpushed or feature-branch) history
git commit --amend                  # fix the last commit message or add forgotten files
git rebase -i HEAD~3                # squash/reword/reorder the last 3 commits
git rebase main                     # replay your branch on the latest main
git push --force-with-lease         # safe force push (fails if someone else pushed)

# Pick one commit from another branch
git cherry-pick <sha>

# Undo
git restore file.ts                 # discard working-copy changes
git restore --staged file.ts        # unstage
git reset --soft HEAD~1             # undo the commit, keep changes staged
git reset --mixed HEAD~1            # undo the commit, keep changes unstaged (default)
git reset --hard HEAD~1             # undo the commit AND delete changes (dangerous)
git revert <sha>                    # new commit that undoes <sha>: safe on shared branches

# Recover "lost" commits
git reflog                          # every place HEAD has been: find the sha
git reset --hard <sha-from-reflog>

# Find the commit that introduced a bug
git bisect start
git bisect bad                      # current is broken
git bisect good v1.2.0              # this tag was fine
# test... then: git bisect good / git bisect bad ... until found
git bisect reset
```

## `reset` vs `revert` vs `restore`: one table

| Command | Changes history? | Use on shared branch? | Use for |
| --- | --- | --- | --- |
| `restore` | No | Yes | Discard local file changes |
| `reset` | Yes (moves branch pointer) | **No** | Undo local commits |
| `revert` | No (adds a commit) | **Yes** | Undo a pushed commit |

## Branching strategies

- **GitHub/GitLab flow (feature branches + MRs to main)**: the most common. Short-lived branches, CI on each MR, merge to main, deploy.
- **Trunk-based development**: everyone merges small changes to main at least daily. Feature flags hide incomplete work. Best for CI/CD.
- **Git Flow**: `develop`, `release/*`, `hotfix/*` branches. Heavier, suits versioned releases (mobile apps, libraries).

## Conventional commits + hooks

```
feat(auth): add password reset flow
fix(cart): prevent double submit on checkout
refactor: extract useOrders hook
chore(deps): bump vite to 7.1
```
They enable automated changelogs and semantic versioning (`feat` → minor, `fix` → patch, `BREAKING CHANGE` → major).

```json
// package.json: run checks before each commit (husky + lint-staged)
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{scss,css,md}": "prettier --write"
}
```

---

## A complete production `.gitlab-ci.yml` for a React app

```yaml
stages: [install, verify, build, deploy]

default:
  image: node:22-alpine
  interruptible: true            # cancel old pipelines when a new commit is pushed

workflow:
  rules:                         # avoid duplicate branch + MR pipelines
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS
      when: never
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"

.node_cache: &node_cache
  cache:
    key:
      files: [package-lock.json]   # cache invalidates when the lockfile changes
    paths: [.npm/]
    policy: pull                   # most jobs only read the cache

install:
  stage: install
  <<: *node_cache
  cache:
    key: { files: [package-lock.json] }
    paths: [.npm/]
    policy: pull-push              # this job writes the cache
  script:
    - npm ci --prefer-offline
  artifacts:
    paths: [node_modules/]
    expire_in: 1 hour

lint:
  stage: verify
  needs: [install]                 # DAG: start as soon as install finishes
  script: npm run lint

typecheck:
  stage: verify
  needs: [install]
  script: npx tsc --noEmit

test:
  stage: verify
  needs: [install]
  script: npm run test -- --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'   # shows coverage % in the MR
  artifacts:
    when: always
    reports:
      junit: junit.xml                               # test results in the MR widget
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml        # line-by-line coverage in the MR diff

build:
  stage: build
  needs: [lint, typecheck, test]
  script:
    - npm run build
  artifacts:
    paths: [dist/]
    expire_in: 1 week

docker:
  stage: build
  image: docker:27
  services: [docker:27-dind]
  needs: [build]
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG
  script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA

deploy_staging:
  stage: deploy
  needs: [docker]
  environment: { name: staging, url: https://staging.example.com }
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script: ./scripts/deploy.sh staging $CI_COMMIT_SHORT_SHA

deploy_production:
  stage: deploy
  needs: [docker]
  environment: { name: production, url: https://example.com }
  rules:
    - if: $CI_COMMIT_TAG
      when: manual                 # a human clicks "play"
  script: ./scripts/deploy.sh production $CI_COMMIT_SHORT_SHA

# Review app per MR (a GitLab-specific talking point)
review:
  stage: deploy
  needs: [build]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  environment:
    name: review/$CI_COMMIT_REF_SLUG
    url: https://$CI_COMMIT_REF_SLUG.review.example.com
    on_stop: stop_review
  script: ./scripts/deploy-review.sh

stop_review:
  stage: deploy
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: manual
  environment: { name: review/$CI_COMMIT_REF_SLUG, action: stop }
  script: ./scripts/teardown-review.sh
```

## Other GitLab CI keywords worth naming

```yaml
include:
  - template: Security/SAST.gitlab-ci.yml       # built-in security scanning
  - project: 'platform/ci-templates'
    file: '/node.yml'

extends: .node_job                              # inherit from a hidden job (starts with a dot)

parallel:
  matrix:
    - NODE_VERSION: ['20', '22']                # run the job once per version

retry: { max: 2, when: [runner_system_failure] }
timeout: 15m
allow_failure: true                             # non-blocking job
only: [main]                                    # legacy: prefer rules
rules:
  - changes: ['src/**/*', 'package-lock.json']  # run only when these files change
```

**Variables:** set in Settings → CI/CD → Variables. **Protected** = only on protected branches/tags. **Masked** = hidden in logs. Predefined: `CI_COMMIT_SHA`, `CI_COMMIT_REF_SLUG`, `CI_DEFAULT_BRANCH`, `CI_PIPELINE_SOURCE`, `CI_REGISTRY_IMAGE`, `CI_MERGE_REQUEST_IID`.

**Runners:** machines that execute jobs. Shared (GitLab.com) or self-hosted. Executors: Docker, shell, Kubernetes. Tags route jobs to specific runners.

---

## Extra interview questions

**Q: Merge vs rebase vs squash: what does your team do and why?**
Merge keeps the true history with merge commits. Rebase gives linear history but rewrites commits (never rebase shared branches). Squash merge turns one MR into one commit on main: clean history, easy revert. A common setup: rebase your feature branch on main locally, then squash-merge the MR.

**Q: What is `HEAD`? Detached HEAD?**
`HEAD` points to the current branch (which points to a commit). Detached HEAD = HEAD points directly at a commit (after checking out a sha or tag). New commits there are lost unless you create a branch.

**Q: `git fetch` vs `git pull`?**
`fetch` downloads remote commits without changing your branch. `pull` = `fetch` + `merge` (or `rebase` with `--rebase`).

**Q: How do you undo a commit that's already been pushed to main?**
`git revert <sha>` creates a new inverse commit, so history isn't rewritten. Don't reset and force-push shared branches.

**Q: Someone force-pushed and you lost commits. How do you recover?**
`git reflog` on the machine that had the commits, find the sha, then `git branch recovery <sha>`. Prevent it with protected branches and `--force-with-lease`.

**Q: What is a merge request pipeline vs a branch pipeline?**
A branch pipeline runs on push to a branch. An MR pipeline runs in the context of an MR (`CI_PIPELINE_SOURCE == merge_request_event`) and can show results in the MR widget. **Merged results pipelines** test the result of merging into the target branch.

**Q: `stages` vs `needs`?**
By default, jobs wait for the entire previous stage. `needs` creates a DAG: a job starts as soon as its listed dependencies finish, which makes pipelines faster.

**Q: How do you keep CI fast?**
Cache dependencies keyed on the lockfile, `needs` for a DAG, parallel jobs (lint, typecheck and test at once), `rules: changes` to skip irrelevant jobs, `interruptible` to cancel outdated pipelines, smaller Docker images, test sharding.

**Q: How do you handle secrets in CI?**
Masked and protected CI/CD variables or an external vault. Never commit `.env`. Remember that frontend build-time vars end up in the bundle, so they're public anyway.

**Q: What are environments and deployments in GitLab?**
Named targets (staging, production) that track which commit is deployed where, with rollback buttons, manual approvals and review apps.

**Q: What are protected branches and MR approvals?**
Protected branches block direct pushes and force pushes to main. MR rules require N approvals, a passing pipeline and resolved threads before merge. CODEOWNERS can auto-assign reviewers.
