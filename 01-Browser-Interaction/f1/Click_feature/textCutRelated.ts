
export const extractClickables = async (page: import('playwright').Page): Promise<string> => {
  return await page.evaluate(() => {
    const selector = 'a, button, input[type=button], input[type=submit], [role="button"], [onclick]';
    const els = Array.from(document.querySelectorAll(selector));

    // Landmark tags/roles, closest ancestor wins
    const landmarkSelector = [
      'header', 'footer', 'nav', 'aside', 'main',
      '[role="banner"]', '[role="contentinfo"]', '[role="navigation"]',
      '[role="complementary"]', '[role="main"]', '[role="dialog"]',
      '[role="alertdialog"]', 'dialog'
    ].join(', ');

    const getLandmark = (el: Element): string | null => {
      const landmarkEl = el.closest(landmarkSelector);
      if (!landmarkEl) return null;
      const role = landmarkEl.getAttribute('role');
      if (role) return role;
      return landmarkEl.tagName.toLowerCase();
    };

    return els
      .map(el => {
        const visibleText = (el.textContent || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' ');
        const label = visibleText || el.getAttribute('aria-label') || el.getAttribute('title') || '';
        if (!label) return null;

        const tag = el.tagName.toLowerCase();
        const href = el.getAttribute('href');
        const landmark = getLandmark(el);
        const prefix = landmark ? `[${landmark}] ` : '';

        return `${prefix}<${tag}${href ? ` href="${href}"` : ''}>${label}</${tag}>`;
      })
      .filter(Boolean)
      .join('\n');
  });
};

export const cleanHtml = async (page: import('playwright').Page): Promise<string> => {
  const raw = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;

    clone.querySelectorAll('script, style, svg, noscript, link, meta').forEach(el => el.remove());

    clone.querySelectorAll('span').forEach(span => {
      span.replaceWith(document.createTextNode(span.textContent || ''));
    });

    clone.querySelectorAll('*').forEach(el => {
      const keep = ['href', 'alt', 'role', 'type', 'value'];
      [...el.attributes].forEach(attr => {
        if (!keep.includes(attr.name)) el.removeAttribute(attr.name);
      });
    });

    return clone.outerHTML;
  });

  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const truncate = (text: string, maxChars = 20000): string => {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...[truncated]';
};
