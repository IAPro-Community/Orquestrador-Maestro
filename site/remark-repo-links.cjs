const path = require('node:path');

const REPO = 'https://github.com/IAPro-Community/Orquestrador-Maestro/blob/main/';
const repoRoot = path.resolve(__dirname, '..');
const docsRoot = path.resolve(repoRoot, 'docs');

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visit);
  }
}

module.exports = function repoRelativeLinks() {
  return (tree, file) => {
    const sourcePath = file.path || file.history?.[0];
    if (!sourcePath) return;
    walk(tree, (node) => {
      if (node.type !== 'link' || typeof node.url !== 'string') return;
      const url = node.url.trim();
      if (!url || url.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return;

      const [target, hash = ''] = url.split('#', 2);
      const absolute = path.resolve(path.dirname(sourcePath), target);
      const insideDocs = absolute === docsRoot || absolute.startsWith(docsRoot + path.sep);
      if (insideDocs) return;

      const relative = path.relative(repoRoot, absolute).replace(/\\/g, '/');
      if (relative.startsWith('../')) return;
      node.url = REPO + relative + (hash ? '#' + hash : '');
    });
  };
};
