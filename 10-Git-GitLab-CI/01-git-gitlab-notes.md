## 9. GitLab (Git + CI/CD)

For a frontend role, expect workflow questions (branching, merge requests, rebase) and the ability to read or write a basic `.gitlab-ci.yml`.

### Explained simply (read this first)

**Git = save points for your code. GitLab = where the team shares those save points**, reviews them (Merge Requests) and runs automatic checks (CI/CD pipelines).

**A typical daily workflow:**

```bash
git checkout main && git pull                 # get latest
git checkout -b feat/login-form               # new branch for your work
# ...edit files...
git add .
git commit -m "feat: add login form validation"
git push -u origin feat/login-form            # then open a Merge Request in GitLab

# main moved on while you worked? update your branch:
git fetch origin
git rebase origin/main                        # replay your commits on top of latest main
# fix conflicts -> git add <file> -> git rebase --continue
git push --force-with-lease                   # safer than --force: refuses if someone else pushed
```

**Merge vs rebase, with a picture in words:**

- **Merge** ties the two branches together with a new "merge commit". History shows exactly what happened, but looks like a tangle.
- **Rebase** picks up your commits and replays them on top of the latest main, as if you started from there. History is a straight line, but commits get new ids.
- **Golden rule:** never rebase a branch other people are working on.

**Undoing things (frequently asked):**

```bash
git restore file.ts             # throw away uncommitted changes in a file
git commit --amend              # fix the last commit message or add a forgotten file
git reset --soft HEAD~1         # undo last commit, keep changes staged
git reset --hard HEAD~1         # undo last commit and DELETE the changes (careful)
git revert abc123               # new commit that undoes abc123 (safe on shared branches)
git stash / git stash pop       # park unfinished work, bring it back later
git reflog                      # list of everywhere HEAD has been: recover "lost" commits
git cherry-pick abc123          # copy one commit onto the current branch
```

**Resolving a merge conflict:** Git marks the clash in the file. Pick or combine the code, delete the markers, then `git add` and continue.

```text
<<<<<<< HEAD
const limit = 10;
=======
const limit = 20;
>>>>>>> feat/pagination
```

**GitLab CI/CD, explained simply.** On every push, GitLab reads `.gitlab-ci.yml` and runs your commands on a server (a **runner**) inside a Docker container. If any step fails, the Merge Request shows a red X.

- A **job** = a list of shell commands (e.g. run tests).
- A **stage** = a group of jobs. Stages run one after another; jobs in the same stage run at the same time.
- A **pipeline** = all the stages for one push.

**Smallest useful pipeline:**

```yaml
image: node:22-alpine           # every job runs inside this Docker image

stages: [test, build]

test:
  stage: test
  script:
    - npm ci
    - npm run lint
    - npm test

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths: [dist/]               # save the build output so later jobs (or you) can download it
```

**Running jobs only when needed with `rules`:**

```yaml
deploy_staging:
  stage: deploy
  script: ./deploy.sh staging
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: never                                 # don't deploy from MRs
    - if: $CI_COMMIT_BRANCH == "develop"            # deploy automatically from develop

deploy_prod:
  stage: deploy
  script: ./deploy.sh production
  environment: production
  rules:
    - if: $CI_COMMIT_TAG                            # only for tags like v1.2.0
      when: manual                                  # someone clicks "play" to release
```

**Reusing config (keeps YAML DRY):**

```yaml
.node_job:                      # names starting with . are templates, not run on their own
  image: node:22-alpine
  before_script: [npm ci]

unit_tests:
  extends: .node_job
  script: npm test

typecheck:
  extends: .node_job
  script: npx tsc --noEmit
```

**Building and pushing a Docker image in CI:**

```yaml
docker_build:
  stage: build
  image: docker:27
  services: [docker:27-dind]     # Docker-in-Docker so the job can run docker commands
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
```

Variables like `$CI_COMMIT_BRANCH`, `$CI_COMMIT_SHORT_SHA` and `$CI_REGISTRY_IMAGE` are predefined by GitLab. Your own secrets go in Settings, then CI/CD, then Variables (masked).

### Git essentials

- `merge` keeps history and adds a merge commit. `rebase` rewrites commits onto a new base for a linear history. Never rebase shared or pushed branches others use.
- `git rebase -i` squashes or rewords commits; `cherry-pick` applies one commit elsewhere; `revert` makes an undo commit (safe on shared branches); `reset --soft/--mixed/--hard`; `stash`; `reflog` recovers "lost" commits.
- Branching strategies: GitFlow vs trunk-based development (short-lived branches + feature flags). Conventional Commits (`feat:`, `fix:`).
- GitLab terms: **Merge Request** (MR, the equivalent of a GitHub PR), approvals, protected branches, CODEOWNERS, issues and boards.

### GitLab CI/CD

- Pipelines are defined in `.gitlab-ci.yml` at the repo root and run by **GitLab Runners**.
- **Stages** run in order; **jobs** within a stage run in parallel. `needs:` creates a DAG so jobs can start early.
- Keywords: `image`, `script`, `before_script`, `rules` (replaces `only/except`), `variables`, `cache` (dependencies, speed), `artifacts` (files passed to later jobs or downloaded), `environment`, `when: manual`, `extends`, `include`.
- Secrets go in CI/CD variables (masked, protected) in project settings, never in the repo.

```yaml
stages: [install, test, build, deploy]

default:
  image: node:22-alpine
  cache:
    key:
      files: [package-lock.json]
    paths: [.npm/]

install:
  stage: install
  script: npm ci --cache .npm --prefer-offline
  artifacts: { paths: [node_modules/], expire_in: 1h }

lint_test:
  stage: test
  script:
    - npm run lint
    - npm run test -- --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'

build:
  stage: build
  script: npm run build
  artifacts: { paths: [dist/] }

deploy_prod:
  stage: deploy
  script: ./deploy.sh
  environment: production
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
```

### Likely questions

- `cache` vs `artifacts`? (Cache speeds up repeated jobs, is best-effort and can be shared across pipelines. Artifacts are the outputs of a job, guaranteed to pass to later stages in the same pipeline.)
- Merge vs rebase?
- How would you set up CI for a React app? (Install, then lint + typecheck + tests in parallel, then build, then deploy, with MR pipelines.)
- How do you resolve a merge conflict?

### Gotchas

- Use `npm ci`, not `npm install`, in CI (reproducible, respects the lockfile).
- Mixing `rules` with `only/except` in the same job isn't allowed.
- Duplicate pipelines for branch + MR events: use `workflow: rules`.

