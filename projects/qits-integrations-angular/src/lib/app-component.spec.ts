import { nearestAppComponent } from './app-component';

describe('nearestAppComponent', () => {
  it('climbs to the closest ancestor-or-self whose tag starts with app-', () => {
    const host = document.createElement('app-greeting');
    host.innerHTML = '<section><button id="go">Go</button></section>';
    const button = host.querySelector('#go')!;

    expect(nearestAppComponent(button).tagName.toLowerCase()).toBe('app-greeting');
  });

  it('returns the element itself when it is the app component', () => {
    const host = document.createElement('app-card');

    expect(nearestAppComponent(host)).toBe(host);
  });

  it('picks the innermost app component when several nest', () => {
    const outer = document.createElement('app-shell');
    outer.innerHTML = '<app-panel><span id="leaf">x</span></app-panel>';
    const leaf = outer.querySelector('#leaf')!;

    expect(nearestAppComponent(leaf).tagName.toLowerCase()).toBe('app-panel');
  });

  it('falls back to the picked element when no app-* encloses it', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p id="p">hi</p>';
    const p = div.querySelector('#p')!;

    expect(nearestAppComponent(p)).toBe(p);
  });
});
