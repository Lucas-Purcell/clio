# Clio – Figure Explorer for JupyterLab

Clio is a JupyterLab extension for browsing, searching, comparing, exporting, and returning to PNG figures generated in open Jupyter notebooks.

Notebook work can quickly produce more plots than are practical to revisit one cell at a time. Clio gathers figures from your open notebooks into a dedicated gallery, keeps that gallery synchronized as notebook outputs change, and lets you return directly to the cell that generated any figure.

## Installation

For users, install the prebuilt Python package:

```bash
pip install clio-jupyter
```

Restart JupyterLab after installation. Clio supports JupyterLab 4.

For development, install the workspace dependencies and run:

```bash
yarn build:jupyterlab
```

## Features

- Automatically discovers PNG figures from open notebooks.
- Tracks figures across the current notebook or all open notebooks.
- Displays open notebooks and their figures in the Clio left sidebar.
- Opens the gallery in the main area, a JupyterLab side panel, or a separate browser window.
- Searches figure titles, notebook names, tags, and source code.
- Filters by extracted tags and by titled or untitled figures.
- Shows source code and a larger preview for the selected figure.
- Zooms and pans previews and comparison views.
- Supports multi-selection, shift-range selection, drag selection, and arrow-key navigation.
- Compares selected figures side by side.
- Saves one or more figures as PNG, exports them as PDF, and copies individual images.
- Reveals the source cell from the preview, a context action, or a double-clicked thumbnail.

## Gallery

Use the Command Palette to open one of the following commands:

- `Clio: Open Gallery as Tab`
- `Clio: Open Gallery in Side Panel`
- `Clio: Open Gallery in New Window`
- `Clio: Refresh Gallery`

The regular gallery shows the thumbnails above the preview in a side panel. The separate-window gallery uses a wider layout with the preview and thumbnails beside each other. The gallery updates while notebooks are opened, edited, executed, or closed.

## Figure titles and tags

Add a title as the first non-empty line of a notebook cell:

```python
# figure: Residual distribution

plt.hist(residuals)
plt.show()
```

Add tags with a comma-separated comment:

```python
# figure: Residual distribution
# tags: residuals, metallicity, final

plt.hist(residuals)
plt.show()
```

For cells that produce multiple PNG figures, give each one a title in output order:

```python
# figure: Input distribution, Model fit, Residuals
```

When there is one title, Clio applies it to every figure from that cell. With multiple titles, each title is used once; any remaining figures are left untitled.

Titles and tags are displayed throughout Clio. Select a tag beneath a preview to add it to the active filters.

## Requirements and limitations

- JupyterLab 4.x
- Jupyter notebooks (`.ipynb`)
- PNG image outputs

Clio currently indexes PNG outputs. Other image formats and rich output types are not yet indexed.

## Feedback

Bug reports and feature requests are welcome at [GitHub Issues](https://github.com/Lucas-Purcell/clio/issues). Please include the Clio version, JupyterLab version, browser, operating system, steps to reproduce, and screenshots when useful.

## License

Clio is released under the [MIT License](LICENSE).
