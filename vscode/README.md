# Clio – Figure Explorer for VS Code

Clio gathers PNG figures generated in Jupyter notebooks into a searchable gallery in VS Code. Browse figures from the current notebook or every open notebook, inspect a larger preview, compare plots, and return directly to the source cell.

## Install

Install **Clio – Figure Explorer** from the VS Code Marketplace, then open a Jupyter notebook. Clio appears in the Activity Bar and automatically indexes PNG notebook outputs as the notebook is opened, edited, or executed.

To install a downloaded release manually, run:

```bash
code --install-extension clio-figure-explorer-0.1.14.vsix
```

## Features

- Browse figures from the active notebook or all open notebooks.
- Search titles, notebook names, tags, source code, and figure metadata.
- Add `# figure:` titles and `# tags:` metadata in notebook cells.
- Open the gallery in the Clio sidebar or as an editor tab, which can be moved to another VS Code window for a second monitor.
- Zoom and pan figure previews and comparison views.
- Select multiple figures with click, Shift-click, drag selection, and keyboard navigation.
- Compare selected figures side by side.
- Save PNG files, export PDF files, copy images, and reveal the source cell.

## Figure titles and tags

Use a title in the first non-empty line of a cell:

```python
# figure: Residual distribution

plt.hist(residuals)
plt.show()
```

Use a comma-separated tag comment to make figures easier to filter:

```python
# figure: Residual distribution
# tags: residuals, metallicity, final
```

For a cell with multiple PNG outputs, provide titles in output order:

```python
# figure: Input distribution, Model fit, Residuals
```

One title is applied to every figure from the cell. When there are fewer titles than figures, the remaining figures are untitled.

## Commands

- `Clio: Scan Notebook`
- `Clio: Open Gallery`
- `Clio: Open Gallery in Editor`
- `Clio: Reveal Cell`

## License

Clio is released under the MIT License.
