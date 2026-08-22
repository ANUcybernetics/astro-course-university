#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <patch|minor|major|x.y.z> [reason]" >&2
  exit 1
fi

bump="$1"
reason="${2:-}"

[[ -n "$(git status --porcelain)" ]] && { echo "Working tree not clean." >&2; exit 1; }
branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || { echo "Not on main (currently '$branch')." >&2; exit 1; }

git fetch --quiet
read -r behind ahead < <(git rev-list --left-right --count origin/main...HEAD)
[[ "$behind" == "0" && "$ahead" == "0" ]] \
  || { echo "Local main is $behind behind / $ahead ahead of origin/main. Sync first." >&2; exit 1; }

pnpm check

old="$(jq -r .version package.json)"
pnpm version "$bump" --no-git-tag-version >/dev/null
new="$(jq -r .version package.json)"
tag="v${new}"

if git rev-parse "$tag" >/dev/null 2>&1; then
  git checkout -- package.json
  echo "Tag $tag already exists. Aborting." >&2
  exit 1
fi

echo "astro-course-university: $old -> $new (tag: $tag)"
git add package.json
git commit -m "chore(release): astro-course-university $tag"

msg="astro-course-university $new"
[[ -n "$reason" ]] && msg="$msg"$'\n\n'"$reason"
git tag -a "$tag" -m "$msg"
git push origin main "$tag"
