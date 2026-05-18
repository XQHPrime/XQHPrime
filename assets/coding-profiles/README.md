# Coding Profiles Cards

This directory keeps the editable source of the profile cards shown in `README.md`.

## Files

- `codeforces-card.template.svg`: editable Codeforces card template
- `nowcoder-card.template.svg`: editable NowCoder card template
- `leetcode-card.template.svg`: editable LeetCode card template
- `config.json`: profile ids, handles, output names
- `sample-data.json`: local preview data used in offline mode
- `preview.html`: local side-by-side preview page

## Local preview

Run:

```bash
node scripts/generate_coding_profile_cards.mjs --mode sample
```

The generated preview SVGs are written to `assets/coding-profiles/generated/` and ignored by git.

Then open `assets/coding-profiles/preview.html` locally to inspect the cards.

## Live data

GitHub Actions runs:

```bash
node scripts/generate_coding_profile_cards.mjs --mode live
```

It fetches the latest profile data, renders light and dark SVG files for every card, and publishes only the generated SVG files to the `profiles-output` branch.

The root `README.md` appends GitHub's `#gh-dark-mode-only` and `#gh-light-mode-only` URL fragments so GitHub chooses the matching card for the viewer's current GitHub theme. The workflow never commits `README.md`; keep README links stable and edit card layout/style in these templates on `main`, while the workflow owns only generated SVG assets on `profiles-output`.
