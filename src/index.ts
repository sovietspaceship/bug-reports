import * as fs from 'fs';
import * as Bluebird from 'bluebird';
import * as glob from 'glob';
import * as path from 'path';
import * as Apps from '../apps.json';
import * as os from 'os';

type AppInfo = typeof Apps[0];

const readFileAsync = Bluebird.promisify(fs.readFile);
const writeFileAsync = Bluebird.promisify(fs.writeFile);

main().catch(error => {
    console.error(error);
    process.exit(1);
})

type TemplateData = { filename: string, content: string, app: AppInfo };

type TemplateMetadata = Record<'name' | 'about' | 'title' | 'labels' | 'assignees', string>

const README = `# Issues for my souls apps

## Contacts

* Discord: Emilia#4567
* https://twitch.tv/sovietspaceship
* \`#souls-dev\` in my [Discord server](https://discord.gg/Kkb5MSqy7x)
* \`#research\` in the [Elden Ring PvP server](https://discord.gg/vb2uWpmXhc)`

const README_POST = `## Elden Ring Database

[Open an issue](https://github.com/EldenRingDatabase/erdb/issues/new) in the [\`EldenRingDatabase/erdb\`](https://github.com/EldenRingDatabase/erdb) repository.
`

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
                content: newContent.split('\n').map(l => l.trim()).join(os.EOL),
                app,
            }
        }));
    }, [] as TemplateData[]);

    await Bluebird.map(processedTemplates, template => {
        return writeFileAsync(`.github/ISSUE_TEMPLATE/${template.filename}`, template.content);
    });

    await writeFileAsync('README.md', [
        README,
        await makeIssueTable(processedTemplates),
        README_POST
    ].join(os.EOL))
}

function performReplacements(template: string, app: AppInfo) {
    return template
        .replace(makeVar('APP_TITLE'), app.name)
        .replace(makeVar('APP_SLUG'), app.slug)
        .replace(makeVar('APP_URL'), app.url)
}

async function makeIssueTable(templates: TemplateData[]) {
    const entries = await Bluebird.map(Apps, async app => {
        const table = await Bluebird.map(templates, template => {
            if (template.app.name === app.name) {
                const prefix = `${template.app.name} `;
                const templateMetadata = parseTemplateMetadata(template);
                const encodedLabels = encodeURIComponent(templateMetadata.labels)
                const templateFile = template.filename;
                const encodedTitle = encodeURIComponent(templateMetadata.title.replace(/'/g, ''));
                const urlTemplate = `https://github.com/sovietspaceship/souls-bug-reports/issues/new?assignees=sovietspaceship&labels=${encodedLabels}&template=${templateFile}&title=${encodedTitle}`

                return `* [${templateMetadata.name.replace(prefix, '')}](${urlTemplate})`
            }
        });

        return [
            '',
            `## [${app.name}](${app.url})`,
            '',
            ...table.filter(l => l),
            '',
        ].join(os.EOL);
    });

    return entries.join('');
}

function parseTemplateMetadata(template: TemplateData): TemplateMetadata {
    return template.content.split(os.EOL).reduce((out, line) => {
        const pattern = /^([a-z]+): (.+)/
        const match = line.match(pattern)
        if (match) {
            const [key, value] = match.slice(1)

            return {
                ...out,
                [key]: value,
            }
        }

        return out;
    }, {} as TemplateMetadata)
}

function makeVar(name: string) {
    return new RegExp(name, 'g')
}
