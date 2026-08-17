const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const extensionRoot = __dirname;
const sourceRoot = path.join(extensionRoot, "src");
const outputRoot = path.join(extensionRoot, "dist");

const esbuildProblemMatcherPlugin = {
    name: "esbuild-problem-matcher",

    setup(build) {
        build.onStart(() => {
            console.log("[watch] build started");
        });

        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);

                if (location) {
                    console.error(
                        `    ${location.file}:${location.line}:${location.column}:`
                    );
                }
            });

            console.log("[watch] build finished");
        });
    },
};

function copyGalleryAssets() {
    const source = path.join(
        sourceRoot,
        "gallery",
        "gallery.css"
    );

    const destination = path.join(outputRoot, "gallery.css");

    fs.mkdirSync(outputRoot, { recursive: true });
    fs.copyFileSync(source, destination);
}

async function main() {
    const extensionContext = await esbuild.context({
        entryPoints: [path.join(sourceRoot, "extension.ts")],
        bundle: true,
        format: "cjs",
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: "node",
        outfile: path.join(outputRoot, "extension.js"),
        external: ["vscode"],
        logLevel: "silent",
        plugins: [esbuildProblemMatcherPlugin],
    });

    const galleryContext = await esbuild.context({
        entryPoints: [
            path.join(
                sourceRoot,
                "gallery",
                "galleryScripts.ts"
            ),
        ],
        bundle: true,
        format: "iife",
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: "browser",
        outfile: path.join(outputRoot, "galleryScript.js"),
        logLevel: "silent",
        plugins: [esbuildProblemMatcherPlugin],
    });

    copyGalleryAssets();

    if (watch) {
        await extensionContext.watch();
        await galleryContext.watch();
        return;
    }

    await extensionContext.rebuild();
    await galleryContext.rebuild();

    await extensionContext.dispose();
    await galleryContext.dispose();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
