import { applicationFrames, parseFrame } from './fetch-caller-attribution';

describe('parseFrame', () => {
  it('parses a named V8 frame and strips esbuild underscore aliases', () => {
    expect(parseFrame('    at _Greeting.submit (http://host/main.js:12:34)')).toEqual({
      functionName: 'Greeting.submit',
      file: 'http://host/main.js',
      line: 12,
    });
  });

  it('parses anonymous frames', () => {
    expect(parseFrame('    at http://host/main.js:12:34')).toEqual({
      functionName: '<anonymous>',
      file: 'http://host/main.js',
      line: 12,
    });
  });

  it('returns undefined for non-frame lines', () => {
    expect(parseFrame('Error: boom')).toBeUndefined();
  });
});

describe('applicationFrames', () => {
  it('drops wrapper, OTEL, vendor-chunk and RxJS/HttpClient plumbing frames', () => {
    const stack = [
      'Error',
      '    at captureStack (http://h/lib.js:1:1)',
      '    at attributedFetch (http://h/lib.js:2:2)',
      '    at _FetchBackend.doRequest (http://h/@fs/deps/chunk-ABC.js:3:3)',
      '    at Observable2.subscribe (http://h/node_modules/rxjs/dist/x.js:4:4)',
      '    at exportSpans (http://h/@opentelemetry/otlp.js:5:5)',
      '    at _Greeting.submit (http://h/main.js:6:6)',
    ].join('\n');
    expect(applicationFrames(stack)).toEqual(['    at _Greeting.submit (http://h/main.js:6:6)']);
  });
});
