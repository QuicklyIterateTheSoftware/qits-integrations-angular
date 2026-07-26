import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { resetRouteContextForTesting, routeAttributes } from './route-context';
import { installRouteTelemetry } from './route-telemetry';

@Component({ template: '' })
class Blank {}

describe('route telemetry', () => {
  afterEach(() => {
    resetRouteContextForTesting();
  });

  it('tracks the matched route pattern + concrete URL for the stamping processors', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'greeting/:name', component: Blank }])],
    });
    const router = TestBed.inject(Router);
    installRouteTelemetry(router);

    await router.navigateByUrl('/greeting/world');

    expect(routeAttributes()).toEqual({
      'app.route.path': 'greeting/:name',
      'app.route.url': '/greeting/world',
    });
  });

  it('keeps the concrete URL current across navigations, pattern per match', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'greeting/:name', component: Blank },
          { path: 'other', component: Blank },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    installRouteTelemetry(router);

    await router.navigateByUrl('/greeting/world');
    await router.navigateByUrl('/other');

    expect(routeAttributes()).toEqual({
      'app.route.path': 'other',
      'app.route.url': '/other',
    });
  });
});
