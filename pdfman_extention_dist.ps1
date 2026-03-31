param(
    [switch]$NoBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManifestPath = Join-Path $Root 'manifest.json'
$PackageJsonPath = Join-Path $Root 'package.json'
$DistRoot = Join-Path $Root 'dist\chrome-webstore'

$FilesToCopy = @(
    'background.js',
    'manager.css',
    'manager.html',
    'manager.js',
    'manifest.json',
    'pdf-raster-worker.js'
)

$DirsToCopy = @(
    'icons',
    'lib'
)

function Get-PackageVersion {
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        throw 'manifest.json was not found.'
    }

    $manifest = Get-Content -Path $ManifestPath -Raw | ConvertFrom-Json
    $version = [string]$manifest.version
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw 'manifest.json does not contain a valid version.'
    }

    return $version.Trim()
}

function Get-PackageName {
    $defaultName = 'pdfman-extension'

    if (-not (Test-Path -LiteralPath $PackageJsonPath -PathType Leaf)) {
        return $defaultName
    }

    try {
        $package = Get-Content -Path $PackageJsonPath -Raw | ConvertFrom-Json
        $name = [string]$package.name
        if ([string]::IsNullOrWhiteSpace($name)) {
            return $defaultName
        }
        return $name.Trim()
    }
    catch {
        return $defaultName
    }
}

function Ensure-SourcesExist {
    $missing = @()

    foreach ($rel in $FilesToCopy) {
        $path = Join-Path $Root $rel
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $missing += $rel
        }
    }

    foreach ($rel in $DirsToCopy) {
        $path = Join-Path $Root $rel
        if (-not (Test-Path -LiteralPath $path -PathType Container)) {
            $missing += $rel
        }
    }

    if ($missing.Count -gt 0) {
        throw ('Missing required sources: ' + ($missing -join ', '))
    }
}

function Prepare-DistFolder {
    param(
        [string]$TargetDir
    )

    New-Item -ItemType Directory -Path $DistRoot -Force | Out-Null
    if (Test-Path -LiteralPath $TargetDir) {
        Remove-Item -Path $TargetDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

function Copy-ExtensionFiles {
    param(
        [string]$TargetDir
    )

    foreach ($rel in $FilesToCopy) {
        $src = Join-Path $Root $rel
        $dst = Join-Path $TargetDir $rel
        $dstParent = Split-Path -Parent $dst
        if ($dstParent) {
            New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
        }
        Copy-Item -Path $src -Destination $dst -Force
    }

    foreach ($rel in $DirsToCopy) {
        $src = Join-Path $Root $rel
        $dst = Join-Path $TargetDir $rel
        Copy-Item -Path $src -Destination $dst -Recurse -Force
    }
}

function Build-Zip {
    param(
        [string]$TargetDir,
        [string]$ZipPath
    )

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $ZipPath) {
        Remove-Item -Path $ZipPath -Force
    }

    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $TargetDir,
        $ZipPath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
}

Push-Location $Root
try {
    if (-not $NoBuild) {
        Write-Host 'Running npm build...'
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw 'Command failed: npm run build'
        }
    }

    Ensure-SourcesExist
    $version = Get-PackageVersion
    $packageName = Get-PackageName

    $packageFolderName = "$packageName-v$version"
    $targetDir = Join-Path $DistRoot $packageFolderName
    $zipPath = Join-Path $DistRoot ("$packageFolderName.zip")

    Write-Host "Preparing dist folder: $targetDir"
    Prepare-DistFolder -TargetDir $targetDir

    Write-Host 'Copying extension files...'
    Copy-ExtensionFiles -TargetDir $targetDir

    Write-Host "Creating zip: $zipPath"
    Build-Zip -TargetDir $targetDir -ZipPath $zipPath

    $zipSize = (Get-Item -Path $zipPath).Length
    Write-Host 'Package created successfully.'
    Write-Host "Folder: $targetDir"
    Write-Host "Zip: $zipPath"
    Write-Host "Size: $zipSize bytes"
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    Pop-Location
}