# Local Android preview: build setup and verification status

## Latest build result: blocked by NDK download

The release build was attempted using JDK 17 and preview environment settings.
It failed during installation of NDK 27.1.12297006: the downloaded archive was
not a valid ZIP. SDK Manager retries returned HTTP 502 for Google's package
index. A direct archive GET also stalled; a small ranged GET timed out with
zero bytes. No release APK was generated, so its certificate, size and final
manifest remain unverified. No phone was connected.

Next prerequisite: install NDK (Side by side) 27.1.12297006 through Android
Studio > SDK Manager > SDK Tools > Show Package Details once repository
downloads work. Then rerun the documented release command, inspect the APK,
and compare against the connected phone before recommending an update.

## Follow-up: native project generated and signing configured

Android has now been generated without --clean. The ignored
`android/app/build.gradle` applies `scripts/android-preview-signing.gradle`.
That script reads the existing ignored credentials.json into Gradle memory,
requires the preview environment flag, and assigns the EAS keystore to release.
It contains no passwords. If Android is regenerated, reapply this line at the
end of android/app/build.gradle before building:

```groovy
apply from: rootProject.file('../scripts/android-preview-signing.gradle')
```

Current generated package is com.ajaydmja.lifepilot, versionName 1.0.0,
versionCode 1. No phone was connected; update compatibility is unverified.
Use the confirmed local JDK in the build terminal:

```powershell
$env:JAVA_HOME = 'C:\Java\microsoft-jdk-17.0.20.1-windows-x64\jdk-17.0.20.1+1'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:EXPO_PUBLIC_APP_VARIANT = 'preview'
.\android\gradlew.bat -p android :app:assembleRelease
```

The original inspection below is historical; credential retrieval, JDK location,
native generation and signing integration have since been resolved. Successful
APK generation and certificate/version verification are still required.

No APK has been built or approved for installation. Do not uninstall LifePilot,
clear storage, generate a replacement key, or install a debug-signed build over
the existing app.

## Inspection (2026-09-18)

- Expo SDK 57 / React Native 0.86.3; managed/CNG project, no android directory.
- Resolved application package: `com.ajaydmja.lifepilot`.
- EAS project/account and remote version management remain unchanged.
- Active Java is 15.0.2, JAVA_HOME and ANDROID_HOME are unset.
- SDK exists at `%LOCALAPPDATA%\Android\Sdk`; platform 36 and build tools
  36.0.0 are installed. adb works by absolute path; no device was connected.
- Installed NDK is 28.2.13676358; the installed RN version catalog requests
  27.1.12297006. CMake 3.22.1 is installed.
- Installed Expo template uses Gradle 9.3.1; RN catalog specifies AGP 8.12.0.
  Use a compatible JDK (17 is the minimum), not the active Java 15. Keep the
  project-provided Gradle/AGP versions. No global Gradle installation is needed.
- No project-local credentials or tracked signing files were found.

## Required interactive step

From the project directory run `eas credentials -p android`. Choose preview,
then `Credentials.json: Upload/Download credentials between EAS servers and your
local json`, then `Download credentials from EAS to credentials.json`.
Authenticate with the existing EAS account if prompted. Download the existing
credentials only; stop if asked to create or replace a keystore.

`credentials.json`, `*.jks`, `*.keystore`, and `/.local-credentials/` are ignored.
Keep the downloaded files local, verify their actual paths with `git check-ignore`,
and never paste their contents into chat, documentation, or tracked files.
Git ignore is not encryption or access control.

## Build workflow after prerequisites are verified

Use Windows native Gradle, not `eas build --local` (Windows is unsupported).
No WSL/Docker or development-client dependency is needed for a standalone APK.

1. Select a compatible JDK, set JAVA_HOME and ANDROID_HOME for the build shell,
   and install the exact missing SDK/NDK components without changing project versions.
2. Set `$env:EXPO_PUBLIC_APP_VARIANT = 'preview'` before generation and bundling.
   Gradle does not load eas.json preview environment settings automatically.
3. Generate Android with `npx expo prebuild --platform android --no-install`;
   do not use `--clean`. Review the resulting package and tracked diff.
4. Configure release signing to consume the downloaded EAS credentials locally,
   with no passwords in tracked files or command-line arguments. This integration
   has NOT been implemented yet. Plain Gradle does not automatically consume
   credentials.json. The stock template signs release with the DEBUG key.
5. Read the installed app's versionCode and use a compatible local versionCode
   (at least the installed code). app.json has none; EAS stores it remotely and
   plain prebuild/Gradle does not synchronize it. Do not bypass downgrade checks.
6. Re-run TypeScript, Tasks regression tests, and git diff --check.
7. Only after signing and version configuration are verified, from project root:

   ```powershell
   $env:EXPO_PUBLIC_APP_VARIANT = 'preview'
   Push-Location android
   try { .\gradlew.bat :app:assembleRelease } finally { Pop-Location }
   ```

Expected output: `android/app/build/outputs/apk/release/app-release.apk`.
This is a release native variant with preview JavaScript behavior and embedded
JS/assets; it should not need Metro. No npm shortcut is provided until the
signing integration is implemented and tested.

## Required verification before any manual update

Connect/authorize the phone and use adb read-only commands:
`adb shell dumpsys package com.ajaydmja.lifepilot` (versionCode) and
`adb shell pm path com.ajaydmja.lifepilot` (installed APK location).
Pull the returned base APK to a local ignored directory. This copies the APK,
not the private database or photos, and is not a user-data backup.

Use SDK build-tools `apksigner.bat verify --print-certs` on both installed and
new APK files. Verify the signatures and compare signer SHA-256 certificate
fingerprints. Inspect the new APK package/version with `aapt.exe dump badging`.
Do not print or share private keys/passwords. Mismatches or missing evidence
block an update recommendation; signing-key rotation requires separate review.

The v8-to-v9 migration adds Tasks tables/indexes/seeds transactionally; automated
preservation/rollback tests pass. This does not establish the phone's actual DB
state or replace device testing. A compatible Android update normally preserves
app-private files, but package/signature/version and migration must all be checked.
Installation remains the user's action after review; no install command is automated.

## References

- https://docs.expo.dev/versions/v57.0.0/
- https://docs.expo.dev/build-reference/local-builds/
- https://docs.expo.dev/app-signing/syncing-credentials/
- https://docs.expo.dev/guides/local-app-production/
