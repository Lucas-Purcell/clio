# CLIO — Cross-notebook Library for Images and Outputs

Clio is a figure gallery for Jupyter notebooks. It gathers PNG, JPEG, WebP, and SVG figures into a searchable workspace where you can preview, compare, star, export, and return to the cell that created each plot.

Clio is available in two forms:

- **VS Code:** Clio – Figure Explorer, distributed through the VS Code Marketplace.
- **JupyterLab:** `clio-jupyter`, distributed as a prebuilt JupyterLab 4 extension through PyPI.

## Features

- Browse figures from the active notebook, all open notebooks, or a persistent starred collection.
- Search and filter by notebook, title, tag, and source code.
- Use qualified searches such as `title:`, `tag:`/`tags:`, `code:`, `cell:`, and `figure:`.
- Zoom, pan, compare, select, star, export in the original format or PDF, and copy figures as PNG.
- Apply save/export and star/unstar actions to an entire multi-selection in either host.
- Browse and compare session-only figure history captured whenever a cell rerun changes a plot.
- View, copy, or restore the cell code associated with a historical plot version; restoration is undoable and never runs the cell automatically.
- Reveal the source cell from a figure preview.
- Use the gallery in a side panel, editor/tab, or separate window where supported.

## Install

### VS Code

Install **Clio – Figure Explorer** from the VS Code Marketplace, or install a downloaded `.vsix` release.

### JupyterLab

```bash
pip install clio-jupyter
```

Restart JupyterLab after installation.

## Tutorial notebooks

The self-contained [tutorial notebooks](examples/README.md) demonstrate the
complete Clio workflow in either host: quick discovery, metadata and search,
then comparison and export. They use NumPy and Matplotlib; open them, run all
cells, and use Clio to explore the generated figures.

## Development

This monorepo contains platform-independent logic in `shared/`, the VS Code extension in `vscode/`, and the JupyterLab extension in `jupyterlab/`. See the platform-specific READMEs for development and release details.

To test current JupyterLab source, activate the Python environment used to
launch JupyterLab and install a freshly built wheel rather than using an
editable Python install:

```bash
corepack yarn install
corepack yarn package:jupyterlab
python -m pip install --force-reinstall --no-deps python/dist/clio_jupyter-0.1.17-py3-none-any.whl
jupyter lab
```

## License

Clio is released under the MIT License.
