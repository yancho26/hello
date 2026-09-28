; Инсталатор и файл за обновяване на DocUp за Windows 10/11 (64-битов).
;
; Сглобява се със scripts/build-windows.mjs, който подава:
;   VERSION, SOURCE_DIR (DocUp.exe и лиценза на Node.js),
;   ICON, WELCOME (странична картинка 164×314), README и OUTFILE,
;   а за файла за обновяване — и UPDATE.
;
; Пълен инсталатор (DocUp-Setup-<версия>.exe):
;   - копира програмата в C:\Program Files\DocUp;
;   - създава C:\ProgramData\DocUp за данните — обща за всички
;     потребители на компютъра и извън OneDrive;
;   - преки пътища в менюто Старт и (по избор) на работния плот;
;   - (по избор) стартиране при влизане в Windows и правило в защитната стена
;     само за частни и домейн мрежи — за достъп от другите компютри в кабинета.
;   При вече инсталирана програма предварително са избрани досегашните избори.
;
; Файл за обновяване (DocUp-Update-<версия>.exe):
;   - работи само върху съществуваща инсталация и не пита нищо освен „Напред“;
;   - подменя програмата и запазва данните, преките пътища, автоматичното
;     стартиране и правилото в защитната стена;
;   - ако програмата е работила, я стартира отново.
;
; Преминаване от „Детска консултация“ (до версия 2.2 програмата се казваше
; така): двата файла разпознават старата инсталация, спират я, преместват
; C:\ProgramData\DetskaKonsultacia в C:\ProgramData\DocUp, пренасят иконата на
; работния плот, автоматичното стартиране и правилото в защитната стена под
; новото име и премахват старата програма от „Приложения“. Ако папката с
; данните не може да бъде преместена (зает файл), програмата ги чете от
; старото място, а следващото обновяване опитва отново.
;
; Деинсталирането НЕ изтрива данните, освен ако потребителят изрично
; потвърди два пъти. При тихо деинсталиране (/S) данните винаги остават.
;
; Изходни кодове: 0 — успех; 2 — (обновяване) програмата не е инсталирана;
; 3 — (обновяване) вече е инсталирана по-нова версия.

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!include "StrFunc.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

${StrStr}

!define APP_NAME "DocUp"
!define APP_ID "DocUp"
!define APP_EXE "DocUp.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
; $APPDATA при SetShellVarContext all е C:\ProgramData.
!define DATA_ROOT "$APPDATA\${APP_ID}"
!define FIREWALL_RULE "${APP_ID}"

; Старото име (до версия 2.2).
!define LEGACY_NAME "Детска консултация"
!define LEGACY_ID "DetskaKonsultacia"
!define LEGACY_EXE "DetskaKonsultacia.exe"
!define LEGACY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_ID}"
!define LEGACY_DATA "$APPDATA\${LEGACY_ID}"
!define LEGACY_RULE "${LEGACY_ID}"

Var WasRunning
Var OldVersion
Var LegacyDir
Var HadDesktop
Var HadStartup
Var HadFirewall
Var DataRoot
Var WelcomeExtra

Name "${APP_NAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\${APP_ID}"
InstallDirRegKey HKLM "${UNINST_KEY}" "InstallLocation"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show
!ifdef UPDATE
  Caption "Обновяване на ${APP_NAME} до ${VERSION}"
  BrandingText "${APP_NAME} ${VERSION} — обновяване"
  InstallButtonText "Обнови"
!else
  BrandingText "${APP_NAME} ${VERSION}"
!endif

;--------------------------------- интерфейс ---------------------------------

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${WELCOME}"
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING

!ifdef UPDATE
  !define MUI_WELCOMEPAGE_TITLE "Обновяване на ${APP_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "$WelcomeExtraПрограмата ще бъде обновена от версия $OldVersion до ${VERSION}.$\r$\n$\r$\nЗа около минута тя ще бъде спряна и другите компютри в кабинета временно няма да имат достъп.$\r$\n$\r$\nДанните, настройките и преките пътища се запазват. При първото отваряне DocUp ще поиска продуктов ключ, ако още не е активиран — пригответе го."
  !define MUI_FINISHPAGE_TITLE "Обновяването е завършено"
  !define MUI_FINISHPAGE_TEXT "${APP_NAME} е обновена до версия ${VERSION}.$\r$\n$\r$\nКакво е новото ще видите при отваряне на програмата."
