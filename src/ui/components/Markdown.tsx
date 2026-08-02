import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * A small, dependency-free Markdown renderer that supports the subset ChatGPT
 * uses: headings, bold/italic, inline code, fenced code blocks with language
 * label + copy button, blockquotes, ordered/unordered lists, tables, links,
 * and horizontal rules. Output is escaped to prevent XSS.
 */

export function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="md-content">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

type Block =
  | { type: 'code'; lang: string; code: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'p'; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || 'text';
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: 'code', lang, code: code.join('\n') });
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        blocks.push({ type: 'heading', level: m[1].length, text: m[2] });
        i++;
        continue;
      }
    }

    if (/^>\s?/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        items.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: items.join('\n') });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: gather consecutive non-empty, non-special lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^\|.*\|$/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', text: para.join('\n') });
  }
  return blocks;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

function renderBlock(b: Block, key: number) {
  switch (b.type) {
    case 'code':
      return <CodeBlock key={key} lang={b.lang} code={b.code} />;
    case 'heading': {
      const Tag = (`h${b.level}` as 'h1' | 'h2' | 'h3');
      return <Tag key={key}>{renderInline(b.text)}</Tag>;
    }
    case 'quote':
      return <blockquote key={key}>{renderInline(b.text)}</blockquote>;
    case 'ul':
      return (
        <ul key={key}>
          {b.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key}>
          {b.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ol>
      );
    case 'table':
      return (
        <table key={key}>
          <thead>
            <tr>{b.header.map((h, i) => <th key={i}>{renderInline(h)}</th>)}</tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    case 'hr':
      return <hr key={key} />;
    case 'p':
      return <p key={key}>{renderInline(b.text)}</p>;
  }
}

/** Render inline markdown (bold, italic, code, links) with HTML escaping. */
function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={k++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={k++}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      nodes.push(<code key={k++}>{m[4]}</code>);
    } else if (m[5] !== undefined && m[6] !== undefined) {
      nodes.push(
        <a key={k++} href={m[6]} target="_blank" rel="noopener noreferrer">
          {m[5]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-line bg-surface-subtle">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="text-xs text-ink-faint">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm">
        <code className="leading-relaxed">{code}</code>
      </pre>
    </div>
  );
}
