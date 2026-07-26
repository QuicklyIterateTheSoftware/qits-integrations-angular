/**
 * The nearest custom "app component" enclosing (or equal to) the picked element: the closest
 * ancestor-or-self whose tag starts with `app-`, Angular's default component-selector prefix. The
 * capture submits this subtree — the pick plus everything around it, trimmed to the component
 * boundary — rather than the bare picked leaf or the whole page. When the pick sits outside any
 * `app-*` component (a bare host-page node), it falls back to the picked element itself.
 */
export function nearestAppComponent(element: Element): Element {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.tagName.toLowerCase().startsWith('app-')) {
      return node;
    }
  }
  return element;
}
