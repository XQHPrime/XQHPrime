# Coding Profiles Cards

This directory keeps the editable source of the profile cards shown in `README.md`.

## Files

- `codeforces-card.template.svg`: editable Codeforces card template
- `nowcoder-card.template.svg`: editable NowCoder card template
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

It fetches the latest profile data, renders both cards, and publishes only the generated SVG files to the `profiles-output` branch.

This keeps style changes on `main` separate from auto-updated card assets on `profiles-output`, so the two do not conflict.
