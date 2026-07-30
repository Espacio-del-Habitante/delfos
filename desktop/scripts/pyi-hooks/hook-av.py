# Override del hook contrib: en este venv `av` a veces no tiene metadata
# (importlib.metadata.version('av') -> None) y is_module_satisfies revienta.
# ponytail: asumimos wheel moderno de Windows con av.libs (av >= 9.1.1).

import os

from PyInstaller.compat import is_win
from PyInstaller.utils.hooks import collect_submodules, get_package_paths

hiddenimports = ["fractions", "dataclasses", "uuid"] + collect_submodules("av")

datas = []
if is_win:
    pkg_base, _pkg_dir = get_package_paths("av")
    lib_dir = os.path.join(pkg_base, "av.libs")
    if os.path.isdir(lib_dir):
        datas = [(os.path.join(lib_dir, name), "av.libs") for name in os.listdir(lib_dir)]
