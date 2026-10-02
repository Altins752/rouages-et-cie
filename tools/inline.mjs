// Produit dist/rouages.html : un fichier HTML unique et autonome (scripts et styles en ligne),
// qui s'ouvre directement dans le navigateur (file://) ou se publie tel quel.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g, (_, href) => {
  const css = readFileSync(join(dist, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});

html = html.replace(/<script type="module" crossorigin src="\.?\/?([^"]+\.js)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

if (/src="\.?\/?assets\//.test(html) || /href="\.?\/?assets\/[^"]+\.css"/.test(html)) {
  console.error('inline : une ressource externe reste référencée');
  process.exit(1);
}
writeFileSync(join(dist, 'rouages.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`dist/rouages.html : ${kb} Ko, autonome${existsSync(join(dist, 'index.html')) ? '' : ''}`);
