# Clio

Clio is a figure gallery for Jupyter notebooks. It gathers PNG figures from open notebooks into a searchable workspace where you can preview, compare, export, and return to the cell that created each plot.

Clio is available in two forms:

- **VS Code:** Clio – Figure Explorer, distributed through the VS Code Marketplace.
- **JupyterLab:** `clio-jupyter`, distributed as a prebuilt JupyterLab 4 extension through PyPI.

## Features

- Browse figures from the active notebook or all open notebooks.
- Search and filter by notebook, title, tag, and source code.
- Zoom, pan, compare, select, export, and copy figures.
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

## License

Clio is released under the MIT License.
