# Outlook 2.1.8 icon refresh — 2026-10-19

Replaced the older Office Fabric Outlook mark with the October 2025 design
currently served by the Microsoft 365 official website. Official page, SVG URL,
announcement, conversion details and exact source/output hashes are recorded in
`outlook-mail/PLUGIN-NOTICE.txt`. The SVG contains only vector paths, gradients
and definitions; no scripts, external references or embedded raster content.
Rendered as 512 x 512 RGBA PNG with the original viewBox and transparent margins.

Validation: 73 repository tests passed. Headed desktop Chrome preview and visual
inspection covered 24/32/48/64/128 px on both light and dark backgrounds; no
clipping or opaque background. PNG is 116,684 bytes. No settings, runtime,
dependencies or permission changes in this revision. This package has not yet
been installed in Cindy; earlier device screenshots remain labeled 2.1.6.
The two existing P1 threads and Draft status remain unchanged.

---

# Outlook 2.1.7 code review and cleanup — 2026-10-19

- Reproduced a P2 keyboard-focus bug: disconnect succeeded, the account row was
  removed, and focus fell back to the document body. The former menu-close hook
  ran before the asynchronous removal and could not restore focus. Restoration
  now runs after the request and refresh: account menu on failure, list heading
  after removal. Both paths have browser regressions.
- Removed unused React default imports, unreferenced CSS hooks, a hidden-only
  setup branch, and three obsolete translation keys in all four languages.
  Account label/status derivation is shared by the row and menu. Removed comments
  that restated the code; retained attribution and the Host auto-height rationale.
- Removed the redundant service-menu close-focus override in favor of Radix's
  behavior. Verified Escape returns focus and clicking the setup input outside
  the menu retains input focus after the menu opens and settles.
- Corrected both READMEs to describe the account card/menu and use a version-neutral
  packaging example. No layout redesign, dependency change, permission change or
  mail-tool change. Manifest differs from the base only in its version.

Validation: 73 repository tests passed; headed desktop Chrome interaction checks
and all 40 constrained light/dark/localized layouts passed. The focus regression
failed against 2.1.6 before the fix. Bundle/license rebuild is reproducible; syntax
and whitespace checks passed. The browser uses synthetic accounts and Host APIs.
2.1.7 has not been installed in the actual Cindy client; the actual-device evidence
below remains specifically for 2.1.6 and is not relabeled as a new-version test.

Two pre-existing P1 review threads remain unresolved: Microsoft icon permission
and the full core-functionality device-verification requirement. Icon/third-party
resources require maintainer review; Draft status and the unchecked broad device
checkbox are preserved. No claim of merge readiness or new-head review score.

---

# Outlook 2.1.6 acceptance — 2026-10-19

Source commit: `52a4e6b0a0ec45f2caeea7b5785906f4a17022dd`.
Release-format package: `/tmp/outlook-mail-2.1.6.cindy`, 181568 bytes, 30 entries.
SHA-256: `c37b27e01e63d1b13be38165c0b068bab4596cfaafd3464ceed47440c2117330`.
Archive settings HTML/CSS/JS and manifest were compared byte-for-byte with source.

## Actual Cindy Beta

Cindy 0.1.111 Beta, macOS. Forge first updated the other installed Outlook copy.
The existing-account copy still showed 2.1.5, so its own **Update from .cindy file**
action was used to select the exact release archive above. That detail page now
shows 2.1.6 with the original connected mailbox and the new account card.
No uninstall, catalog replacement, credential edit or mailbox mutation occurred.

Verified in the actual dark desktop UI:

- Content-width service selector; global and China switching.
- China setup heading and explanation on one line at the actual wide card size;
  required Client ID and callback fields follow the service selection.
- Circular user avatar, compact account identity, right-side menu, divider and
  bottom Connect another account row. The Host's orphan leading label separator
  is removed only from display, never from account identity.
- Account menu displays service, connected status and service-default marker.
  Existing account remains visible while viewing China configuration.
- Returned to the global service. Read-only `outlook_accounts` reports the original
  global account connected, with China still unconfigured.

