# On-demand required PR CI

Pull request CI is a required check on `main`, but it does not run on every push. It runs when a non-draft PR into `main` is opened, marked ready for review, or reopened, and again only when a trusted commenter types `/check`. New commits leave merge blocked until `/check` refreshes the `ci` check on HEAD. This is deliberate: GitHub required checks attach to the HEAD commit, so skip-on-push only works if the check stays required and is re-run on demand.

**Considered options:** run on every synchronize (standard CI, cancel-in-progress only); on-demand but advisory (merge untested HEAD); on-demand and required (this). `/check` dispatches the same `ci` workflow on the PR branch (`workflow_dispatch`) because `GITHUB_TOKEN` cannot start a `labeled` workflow.
