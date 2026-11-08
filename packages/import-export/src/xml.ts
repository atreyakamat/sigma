/** Minimal, dependency-free XML parser sufficient for SVG documents (elements, attributes, text). */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};
const decode = (s: string): string =>
  s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));

export function parseXml(input: string): XmlElement {
  const src = input
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => t);
  const root: XmlElement = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  const tag =
    /<\/?([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(src))) {
    const [whole, name, attrText, selfClose, text] = m;
    const parent = stack[stack.length - 1] as XmlElement;
    if (text !== undefined) {
      parent.text += decode(text);
      continue;
    }
    if (whole.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrText ?? ''))) attrs[a[1] as string] = decode(a[2] ?? a[3] ?? '');
    const el: XmlElement = { name: name as string, attrs, children: [], text: '' };
    parent.children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}
