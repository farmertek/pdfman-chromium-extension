# Changelog

All notable changes to PDF Manager extension are documented in this file.

## 1.0.5 - 2026-04-30

- Bugfix: fixed dialog/message button contrast in light mode by preventing theme-level `.btn` rules from overriding modal action button backgrounds.
- UX: modal action buttons now use theme-aware color tokens for both light and dark modes, including hover states.
- Release: bumped extension/package version to 1.0.5 for Chrome Web Store packaging.

## 1.0.4 - 2026-04-18

- UX: added manual theme selector buttons (System/Light/Dark) directly on the top tab bar, next to the EN/VI language toggle.
- UX: active theme mode now has a visible selected state in the toolbar for quick verification.
- i18n: added localized labels and tooltip for the manual theme selector in both Vietnamese and English.
- Bugfix: in dark mode, Lock/Unlock file status label now follows theme text color for better readability (no hardcoded black text).
- Bugfix: in dark mode, button hover now keeps each button's original color and applies only a subtle highlight effect.
- Bugfix: Lock/Unlock button text color now matches Open PDF button color to keep labels readable in light mode.

## 1.0.3 - 2026-04-16

- Security: PDF Lock now defaults to AES-256 encryption profile.
- Compatibility: when legacy QPDF environments reject 256-bit profile, lock flow retries with AES-128 (`--use-aes=y`) as fallback.
- UX: lock success message now displays the actual encryption profile used (default or fallback).
- Change: removed the `Copy for accessibility` restriction option from the lock UI to preserve assistive-technology access.
- UX: standardized bilingual naming for all PDF Lock/Unlock restrictions and actions (Vietnamese + English labels are now consistent).
- UX: when opening a PDF, lock/unlock checkboxes now reflect the current permission state of that file; non-encrypted PDFs default to all unchecked.

## 1.0.2 - 2026-04-10

- Fix: improve auto-open flow when launching from a browser tab that is viewing a PDF on a LAN/UNC path.
- Change: manager now always re-resolves the real PDF URL from the source tab via background service worker before auto-open.
- Fallback: when Chrome blocks direct file:// fetch for LAN/UNC, extension now offers Open PDF style file-picker flow so user can select the same PDF file.
- UX: network-share fallback dialog now shows the detected path to help user pick the exact file quickly.

## 1.0.1

- Previous release baseline used for OPFS and lazy-render pipeline updates.
