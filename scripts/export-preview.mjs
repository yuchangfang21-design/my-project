import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
let html = await readFile(resolve(root, 'dist/development.html'), 'utf8');
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const stylesheet = html.match(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/);
if (!script || !stylesheet) throw new Error('Expected one bundled script and stylesheet');
const js = await readFile(resolve(root, `dist/${script[1].replace(/^\//, '')}`), 'utf8');
const css = await readFile(resolve(root, `dist/${stylesheet[1].replace(/^\//, '')}`), 'utf8');
// A standalone preview cannot resolve TSX or rely on deferred module loading.
// This entry is a single bundle with no imports; run it after the root exists.
html = html.replace(script[0], '').replace(/^[ \t]+$/gm, '');
const runtime = `;(function(){"use strict";\n${js}\n})();`;
html = html.replace('</body>', () => `<script>${runtime.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`);
html = html.replace(stylesheet[0], () => `<style>${css}</style>`);
const favicon = await readFile(resolve(root, 'public/favicon.svg'), 'utf8');
html = html.replace('href="/favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`);
const screenshot = await readFile(resolve(root, 'artifacts/overview.png'));
const fallback = `<div id="preview-loading" style="max-width:1440px;margin:auto;font-family:Segoe UI,Microsoft YaHei,sans-serif"><p style="padding:16px;color:#4e6b3b;background:#f1f5e9;margin:0">序幕 · 正在加载交互演示。下方为实际效果图；若无法进入交互界面，请使用最新版 Edge 或 Chrome 打开此 HTML 文件。<noscript>当前浏览器未允许 JavaScript，仅展示静态效果图。</noscript></p><img src="data:image/png;base64,${screenshot.toString('base64')}" alt="序幕工作台静态效果图" style="display:block;width:100%;height:auto" /></div>`;
html = html.replace('<div id="root"></div>', () => `<div id="root">${fallback}</div>`);
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const output = resolve(root, 'artifacts/序幕-交互演示.html');
await writeFile(output, html);
await writeFile(resolve(root, 'index.html'), html);
console.log(`Standalone offline preview: ${output}`);
console.log('Root index.html is also a self-contained preview. Development source: development.html');
