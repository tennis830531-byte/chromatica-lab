# Local font sources

The Android bundle and PWA use the same local WOFF2 files so typography does
not depend on network access at runtime.

## Noto Sans TC

- Package: `@fontsource-variable/noto-sans-tc@5.2.10`
- Source: https://www.npmjs.com/package/@fontsource-variable/noto-sans-tc
- Upstream: https://github.com/notofonts/noto-cjk
- Included face: variable normal, weights 100–900
- License: SIL Open Font License 1.1; see `noto-sans-tc/OFL-1.1.txt`

The distributed CSS family name was changed from `Noto Sans TC Variable` to
`Noto Sans TC` so the existing application font stack remains stable. The
WOFF2 files themselves are unmodified.

## LXGW WenKai TC

- Package: `lxgw-wenkai-tc-webfont@1.2.0`
- Source: https://www.npmjs.com/package/lxgw-wenkai-tc-webfont
- Upstream font: https://github.com/lxgw/LxgwWenkaiTC
- Included face: bold 700
- License: SIL Open Font License 1.1; see `lxgw-wenkai-tc/OFL-1.1.txt`

Only the title weight used by the application is included. No TTF or OTF
duplicates are bundled.
