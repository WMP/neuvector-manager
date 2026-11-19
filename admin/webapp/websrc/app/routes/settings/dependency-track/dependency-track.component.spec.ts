import { of, throwError } from 'rxjs';
import { GlobalVariable } from '@common/variables/global.variable';
import {
  buildDtrackPatch,
  DependencyTrackComponent,
} from './dependency-track.component';

const base = {
  enabled: true,
  url: ' https://dt.example ',
  api_key: '',
  project_name: '{image}',
  project_version: '{digest}',
  tags: ' a, b ,,c ',
  inactive_grace_period: 60,
};

describe('buildDtrackPatch', () => {
  it('omits api_key when none was typed and splits tags', () => {
    const { config } = buildDtrackPatch(base, false);
    expect('api_key' in config).toBeFalse();
    expect(config['tags']).toEqual(['a', 'b', 'c']);
    expect(config['url']).toBe('https://dt.example');
    expect('api_key_set' in config).toBeFalse();
  });

  it('sends a typed key and an empty key on removal', () => {
    expect(buildDtrackPatch({ ...base, api_key: 'k' }, false).config).toEqual(
      jasmine.objectContaining({ api_key: 'k' })
    );
    expect(buildDtrackPatch(base, true).config['api_key']).toBe('');
  });
});

describe('DependencyTrackComponent', () => {
  const cfg = {
    enabled: true,
    url: 'https://dt.example',
    api_key_set: true,
    project_name: 'p',
    project_version: 'v',
    tags: ['x', 'y'],
    inactive_grace_period: 1440,
  };
  let get: jasmine.Spy;
  let patch: jasmine.Spy;
  let post: jasmine.Spy;
  let open: jasmine.Spy;
  let openError: jasmine.Spy;
  let comp: DependencyTrackComponent;

  beforeEach(() => {
    get = jasmine.createSpy('get').and.returnValue(of({ config: cfg }));
    patch = jasmine.createSpy('patch').and.returnValue(of({}));
    post = jasmine.createSpy('post');
    open = jasmine.createSpy('open');
    openError = jasmine.createSpy('openError');
    GlobalVariable.http = { get, patch, post } as any;
    comp = new DependencyTrackComponent(
      { instant: (k: string) => k } as any,
      { open, openError } as any,
      { getDisplayFlagByMultiPermission: () => true } as any,
      {
        getContainers: () =>
          of([{ id: 'w1', display_name: 'pod1', domain: 'ns', children: [] }]),
      } as any
    );
    comp.ngOnInit();
  });

  it('loads the form without the key', () => {
    expect(get).toHaveBeenCalledWith('sbom/dependency_track');
    expect(comp.form.value.url).toBe('https://dt.example');
    expect(comp.form.value.api_key).toBe('');
    expect(comp.form.value.tags).toBe('x, y');
    expect(comp.workloads).toEqual([{ id: 'w1', name: 'pod1', domain: 'ns' }]);
  });

  it('requires the key when the URL changes', () => {
    expect(comp.form.controls.api_key.valid).toBeTrue();
    comp.form.controls.url.setValue('https://other.example');
    expect(comp.form.controls.api_key.hasError('required')).toBeTrue();
    comp.form.controls.api_key.setValue('k');
    expect(comp.form.controls.api_key.valid).toBeTrue();
  });

  it('does not require the key after Remove key or without a saved key', () => {
    comp.form.controls.url.setValue('');
    comp.markRemoveKey();
    expect(comp.form.controls.api_key.valid).toBeTrue();
    expect(comp.form.invalid).toBeFalse();

    get.and.returnValue(of({ config: { ...cfg, api_key_set: false } }));
    comp.load();
    comp.form.controls.url.setValue('https://other.example');
    expect(comp.form.controls.api_key.valid).toBeTrue();
  });

  it('saves with PATCH and reloads', () => {
    comp.save();
    expect(patch.calls.mostRecent().args[0]).toBe('sbom/dependency_track');
    expect('api_key' in patch.calls.mostRecent().args[1].config).toBeFalse();
    expect(open).toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reports save errors', () => {
    patch.and.returnValue(throwError(() => ({ status: 400 })));
    comp.save();
    expect(openError).toHaveBeenCalledWith(
      { status: 400 },
      'sbom.dtrack.SAVE_ERR'
    );
    expect(comp.saving).toBeFalse();
  });

  it('sends the workload and current templates to preview', () => {
    post.and.returnValue(
      of({ project_name: 'n', project_version: 'v', tags: [] })
    );
    comp.form.patchValue({ project_name: '{pod}', tags: 'a, b' });
    comp.workloadCtrl.setValue('w1');
    comp.runPreview();
    expect(post).toHaveBeenCalledWith('sbom/dependency_track/preview', {
      project_name: '{pod}',
      project_version: 'v',
      tags: ['a', 'b'],
      workload_id: 'w1',
    });
    expect(comp.preview?.project_name).toBe('n');
  });

  it('reports preview errors', () => {
    post.and.returnValue(throwError(() => ({ status: 404 })));
    comp.workloadCtrl.setValue('w1');
    comp.runPreview();
    expect(openError).toHaveBeenCalledWith(
      { status: 404 },
      'sbom.dtrack.PREVIEW_ERR'
    );
  });

  it('is read-only without the write permission', () => {
    const getContainers = jasmine.createSpy('getContainers');
    const ro = new DependencyTrackComponent(
      { instant: (k: string) => k } as any,
      { open, openError } as any,
      { getDisplayFlagByMultiPermission: () => false } as any,
      { getContainers } as any
    );
    ro.ngOnInit();
    expect(ro.canWrite).toBeFalse();
    expect(ro.form.disabled).toBeTrue();
    expect(getContainers).not.toHaveBeenCalled();
  });
});
