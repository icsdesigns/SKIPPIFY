param(
    [Parameter(Mandatory = $false)]
    [string]$AppId = "com.skippify.app",

    [Parameter(Mandatory = $false)]
    [string]$AppName = "Skippify",

    [Parameter(Mandatory = $false)]
    [switch]$InstallMissing,

    # Las APK que se distribuyen por el canal de actualización tienen que ir
    # firmadas siempre con la misma clave de release; si no, Android rechaza la
    # actualización con INSTALL_FAILED_UPDATE_INCOMPATIBLE. Sólo se usa `debug`
    # para pruebas locales de usar y tirar.
    [Parameter(Mandatory = $false)]
    [ValidateSet("release", "debug")]
    [string]$BuildType = "release"
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[APK] $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Tool {
    param(
        [string]$CommandName,
        [string]$WingetId,
        [string]$FriendlyName
    )

    if (Test-Command $CommandName) {
        Write-Step "$FriendlyName detectado"
        return
    }

    if (-not $InstallMissing) {
        throw "$FriendlyName no está instalado. Ejecuta nuevamente con -InstallMissing para instalarlo automáticamente."
    }

    if (-not (Test-Command "winget")) {
        throw "winget no está disponible; instala manualmente $FriendlyName e inténtalo de nuevo."
    }

    Write-Step "Instalando $FriendlyName con winget..."
    winget install --id $WingetId --exact --silent --accept-source-agreements --accept-package-agreements | Out-Host

    if (-not (Test-Command $CommandName)) {
        throw "No se pudo detectar $FriendlyName tras la instalación. Cierra/reabre terminal e inténtalo otra vez."
    }

    Write-Step "$FriendlyName instalado correctamente"
}

$workspaceRoot  = Resolve-Path (Join-Path $PSScriptRoot "..")
$distDir        = Join-Path $workspaceRoot "dist"
$androidDir     = Join-Path $workspaceRoot "android"
$androidSrcDir  = Join-Path $workspaceRoot "android-src"
$javaPackageDir = Join-Path $androidDir "app\src\main\java\com\skippify\app"
$androidPublicDir = Join-Path $androidDir "app\src\main\assets\public"
$compressedAssetsDir = Join-Path $androidDir "app\build\intermediates\compressed_assets"
$packagedResDir = Join-Path $androidDir "app\build\intermediates\packaged_res"
$mergedResDir = Join-Path $androidDir "app\build\intermediates\merged_res"
$mergedResBlameDir = Join-Path $androidDir "app\build\intermediates\merged_res_blame_folder"
$assetsIntermediatesDir = Join-Path $androidDir "app\build\intermediates\assets"
# ─── Versión: una única fuente de verdad ───────────────────────────────────────
# Antes esto era una constante que había que acordarse de subir a mano, y se
# quedó desincronizada del manifiesto (versionCode 5 / versionName "3.1" con la
# app ya por la 3.4). Ahora manda package.json y de ahí sale todo.
$packageJson = Get-Content (Join-Path $workspaceRoot "package.json") -Raw | ConvertFrom-Json
$appVersion = $packageJson.version
if (-not ($appVersion -match '^\d+\.\d+\.\d+$')) {
    throw "La versión de package.json ('$appVersion') no es MAJOR.MINOR.PATCH; el canal de actualización la necesita así."
}

# El versionCode es el número de commits, no la versión semántica: Android sólo
# acepta actualizar a un versionCode ESTRICTAMENTE mayor, y así cada push genera
# uno nuevo sin tener que acordarse de subir la versión en package.json. Es
# monótono mientras no se reescriba la historia (nada de rebases sobre main).
$buildNumber = (& git -C $workspaceRoot rev-list --count HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $buildNumber) {
    throw "No se pudo contar los commits con git; el versionCode sale de ahí."
}
$appVersionCode = [int]$buildNumber

# La APK instalada antes de todo esto tenía versionCode 5. Si el contador de
# commits fuese menor, ningún móvil aceptaría la actualización y el fallo sería
# mudo, así que se comprueba aquí.
if ($appVersionCode -le 5) {
    throw "El versionCode calculado ($appVersionCode) no supera al de la APK ya instalada (5)."
}

$apkVersionLabel = "v$appVersion-b$appVersionCode"
$env:SKIPPIFY_APP_VERSION = $apkVersionLabel

$buildTypeCap = (Get-Culture).TextInfo.ToTitleCase($BuildType)   # release → Release

# Estos intermedios son los que Gradle deja bloqueados en Windows y hay que
# limpiar entre reintentos; sus rutas llevan el tipo de build en el nombre.
$mergeResourcesDir     = Join-Path $androidDir "app\build\intermediates\incremental\$BuildType\merge${buildTypeCap}Resources"
$mergeAssetsDir        = Join-Path $androidDir "app\build\intermediates\assets\$BuildType\merge${buildTypeCap}Assets"
$packageResourcesDir   = Join-Path $androidDir "app\build\intermediates\incremental\$BuildType\package${buildTypeCap}Resources"

# Ensure Node.js paths are available
foreach ($nodePath in @("C:\Program Files\nodejs", "$env:APPDATA\npm", "$env:ProgramFiles\nodejs")) {
    if ((Test-Path $nodePath) -and ($env:Path -notlike "*$nodePath*")) {
        $env:Path = "$nodePath;" + $env:Path
    }
}

# Ensure JDK 21 is in PATH
$jdk21Path = "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
if (Test-Path $jdk21Path) {
    $env:JAVA_HOME = $jdk21Path
    if (-not ($env:Path -like "*$jdk21Path\bin*")) {
        $env:Path = "$jdk21Path\bin;" + $env:Path
    }
}

Write-Step "Verificando dependencias base..."
Ensure-Tool -CommandName "node" -WingetId "OpenJS.NodeJS.LTS" -FriendlyName "Node.js LTS"
Ensure-Tool -CommandName "npm"  -WingetId "OpenJS.NodeJS.LTS" -FriendlyName "npm"
Ensure-Tool -CommandName "java" -WingetId "Microsoft.OpenJDK.21" -FriendlyName "JDK 21"

if (Test-Path $jdk21Path) {
    Write-Step "JAVA_HOME configurado a JDK 21"
}

# ─── 1. Install npm dependencies ───────────────────────────────────────────────
Write-Step "Instalando dependencias npm..."
Push-Location $workspaceRoot
npm install | Out-Host
Pop-Location

# ─── 2. Build Vue project with Vite ────────────────────────────────────────────
Write-Step "Compilando proyecto Vue con Vite..."
Write-Step "Versión de app para esta build: $env:SKIPPIFY_APP_VERSION"
Push-Location $workspaceRoot
npx vite build | Out-Host
Pop-Location

if (-not (Test-Path (Join-Path $distDir "index.html"))) {
    throw "La build de Vite falló: no se encontró dist/index.html"
}
Write-Step "Build de Vite completada"

# ─── 3. Add Android platform if not present ────────────────────────────────────
if (-not (Test-Path $androidDir)) {
    Write-Step "Creando proyecto Android (npx cap add android)..."
    Push-Location $workspaceRoot
    npx cap add android | Out-Host
    Pop-Location
}

# ─── 4. Sync web assets to Android ─────────────────────────────────────────────
Write-Step "Sincronizando proyecto Android (npx cap sync)..."
if (Test-Path $androidPublicDir) {
    Remove-Item -Path $androidPublicDir -Recurse -Force -ErrorAction SilentlyContinue
}
Push-Location $workspaceRoot
npx cap sync android | Out-Host
Pop-Location

# ─── 5. Inject native notification listener plugin ─────────────────────────────
# Se copia TODO lo que haya en android-src/. Antes había una lista escrita a
# mano y DuplicateSkipEngine.java se quedó fuera: el motor se editaba aquí y la
# APK seguía compilando la copia vieja de android/, con el desconcierto que eso
# supone. Un fichero nuevo no debería requerir acordarse de tocar este script.
$notifSrcFiles = Get-ChildItem -Path $androidSrcDir -Filter "*.java" -File |
    Sort-Object Name | ForEach-Object { $_.Name }

if (-not $notifSrcFiles -or $notifSrcFiles.Count -eq 0) {
    throw "No hay ningún .java en android-src/: la APK saldría sin el motor nativo."
}

foreach ($srcFile in $notifSrcFiles) {
    $src = Join-Path $androidSrcDir $srcFile
    $dst = Join-Path $javaPackageDir $srcFile
    Copy-Item -Path $src -Destination $dst -Force
    Write-Step "Copiado: $srcFile"
}
Write-Step "Fuentes nativas copiadas: $($notifSrcFiles.Count)"

# MainActivity.java tiene que estar sí o sí: es el punto de entrada y el que
# registra los plugins. Si falta, el fallo aparecería mucho más tarde.
if ($notifSrcFiles -notcontains "MainActivity.java") {
    throw "Falta MainActivity.java en android-src/."
}

# Recursos nativos propios (icono monocromo de la notificación persistente).
$androidSrcResDir = Join-Path $androidSrcDir "res"
if (Test-Path $androidSrcResDir) {
    $androidResDir = Join-Path $androidDir "app\src\main\res"
    Get-ChildItem -Path $androidSrcResDir -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($androidSrcResDir.Length).TrimStart('\')
        $target = Join-Path $androidResDir $relative
        $targetDir = Split-Path $target -Parent
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item -Path $_.FullName -Destination $target -Force
        Write-Step "Recurso copiado: $relative"
    }
}

# ─── 6. Patch MainActivity.java – register the plugin ──────────────────────────
$mainActivityPath = Join-Path $javaPackageDir "MainActivity.java"
$mainActivityContent = Get-Content $mainActivityPath -Raw
if ($mainActivityContent -notmatch "NotifListenerPlugin") {
    $importOld = 'import com\.getcapacitor\.BridgeActivity;'
    $importNew = "import android.os.Bundle;`nimport com.getcapacitor.BridgeActivity;"
    $classOld  = 'public class MainActivity extends BridgeActivity \{\}'
    $classNew  = "public class MainActivity extends BridgeActivity {`n    @Override`n    public void onCreate(Bundle savedInstanceState) {`n        registerPlugin(NotifListenerPlugin.class);`n        super.onCreate(savedInstanceState);`n    }`n}"
    $mainActivityContent = $mainActivityContent -replace $importOld, $importNew
    $mainActivityContent = $mainActivityContent -replace $classOld,  $classNew
    $mainActivityContent = $mainActivityContent -replace '^\xEF\xBB\xBF', '' -replace "^\uFEFF", ''
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($mainActivityPath, $mainActivityContent, $utf8NoBom)
    Write-Step "MainActivity.java parcheado con NotifListenerPlugin"
} else {
    Write-Step "MainActivity.java ya tiene NotifListenerPlugin"
}

# ─── 7. Patch AndroidManifest.xml ──────────────────────────────────────────────
$manifestPath    = Join-Path $androidDir "app\src\main\AndroidManifest.xml"
$manifestContent = Get-Content $manifestPath -Raw
$manifestChanged = $false

# FOREGROUND_SERVICE permissions
# Migración de un android/ ya generado con la forma antigua: se reescribe antes
# de comprobar nada para que no se quede con el tipo caducado.
if ($manifestContent -match 'FOREGROUND_SERVICE_DATA_SYNC') {
    $manifestContent = $manifestContent -replace 'FOREGROUND_SERVICE_DATA_SYNC', 'FOREGROUND_SERVICE_SPECIAL_USE'
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: permiso dataSync migrado a specialUse"
}
if ($manifestContent -match 'android:foregroundServiceType="dataSync"') {
    $manifestContent = $manifestContent -replace 'android:foregroundServiceType="dataSync"', 'android:foregroundServiceType="specialUse"'
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: servicio dataSync migrado a specialUse"
}

if ($manifestContent -notmatch 'FOREGROUND_SERVICE"') {
    $manifestContent = $manifestContent -replace '(<application)', "    <uses-permission android:name=`"android.permission.FOREGROUND_SERVICE`" />`n    <uses-permission android:name=`"android.permission.FOREGROUND_SERVICE_SPECIAL_USE`" />`n    `$1"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: permisos FOREGROUND_SERVICE añadidos"
} else {
    Write-Step "AndroidManifest.xml ya tiene permisos FOREGROUND_SERVICE"
}

# SpotifyNotificationListener service
if ($manifestContent -notmatch "SpotifyNotificationListener") {
    $nlServiceXml = @'

        <!-- Skippify: Spotify notification listener -->
        <service
            android:name=".SpotifyNotificationListener"
            android:label="@string/app_name"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
'@
    $manifestContent = $manifestContent -replace '</application>', "$nlServiceXml`n    </application>"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml parcheado con SpotifyNotificationListener"
} else {
    Write-Step "AndroidManifest.xml ya contiene SpotifyNotificationListener"
}

# SkippifyForegroundService
if ($manifestContent -notmatch "SkippifyForegroundService") {
    $fgServiceXml = @'

        <!--
          Skippify: servicio en primer plano. Mantiene vivo el proceso en OEMs
          agresivos y es donde corren las macros en segundo plano.

          El tipo es specialUse y no dataSync a propósito: desde Android 15 un
          servicio dataSync se para solo a las 6 horas de uso en cada ventana de
          24, lo que dejaría sin detección al motor de duplicadas media jornada.
          Ese tope alcanza a las apps que apuntan a API 35, así que hoy (target
          34) no nos toca, pero llegaría el día que subamos el target.
          specialUse no lo tiene. Suele exigir justificarlo ante la revisión de
          Google Play; Skippify se distribuye por releases de GitHub, así que
          ese trámite no aplica.
        -->
        <service
            android:name=".SkippifyForegroundService"
            android:foregroundServiceType="specialUse"
            android:exported="false">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Detecta la reproduccion de Spotify mediante NotificationListenerService para saltar duplicadas, silenciar anuncios y ejecutar las macros del usuario; necesita seguir activo mientras suena musica." />
        </service>
'@
    $manifestContent = $manifestContent -replace '</application>', "$fgServiceXml`n    </application>"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml parcheado con SkippifyForegroundService"
} else {
    Write-Step "AndroidManifest.xml ya contiene SkippifyForegroundService"
}

# Deep link OAuth de Spotify (pestaña Macros): la vuelta del navegador entra por
# skippify://spotify-auth y MainActivity la recoge en su intent.
if ($manifestContent -notmatch 'android:scheme="skippify"') {
    $authFilterXml = @'

            <!-- Skippify: retorno del login de Spotify (OAuth PKCE) -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="skippify" android:host="spotify-auth" />
            </intent-filter>
'@
    $manifestContent = $manifestContent -replace '(?s)(\r?\n\s*</activity>)', "$authFilterXml`$1"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml parcheado con el deep link de Spotify"
} else {
    Write-Step "AndroidManifest.xml ya contiene el deep link de Spotify"
}

# WAKE_LOCK: permite que el servicio termine una decisión de saltado aunque la
# pantalla se apague justo en ese instante.
if ($manifestContent -notmatch 'android.permission.WAKE_LOCK') {
    $manifestContent = $manifestContent -replace '(<uses-permission android:name="android.permission.INTERNET" />)', "`$1`n    <uses-permission android:name=`"android.permission.WAKE_LOCK`" />"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: permiso WAKE_LOCK añadido"
}

# REQUEST_INSTALL_PACKAGES: sin esto el plugin de actualización no puede abrir
# el instalador del sistema con la APK que acaba de descargar.
if ($manifestContent -notmatch 'android.permission.REQUEST_INSTALL_PACKAGES') {
    $manifestContent = $manifestContent -replace '(<uses-permission android:name="android.permission.INTERNET" />)', "`$1`n    <uses-permission android:name=`"android.permission.REQUEST_INSTALL_PACKAGES`" />"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: permiso REQUEST_INSTALL_PACKAGES añadido"
}

if ($manifestChanged) {
    $utf8NoBom2 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $manifestContent, $utf8NoBom2)
    Write-Step "AndroidManifest.xml actualizado en disco"
}

