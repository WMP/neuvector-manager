import { of, throwError } from 'rxjs';
import { GlobalVariable } from '@common/variables/global.variable';
import {
  componentsText,
  SbomComponentsComponent,
  splitImage,
} from './sbom-components.component';

describe('SbomComponents helpers', () => {
  it('formats components', () => {
    expect(
      componentsText([
        { name: 'log4j-core', version: '2.14.0', purl: '' },
        { name: 'bash', version: '', purl: '' },
      ])
    ).toBe('log4j-core 2.14.0, bash');
    expect(componentsText([])).toBe('');
  });

  it('splits repository and tag at the last colon', () => {
    expect(splitImage('a/b:1')).toEqual({ image: 'a/b', tag: '1' });
    expect(splitImage('host:5000/a:1')).toEqual({
      image: 'host:5000/a',
      tag: '1',
    });
    expect(splitImage('host:5000/a')).toEqual({
      image: 'host:5000/a',
      tag: '',
    });
    expect(splitImage('a')).toEqual({ image: 'a', tag: '' });
  });
});

describe('SbomComponentsComponent', () => {
  let get: jasmine.Spy;
  let open: jasmine.Spy;
  let openError: jasmine.Spy;
  let navigate: jasmine.Spy;
  let comp: SbomComponentsComponent;

  beforeEach(() => {
    get = jasmine.createSpy('get');
    open = jasmine.createSpy('open');
    openError = jasmine.createSpy('openError');
    navigate = jasmine.createSpy('navigate');
    GlobalVariable.http = { get } as any;
    comp = new SbomComponentsComponent(
      { instant: (k: string) => k } as any,
      { open, openError } as any,
      { navigate } as any
    );
  });

  it('does not search without name and purl', () => {
    comp.form.patchValue({ name: '  ', version: '1.0' });
    expect(comp.canSearch).toBeFalse();
    comp.search();
    expect(get).not.toHaveBeenCalled();
  });

  it('sends only non-empty trimmed params and sets rows per group', () => {
    get.and.returnValue(
      of({
        workloads: [{ id: 'w' }],
        hosts: [],
        images: [{ registry: 'r' }, { registry: 'q' }],
        running_images: [{ image: 'i' }],
      })
    );
    comp.form.patchValue({ name: ' log4j-core ', version: '<2.17.1' });
    comp.search();
    expect(get).toHaveBeenCalledWith('scan/component', {
      params: { name: 'log4j-core', version: '<2.17.1' },
    });
    expect(comp.sections.map(s => s.rows.length)).toEqual([1, 0, 2, 1]);
    expect(comp.searched).toBeTrue();
    expect(comp.searching).toBeFalse();
  });

  it('shows the busy message on 429 and the error otherwise', () => {
    comp.form.patchValue({ purl: 'pkg:maven/a/b' });
    get.and.returnValue(throwError(() => ({ status: 429 })));
    comp.search();
    expect(open.calls.mostRecent().args[0]).toBe('sbom.SEARCH_BUSY');
    expect(comp.searching).toBeFalse();
    expect(comp.searched).toBeFalse();

    const err = { status: 500 };
    get.and.returnValue(throwError(() => err));
    comp.search();
    expect(openError).toHaveBeenCalledWith(err, 'sbom.SEARCH_ERR');
  });

  it('navigates from rows with encoded values', () => {
    const [pods, nodes, images, running] = comp.sections;
    pods.onRowClicked!({ id: 'a b' });
    expect(navigate).toHaveBeenCalledWith(['/workloads'], {
      queryParams: { container: 'a%20b' },
    });
    nodes.onRowClicked!({ id: 'n1' });
    expect(navigate).toHaveBeenCalledWith(['/hosts'], {
      queryParams: { node: 'n1' },
    });
    images.onRowClicked!({ registry: 'r', images: ['host:5000/a:1', 'x:2'] });
    expect(navigate).toHaveBeenCalledWith(['/regScan'], {
      queryParams: { registry: 'r', image: 'host%3A5000%2Fa', tag: '1' },
    });
    navigate.calls.reset();
    images.onRowClicked!({ registry: 'r', images: [] });
    expect(navigate).not.toHaveBeenCalled();
    expect(running.onRowClicked).toBeUndefined();
  });
});
