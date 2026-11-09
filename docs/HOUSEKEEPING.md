# Housekeeping branch

Changes parked here so `main` stays release-only. Merge when convenient.

- `docs/TESTING.md`: test table brought up to date (desktop, MCP, ops, AI, current counts).
- `.github/workflows/desktop.yml`: adds an Intel Mac build (`macos-13`). Not yet run in CI; the
  first run on this branch will show whether the x64 packaged-app check passes.

Still open (not started):

- Desktop auto-update (`electron-updater` against GitHub Releases).
- Code signing for Windows and macOS (needs certificates from the owner).
- Assistant: streaming replies; a verified run against real Claude and OpenAI accounts.
- Email (invites, password reset on servers, comment notifications).
- Hand tests of the Windows and macOS installers.
- Local cleanup on the development machine: test data folders under `/tmp/sigma-*` and the test
  workspaces in the local Docker instance.
