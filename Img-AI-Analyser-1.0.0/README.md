# Img AI Analyser

Flow Launcher plugin that sends the image currently on the clipboard, plus the text typed after `imgai`, to a selected AI website.

## Usage

1. Copy an image to the clipboard.
2. Type `imgai`, followed by the prompt. Example: `imgai mi a helyes válasz`
3. Use the up and down arrows to choose **Send to Copilot**, **Send to Gemini**, **Send to Claude**, or **Send to ChatGPT**.
4. Press Enter.

The plugin opens the selected website, waits, pastes the clipboard image, pastes the prompt, and presses Enter. In plugin settings, turn off any service you do not want to see and adjust the paste delay if the page loads slowly.

The website must already be logged in, and its message box must receive keyboard focus after the page opens. Restart Flow Launcher after installing the plugin.
