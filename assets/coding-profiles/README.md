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

It fetches the latest profile data, renders all cards, and publishes only the generated SVG files to the `profiles-output` branch.

The workflow never commits `README.md`. Keep README links stable and edit card layout/style in these templates on `main`; the workflow owns only the generated SVG assets on `profiles-output`, which keeps local style edits separate from automated data updates.
