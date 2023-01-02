import * as fs from 'fs';
import * as Bluebird from 'bluebird';
import * as glob from 'glob';
import * as path from 'path';
import * as Apps from '../apps.json';

type AppInfo = typeof Apps[0];

const readFileAsync = Bluebird.promisify(fs.readFile);
const writeFileAsync = Bluebird.promisify(fs.writeFile);

main().catch(error => {
    console.error(error);
    process.exit(1);
})

async function main() {
    const templateFilenames = glob.sync('./templates/**/*.md');

    const templates = await Bluebird.map(templateFilenames, async filename => {
        const data = await readFileAsync(filename);

        return { filename, content: data.toString() }
    });

    const processedTemplates = await Bluebird.reduce(Apps, async (acc, app) => {
        return acc.concat(await Bluebird.map(templates, template => {
            const newContent = performReplacements(template.content, app);

            return {
                filename: `${app.slug}_${path.basename(template.filename)}`,
                content: newContent
            }
        }));
    }, [] as { filename: string, content: string }[]);

    await Bluebird.map(processedTemplates, template => {
        return writeFileAsync(`.github/ISSUE_TEMPLATE/${template.filename}`, template.content);
    });
}

function performReplacements(template: string, app: AppInfo) {
    return template
        .replace(makeVar('APP_TITLE'), app.name)
        .replace(makeVar('APP_SLUG'), app.slug)
        .replace(makeVar('APP_URL'), app.url)
}

function makeVar(name: string) {
    return new RegExp(name, 'g')
}
