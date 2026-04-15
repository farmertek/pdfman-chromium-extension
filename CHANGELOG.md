# Changelog

All notable changes to PDF Manager extension are documented in this file.

## 1.0.2 - 2026-04-10

- Fix: improve auto-open flow when launching from a browser tab that is viewing a PDF on a LAN/UNC path.
- Change: manager now always re-resolves the real PDF URL from the source tab via background service worker before auto-open.
- Fallback: when Chrome blocks direct file:// fetch for LAN/UNC, extension now offers Open PDF style file-picker flow so user can select the same PDF file.
- UX: network-share fallback dialog now shows the detected path to help user pick the exact file quickly.

## 1.0.1

- Previous release baseline used for OPFS and lazy-render pipeline updates.