!else
  !define MUI_WELCOMEPAGE_TITLE "Инсталиране на ${APP_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "$WelcomeExtraПлатформа за общопрактикуващи лекари: деца и възрастни, имунизации, профилактика, хронични заболявания и лекарства.$\r$\n$\r$\nПрограмата работи изцяло на този компютър и се отваря в браузъра. Данните не се изпращат в интернет.$\r$\n$\r$\nАко вече е инсталирана, тя ще бъде спряна и обновена. Данните се запазват."
  !define MUI_FINISHPAGE_TITLE "${APP_NAME} е инсталирана"
  !define MUI_FINISHPAGE_TEXT "Програмата се отваря в браузъра на адрес http://localhost:8080$\r$\n$\r$\nПри първото отваряне въведете продуктовия ключ, който сте получили от DocUp.$\r$\n$\r$\nАдресът за другите компютри в кабинета е в „Настройки → Данни и копия“."
  !define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\Прочети ме.txt"
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Покажи кратките указания"
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!endif

!define MUI_COMPONENTSPAGE_SMALLDESC
!define MUI_FINISHPAGE_TEXT_LARGE
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Отвори ${APP_NAME}"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!ifndef UPDATE
  !insertmacro MUI_PAGE_COMPONENTS
  !insertmacro MUI_PAGE_DIRECTORY
!endif
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Bulgarian"

VIProductVersion "${VERSION}.0"
VIFileVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "ProductName" "${APP_NAME}"
!ifdef UPDATE
  VIAddVersionKey /LANG=${LANG_BULGARIAN} "FileDescription" "Обновяване на ${APP_NAME}"
!else
  VIAddVersionKey /LANG=${LANG_BULGARIAN} "FileDescription" "Инсталатор на ${APP_NAME}"
!endif
VIAddVersionKey /LANG=${LANG_BULGARIAN} "CompanyName" "${APP_NAME}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "LegalCopyright" "Включва Node.js (лиценз MIT)"

;--------------------------------- помощни -----------------------------------

; Запомня дали програмата работи, после я спира: първо учтиво (записва
; данните и прави външно копие), после принудително.
!macro StopRunning
  StrCpy $WasRunning 0
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq ${APP_EXE}" /NH'
  Pop $0
  Pop $1
  ${StrStr} $2 $1 "${APP_EXE}"
  ${If} $2 != ""
    StrCpy $WasRunning 1
  ${EndIf}
  DetailPrint "Спиране на работещата програма…"
  ${If} ${FileExists} "$INSTDIR\${APP_EXE}"
    nsExec::Exec '"$INSTDIR\${APP_EXE}" --stop --quiet'
    Pop $0
  ${EndIf}
  Sleep 500
  nsExec::Exec 'taskkill /F /IM ${APP_EXE}'
  Pop $0
!macroend

; Правилото на старата програма в защитната стена — по име и по пътя до
; програмата (така се махат и правилата, които Windows е създал сам).
!macro RemoveLegacyRule
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${LEGACY_RULE}"'
  Pop $0
  ${If} $LegacyDir != ""
    nsExec::ExecToLog 'netsh advfirewall firewall delete rule name=all program="$LegacyDir\${LEGACY_EXE}"'
    Pop $0
  ${EndIf}
!macroend

; Старата „Детска консултация“: спиране, преместване на данните и премахване
; на програмата, преките пътища, правилото и записа в „Приложения“.
!macro MigrateLegacy
  ${If} $LegacyDir != ""
    DetailPrint "Преминаване от „${LEGACY_NAME}“ към ${APP_NAME}…"
    nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq ${LEGACY_EXE}" /NH'
    Pop $0
    Pop $1
    ${StrStr} $2 $1 "${LEGACY_EXE}"
    ${If} $2 != ""
      StrCpy $WasRunning 1
    ${EndIf}
    ${If} ${FileExists} "$LegacyDir\${LEGACY_EXE}"
      nsExec::Exec '"$LegacyDir\${LEGACY_EXE}" --stop --quiet'
      Pop $0
    ${EndIf}
    Sleep 500
    nsExec::Exec 'taskkill /F /IM ${LEGACY_EXE}'
    Pop $0
    Sleep 500
  ${EndIf}

  ; Данните — и при повторен опит след неуспешно преместване.
  ${If} ${FileExists} "${LEGACY_DATA}\*.*"
    ${IfNot} ${FileExists} "${DATA_ROOT}\config.json"
    ${AndIfNot} ${FileExists} "${DATA_ROOT}\data\practice.json"
      RMDir "${DATA_ROOT}" ; празна папка от предишен неуспешен опит
    ${EndIf}
    ${IfNot} ${FileExists} "${DATA_ROOT}\*.*"
      ClearErrors
      Rename "${LEGACY_DATA}" "${DATA_ROOT}"
      ${If} ${Errors}
        DetailPrint "Папката с данните не беше преместена — програмата ще ги чете от ${LEGACY_DATA}."
      ${Else}
        DetailPrint "Данните са преместени в ${DATA_ROOT}."
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $LegacyDir != ""
    Delete /REBOOTOK "$LegacyDir\${LEGACY_EXE}"
    Delete "$LegacyDir\Node.js-LICENSE.txt"
    Delete "$LegacyDir\Прочети ме.txt"
    Delete "$LegacyDir\uninstall.exe"
    RMDir "$LegacyDir"
    RMDir /r "$SMPROGRAMS\${LEGACY_NAME}"
    Delete "$DESKTOP\${LEGACY_NAME}.lnk"
    Delete "$SMSTARTUP\${LEGACY_NAME}.lnk"
    !insertmacro RemoveLegacyRule
    DeleteRegKey HKLM "${LEGACY_KEY}"
    DetailPrint "„${LEGACY_NAME}“ е заменена от ${APP_NAME}."
  ${EndIf}

  ; Ако данните са останали на старото място, програмата ги чете оттам.
  StrCpy $DataRoot "${DATA_ROOT}"
  ${IfNot} ${FileExists} "${DATA_ROOT}\*.*"
  ${AndIf} ${FileExists} "${LEGACY_DATA}\*.*"
    StrCpy $DataRoot "${LEGACY_DATA}"
  ${EndIf}
