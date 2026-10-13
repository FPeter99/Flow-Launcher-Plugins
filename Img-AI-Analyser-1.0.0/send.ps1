$ErrorActionPreference = 'Stop'

$url = $env:IMGAI_URL
if ($url -notmatch '^https://') {
    exit 1
}

$delay = 3
if ($env:IMGAI_DELAY -match '^\d+$') {
    $delay = [int]$env:IMGAI_DELAY
}
if ($delay -lt 1) { $delay = 1 }
if ($delay -gt 20) { $delay = 20 }

$prompt = ''
$promptFile = $env:IMGAI_PROMPT_FILE
if ($promptFile -and (Test-Path -LiteralPath $promptFile)) {
    $prompt = Get-Content -LiteralPath $promptFile -Raw -Encoding UTF8
    Remove-Item -LiteralPath $promptFile -Force
}

Start-Process $url
Start-Sleep -Seconds $delay

$signature = @'
using System;
using System.Runtime.InteropServices;
public static class ImgAiInput {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
'@
Add-Type -TypeDefinition $signature
function Send-CtrlV {
    [ImgAiInput]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
    [ImgAiInput]::keybd_event(0x56, 0, 0, [UIntPtr]::Zero)
    [ImgAiInput]::keybd_event(0x56, 0, 2, [UIntPtr]::Zero)
    [ImgAiInput]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
}
function Send-Enter {
    [ImgAiInput]::keybd_event(0x0D, 0, 0, [UIntPtr]::Zero)
    [ImgAiInput]::keybd_event(0x0D, 0, 2, [UIntPtr]::Zero)
}

Send-CtrlV
Start-Sleep -Milliseconds 700

if ($prompt.Trim()) {
    Set-Clipboard -Value $prompt
    Start-Sleep -Milliseconds 250
    Send-CtrlV
    Start-Sleep -Milliseconds 300
}

Send-Enter
