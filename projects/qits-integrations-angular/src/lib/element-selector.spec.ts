import { selectorFor } from './element-selector';

describe('selectorFor', () => {
  it('anchors on the nearest data-testid', () => {
    const root = document.createElement('div');
    root.innerHTML = '<section data-testid="panel"><ul><li>a</li><li>b</li></ul></section>';
    document.body.appendChild(root);
    try {
      const target = root.querySelectorAll('li')[1];
      expect(selectorFor(target)).toBe(
        '[data-testid="panel"] > ul:nth-of-type(1) > li:nth-of-type(2)',
      );
    } finally {
      root.remove();
    }
  });

  it('anchors on the nearest id when there is no testid', () => {
    const root = document.createElement('div');
    root.innerHTML = '<main id="main"><span>x</span><span>y</span></main>';
    document.body.appendChild(root);
    try {
      const target = root.querySelectorAll('span')[1];
      expect(selectorFor(target)).toBe('#main > span:nth-of-type(2)');
    } finally {
      root.remove();
    }
  });

  it('uses nth-of-type among same-tag siblings', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.innerHTML = '<p>a</p><p>b</p><p id="t">c</p>';
    document.body.appendChild(root);
    try {
      expect(selectorFor(root.querySelector('#t')!)).toBe('#t');
      expect(selectorFor(root.querySelectorAll('p')[1])).toBe('#root > p:nth-of-type(2)');
    } finally {
      root.remove();
    }
  });
});