!macroend

; Програмата, преките пътища в менюто Старт и записът в „Приложения“.
!macro InstallProgram
  SetOutPath "$INSTDIR"
  File "${SOURCE_DIR}\${APP_EXE}"
  File "${SOURCE_DIR}\Node.js-LICENSE.txt"
  File "/oname=Прочети ме.txt" "${README}"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Папка за данните, в която всеки потребител на компютъра може да пише.
  ; S-1-5-32-545 е групата „Потребители“ независимо от езика на Windows.
  CreateDirectory "$DataRoot"
  nsExec::ExecToLog 'icacls "$DataRoot" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
  Pop $0

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Спиране на ${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "--stop" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Папка с данните.lnk" "$DataRoot"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Прочети ме.lnk" "$INSTDIR\Прочети ме.txt"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Деинсталиране.lnk" "$INSTDIR\uninstall.exe"

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
!macroend

Function LaunchApp
  ; Инсталаторът работи с администраторски права. Чрез Explorer програмата
  ; се стартира с правата на влезлия потребител, а не като администратор.
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\${APP_EXE}"'
FunctionEnd

Function .onInstSuccess
  ; При тихо инсталиране няма последна страница — ако програмата е
  ; работила, я пускаме отново, за да не остане кабинетът без нея.
  ${If} ${Silent}
  ${AndIf} $WasRunning == 1
    Call LaunchApp
  ${EndIf}
FunctionEnd

; Досегашните избори — под новото или под старото име.
Function RememberChoices
  StrCpy $HadDesktop 0
  ${If} ${FileExists} "$DESKTOP\${APP_NAME}.lnk"
  ${OrIf} ${FileExists} "$DESKTOP\${LEGACY_NAME}.lnk"
    StrCpy $HadDesktop 1
  ${EndIf}
  StrCpy $HadStartup 0
  ${If} ${FileExists} "$SMSTARTUP\${APP_NAME}.lnk"
  ${OrIf} ${FileExists} "$SMSTARTUP\${LEGACY_NAME}.lnk"
    StrCpy $HadStartup 1
  ${EndIf}
  StrCpy $HadFirewall 0
  nsExec::Exec 'netsh advfirewall firewall show rule name="${FIREWALL_RULE}"'
  Pop $0
  ${If} $0 == 0
    StrCpy $HadFirewall 1
  ${EndIf}
  nsExec::Exec 'netsh advfirewall firewall show rule name="${LEGACY_RULE}"'
  Pop $0
  ${If} $0 == 0
    StrCpy $HadFirewall 1
  ${EndIf}
FunctionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext all
FunctionEnd

;--------------------------------- секции ------------------------------------

!ifdef UPDATE

Section "-Обновяване" SecUpdate
  SetShellVarContext all
  !insertmacro StopRunning
  !insertmacro MigrateLegacy
  !insertmacro InstallProgram
  ; Иконата, автоматичното стартиране и правилото остават такива, каквито са били
  ; (и се пренасят под новото име след „Детска консултация“).
  ${If} $HadDesktop == 1
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  ${EndIf}
  ${If} $HadStartup == 1
    CreateShortCut "$SMSTARTUP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "--background" "$INSTDIR\${APP_EXE}" 0
  ${EndIf}
  ${If} $HadFirewall == 1
    nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${FIREWALL_RULE}"'
    Pop $0
    nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${FIREWALL_RULE}" dir=in action=allow program="$INSTDIR\${APP_EXE}" enable=yes profile=private,domain'
    Pop $0
  ${EndIf}
  ; Още веднъж, след като старата програма е спряла окончателно.
  !insertmacro RemoveLegacyRule
  DetailPrint "Обновено от $OldVersion до ${VERSION}. Данните и настройките са запазени."
SectionEnd

!else

Section "!${APP_NAME}" SecMain
  SectionIn RO
  SetShellVarContext all
  !insertmacro StopRunning
  !insertmacro MigrateLegacy
  !insertmacro InstallProgram
  ; Изборите по-долу се прилагат наново при всяко инсталиране.
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\${APP_NAME}.lnk"
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
  !insertmacro RemoveLegacyRule
  DetailPrint "Правило в защитната стена (частни и домейн мрежи)…"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${FIREWALL_RULE}"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${FIREWALL_RULE}" dir=in action=allow program="$INSTDIR\${APP_EXE}" enable=yes profile=private,domain'
  Pop $0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "Самата програма. Данните се пазят в $DataRoot."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Икона на работния плот за бързо отваряне."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAutostart} "Програмата тръгва във фонов режим при влизане в Windows, така че другите компютри винаги да могат да се свържат."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecFirewall} "Разрешава връзки от другите компютри в частната мрежа на кабинета. Не се отнася за публични мрежи."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

!endif

;------------------------------- проверки ------------------------------------

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
  StrCpy $WasRunning 0
  StrCpy $WelcomeExtra ""
  StrCpy $DataRoot "${DATA_ROOT}"
  ReadRegStr $OldVersion HKLM "${UNINST_KEY}" "DisplayVersion"

  ; Инсталирана „Детска консултация“ (преди преименуването)?
  ReadRegStr $LegacyDir HKLM "${LEGACY_KEY}" "InstallLocation"
  ${If} $LegacyDir != ""
    ${If} $OldVersion == ""
      ReadRegStr $OldVersion HKLM "${LEGACY_KEY}" "DisplayVersion"
      ${If} $OldVersion == ""
        StrCpy $OldVersion "1.0.0"
      ${EndIf}
    ${EndIf}
    StrCpy $WelcomeExtra "„${LEGACY_NAME}“ вече се казва ${APP_NAME}. Данните, настройките и преките пътища се пренасят под новото име.$\r$\n$\r$\n"
  ${EndIf}
  Call RememberChoices

!ifdef UPDATE
  ; Файлът за обновяване работи само върху съществуваща инсталация —
  ; на DocUp или на „Детска консултация“.
  ReadRegStr $0 HKLM "${UNINST_KEY}" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\${APP_EXE}"
    StrCpy $INSTDIR $0
  ${ElseIf} $LegacyDir != ""
  ${AndIf} ${FileExists} "$LegacyDir\${LEGACY_EXE}"
    ; Новата папка е до старата: C:\Program Files\DetskaKonsultacia → C:\Program Files\DocUp.
    ${GetParent} "$LegacyDir" $1
    StrCpy $INSTDIR "$1\${APP_ID}"
  ${Else}
    MessageBox MB_ICONSTOP "${APP_NAME} не е инсталирана на този компютър.$\r$\n$\r$\nЗа първо инсталиране използвайте DocUp-Setup-${VERSION}.exe." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} $OldVersion == ""
    StrCpy $OldVersion "1.0.0"
  ${EndIf}
  ${VersionCompare} "$OldVersion" "${VERSION}" $1
  ${If} $1 == 1
    MessageBox MB_ICONINFORMATION "Инсталирана е по-нова версия ($OldVersion). Обновяването не е нужно." /SD IDOK
    SetErrorLevel 3
    Quit
  ${ElseIf} $1 == 0
    MessageBox MB_YESNO|MB_ICONQUESTION "Версия ${VERSION} вече е инсталирана. Да се инсталира ли отново?" /SD IDYES IDYES reinstall
    Quit
    reinstall:
  ${EndIf}
!else
  ; Първа инсталация на DocUp върху „Детска консултация“ — до старата папка.
  ReadRegStr $0 HKLM "${UNINST_KEY}" "InstallLocation"
  ${If} $0 == ""
  ${AndIf} $LegacyDir != ""
    ${GetParent} "$LegacyDir" $1
    StrCpy $INSTDIR "$1\${APP_ID}"
  ${EndIf}
  ; При обновяване с пълния инсталатор досегашните избори остават избрани.
  ${If} $OldVersion != ""
    ${If} $HadDesktop == 0
      SectionSetFlags ${SecDesktop} 0
    ${EndIf}
    ${If} $HadStartup == 0
      SectionSetFlags ${SecAutostart} 0
    ${EndIf}
    ${If} $HadFirewall == 0
      SectionSetFlags ${SecFirewall} 0
    ${EndIf}
  ${EndIf}
!endif
FunctionEnd

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
