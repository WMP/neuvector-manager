import { SimpleChange } from '@angular/core';
import { GlobalVariable } from '@common/variables/global.variable';
import { of, throwError } from 'rxjs';
import {
  cdxToRows,
  sbomFileName,
  SbomPanelComponent,
} from './sbom-panel.component';

describe('SbomPanel helpers', () => {
  it('maps components to rows', () => {
    const rows = cdxToRows({
      components: [
        {
          name: 'openssl',
          version: '3.0.1',
          purl: 'pkg:deb/openssl@3.0.1',
          licenses: [
            { license: { id: 'MIT' } },
            { license: { name: 'Custom' } },
            { expression: 'GPL-2.0 OR BSD-3-Clause' },
          ],
          properties: [{ name: 'neuvector:runtime', value: 'true' }],
        },
        { name: 'bash' },
      ],
    });
    expect(rows[0]).toEqual({
      name: 'openssl',
      version: '3.0.1',
      purl: 'pkg:deb/openssl@3.0.1',
      licenses: 'MIT, Custom, GPL-2.0 OR BSD-3-Clause',
      runtime: true,
    });
    expect(rows[1]).toEqual({
      name: 'bash',
      version: '',
      purl: '',
      licenses: '',
      runtime: false,
    });
  });

  it('returns no rows without components', () => {
    expect(cdxToRows({})).toEqual([]);
  });

  it('sanitizes file names', () => {
    expect(sbomFileName('a/b:c@1', 'cdx')).toBe('sbom-a_b_c_1.cdx.json');
  });
});

describe('SbomPanelComponent', () => {
  let get: jasmine.Spy;
  let panel: SbomPanelComponent;

  const change = (prev, curr) =>
    new SimpleChange(prev, curr, prev === undefined);

  beforeEach(() => {
    get = jasmine.createSpy('get');
    GlobalVariable.http = { get } as any;
    panel = new SbomPanelComponent(
      { textInput$: of(''), onFilterChange: () => {} } as any,
      { instant: (k: string) => k } as any,
      { openError: () => {} } as any,
      { markForCheck: () => {} } as any
    );
    panel.url = 'scan/workload/sbom';
    panel.ngOnInit();
  });

  it('loads rows and refetches only when params change', () => {
    get.and.returnValue(of('{"components":[{"name":"bash"}]}'));
    panel.params = { id: 'a' };
    panel.ngOnChanges({
      url: change(undefined, panel.url),
      params: change(undefined, { id: 'a' }),
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.calls.mostRecent().args[1].params).toEqual({
      id: 'a',
      format: 'cyclonedx',
    });
    expect(panel.gridOptions.rowData?.length).toBe(1);
    expect(panel.error).toBe('');

    panel.ngOnChanges({ params: change({ id: 'a' }, { id: 'a' }) });
    panel.ngOnChanges({ name: change('x', 'y') });
    expect(get).toHaveBeenCalledTimes(1);

    panel.ngOnChanges({ params: change({ id: 'a' }, { id: 'b' }) });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('maps errors to messages', () => {
    get.and.returnValue(throwError(() => ({ status: 404 })));
    panel.ngOnChanges({ url: change(undefined, panel.url) });
    expect(panel.error).toBe('sbom.NOT_FOUND');

    get.and.returnValue(throwError(() => ({ status: 403 })));
    panel.ngOnChanges({ params: change({ id: 'a' }, { id: 'b' }) });
    expect(panel.error).toBe('sbom.LOAD_ERR');

    get.and.returnValue(of('not json'));
    panel.ngOnChanges({ params: change({ id: 'b' }, { id: 'c' }) });
    expect(panel.error).toBe('sbom.LOAD_ERR');
    expect(panel.loading).toBeFalse();
  });
});
