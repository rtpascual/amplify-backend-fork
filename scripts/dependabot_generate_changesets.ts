import fsp from 'fs/promises';
import { EOL } from 'os';
import { GitClient } from './components/git_client.js';
import { readPackageJson } from './components/package-json/package_json.js';

const createChangesetFile = async (versionUpdates: Map<string, string>, packageNames: string[]) => {
  let message = '';

  for (const [dep, version] of versionUpdates) {
    message += `Update dependency ${dep} to ${version}.${EOL}`;
  }

  const frontmatterContent = packageNames.map(name => `'${name}': patch`).join(EOL);
  const body = `---${EOL}${frontmatterContent}${EOL}---${EOL}${EOL}${message.trim()}${EOL}`;
  await fsp.writeFile(fileName, body);
}

const getVersionUpdates = async (files: string[]) => {
  const updates = new Map<string, string>();

  for (const file of files) {
    const changes = await gitClient.getFileChanges(file);

    for (const change of changes.split(EOL)) {
      if (!change.startsWith('+ ')) {
        continue;
      }
      const match = change.match(/"(.*)"/g);
      
      if (!match) {
        continue;
      }
      updates.set(match[0].replace(/"/g, ''), match[1].replace(/"/g, ''));
    }
  }

  return updates;
}

const gitClient = new GitClient();

const branch = await gitClient.getCurrentBranch();
if (!branch.startsWith('dependabot/')) {
  // if branch is not a dependabot branch, return early
  process.exit();
}

const baseRef = process.argv[2];
if (baseRef === undefined) {
  throw new Error('No base ref specified for generate changeset check');
}

const headRef = process.argv[3].trim();
if (headRef === undefined) {
  throw new Error('No head ref specified for generate changeset check');
}

const changedFiles = await gitClient.getChangedFiles(baseRef);
const modifiedPackageDirs = new Set<string>();

changedFiles
  .filter(changedFile => changedFile.startsWith('packages/') && changedFile.endsWith('package.json'))
  .forEach(changedPackageFile => {
    modifiedPackageDirs.add(
      changedPackageFile.split('/').slice(0, 2).join('/')
    )
  });

const packageNames = [];
for (const modifiedPackageDir of modifiedPackageDirs) {
  const { name: modifiedPackageName } = await readPackageJson(modifiedPackageDir);
  packageNames.push(modifiedPackageName);
}




const fileName = `.changeset/dependabot-${headRef}.md`;
const versionUpdates = await getVersionUpdates(changedFiles);
await createChangesetFile(versionUpdates, packageNames);