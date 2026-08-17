from pathlib import Path

from setuptools import setup


PACKAGE_NAME = "@clio/jupyter"
LABEXTENSION = Path("labextension")

data_files = []
for asset in LABEXTENSION.rglob("*"):
    if asset.is_file():
        relative_parent = asset.relative_to(LABEXTENSION).parent
        destination = Path("share/jupyter/labextensions") / PACKAGE_NAME / relative_parent
        data_files.append((str(destination), [str(asset)]))

setup(include_package_data=False, data_files=data_files)
