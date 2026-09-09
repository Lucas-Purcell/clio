# CLIO — Cross-notebook Library for Images and Outputs

## Figure Explorer for JupyterLab

Clio collects PNG, JPEG, WebP, and SVG figures from open Jupyter notebooks into a searchable, comparable, and exportable gallery. It provides a notebook sidebar, gallery views in the main area or side panel, and an optional separate browser window for a second monitor.

## Installation

```bash
pip install clio-jupyter
```

Restart JupyterLab after installation. Use the Command Palette to run `Clio: Open Gallery as Tab`.

Clio is a prebuilt JupyterLab 4 extension: end users do not need Node.js or a local extension build.

## Highlights

- Discovers PNG, JPEG, WebP, and SVG figures from all open notebooks.
- Searches and filters by title, notebook, tag, and source code, including `title:`, `tag:`/`tags:`, `code:`, `cell:`, and `figure:` queries.
- Keeps a persistent starred collection, including metadata for figures whose notebooks are currently closed.
- Keeps earlier runs of changed figures in a session-only history for browsing, comparison, copying, and export. History resets when the JupyterLab page closes.
- Lets you view, copy, or safely restore the cell source captured with a historical plot version. Restoration is undoable and never runs the cell automatically.
- Supports zoomable previews, Focus Figure, multi-selection, comparison mode, keyboard navigation, and cell reveal.
- Applies save, PDF export, and star/unstar actions to the complete thumbnail selection.
- Saves original image formats, exports PDFs, and copies images as PNG.

For developer documentation, see the [JupyterLab extension source](https://github.com/Lucas-Purcell/clio/tree/main/jupyterlab). For release history, see the [Clio JupyterLab changelog](https://github.com/Lucas-Purcell/clio/blob/main/python/CHANGELOG.md).

## License

Clio is released under the MIT License.
