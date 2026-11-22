# Versioning

This repository holds three games built from the same brief. Each one is a
separate product with its own version number.

| Product | Folder | Tag | Changelog |
| --- | --- | --- | --- |
| Claude edition | `claude/` | `claude-vX.Y.Z` | `claude/CHANGELOG.md` |
| ChatGPT edition (Ciao, Vespa!) | `chatgpt/` | `chatgpt-vX.Y.Z` | `chatgpt/CHANGELOG.md` |
| Gemini edition (Passo del Saluto) | `gemini/` | `gemini-vX.Y.Z` | `gemini/CHANGELOG.md` |

## Version numbers

Versions are written MAJOR.MINOR.PATCH. Each product starts at 1.0.0.

- **MAJOR**: the game plays differently (new rules, new controls, a rebuilt world).
- **MINOR**: something new for players (a vehicle, a camera, a game mode).
- **PATCH**: a fix or a tuning that players can notice.

Each changelog lists versions newest first and is written for players, in plain
language.

## What gets no version

Changes to documentation alone: README files, this file, screenshots, and the
landing page and README at the root of the repository. They get no version, no
tag and no release.

## How a version is published

Every change reaches `main` through a branch and a pull request. Nobody commits
or pushes directly on `main`.

1. Bring `main` up to date locally.
2. Create a branch from it: `release/<product>-vX.Y.Z` for a version,
   `docs/<short-name>` for a change to the documentation only.
3. Commit on that branch under the owner's Git identity, with a plain message
   and no attribution lines (no "Co-Authored-By", no "Generated with").
4. Push the branch and open a pull request with `gh pr create`. Title: the
   version number and a few words. Body: the changelog section for this
   version, in plain language for users.
5. Merge it with a merge commit (`gh pr merge --merge --delete-branch`), not a
   squash and not a rebase.
6. Tag the merge commit on `main` with the product's tag and create the GitHub
   release, with the changelog section as its notes. A change to the
   documentation alone stops after step 5.

"Open a pull request" means: stop after step 4 and share the link.

## Rules that always hold

- Never force-push `main`.
- Never move or delete a tag that has been pushed.
- Do not rewrite existing history.
