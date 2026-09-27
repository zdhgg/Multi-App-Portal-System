' Launch portal-watchdog.ps1 with a genuinely hidden window.
'
' Why this file exists:
'   A scheduled task whose action is pwsh.exe -WindowStyle Hidden still has the OS
'   create the console window first and hide it a moment later, which shows up as a
'   black window flashing every 5 minutes. wscript.exe is a GUI-subsystem host, so
'   Shell.Run(cmd, 0, ...) passes SW_HIDE at CreateProcess time -> no window at all.
'
'   Run(cmd, 0, True) waits for the script, so the scheduled task stays "running"
'   until the watchdog finishes; with MultipleInstances=IgnoreNew that prevents
'   two overlapping watchdog runs.
'
' This file is deliberately ASCII-only so wscript reads it correctly regardless of
' the system code page.

Option Explicit

Dim fso, shell, scriptDir, pwsh, cmd

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

pwsh = "C:\Program Files\PowerShell\7\pwsh.exe"
If Not fso.FileExists(pwsh) Then
    pwsh = "powershell.exe"
End If

cmd = """" & pwsh & """ -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & _
      fso.BuildPath(scriptDir, "portal-watchdog.ps1") & """"

' 0 = hidden window, True = wait for the child to exit
WScript.Quit shell.Run(cmd, 0, True)
