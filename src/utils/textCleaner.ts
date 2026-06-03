/**
 * 从 Office 文档解析结果中清洗 XML 标签和样式垃圾。
 * 在资料进入 AI 处理前必须调用。
 */

const XML_GARBAGE_PATTERNS = [
  '<a:', '<p:', '<w:', '<r:', '</a:', '</p:', '</w:', '</r:',
  'panose', 'pitchFamily', 'charset', 'typeface',
  'txBody', 'rPr', 'pPr', 'hiddenLine',
];

/** 判断文本是否包含大量 Office XML 垃圾 */
export function isLikelyXmlGarbage(text: string): boolean {
  let matchCount = 0;
  for (const pattern of XML_GARBAGE_PATTERNS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const matches = text.match(regex);
    if (matches) matchCount += matches.length;
  }
  return matchCount >= 3;
}

function isJunkLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^[<>\/=\s"'_a-z:.-]+$/.test(t) && /[<>]/.test(t)) return true;
  if (t.length < 3) return true;
  if (/^\d{1,3}$/.test(t)) return true;
  return isLikelyXmlGarbage(t);
}

/**
 * 统一清洗从 Office 文件解析出的文本。
 * 移除 XML 标签、样式属性，解码 HTML 实体，过滤无效行。
 */
export function cleanExtractedText(raw: string): string {
  // 解码 HTML 实体
  let result = raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)));

  // 移除 XML/HTML 标签
  result = result.replace(/<[^>]*>/g, ' ');

  // 移除样式属性字段
  const styleRegex = /\b(panose|pitchFamily|charset|typeface|anchor|lnSpcReduction|dirty|smtClean|sz|kern|baseline|normalizeH|compatLnSpc|err|noProof)[=:][^\s;]*\s*/gi;
  result = result.replace(styleRegex, '');

  // 标准化空行和空白
  result = result
    .replace(/\r/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => !isJunkLine(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return result;
}