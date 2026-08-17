"use strict";

function wrapText(text, width) {
  if (width < 1) width = 1;
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = [];
  let currentLen = 0;
  
  for (const word of words) {
    // If the word itself is longer than the width, we'll just put it on its own line (or it'll overflow).
    if (currentLen + word.length + (currentLine.length > 0 ? 1 : 0) <= width) {
      currentLine.push(word);
      currentLen += word.length + (currentLine.length > 0 ? 1 : 0);
    } else {
      if (currentLine.length > 0) lines.push(currentLine.join(" "));
      currentLine = [word];
      currentLen = word.length;
    }
  }
  
  if (currentLine.length > 0) lines.push(currentLine.join(" "));
  return lines;
}

function formatTasks(tasks, maxWidth = 80) {
  if (!Array.isArray(tasks)) return "";
  
  return tasks.map((task, index) => {
    const t = task || {};
    const num = String(index + 1).padStart(2, '0');
    const tier = (t.complexity || t.semanticMetadata?.complexity || "standard").toUpperCase();
    const provider = (t.provider || "default");
    const providerCapitalized = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    const header = `${tier} · ${providerCapitalized}`;
    const label = t.label || t.title || t.id || "Tarefa não nomeada";
    
    const prefixLength = 4; // "01  "
    const availableLabelWidth = Math.max(10, maxWidth - prefixLength);
    const wrappedLabel = wrapText(label, availableLabelWidth).join(`\n    `);
    
    return `${num}  ${wrappedLabel}\n    ${header}`;
  }).join("\n\n");
}

module.exports = { formatTasks, wrapText };
