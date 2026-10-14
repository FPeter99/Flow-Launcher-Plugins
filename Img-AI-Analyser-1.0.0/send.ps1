$ErrorActionPreference = 'Stop'

$url = $env:IMGAI_URL
if ($url -notmatch '^https://') {
    exit 1
}

$prompt = ''
$promptFile = $env:IMGAI_PROMPT_FILE
if ($promptFile -and (Test-Path -LiteralPath $promptFile)) {
    $prompt = Get-Content -LiteralPath $promptFile -Raw -Encoding UTF8
    Remove-Item -LiteralPath $promptFile -Force -ErrorAction SilentlyContinue
}

$signature = @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class ImgAiInput {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

    [DllImport("user32.dll")]
    public static extern uint GetClipboardSequenceNumber();

    [DllImport("user32.dll")]
    public static extern bool IsClipboardFormatAvailable(uint format);

    public static bool HasImage() {
        return IsClipboardFormatAvailable(2) || IsClipboardFormatAvailable(8) || IsClipboardFormatAvailable(17);
    }

    public static void TriggerScreenshot() {
        // PrintScreen (VK_SNAPSHOT = 0x2C)
        keybd_event(0x2C, 0, 0, UIntPtr.Zero);
        keybd_event(0x2C, 0, 2, UIntPtr.Zero);

        // Win + Shift + S
        keybd_event(0x5B, 0, 0, UIntPtr.Zero);
        keybd_event(0x10, 0, 0, UIntPtr.Zero);
        keybd_event(0x53, 0, 0, UIntPtr.Zero);
        keybd_event(0x53, 0, 2, UIntPtr.Zero);
        keybd_event(0x10, 0, 2, UIntPtr.Zero);
        keybd_event(0x5B, 0, 2, UIntPtr.Zero);
    }

    public static IntPtr FindWindowByKeywords(string[] keywords) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                var sb = new StringBuilder(512);
                GetWindowText(hWnd, sb, 512);
                string title = sb.ToString();
                if (!string.IsNullOrEmpty(title)) {
                    foreach (var kw in keywords) {
                        if (!string.IsNullOrEmpty(kw) && title.IndexOf(kw, StringComparison.OrdinalIgnoreCase) >= 0) {
                            found = hWnd;
                            return false;
                        }
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static void SendCtrlV() {
        keybd_event(0x11, 0, 0, UIntPtr.Zero);
        keybd_event(0x56, 0, 0, UIntPtr.Zero);
        keybd_event(0x56, 0, 2, UIntPtr.Zero);
        keybd_event(0x11, 0, 2, UIntPtr.Zero);
    }

    public static void SendEnter() {
        keybd_event(0x0D, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(50);
        keybd_event(0x0D, 0, 2, UIntPtr.Zero);
    }
}
'@
Add-Type -TypeDefinition $signature

# Small delay to let Flow Launcher close and clear the screen
Start-Sleep -Milliseconds 300

$initialSeq = [ImgAiInput]::GetClipboardSequenceNumber()
[ImgAiInput]::TriggerScreenshot()

$timeoutSeconds = 60
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$snippingStarted = $false
$newImageCaptured = $false

while ($stopwatch.Elapsed.TotalSeconds -lt $timeoutSeconds) {
    Start-Sleep -Milliseconds 100

    $currentSeq = [ImgAiInput]::GetClipboardSequenceNumber()
    if ($currentSeq -ne $initialSeq -and [ImgAiInput]::HasImage()) {
        $newImageCaptured = $true
        break
    }

    $hostProc = Get-Process ScreenClippingHost -ErrorAction SilentlyContinue
    if ($hostProc) {
        $snippingStarted = $true
    } elseif ($snippingStarted) {
        Start-Sleep -Milliseconds 400
        $currentSeq = [ImgAiInput]::GetClipboardSequenceNumber()
        if ($currentSeq -ne $initialSeq -and [ImgAiInput]::HasImage()) {
            $newImageCaptured = $true
        }
        break
    }
}

if (-not $newImageCaptured) {
    exit 0
}

# Open the AI chat page
Start-Process $url

# Wait for the browser window to load the page title (up to 15 seconds)
$keywords = @()
if ($env:IMGAI_KEYWORDS) {
    $keywords = $env:IMGAI_KEYWORDS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
if ($keywords.Count -eq 0) {
    $keywords = @('ChatGPT', 'Grok', 'Copilot', 'Gemini', 'Meta AI', 'Claude')
}

$loadTimeout = 15
$loadWatch = [System.Diagnostics.Stopwatch]::StartNew()
$targetHwnd = [IntPtr]::Zero

# Give browser a moment to initiate the request
Start-Sleep -Milliseconds 1200

while ($loadWatch.Elapsed.TotalSeconds -lt $loadTimeout) {
    $hwnd = [ImgAiInput]::FindWindowByKeywords($keywords)
    if ($hwnd -ne [IntPtr]::Zero) {
        $targetHwnd = $hwnd
        break
    }
    Start-Sleep -Milliseconds 250
}

if ($targetHwnd -ne [IntPtr]::Zero) {
    [ImgAiInput]::SetForegroundWindow($targetHwnd)
}

# Wait for the chat UI to finish initializing
Start-Sleep -Milliseconds 1200

# 1. Paste screenshot
[ImgAiInput]::SendCtrlV()

# Wait for image to attach
Start-Sleep -Milliseconds 1200

# 2. Paste prompt if any
if ($prompt.Trim()) {
    Set-Clipboard -Value $prompt
    Start-Sleep -Milliseconds 250
    [ImgAiInput]::SendCtrlV()
    Start-Sleep -Milliseconds 500
}

# Send the message
[ImgAiInput]::SendEnter()
