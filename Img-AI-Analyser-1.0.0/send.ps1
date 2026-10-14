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
using System.Collections.Generic;
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
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

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

        // Win + Shift + S (Windows Screen Snipping)
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

    public static bool ActivateWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        if (IsIconic(hWnd)) {
            ShowWindow(hWnd, 9); // SW_RESTORE
        } else {
            ShowWindow(hWnd, 5); // SW_SHOW
        }
        BringWindowToTop(hWnd);

        IntPtr fgWnd = GetForegroundWindow();
        uint pid;
        uint fgThread = GetWindowThreadProcessId(fgWnd, out pid);
        uint curThread = GetCurrentThreadId();

        if (fgThread != curThread) {
            AttachThreadInput(curThread, fgThread, true);
            SetForegroundWindow(hWnd);
            AttachThreadInput(curThread, fgThread, false);
        } else {
            SetForegroundWindow(hWnd);
        }
        return true;
    }

    public static void SendCtrlV() {
        keybd_event(0x11, 0, 0, UIntPtr.Zero);
        keybd_event(0x56, 0, 0, UIntPtr.Zero);
        keybd_event(0x56, 0, 2, UIntPtr.Zero);
        keybd_event(0x11, 0, 2, UIntPtr.Zero);
    }

    public static void SendEnter() {
        keybd_event(0x0D, 0, 0, UIntPtr.Zero);
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
        # ScreenClippingHost was open and is now closed.
        # Give a small grace period for the clipboard event to process.
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

# Wait dynamically for the browser window to load the page title
$keywords = @()
if ($env:IMGAI_KEYWORDS) {
    $keywords = $env:IMGAI_KEYWORDS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
if ($keywords.Count -eq 0) {
    $keywords = @('ChatGPT', 'Claude', 'Gemini', 'Copilot')
}

$loadTimeout = 25
$loadWatch = [System.Diagnostics.Stopwatch]::StartNew()
$targetHwnd = [IntPtr]::Zero

while ($loadWatch.Elapsed.TotalSeconds -lt $loadTimeout) {
    Start-Sleep -Milliseconds 150
    $hwnd = [ImgAiInput]::FindWindowByKeywords($keywords)
    if ($hwnd -ne [IntPtr]::Zero) {
        $targetHwnd = $hwnd
        break
    }
}

if ($targetHwnd -ne [IntPtr]::Zero) {
    [ImgAiInput]::ActivateWindow($targetHwnd)
    # Adaptive settle time: give the SPA chat UI ~700ms to mount and autofocus the input box
    Start-Sleep -Milliseconds 700
    [ImgAiInput]::ActivateWindow($targetHwnd)
} else {
    # Fallback if window title was not matched
    Start-Sleep -Seconds 2
}

# Paste screenshot
[ImgAiInput]::SendCtrlV()
Start-Sleep -Milliseconds 600

# Paste prompt if any
if ($prompt.Trim()) {
    Set-Clipboard -Value $prompt
    Start-Sleep -Milliseconds 200
    [ImgAiInput]::SendCtrlV()
    Start-Sleep -Milliseconds 300
}

# Send the message
[ImgAiInput]::SendEnter()
