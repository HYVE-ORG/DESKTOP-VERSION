!macro customInstall
  Delete "$SMPROGRAMS\Forma - Administrar Studio.lnk"
  FileOpen $0 "$INSTDIR\resources\forma-installed.json" w
  FileWrite $0 '{"type":"nsis"}'
  FileClose $0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Forma - Administrar Studio.lnk"
!macroend
