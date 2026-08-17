# Clio – Figure Explorer for JupyterLab

Clio collects PNG figures from open Jupyter notebooks into a searchable, comparable, and exportable gallery. It provides a notebook sidebar, gallery views in the main area or side panel, and an optional separate browser window for a second monitor.

## Installation

```bash
pip install clio-jupyter
```

Restart JupyterLab after installation. Use the Command Palette to run `Clio: Open Gallery as Tab`.

Clio is a prebuilt JupyterLab 4 extension: end users do not need Node.js or a local extension build.

## Highlights

- Discovers PNG figures from all open notebooks.
- Searches and filters by title, notebook, tag, and source code.
- Supports zoomable previews, multi-selection, comparison mode, keyboard navigation, and cell reveal.
- Saves PNG files, exports PDFs, and copies images.

For developer documentation, see the [JupyterLab extension source](https://github.com/Lucas-Purcell/clio/tree/main/jupyterlab). For release history, see the [Clio JupyterLab changelog](https://github.com/Lucas-Purcell/clio/blob/main/python/CHANGELOG.md).

## License

Clio is released under the MIT License.