Screenshots (mailbox identity redacted, unrelated UI cropped):
[default](screenshots/outlook-cindy-beta-default.png),
[service menu](screenshots/outlook-cindy-beta-menu.png),
[account menu](screenshots/outlook-cindy-beta-accountmenu.png),
[China setup](screenshots/outlook-cindy-beta-china.png).

## Browser and repository checks

Headed local desktop Chrome: all prior interaction checks and 40 Host-constrained
layouts passed (280/320/360/460/720 px × four languages × light/dark). New checks
cover the compact selector, inline wide-card setup explanation, account-card
footer, hidden healthy-state details, metadata in the account menu, and display
cleanup of the orphan separator. Long addresses and authorization warnings remain
visible and wrap without horizontal clipping.

Repository contract/localization/provisioning/publish-workflow and Outlook tests:
73 passed, 0 failed. Build, bundle syntax, diff whitespace and packaging passed.
No new dependencies, permissions or credential paths in this refinement.

Limitations: light theme and narrow layouts were validated in desktop Chrome,
not in the actual Cindy window. New OAuth sign-in, China enterprise authorization
and destructive account operations were not performed against real accounts.
The PR stays Draft; the broader full-core-functionality device checkbox remains
unchecked. The exact 2.1.6 release archive itself **was** installed this time.

---

# Outlook 2.1.5 acceptance — 2026-10-19

Source commit: `964912570f3d9797d6f0fb3c26a1dcfc72d83fef`.
Release-format package: `/tmp/outlook-mail-2.1.5.cindy`, SHA-256
`721618c62b1d9dd1a68300a0bf4b6bf3a934159b395d287b1a9afc9a6e4782db`.

## Actual Cindy Beta

Cindy 0.1.111 Beta, macOS, existing desktop installation. Forge validated,
packaged and installed 2.1.5 from the source worktree. The installed plugin detail
page explicitly displays 2.1.5 with the new icon and React/Radix settings UI.
This is distinct from the catalog's 2.1.2 detail page; the installed list also
contains an older local copy. No catalog replacement or uninstall was performed.

Verified through actual desktop UI:

- Global service displays Add mailbox and keeps application setup optional.
- The service menu matches its trigger width and is not clipped by the settings
  card. Selection and saved Default badge are distinct.
- Selecting China reveals required Client ID, the `53688` callback and Azure
  China registration link; it retains the connected global mailbox.
- Switching back to global restores the direct connection path.
- More settings opens; Connection application opens; Cancel returns to the
  collapsed application section. The mailbox menu opens without reflowing its row.
- An existing mailbox remains connected. A read-only `outlook_accounts` profile
  lookup succeeded against Graph. No mail was sent, changed or deleted.
- Actual screenshots were cropped to the plugin detail area and the mailbox
  identity was redacted before being committed.

Earlier 2.1.5 screenshots (retained at source/evidence commit `4f53ebe`):
[default](screenshots/outlook-cindy-beta-default.png),
[service menu](screenshots/outlook-cindy-beta-menu.png).

Limitations: only the current dark desktop theme was inspected in Cindy itself.
Light theme and narrow widths below were tested in desktop Chrome using simulated
Host APIs. A new Microsoft sign-in, China enterprise authorization and destructive
account actions were not performed on the real account. Forge repackages the
source; the separately generated release-format archive's exact SHA was not
installed through the file picker. The broad PR device checkbox remains unchecked.

## Reproducible browser verification

`settings-browser.mjs`, headed local desktop Chrome, synthetic `example.test`
accounts, same-origin CSP, and Cindy's actual auto-height/width constraints:

- 40 layouts: 280/320/360/460/720 px × zh-CN/en/ja/ko × light/dark.
- Visible control bounds, menu width, vertical clipping, long addresses,
  account-menu row stability, China setup and ordinary same-page links.
- Keyboard selection/Escape/focus return, transient service vs persisted default,
  failed saves preserving drafts, cancellation, duplicate-submit guard, clear-app
  fallback, four accounts across two services, per-service default/reconnect/
  disconnect isolation, failed disconnect, loading recovery, XSS and locale fallback.

All passed. Repository contract/localization/provisioning/publish-workflow and
Outlook tests: 73 passed, 0 failed. Manifest validation, bundle syntax and
release-format packaging passed. No new Host permissions or credential paths.
