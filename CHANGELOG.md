# Changelog

All notable changes to PDF Manager extension are documented in this file.

## 1.0.3 - 2026-04-16

- Security: PDF Lock now defaults to AES-256 encryption profile.
- Compatibility: when legacy QPDF environments reject 256-bit profile, lock flow retries with AES-128 (`--use-aes=y`) as fallback.
- UX: lock success message now displays the actual encryption profile used (default or fallback).
- Fix: restriction `copy_accessibility` now maps to QPDF `--accessibility=n` so "Khóa Copy Text cho Accessibility" is applied correctly.
- UX: standardized bilingual naming for all PDF Lock/Unlock restrictions and actions (Vietnamese + English labels are now consistent).
- UX: when opening a PDF, lock/unlock checkboxes now reflect the current permission state of that file; non-encrypted PDFs default to all unchecked.

## 1.0.2 - 2026-04-10

- Fix: improve auto-open flow when launching from a browser tab that is viewing a PDF on a LAN/UNC path.
- Change: manager now always re-resolves the real PDF URL from the source tab via background service worker before auto-open.
- Fallback: when Chrome blocks direct file:// fetch for LAN/UNC, extension now offers Open PDF style file-picker flow so user can select the same PDF file.
- UX: network-share fallback dialog now shows the detected path to help user pick the exact file quickly.

## 1.0.1

- Previous release baseline used for OPFS and lazy-render pipeline updates.
