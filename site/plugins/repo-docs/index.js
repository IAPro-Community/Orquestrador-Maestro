import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '../..');
const docsDataPath = path.join(siteRoot, 'src/generated/docs.json');

export default function repoDocsPlugin() {
  return {
    name: 'repo-docs-pages',
    async loadContent() {
      const raw = await fs.readFile(docsDataPath, 'utf8');
      return JSON.parse(raw);
    },
    async contentLoaded({ content, actions }) {
      const { createData, createPage } = actions;
      for (const doc of content.documents) {
        const dataPath = await createData(`repo-doc-${doc.id}.json`, JSON.stringify(doc));
        createPage({
          path: `/docs/${doc.slug}`,
          component: '@site/src/components/RepoDocPage.jsx',
          modules: { doc: dataPath },
          exact: true
        });
      }
    }
  };
}
