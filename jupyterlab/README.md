# CLIO — Cross-notebook Library for Images and Outputs

## Figure Explorer for JupyterLab

Clio is a JupyterLab extension for browsing, searching, comparing, exporting, and returning to PNG, JPEG, WebP, and SVG figures generated in Jupyter notebooks.

Notebook work can quickly produce more plots than are practical to revisit one cell at a time. Clio gathers figures from your open notebooks into a dedicated gallery, keeps that gallery synchronized as notebook outputs change, and lets you return directly to the cell that generated any figure.

## Installation

For users, install the prebuilt Python package:

```bash
pip install clio-jupyter
```

Restart JupyterLab after installation. Clio supports JupyterLab 4.

For development, build and install the complete prebuilt extension from the
repository root. Activate the same Python environment that runs JupyterLab,
then run:

```bash
corepack yarn install
corepack yarn package:jupyterlab
python -m pip install --force-reinstall --no-deps python/dist/clio_jupyter-0.1.17-py3-none-any.whl
jupyter lab
```

Do not use `pip install -e python` for frontend testing in this repository.
That editable Python install does not copy the prebuilt JupyterLab assets and
can leave an older or empty Clio frontend registered. Rebuild and reinstall
the wheel after changing JupyterLab or shared code, then fully restart the
JupyterLab server and refresh the browser.

## Features

- Automatically discovers PNG, JPEG, WebP, and SVG figures from open notebooks.
- Tracks figures across the current notebook or all open notebooks.
- Stars important figures in a persistent browser-local collection. Stars from closed notebooks keep their metadata and become fully available after the notebook is reopened or rescanned.
- Displays open notebooks and their figures in the Clio left sidebar.
- Opens the gallery in the main area, a JupyterLab side panel, or a separate browser window.
- Searches figure titles, notebook names, tags, and source code.
- Supports qualified searches including `title:`, `tag:`/`tags:`, `code:`, `cell:`, and `figure:`.
- Updates titles and tags in the gallery as soon as their metadata comments are edited, without reloading figure images.
- Filters by extracted tags and by titled or untitled figures.
- Shows source code and a larger preview for the selected figure.
- Zooms and pans previews and comparison views, with Focus Figure for expanding a selected plot to the full Clio panel.
- Supports multi-selection, shift-range selection, drag selection, and arrow-key navigation.
- Applies save, PDF export, and star/unstar actions to the complete thumbnail selection.
- Compares selected figures side by side.
- Customizes Gallery controls with icon-only or labeled buttons, small/medium/large fixed thumbnails, and automatic, grid, or stacked comparison layouts.
- Keeps Gallery controls and their dropdown menus within narrow or resized panels.
- Saves one or more figures in their original format, exports them as PDF, and copies individual images as PNG.
- Reveals the source cell from the preview, a context action, or a double-clicked thumbnail.
- Builds session-only figure history as cells are rerun. Use the preview clock to browse and compare earlier versions in the side panel, tab, or separate window; history resets when the JupyterLab page closes.
- Right-click a history version to view or copy its captured cell source, or safely restore it to the original cell with normal notebook Undo support. Restoring code never runs the cell automatically.

## Gallery

Use the Command Palette to open one of the following commands:

- `Clio: Open Gallery as Tab`
- `Clio: Open Gallery in Side Panel`
- `Clio: Open Gallery in New Window`
- `Clio: Refresh Gallery`

The regular gallery shows the thumbnails above the preview in a side panel. The separate-window gallery uses a wider layout with the preview and thumbnails beside each other. Use the Focus Figure control over a preview or comparison figure to temporarily use the entire Clio panel; press Escape to return. The gallery updates while notebooks are opened, edited, executed, closed, or switched while using This notebook mode.

Use the Gallery ⚙ button to change the button style, thumbnail size, and comparison layout. JupyterLab saves these preferences in the browser and shares them with Clio's tab, side-panel, and external-window galleries.

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

For cells that produce multiple figures, give each one a title in output order:

```python
# figure: Input distribution, Model fit, Residuals
```

When there is one title, Clio applies it to every figure from that cell. With multiple titles, each title is used once; any remaining figures are left untitled.

Titles and tags are displayed throughout Clio. Select a tag beneath a preview to add it to the active filters.

## Requirements and limitations

- JupyterLab 4.x
- Jupyter notebooks (`.ipynb`)
- PNG, JPEG, WebP, or SVG image outputs

When a notebook output contains several representations of the same image, Clio selects one preferred supported representation so it appears only once.

## Feedback

Bug reports and feature requests are welcome at [GitHub Issues](https://github.com/Lucas-Purcell/clio/issues). Please include the Clio version, JupyterLab version, browser, operating system, steps to reproduce, and screenshots when useful.

## License

Clio is released under the [MIT License](LICENSE).
