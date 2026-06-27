# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['play_logh7.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    hiddenimports=['tools.logh7_launch_config', 'tools.logh7_client_exe'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['numpy', 'scipy', 'pandas', 'pyarrow', 'torch', 'cv2', 'numba', 'matplotlib', 'llvmlite', 'PIL', 'sympy', 'IPython'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='play-logh7',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
