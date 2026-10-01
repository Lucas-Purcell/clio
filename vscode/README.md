# CLIO — Cross-notebook Library for Images and Outputs

## Figure Explorer for VS Code

Clio gathers PNG, JPEG, WebP, and SVG figures from Jupyter notebooks, plus PNG, JPEG, WebP, SVG, GIF, and PDF files from scanned image sources, into a searchable gallery in VS Code. Browse the current notebook, scanned sources, or your starred collection; inspect a larger preview, compare plots, and return directly to a notebook cell or open a saved image.

## Install

Install **Clio – Figure Explorer** from the VS Code Marketplace, then open a Jupyter notebook. Clio appears in the Activity Bar and automatically indexes supported notebook image outputs as the notebook is opened, edited, or executed.

To install a downloaded release manually, run:

```bash
code --install-extension clio-figure-explorer-0.1.23.vsix
```

## Features

- Browse figures from the active notebook, all scanned sources, or any chosen combination of notebooks and image folders. Use the Gallery source dropdown to check or uncheck sources without closing it, with All sources and None shortcuts.
- Scan one or several notebook files from the command palette without opening tabs. Manually scanned notebooks remain in Clio for the current VS Code session until removed with the × action on their explorer row.
- Run **Clio: Scan Folder** to recursively include PNG, JPEG, WebP, SVG, GIF, and PDF files in a folder and its subfolders. Clio asks before loading more than 200 files. Use **Clio: Scan Images** for individual files. GIF thumbnails are still images; their previews remain animated. PDFs show their first page in Clio while the original PDF can be opened or saved. These manually added sources last only for the current VS Code session; remove or rescan them from the Clio explorer.
- Use the **Scan** dropdown beside Filters in either Gallery view to add notebooks, individual images, or folders without opening the Command Palette.
- Saved images appear under their folder or **Individual images** in the explorer and in the Gallery source picker. The reveal/open action opens the original image as an editor tab.
- Star important figures from the toolbar or directly on Gallery thumbnails in the sidebar or editor tab, then return to them through the persistent Starred scope. Closed-notebook stars retain their metadata and become fully available when the notebook is reopened or rescanned.
- Re-run a figure-producing cell to build a session-only version history. Use the clock over its preview to browse earlier runs, compare versions, or export them; history resets when VS Code closes.
- Right-click a history version to view or copy its captured cell source, or safely restore it to the original cell with normal editor Undo support. Restoring code never runs the cell automatically.
- Search titles, notebook names, tags, source code, and figure metadata.
- Use qualified searches such as `title:rotation curve`, `tag:draft`, `tags:draft`, `code:scatter`, `cell:4`, and `figure:2`.
- Add `# figure:` titles and `# tags:` metadata in notebook cells.
- Updates titles and tags in the gallery as soon as their metadata comments are edited, without reloading figure images.
- Open the gallery in the Clio sidebar or as an editor tab, which can be moved to another VS Code window for a second monitor. In the editor tab, drag the divider to resize the preview and thumbnail panes.
- Zoom and pan figure previews and comparison views, then use Focus Figure to give a selected plot the full Clio panel.
- Select multiple figures with click, Shift-click, drag selection, and keyboard navigation.
- Save/export or star/unstar the complete selection from the toolbar or a selected thumbnail's context menu.
- Right-click a single thumbnail to copy its image. For multiple selected figures, use **Save Selected Images** to get separate files.
- Compare selected figures side by side.
- Customize Gallery controls with icon-only or labeled buttons, small/medium/large fixed thumbnails, and automatic, grid, or stacked comparison layouts.
- Keeps Gallery controls and their dropdown menus within narrow or resized panels.
- Preview PNG, JPEG, WebP, SVG, and GIF images or the first page of a scanned PDF; save originals, export PDF files, copy a preview as PNG, and reveal a source cell or open a saved file.

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

For a cell with multiple figure outputs, provide titles in output order:

```python
# figure: Input distribution, Model fit, Residuals
```

One title is applied to every figure from the cell. When there are fewer titles than figures, the remaining figures are untitled.

## Commands

- `Clio: Scan Notebook`
- `Clio: Open Gallery`
- `Clio: Open Gallery in Editor`
- `Clio: Reveal Cell`

Use the Gallery ⚙ button to change the button style, thumbnail size, comparison layout, and preview background. Choose **White** for transparent plots whose dark labels are difficult to read against a dark theme. These preferences are also available in VS Code Settings under **Clio Gallery**.

## License

Clio is released under the MIT License.
