import React from 'react';
import Layout from '@theme/Layout';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function RepoDocPage({doc}) {
  return <Layout title={doc.title} description={doc.excerpt}>
    <main className="shell doc-page">
      <div className="source-badge">Fonte: <a href={doc.sourceUrl}>{doc.sourcePath}</a></div>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.markdown}</ReactMarkdown>
    </main>
  </Layout>;
}
