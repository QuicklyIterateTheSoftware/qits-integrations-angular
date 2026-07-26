import { enrichInteractionSpan } from './interaction-telemetry';

function fakeSpan() {
  return { updateName: vi.fn(), setAttribute: vi.fn() };
}

describe('enrichInteractionSpan', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('never prevents the span (the hook is an enrichment seam, despite its name)', () => {
    expect(enrichInteractionSpan(document.createElement('button'), fakeSpan() as never)).toBe(
      false,
    );
  });

  it('names the span from data-track-event on an ancestor (a submit targets the form)', () => {
    const form = document.createElement('form');
    form.setAttribute('data-track-event', 'save-greeting');
    const button = document.createElement('button');
    form.appendChild(button);
    document.body.appendChild(form);

    const span = fakeSpan();
    enrichInteractionSpan(form, span as never);

    expect(span.updateName).toHaveBeenCalledWith('interaction save-greeting');
    expect(span.setAttribute).toHaveBeenCalledWith('app.interaction.name', 'save-greeting');
  });

  it('describes unnamed targets by tag#id', () => {
    const button = document.createElement('button');
    button.id = 'save';
    const span = fakeSpan();
    enrichInteractionSpan(button, span as never);
    expect(span.updateName).not.toHaveBeenCalled();
    expect(span.setAttribute).toHaveBeenCalledWith('app.interaction.target', 'button#save');
  });

  it('falls back to a text snippet for anonymous targets', () => {
    const button = document.createElement('button');
    button.textContent = 'Save the greeting';
    const span = fakeSpan();
    enrichInteractionSpan(button, span as never);
    expect(span.setAttribute).toHaveBeenCalledWith(
      'app.interaction.target',
      'button "Save the greeting"',
    );
  });
});
