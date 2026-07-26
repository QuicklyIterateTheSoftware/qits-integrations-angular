import { pickElement } from './element-picker';

/**
 * The picker is pure event wiring (no layout math on the resolve path), so jsdom is enough — the
 * frozen-styles round-trip lives in document-freeze's browser spec.
 */
describe('pickElement', () => {
  let target: HTMLElement;

  beforeEach(() => {
    target = document.createElement('button');
    target.textContent = 'pick me';
    document.body.appendChild(target);
  });

  afterEach(() => {
    target.remove();
    document.querySelectorAll('[data-qits-pick-overlay]').forEach((n) => n.remove());
  });

  function click(el: Element): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('resolves the clicked element and tears down its chrome', async () => {
    const pending = pickElement(document);
    expect(document.querySelectorAll('[data-qits-pick-overlay]').length).toBe(2); // overlay + hint

    click(target);
    expect(await pending).toBe(target);
    expect(document.querySelectorAll('[data-qits-pick-overlay]').length).toBe(0);
  });

  it('cancels to undefined on Escape', async () => {
    const pending = pickElement(document);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await pending).toBeUndefined();
  });

  it('cancels to undefined on right-click', async () => {
    const pending = pickElement(document);
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(await pending).toBeUndefined();
  });

  it('ignores clicks on its own overlay chrome, then resolves the next real pick', async () => {
    const pending = pickElement(document);
    const chrome = document.querySelector('[data-qits-pick-overlay]')!;

    click(chrome); // swallowed — not a pick
    click(target);

    expect(await pending).toBe(target);
  });

  it('resolves undefined when the document has no rendering context', async () => {
    const xml = document.implementation.createDocument(null, 'root', null);
    expect(await pickElement(xml)).toBeUndefined();
  });
});
