# Lock Eyes Installers

Pre-built installers for Lock Eyes v0.1.0.

## Files

| Platform | File | Size |
|---|---|---|
| Windows | `Lock-Eyes-0.1.0-win-x64.exe` | 78 MB |
| macOS | `Lock-Eyes-0.1.0-mac.tar.gz.part-aa` + `.part-ab` | ~100 MB (split) |
| Linux | `Lock-Eyes-0.1.0-linux-x64.AppImage.part-aa` + `.part-ab` | ~106 MB (split) |

## Download & Assembly

### Windows
Just download and run `Lock-Eyes-0.1.0-win-x64.exe`.

### macOS
The tarball was split to fit GitHub's 100MB file limit. Reassemble and extract:

```bash
cat Lock-Eyes-0.1.0-mac.tar.gz.part-* > Lock-Eyes-0.1.0-mac.tar.gz
tar xzf Lock-Eyes-0.1.0-mac.tar.gz
# The .app will be in mac/Lock Eyes.app
```

### Linux
The AppImage was split to fit GitHub's 100MB file limit. Reassemble and run:

```bash
cat Lock-Eyes-0.1.0-linux-x64.AppImage.part-* > Lock-Eyes-0.1.0-linux-x64.AppImage
chmod +x Lock-Eyes-0.1.0-linux-x64.AppImage
./Lock-Eyes-0.1.0-linux-x64.AppImage
```

## Building from Source

To build all three installers yourself:

```bash
npm run build:all
```

This runs `scripts/build-all.sh` which:
1. Builds Vite production assets
2. Compiles Linux AppImage
3. Compiles Windows NSIS installer
4. Compiles macOS .app (DMG on macOS, tarball on Linux/Windows)

Output goes to `release/`.