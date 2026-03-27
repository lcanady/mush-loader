# Contributing to the Registry

The mush-loader registry lives in a separate repo: `https://github.com/lcanady/mush-registry`

## Submitting a package

1. Fork `mush-registry`
2. Create a `.mush` file in `packages/<your-package-name>/`
3. Add an entry to `index.json`
4. Open a PR

### index.json entry format

```json
{
  "name": "my-system",
  "version": "1.0.0",
  "description": "Short description of what this does",
  "author": "YourName",
  "url": "https://raw.githubusercontent.com/lcanady/mush-registry/main/packages/my-system/my-system.mush",
  "sha256": "<sha256 of the .mush file>",
  "vetted": false,
  "tags": ["utility", "chargen"]
}
```

Compute the sha256:
```bash
sha256sum packages/my-system/my-system.mush
```

### Getting your package marked as vetted

PRs that include the output of `mush-loader vet my-system.mush` (with AI vetting) will be reviewed and marked `"vetted": true` by a maintainer if the verdict is `pass`.

## .mush file format

One mushcode command per line. Lines starting with `#` are comments. No special escaping required — mush-loader sends each line directly via the testkit client.

```mushcode
# My System v1.0
# Author: YourName
# License: MIT
@create MySystem <sys>
@set MySystem <sys>=inherit safe
@fo me=&d.sys me=search(name=MySystem <sys>)
&VERSION [v(d.sys)]=1.0.0
&FN_EXAMPLE [v(d.sys)]=[name(%0)]
```

## Security standards for accepted packages

All packages in the registry must:

- Pass static validation (`mush-loader vet` with no errors)
- Not use `@power`, `@wizard`, or `@set ... wizard`
- Sanitize all user input with `stripchars()` or `escape()` before interpolation
- Not include hardcoded dbrefs (use `search()` instead)
- Lock system objects with `@lock` and `@set ... inherit safe`