# ─── 7b. Versionado y firma en build.gradle ────────────────────────────────────
# `android/` se regenera en cada build, así que el versionCode y la firma se
# reinyectan aquí en vez de editarse a mano una sola vez.
$appGradlePath = Join-Path $androidDir "app\build.gradle"
$appGradle = Get-Content $appGradlePath -Raw

$appGradle = $appGradle -replace 'versionCode\s+\d+', "versionCode $appVersionCode"
$appGradle = $appGradle -replace 'versionName\s+"[^"]*"', "versionName `"$appVersion`""
Write-Step "build.gradle: versionCode $appVersionCode / versionName $appVersion"

if ($BuildType -eq "release") {
    # ── Resolución del keystore ────────────────────────────────────────────────
    # En CI llegan por variables de entorno (desde los secrets del repo); en
    # local, del fichero que genera scripts/create-keystore.ps1.
    $storeFile     = $env:SKIPPIFY_KEYSTORE_FILE
    $storePassword = $env:SKIPPIFY_KEYSTORE_PASSWORD
    $keyAlias      = $env:SKIPPIFY_KEY_ALIAS
    $keyPassword   = $env:SKIPPIFY_KEY_PASSWORD

    $localKeystoreProps = Join-Path $workspaceRoot "android-keystore.properties"
    if (-not $storeFile -and (Test-Path $localKeystoreProps)) {
        Get-Content $localKeystoreProps | ForEach-Object {
            if ($_ -match '^\s*([^#=]+)=(.*)$') {
                switch ($matches[1].Trim()) {
                    "storeFile"     { $storeFile     = $matches[2].Trim() }
                    "storePassword" { $storePassword = $matches[2].Trim() }
                    "keyAlias"      { $keyAlias      = $matches[2].Trim() }
                    "keyPassword"   { $keyPassword   = $matches[2].Trim() }
                }
            }
        }
    }

    if (-not $storeFile -or -not (Test-Path $storeFile)) {
        throw @"
No se encontró el keystore de release.

El canal de actualización automática exige firmar SIEMPRE con la misma clave:
una APK firmada con otra distinta la rechaza Android al actualizar.

Genera el tuyo una sola vez con:
    .\scripts\create-keystore.ps1

O compila sin canal de actualización con:
    .\scripts\build-apk.ps1 -BuildType debug
"@
    }

    # Gradle lee esto desde android/keystore.properties; se reescribe en cada
    # build porque la carpeta android/ es desechable.
    $gradleStorePath = (Resolve-Path $storeFile).Path.Replace('\', '/')
    $keystorePropsContent = @"
storeFile=$gradleStorePath
storePassword=$storePassword
keyAlias=$keyAlias
keyPassword=$keyPassword
"@
    $utf8NoBomKs = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $androidDir "keystore.properties"), $keystorePropsContent, $utf8NoBomKs)

    if ($appGradle -notmatch 'skippifyKeystoreProps') {
        $loaderSnippet = @'
apply plugin: 'com.android.application'

// Skippify: credenciales de firma para el canal de actualización automática.
// Las escribe build-apk.ps1 en android/keystore.properties (fuera de git).
def skippifyKeystoreProps = new Properties()
def skippifyKeystoreFile = rootProject.file("keystore.properties")
if (skippifyKeystoreFile.exists()) {
    skippifyKeystoreFile.withInputStream { skippifyKeystoreProps.load(it) }
}
'@
        $appGradle = $appGradle -replace "(?m)^apply plugin: 'com\.android\.application'\r?\n", "$loaderSnippet"

        $signingSnippet = @'
    signingConfigs {
        release {
            storeFile file(skippifyKeystoreProps['storeFile'])
            storePassword skippifyKeystoreProps['storePassword']
            keyAlias skippifyKeystoreProps['keyAlias']
            keyPassword skippifyKeystoreProps['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
'@
        $appGradle = $appGradle -replace "(?m)^    buildTypes \{\r?\n        release \{", $signingSnippet
        Write-Step "build.gradle parcheado con la configuración de firma de release"
    } else {
        Write-Step "build.gradle ya tiene la configuración de firma"
    }
}

$utf8NoBomGradle = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($appGradlePath, $appGradle, $utf8NoBomGradle)

# ─── 8. Configure Android SDK ──────────────────────────────────────────────────
$androidSdkRoot = "C:\Android\Sdk"
if (Test-Path $androidSdkRoot) {
    $env:ANDROID_HOME = $androidSdkRoot
    $env:ANDROID_SDK_ROOT = $androidSdkRoot
    # Sin BOM: `Set-Content -Encoding UTF8` lo añadía y Gradle leía la clave como
    # "﻿sdk.dir", así que la build sólo funcionaba si ANDROID_HOME estaba en
    # el entorno.
    $utf8NoBomSdk = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $androidDir "local.properties"), "sdk.dir=C\:/Android/Sdk`n", $utf8NoBomSdk)
    Write-Step "Android SDK configurado en $androidSdkRoot"
}

