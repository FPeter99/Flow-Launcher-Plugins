# Img AI Analyser

Flow Launcher plugin that triggers a screenshot, then sends the captured image and the prompt typed after `imgai` to a selected AI website.

## Usage

1. Type `imgai`, followed by the prompt. Example: `imgai mi a helyes válasz`
2. Use the up and down arrows to choose **Send to Copilot**, **Send to Gemini**, **Send to Claude**, or **Send to ChatGPT**.
3. Press Enter.
4. Take a screenshot with the screen snip tool. If you cancel, nothing happens.
5. Once captured, the plugin opens the selected website, automatically waits for the page to load, focuses the window, pastes the screenshot, pastes the prompt, and presses Enter.

The website must already be logged in, and its message box must receive keyboard focus after the page opens. Restart Flow Launcher after installing the plugin.
