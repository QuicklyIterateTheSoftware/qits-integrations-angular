import { ErrorHandler, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideQitsIntegration } from './provide-qits-integration';
import { TelemetryErrorHandler } from './telemetry-error-handler';

describe('provideQitsIntegration', () => {
  it('provides the telemetry ErrorHandler', () => {
    TestBed.configureTestingModule({ providers: [provideQitsIntegration()] });
    expect(TestBed.inject(ErrorHandler)).toBeInstanceOf(TelemetryErrorHandler);
  });

  it('spreads feature providers into the environment (the with*() seam for later plans)', () => {
    const FEATURE = new InjectionToken<string>('feature');
    TestBed.configureTestingModule({
      providers: [provideQitsIntegration({ providers: [{ provide: FEATURE, useValue: 'on' }] })],
    });
    expect(TestBed.inject(FEATURE)).toBe('on');
  });
});