# ─── 9. Build APK ──────────────────────────────────────────────────────────────
$gradleWrapper = Join-Path $androidDir "gradlew.bat"
if (-not (Test-Path $gradleWrapper)) {
    throw "No se encontró gradlew.bat en $androidDir"
}

Write-Step "Compilando APK $BuildType..."
Push-Location $androidDir
$packageTmpDir = Join-Path $androidDir "app\build\intermediates\incremental\package$buildTypeCap\tmp"
$buildSucceeded = $false
$maxAttempts = 3

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
        & .\gradlew.bat --stop | Out-Host
        if (Test-Path $compressedAssetsDir) {
            Remove-Item -Path $compressedAssetsDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $packagedResDir) {
            Remove-Item -Path $packagedResDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergedResDir) {
            Remove-Item -Path $mergedResDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergedResBlameDir) {
            Remove-Item -Path $mergedResBlameDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergeResourcesDir) {
            Remove-Item -Path $mergeResourcesDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $assetsIntermediatesDir) {
            Remove-Item -Path $assetsIntermediatesDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergeAssetsDir) {
            Remove-Item -Path $mergeAssetsDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $packageResourcesDir) {
            Remove-Item -Path $packageResourcesDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $packageTmpDir) {
            Remove-Item -Path $packageTmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }

        & .\gradlew.bat "assemble$buildTypeCap" | Out-Host
        $buildSucceeded = $true
        break
    }
    catch {
        if ($attempt -ge $maxAttempts) {
            throw
        }

        Write-Host "[APK] Reintento $($attempt + 1)/$maxAttempts tras bloqueo temporal de packageDebug..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}
Pop-Location

if (-not $buildSucceeded) {
    throw "No se pudo completar assembleDebug tras varios intentos."
}

$sourceApk = Join-Path $androidDir "app\build\outputs\apk\$BuildType\app-$BuildType.apk"
if (-not (Test-Path $sourceApk)) {
    throw "No se generó app-$BuildType.apk"
}

$versionedApkName = "Skippify-$apkVersionLabel.apk"
$buildOutputDir = Join-Path $androidDir "app\build\outputs\apk\$BuildType"
$targetOutputApk = Join-Path $buildOutputDir $versionedApkName
$targetApk = Join-Path $distDir $versionedApkName

# Publish the versioned artifact in both output folders.
Copy-Item -Path $sourceApk -Destination $targetOutputApk -Force
Copy-Item -Path $sourceApk -Destination $targetApk -Force

# Keep only the versioned APK after each run.
if (Test-Path $sourceApk) {
    Remove-Item -Path $sourceApk -Force
}

# ─── 10. Manifiesto del canal de actualización ─────────────────────────────────
# La app lee esto de la release para saber si lo publicado es más nuevo que lo
# instalado. Va en un JSON aparte y no en el nombre del tag porque el versionCode
# es lo único que Android compara de verdad.
$updateManifest = [ordered]@{
    versionCode = $appVersionCode
    versionName = $appVersion
    apk         = $versionedApkName
    size        = (Get-Item $targetApk).Length
    commit      = (& git -C $workspaceRoot rev-parse --short HEAD 2>$null)
    builtAt     = (Get-Date).ToUniversalTime().ToString("o")
}
$manifestJsonPath = Join-Path $distDir "latest.json"
[System.IO.File]::WriteAllText(
    $manifestJsonPath,
    ($updateManifest | ConvertTo-Json),
    (New-Object System.Text.UTF8Encoding($false))
)
Write-Step "Manifiesto de actualización: $manifestJsonPath"

Write-Step "APK creada: $targetApk"
Write-Host ""
Write-Host "Instala con: adb install -r `"$targetApk`"" -ForegroundColor Green
