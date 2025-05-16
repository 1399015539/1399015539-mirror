import { JSDOM } from 'jsdom';

interface ParsedContent {
  title: string;
  url: string;
  images: Array<{
    url: string;
    author: string;
  }>;
  navigation: string[];
}

export function parseMidjourneyContent(content: string): ParsedContent {
  // 提取基本信息
  const titleMatch = content.match(/Title: (.*?)\n/);
  const urlMatch = content.match(/URL: (.*?)\n/);
  
  // 创建 DOM 解析器
  const dom = new JSDOM(content);
  const document = dom.window.document;
  
  // 提取导航链接
  const navigation = Array.from(document.querySelectorAll('a'))
    .map(a => a.textContent?.trim())
    .filter((text): text is string => text !== null && text !== undefined && text.length > 0);

  // 提取图片信息
  const images = Array.from(document.querySelectorAll('a[href^="/jobs/"]'))
    .map(a => ({
      url: `https://www.midjourney.com${a.getAttribute('href')}`,
      author: a.textContent?.trim() || 'Unknown'
    }))
    .filter(img => img.author !== 'Unknown');

  return {
    title: titleMatch ? titleMatch[1] : '',
    url: urlMatch ? urlMatch[1] : '',
    images,
    navigation: [...new Set(navigation)]
  };
}

export function formatParsedContent(parsed: ParsedContent): string {
  let output = '';
  
  // 添加基本信息
  output += `标题: ${parsed.title}\n`;
  output += `网址: ${parsed.url}\n\n`;
  
  // 添加导航信息
  output += '导航菜单:\n';
  parsed.navigation.forEach(item => {
    output += `- ${item}\n`;
  });
  output += '\n';
  
  // 添加图片信息
  output += '图片列表:\n';
  parsed.images.forEach((img, index) => {
    output += `${index + 1}. 作者: ${img.author}\n   链接: ${img.url}\n`;
  });
  
  return output;
}
