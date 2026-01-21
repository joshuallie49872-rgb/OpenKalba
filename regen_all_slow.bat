@echo off
setlocal

REM Run from OpenKalba root. This regenerates ONLY slow audio (keeps normal MP3s).
REM It deletes * __slow.mp3 and manifest_slow.json for each language, then rebuilds.

set LANGS=de es et fi fr is lt lv mx no pl ru se uk

for %%L in (%LANGS%) do (
  echo.
  echo ==========================================
  echo Rebuilding SLOW audio for %%L
  echo ==========================================

  if exist "audio\%%L" (
    del /q "audio\%%L\*__slow.mp3" 2>nul
  )

  if exist "courses\%%L\audio\manifest_slow.json" (
    del /q "courses\%%L\audio\manifest_slow.json" 2>nul
  )

  node generate_audio.js --lang %%L

  if errorlevel 1 (
    echo ❌ ERROR while generating %%L. Stopping.
    exit /b 1
  )
)

echo.
echo ✅ All slow audio regenerated.
endlocal
