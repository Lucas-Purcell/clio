import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "jupyterlab/static");
const destination = resolve(
    projectRoot,
    "python/labextension"
);
const legacyPackageAssets = resolve(
    projectRoot,
    "python/figure_explorer_jupyterlab/labextension"
);

if (!existsSync(resolve(source, "package.json"))) {
    throw new Error(
        "The JupyterLab bundle is missing. Run `yarn workspace @clio/jupyter build:labextension` first."
    );
}

rmSync(destination, { recursive: true, force: true });
rmSync(legacyPackageAssets, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });

writeFileSync(
    resolve(destination, "install.json"),
    `${JSON.stringify({
        packageManager: "python",
        packageName: "clio-jupyter",
        uninstallInstructions:
            "Use your Python package manager to uninstall clio-jupyter.",
    }, null, 2)}\n`
);

console.log("Prepared the JupyterLab Python package assets.");
