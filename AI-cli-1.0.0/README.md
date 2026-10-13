# AI CLI

Flow Launcher plugin that browses local drives and folders, then opens OpenCode in the selected directory and starts OmniRoute in a separate hidden PowerShell process.

## Usage

Type `cli` in Flow Launcher.

- With no path, it opens the starting folder from plugin settings, or your user profile if that setting is empty. Available drives are listed too.
- Browse into a drive or folder. Partial folder names filter the current directory.
- Choose **select folder as workdir** to launch OpenCode there.

You can also type a path directly, for example `cli D:/projects/`.

## Settings

- **Starting folder:** folder opened when you type `cli` without a path.
- **OpenCode command:** command setting for the visible terminal. The current launcher still starts `opencode` and `omniroute`.

Restart Flow Launcher after installing the plugin or changing `plugin.json`.
