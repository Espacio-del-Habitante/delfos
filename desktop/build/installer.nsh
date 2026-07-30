; Página opcional del instalador NSIS: dictado local (Whisper).
; No corre `uv sync` (el usuario no tiene el repo): solo deja un flag para que
; Electron descargue el modelo al primer arranque (POST /api/settings/stt/warmup).
;
; Las Functions van bajo !ifndef BUILD_UNINSTALLER: el include se procesa también
; al compilar el uninstaller y makensis trata el warning 6010 como error.

!ifndef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"

  Var SttDialog
  Var SttLabel
  Var SttCheckbox
  Var SttWantWarmup

  Function SttPageCreate
    nsDialogs::Create 1018
    Pop $SttDialog
    ${If} $SttDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 48u "Delfos puede dictar gastos e ingresos por voz en este PC (Whisper local, sin nube).$\r$\n$\r$\nLa primera vez descarga un modelo (~75–150 MB) y puede tardar unos minutos."
    Pop $SttLabel

    ${NSD_CreateCheckbox} 0 56u 100% 12u "Preparar dictado local con Whisper al abrir Delfos"
    Pop $SttCheckbox
    ${NSD_Check} $SttCheckbox

    nsDialogs::Show
  FunctionEnd

  Function SttPageLeave
    ${NSD_GetState} $SttCheckbox $SttWantWarmup
  FunctionEnd
!endif

!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    Page custom SttPageCreate SttPageLeave
  !endif
!macroend

!macro customInstall
  !ifndef BUILD_UNINSTALLER
    ${If} $SttWantWarmup == ${BST_CHECKED}
      ; Mismo userData que Electron (package.json name = delfos-desktop).
      CreateDirectory "$APPDATA\delfos-desktop"
      FileOpen $0 "$APPDATA\delfos-desktop\stt-warmup.flag" w
      FileWrite $0 "1"
      FileClose $0
    ${EndIf}
  !endif
!macroend
