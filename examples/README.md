# Clio tutorial notebooks

These notebooks are intentionally self-contained: they only require NumPy and
Matplotlib in addition to Clio. Open them in either JupyterLab or VS Code, run
all cells, and then open Clio.

| Notebook | What it demonstrates |
| --- | --- |
| `01_quick_start.ipynb` | Automatic discovery, the gallery, preview, zoom, pan, and reveal cell. |
| `02_search_and_tags.ipynb` | Figure titles, tags, search, scope, filters, and multi-output-cell titles. |
| `03_compare_and_export.ipynb` | Multi-selection, comparison, keyboard navigation, copy/download, PNG, and PDF export. |

## Fastest JupyterLab setup

```bash
python -m pip install clio-jupyter numpy matplotlib
jupyter lab
```

Restart JupyterLab after installing. Open one of the notebooks, select **Run
All Cells**, then open **Clio: Open Gallery as Tab** or the Clio sidebar.

## VS Code setup

Install **Clio – Figure Explorer** from the VS Code Marketplace, open a
notebook, run all cells, and select the Clio icon in the Activity Bar. The
same notebooks and metadata convention work in both hosts.

## Metadata convention

Put a figure title on the first non-empty line of the cell and optional tags
on the next line:

```python
# figure: Example figure
# tags: tutorial, line plot
```

For several PNG outputs from one cell, separate output titles with commas.
One title is applied to every output from that cell.
