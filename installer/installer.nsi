; Инсталатор на „Детска консултация“ за Windows 10/11 (64-битов).
;
; Сглобява се със scripts/build-windows.mjs, който подава:
;   VERSION, SOURCE_DIR (DetskaKonsultacia.exe и лиценза на Node.js),
;   ICON, WELCOME (странична картинка 164×314), README и OUTFILE.
;
; Какво прави:
;   - копира програмата в C:\Program Files\DetskaKonsultacia;
;   - създава C:\ProgramData\DetskaKonsultacia за данните — обща за всички
;     потребители на компютъра и извън OneDrive;
;   - преки пътища в менюто Старт и (по избор) на работния плот;
;   - (по избор) стартиране при влизане в Windows и правило в защитната стена
;     само за частни и домейн мрежи — за достъп от другите компютри в кабинета.
;
; Деинсталирането НЕ изтрива данните, освен ако потребителят изрично
; потвърди два пъти. При тихо деинсталиране (/S) данните винаги остават.

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

!define APP_NAME "Детска консултация"
!define APP_ID "DetskaKonsultacia"
!define APP_EXE "DetskaKonsultacia.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
; $APPDATA при SetShellVarContext all е C:\ProgramData.
!define DATA_ROOT "$APPDATA\${APP_ID}"
!define FIREWALL_RULE "${APP_ID}"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\${APP_ID}"
InstallDirRegKey HKLM "${UNINST_KEY}" "InstallLocation"
RequestExecutionLevel admin
BrandingText "${APP_NAME} ${VERSION}"
ShowInstDetails show
ShowUninstDetails show

;--------------------------------- интерфейс ---------------------------------

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${WELCOME}"
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Инсталиране на ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Програма за проследяване на деца пациенти в практиката: имунизации, профилактични прегледи, растеж и развитие.$\r$\n$\r$\nПрограмата работи изцяло на този компютър и се отваря в браузъра. Данните не се изпращат в интернет.$\r$\n$\r$\nАко вече е инсталирана, тя ще бъде спряна и обновена. Данните се запазват."

!define MUI_COMPONENTSPAGE_SMALLDESC

!define MUI_FINISHPAGE_TITLE "${APP_NAME} е инсталирана"
!define MUI_FINISHPAGE_TEXT "Програмата се отваря в браузъра на адрес http://localhost:8080$\r$\n$\r$\nАдресът за другите компютри в кабинета е в „Настройки → Данни и копия“."
!define MUI_FINISHPAGE_TEXT_LARGE
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Отвори ${APP_NAME}"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\Прочети ме.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Покажи кратките указания"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Bulgarian"

VIProductVersion "${VERSION}.0"
VIFileVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "FileDescription" "Инсталатор на ${APP_NAME}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "CompanyName" "${APP_NAME}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "LegalCopyright" "Включва Node.js (лиценз MIT)"

;--------------------------------- помощни -----------------------------------

; Спира работещо копие: първо учтиво (записва данните), после принудително.
!macro StopRunning
  DetailPrint "Спиране на работещата програма…"
  IfFileExists "$INSTDIR\${APP_EXE}" 0 +3
    nsExec::Exec '"$INSTDIR\${APP_EXE}" --stop --quiet'
    Pop $0
  Sleep 500
  nsExec::Exec 'taskkill /F /IM ${APP_EXE}'
  Pop $0
!macroend

Function LaunchApp
  ; Инсталаторът работи с администраторски права. Чрез Explorer програмата
  ; се стартира с правата на влезлия потребител, а не като администратор.
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\${APP_EXE}"'
FunctionEnd

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${APP_NAME} изисква 64-битов Windows 10 или по-нов."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "${APP_NAME} изисква Windows 10 или по-нов."
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
FunctionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext all
FunctionEnd

;--------------------------------- секции ------------------------------------

Section "!${APP_NAME}" SecMain
  SectionIn RO
  SetShellVarContext all

  !insertmacro StopRunning

  SetOutPath "$INSTDIR"
  File "${SOURCE_DIR}\${APP_EXE}"
  File "${SOURCE_DIR}\Node.js-LICENSE.txt"
  File "/oname=Прочети ме.txt" "${README}"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Папка за данните, в която всеки потребител на компютъра може да пише.
  ; S-1-5-32-545 е групата „Потребители“ независимо от езика на Windows.
  CreateDirectory "${DATA_ROOT}"
  nsExec::ExecToLog 'icacls "${DATA_ROOT}" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
  Pop $0

  ; Меню Старт
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Спиране на ${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "--stop" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Папка с данните.lnk" "${DATA_ROOT}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Прочети ме.lnk" "$INSTDIR\Прочети ме.txt"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Деинсталиране.lnk" "$INSTDIR\uninstall.exe"

  ; Изборите по-долу се прилагат наново при всяко обновяване.
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\${APP_NAME}.lnk"

  ; Запис в „Приложения и функции“
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${APP_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE},0"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Пряк път на работния плот" SecDesktop
  SetShellVarContext all
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
SectionEnd

Section "Стартиране при влизане в Windows" SecAutostart
  SetShellVarContext all
  CreateShortCut "$SMSTARTUP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "--background" "$INSTDIR\${APP_EXE}" 0
SectionEnd

Section "Достъп от другите компютри в кабинета" SecFirewall
  DetailPrint "Правило в защитната стена (частни и домейн мрежи)…"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${FIREWALL_RULE}"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${FIREWALL_RULE}" dir=in action=allow program="$INSTDIR\${APP_EXE}" enable=yes profile=private,domain'
  Pop $0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "Самата програма. Данните се пазят в ${DATA_ROOT}."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Икона на работния плот за бързо отваряне."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAutostart} "Програмата тръгва във фонов режим при влизане в Windows, така че другите компютри винаги да могат да се свържат."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecFirewall} "Разрешава връзки от другите компютри в частната мрежа на кабинета. Не се отнася за публични мрежи."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

;------------------------------- деинсталиране -------------------------------

Section "Uninstall"
  SetShellVarContext all

  DetailPrint "Спиране на работещата програма…"
  nsExec::Exec '"$INSTDIR\${APP_EXE}" --stop --quiet'
  Pop $0
  Sleep 500
  nsExec::Exec 'taskkill /F /IM ${APP_EXE}'
  Pop $0

  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${FIREWALL_RULE}"'
  Pop $0

  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"

  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\Node.js-LICENSE.txt"
  Delete "$INSTDIR\Прочети ме.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${UNINST_KEY}"

  ; Данните остават, освен ако потребителят изрично поиска друго.
  IfSilent keep
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
    "Програмата е премахната.$\r$\n$\r$\nДа се изтрият ли и ДАННИТЕ на пациентите и резервните копия?$\r$\n${DATA_ROOT}$\r$\n$\r$\nАко изберете „Не“, данните остават и ще се заредят отново при следващо инсталиране." \
    IDYES confirm
  Goto keep
  confirm:
  MessageBox MB_YESNO|MB_ICONSTOP|MB_DEFBUTTON2 \
    "Сигурни ли сте? Изтриването е окончателно и не може да бъде отменено.$\r$\n$\r$\nАко нямате копие на друго място, изберете „Не“." \
    IDNO keep
  RMDir /r "${DATA_ROOT}"
  DetailPrint "Данните са изтрити."
  Goto done
  keep:
  DetailPrint "Данните са запазени в ${DATA_ROOT}"
  done:
SectionEnd
