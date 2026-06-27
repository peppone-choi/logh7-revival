#!/bin/bash
set -u
GH="C:/Users/user/AppData/Local/Programs/Ghidra/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat"
PROJ="C:/Users/user/AppData/Local/Temp/logh7gh/proj"
SCR="C:/Users/user/AppData/Local/Temp/logh7gh/scripts"
R="E:/logh7-revival/.omo/ghidra"
cp /e/logh7-revival/tools/ghidra_scripts/Logh7FullExport.java "$SCR/"
run() {
  name="$1"; src="$2"; out="$3"
  echo "===== EXPORT $name -> $out ($(date +%T)) ====="
  cp "$src" "/e/logh7-revival/.omo/ghidra/bin/$name" 2>&1
  mkdir -p "/e/logh7-revival/.omo/ghidra/export/$out"
  "$GH" "$PROJ" logh7full -import "$R/bin/$name" -overwrite -scriptPath "$SCR" \
    -postScript Logh7FullExport.java "$R/export/$out" 2>&1 | grep -iE "exporting|functions |strings=|imports=|pointer-target|DONE|ERROR|Import succeeded" | tail -8
}
run BootFirst.exe       /e/logh7-revival/.omo/work/logh7-installed/BootFirst.exe        BootFirst
run setup.exe           /e/logh7-revival/.omo/work/logh7-iso-root/setup.exe             setup
run G7Start.exe         /e/logh7-revival/.omo/work/logh7-installed/G7Start.exe          G7Start
run Gin7UpdateClient.exe /e/logh7-revival/.omo/work/logh7-installed/Gin7UpdateClient.exe Gin7UpdateClient
run G7MTClient.exe      /e/logh7-revival/.omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer G7MTClient
echo "ALL EXPORTS DONE $(date +%T)"
