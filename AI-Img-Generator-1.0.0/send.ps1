$ErrorActionPreference = 'Stop'

$url = $env:IMGGEN_URL
if ($url -notmatch '^https://') {
    exit 1
}

$prompt = ''
$promptFile = $env:IMGGEN_PROMPT_FILE
if ($promptFile -and (Test-Path -LiteralPath $promptFile)) {
    $prompt = Get-Content -LiteralPath $promptFile -Raw -Encoding UTF8
    Remove-Item -LiteralPath $promptFile -Force -ErrorAction SilentlyContinue
}

$signature = @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class ImggenInput {
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

# Open the AI website
Start-Process $url

# Wait for the page title to load (up to 15 seconds)
$keywords = @()
if ($env:IMGGEN_KEYWORDS) {
    $keywords = $env:IMGGEN_KEYWORDS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
if ($keywords.Count -eq 0) {
    $keywords = @('ChatGPT', 'Grok', 'Copilot', 'Gemini', 'Meta AI')
}

$timeout = 15
$watch = [System.Diagnostics.Stopwatch]::StartNew()
$targetHwnd = [IntPtr]::Zero

# Give browser a moment to initiate the request
Start-Sleep -Milliseconds 1200

while ($watch.Elapsed.TotalSeconds -lt $timeout) {
    $hwnd = [ImggenInput]::FindWindowByKeywords($keywords)
    if ($hwnd -ne [IntPtr]::Zero) {
        $targetHwnd = $hwnd
        break
    }
    Start-Sleep -Milliseconds 250
}

# Bring window to foreground cleanly
if ($targetHwnd -ne [IntPtr]::Zero) {
    [ImggenInput]::SetForegroundWindow($targetHwnd)
}

# Wait for the input box and scripts to finish initializing
Start-Sleep -Milliseconds 1200

# Paste prompt and send
if ($prompt.Trim()) {
    Set-Clipboard -Value $prompt
    Start-Sleep -Milliseconds 250
    [ImggenInput]::SendCtrlV()
    Start-Sleep -Milliseconds 600
    [ImggenInput]::SendEnter()
}
