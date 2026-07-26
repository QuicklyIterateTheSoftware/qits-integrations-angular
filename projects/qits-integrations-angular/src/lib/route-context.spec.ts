import {
  RouteStampingLogRecordProcessor,
  RouteStampingSpanProcessor,
  resetRouteContextForTesting,
  setCurrentRoute,
} from './route-context';

describe('route stamping', () => {
  afterEach(() => {
    resetRouteContextForTesting();
  });

  it('stamps only the concrete URL before the first navigation (no faked pattern)', () => {
    const span = { setAttributes: vi.fn() };
    new RouteStampingSpanProcessor().onStart(span as never);
    expect(span.setAttributes).toHaveBeenCalledWith({ 'app.route.url': location.pathname });
  });

  it('stamps app.route.path and app.route.url on every span once a route matched', () => {
    setCurrentRoute({ path: 'greeting/:name', url: '/greeting/world' });
    const span = { setAttributes: vi.fn() };
    new RouteStampingSpanProcessor().onStart(span as never);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'app.route.path': 'greeting/:name',
      'app.route.url': '/greeting/world',
    });
  });

  it('stamps log records identically (the twin processor)', () => {
    setCurrentRoute({ path: 'greeting/:name', url: '/greeting/world' });
    const record = { setAttributes: vi.fn() };
    new RouteStampingLogRecordProcessor().onEmit(record as never);
    expect(record.setAttributes).toHaveBeenCalledWith({
      'app.route.path': 'greeting/:name',
      'app.route.url': '/greeting/world',
    });
  });
});
