import { freezeDocument, freezeElement } from './document-freeze';

/**
 * Style freezing needs a real layout engine (jsdom computes no styles), so this runs in Vitest
 * browser mode. A same-origin `srcdoc` iframe stands in for the captured app document.
 */

function frameWith(html: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.width = '600px';
    iframe.style.height = '400px';
    const onLoad = () => {
      if (iframe.contentDocument?.body?.childElementCount) {
        iframe.removeEventListener('load', onLoad);
        resolve(iframe);
      }
    };
    iframe.addEventListener('load', onLoad);
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

describe('freezeDocument', () => {
  afterEach(() => {
    document.querySelectorAll('iframe').forEach((f) => f.remove());
  });

  it('round-trips: the frozen page renders alike after its stylesheets are removed', async () => {
    const iframe = await frameWith(
      '<style>button { color: rgb(255, 0, 0); } span { font-weight: 700; }</style>' +
        '<div><button>Go <span>now</span></button></div>',
    );

    const frozen = freezeDocument(iframe.contentDocument!)!;
    expect(frozen.truncated).toBe(false);
    expect(frozen.bytes).toBe(new TextEncoder().encode(frozen.html).length);

    const rendered = await frameWith(frozen.html);
    const doc = rendered.contentDocument!;
    doc.querySelectorAll('style, link[rel="stylesheet"]').forEach((s) => s.remove());
    const view = doc.defaultView!;
    expect(view.getComputedStyle(doc.querySelector('button')!).color).toBe('rgb(255, 0, 0)');
    expect(view.getComputedStyle(doc.querySelector('span')!).fontWeight).toBe('700');
  });

  it('omits properties left at their UA default', async () => {
    const iframe = await frameWith('<style>p { color: rgb(255, 0, 0); }</style><p>plain</p>');
    const frozen = freezeDocument(iframe.contentDocument!)!;
    expect(frozen.html).not.toContain('display: block');
    expect(frozen.html).toContain('color: rgb(255, 0, 0)');
  });

  it('records scroll positions as attributes — a frozen DOM renders at scroll zero', async () => {
    const iframe = await frameWith(
      '<div id="scroller" style="height: 50px; width: 50px; overflow: scroll">' +
        '<div style="height: 500px; width: 500px">tall</div></div>',
    );
    const scroller = iframe.contentDocument!.getElementById('scroller')!;
    scroller.scrollTop = 120;
    scroller.scrollLeft = 40;

    const frozen = freezeDocument(iframe.contentDocument!)!;
    expect(frozen.html).toContain('data-qits-scroll-top="120"');
    expect(frozen.html).toContain('data-qits-scroll-left="40"');
  });

  it('reflects live form state into attributes', async () => {
    const iframe = await frameWith(
      '<input id="name"><input id="check" type="checkbox">' +
        '<textarea id="notes"></textarea>' +
        '<select id="pick"><option value="a">a</option><option value="b">b</option></select>',
    );
    const doc = iframe.contentDocument!;
    (doc.getElementById('name') as HTMLInputElement).value = 'anna';
    (doc.getElementById('check') as HTMLInputElement).checked = true;
    (doc.getElementById('notes') as HTMLTextAreaElement).value = 'typed text';
    (doc.getElementById('pick') as HTMLSelectElement).value = 'b';

    const frozen = freezeDocument(doc)!;
    expect(frozen.html).toContain('value="anna"');
    expect(frozen.html).toMatch(/<input[^>]*id="check"[^>]*checked/);
    expect(frozen.html).toMatch(/<textarea[^>]*>typed text<\/textarea>/);
    expect(frozen.html).toMatch(/<option[^>]*value="b"[^>]*selected/);
  });

  it('replaces a canvas with a data-URL image of its pixels', async () => {
    const iframe = await frameWith('<canvas id="c" width="10" height="10"></canvas>');
    const canvas = iframe.contentDocument!.getElementById('c') as HTMLCanvasElement;
    canvas.getContext('2d')!.fillRect(0, 0, 10, 10);

    const frozen = freezeDocument(iframe.contentDocument!)!;
    expect(frozen.html).not.toContain('<canvas');
    expect(frozen.html).toMatch(/<img[^>]*src="data:image\/png;base64,/);
  });

  it('drops scripts, pick overlays, and its own baseline iframe from the snapshot', async () => {
    const iframe = await frameWith(
      '<script>window.secret = 1;</script>' +
        '<div data-qits-pick-overlay="">overlay</div><p>content</p>',
    );

    const frozen = freezeDocument(iframe.contentDocument!)!;
    expect(frozen.html).not.toContain('<script');
    expect(frozen.html).not.toContain('data-qits-pick-overlay');
    expect(frozen.html).not.toContain('<iframe'); // the baseline iframe never leaks into its own snapshot
    expect(frozen.html).toContain('<p');
    // The captured document is left untouched (baseline iframe cleaned up).
    expect(iframe.contentDocument!.querySelector('iframe')).toBeNull();
  });

  it('truncates depth-first under a byte budget instead of failing', async () => {
    const items = Array.from({ length: 50 }, (_, i) => `<li>item number ${i}</li>`).join('');
    const iframe = await frameWith(`<ul>${items}</ul>`);

    const capped = freezeDocument(iframe.contentDocument!, { maxBytes: 500 })!;
    const uncapped = freezeDocument(iframe.contentDocument!)!;

    expect(capped.truncated).toBe(true);
    expect(uncapped.truncated).toBe(false);
    expect(capped.bytes).toBeLessThan(uncapped.bytes);
  });

  it('trims to the body — the head, its stylesheets and scripts, are dropped', async () => {
    const iframe = await frameWith(
      '<head><title>t</title><style>p { color: red }</style></head>' +
        '<body><p>content</p></body>',
    );
    const frozen = freezeDocument(iframe.contentDocument!)!;
    expect(frozen.html.startsWith('<!doctype html><body')).toBe(true);
    expect(frozen.html).not.toContain('<head');
    expect(frozen.html).not.toContain('<title');
    expect(frozen.html).not.toContain('<style');
    expect(frozen.html).toContain('<p');
  });
});

describe('freezeElement', () => {
  afterEach(() => {
    document.querySelectorAll('iframe').forEach((f) => f.remove());
  });

  it('freezes just the element subtree (no document wrapper) with its applied styles', async () => {
    const iframe = await frameWith(
      '<style>.badge { color: rgb(0, 128, 0); font-weight: 700 }</style>' +
        '<app-widget><span class="badge">hi</span></app-widget><footer>outside</footer>',
    );
    const widget = iframe.contentDocument!.querySelector('app-widget')!;

    const frozen = freezeElement(widget)!;
    expect(frozen.html.startsWith('<app-widget')).toBe(true);
    expect(frozen.html).not.toContain('<!doctype');
    expect(frozen.html).not.toContain('footer'); // only the subtree, not the siblings around it
    expect(frozen.html).toContain('color: rgb(0, 128, 0)');
    expect(frozen.html).toContain('font-weight: 700');
    expect(frozen.bytes).toBe(new TextEncoder().encode(frozen.html).length);
  });
});
