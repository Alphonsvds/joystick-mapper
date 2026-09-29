; Extra setup steps for the Windows installer (included by electron-builder's NSIS script).
;
; Joystick Mapper needs the ViGEmBus driver to create its virtual Xbox controller. The
; official installer ships inside our installer (resources\vigembus); install it
; silently unless it's already there. The installer runs elevated (perMachine), so the
; driver install needs no second prompt.

!macro customInstall
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ViGEmBus" "ImagePath"
  StrCmp $0 "" 0 vigembus_done
    DetailPrint "Installing the ViGEmBus controller driver..."
    ExecWait '"$INSTDIR\resources\vigembus\ViGEmBus_Setup.exe" /exenoui /qn /norestart' $1
    StrCmp $1 "0" vigembus_done
    StrCmp $1 "3010" vigembus_done
      MessageBox MB_OK|MB_ICONEXCLAMATION "The ViGEmBus controller driver couldn't be installed (code $1).$\r$\n$\r$\nJoystick Mapper will still open; use its Install driver button to try again." /SD IDOK
  vigembus_done:
!macroend

; The driver is left installed on uninstall: other apps (DS4Windows, etc.) may use it,
; and it can be removed from Settings > Apps if wanted.
