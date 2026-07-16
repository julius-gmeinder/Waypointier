const esbuild = require('esbuild');
const fs = require('fs');

async function runBuild() {

    const rawData = fs.readFileSync('manifest.json', 'utf8');
    const data = JSON.parse(rawData);
    const path = "build/" + data.id;

    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
    }

    try {
        await esbuild.build({
            entryPoints: ['main.ts'],
            bundle: true,
            external: ['obsidian'],
            format: 'cjs',
            outfile: `${path}/main.js`,
            logLevel: 'info',
        });

        if (fs.existsSync('manifest.json')) {
            fs.copyFileSync('manifest.json', `${path}/manifest.json`);
        }
        
        if (fs.existsSync('styles.css')) {
            fs.copyFileSync('styles.css', `${path}/styles.css`);
        }

        console.log('build complete');
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

runBuild();