# AI Image Generator

Flow Launcher plugin that sends an image generation prompt to a selected AI website (ChatGPT, Grok, Copilot, Gemini, Meta AI).

It prefixes your prompt with `Generate an image from this: {prompt}`, opens the selected service, waits for the page to load, pastes the prompt, and presses Enter automatically.

## Usage

1. Type `imggen`, followed by your prompt. Example: `imggen gördeszkázó kutya`
2. Select the AI provider (ChatGPT, Grok, Copilot, Gemini, Meta AI).
3. Press Enter.
4. The plugin automatically opens the chat, waits for it to load, focuses the input box, pastes `Generate an image from this: gördeszkázó kutya`, and sends it.

## Settings

In Flow Launcher settings for **AI-Img-Generator-1.0.0**:
- **Visible AI services**: Toggle individual AI providers on or off.
