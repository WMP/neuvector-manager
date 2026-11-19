import { of, throwError } from 'rxjs';
import { GlobalVariable } from '@common/variables/global.variable';
import { buildS3Patch, SbomStorageComponent } from './sbom-storage.component';

const base = {
  enabled: true,
  endpoint: ' http://minio:9000/ ',
  region: ' us-east-1 ',
  bucket: ' b-1 ',
  prefix: ' p ',
  path_style: true,
  access_key: ' ak ',
  secret_key: '',
  delete_unused: false,
  delete_grace_period: 60,
};

describe('buildS3Patch', () => {
  it('omits secret_key when none was typed and trims text fields', () => {
    const { config } = buildS3Patch(base, false);
    expect('secret_key' in config).toBeFalse();
    expect('secret_key_set' in config).toBeFalse();
    expect(config['endpoint']).toBe('http://minio:9000/');
    expect(config['region']).toBe('us-east-1');
    expect(config['bucket']).toBe('b-1');
    expect(config['prefix']).toBe('p');
    expect(config['access_key']).toBe('ak');
  });

  it('sends a typed secret and an empty secret on removal', () => {
    expect(buildS3Patch({ ...base, secret_key: 's' }, false).config).toEqual(
      jasmine.objectContaining({ secret_key: 's' })
    );
    expect(buildS3Patch(base, true).config['secret_key']).toBe('');
  });
});

describe('SbomStorageComponent', () => {
  const cfg = {
    enabled: true,
    endpoint: 'http://minio:9000',
    region: 'us-east-1',
    bucket: 'bucket1',
    prefix: 'p',
    path_style: true,
    access_key: 'ak',
    secret_key_set: true,
    delete_unused: false,
    delete_grace_period: 0,
  };
  const row = {
    registry: 'reg',
    image_id: 'id1',
    digest: 'sha256:abc',
    images: ['repo:tag'],
    size: 2048,
    last_modified: '2026-01-01T00:00:00Z',
  };
  let get: jasmine.Spy;
  let patch: jasmine.Spy;
  let open: jasmine.Spy;
  let openError: jasmine.Spy;
  let dialogResult: boolean;
  let dialog: { open: jasmine.Spy };

  const make = (allowed: string[]) =>
    new SbomStorageComponent(
      { instant: (k: string) => k } as any,
      { open, openError } as any,
      {
        getDisplayFlagByMultiPermission: (p: string) => allowed.includes(p),
      } as any,
      dialog as any
    );

  beforeEach(() => {
    get = jasmine
      .createSpy('get')
      .and.callFake((url: string) =>
        of(url === 'sbom/s3' ? { config: cfg } : { images: [row] })
      );
    patch = jasmine.createSpy('patch').and.returnValue(of({}));
    open = jasmine.createSpy('open');
    openError = jasmine.createSpy('openError');
    GlobalVariable.http = { get, patch } as any;
    dialogResult = false;
    dialog = {
      open: jasmine
        .createSpy('dialogOpen')
        .and.callFake(() => ({ afterClosed: () => of(dialogResult) })),
    };
  });

  it('loads config (0 shown as 1440) and list', () => {
    const c = make(['write_sbom']);
    c.ngOnInit();
    expect(c.form.value.endpoint).toBe('http://minio:9000');
    expect(c.form.value.secret_key).toBe('');
    expect(c.form.value.delete_grace_period).toBe(1440);
    expect(c.rows).toEqual([row]);
  });

  it('requires the secret only for a real endpoint change', () => {
    const c = make(['write_sbom']);
    c.ngOnInit();
    c.form.controls.endpoint.setValue(' http://minio:9000/ ');
    expect(c.form.controls.secret_key.valid).toBeTrue();
    c.form.controls.endpoint.setValue('http://other:9000');
    expect(c.form.controls.secret_key.hasError('required')).toBeTrue();
    c.markRemoveSecret();
    expect(c.form.controls.secret_key.valid).toBeTrue();
    c.undoRemoveSecret();
    expect(c.form.controls.secret_key.hasError('required')).toBeTrue();
    c.form.controls.secret_key.setValue('s');
    expect(c.form.controls.secret_key.valid).toBeTrue();
  });

  it('does not require the secret when none is saved', () => {
    get.and.callFake((url: string) =>
      of(
        url === 'sbom/s3'
          ? { config: { ...cfg, secret_key_set: false } }
          : { images: [] }
      )
    );
    const c = make(['write_sbom']);
    c.ngOnInit();
    c.form.controls.endpoint.setValue('http://other:9000');
    expect(c.form.controls.secret_key.valid).toBeTrue();
  });

  it('skips the config without global read but loads the list', () => {
    const c = make([]);
    c.ngOnInit();
    expect(get).not.toHaveBeenCalledWith('sbom/s3');
    expect(get).toHaveBeenCalledWith('sbom/s3/images');
    expect(c.canReadConfig).toBeFalse();
  });

  it('is read-only with global read only', () => {
    const c = make(['sbom_global_read']);
    c.ngOnInit();
    expect(c.canWrite).toBeFalse();
    expect(c.form.disabled).toBeTrue();
  });

  it('saves with PATCH and reloads', () => {
    const c = make(['write_sbom']);
    c.ngOnInit();
    c.save();
    expect(patch.calls.mostRecent().args[0]).toBe('sbom/s3');
    expect('secret_key' in patch.calls.mostRecent().args[1].config).toBeFalse();
    expect(open).toHaveBeenCalled();
    expect(get.calls.allArgs().filter(a => a[0] === 'sbom/s3').length).toBe(2);
  });

  it('asks before turning on delete_unused', () => {
    const c = make(['write_sbom']);
    c.ngOnInit();
    c.form.controls.delete_unused.setValue(true);
    c.save();
    expect(dialog.open).toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    dialogResult = true;
    c.save();
    expect(patch.calls.mostRecent().args[1].config.delete_unused).toBeTrue();
  });

  it('formats sizes with a unit', () => {
    const c = make([]);
    const size = c.columnDefs.find(d => d.field === 'size') as any;
    expect(size.valueFormatter({ value: 0 })).toBe('0 B');
    expect(size.valueFormatter({ value: 900 })).toBe('900 B');
  });

  it('reports save and list errors', () => {
    const c = make(['write_sbom']);
    c.ngOnInit();
    patch.and.returnValue(throwError(() => ({ status: 400 })));
    c.save();
    expect(openError).toHaveBeenCalledWith({ status: 400 }, 'sbom.s3.SAVE_ERR');
    get.and.returnValue(throwError(() => ({ status: 500 })));
    c.loadList();
    expect(openError).toHaveBeenCalledWith({ status: 500 }, 'sbom.s3.LOAD_ERR');
    expect(c.rows).toEqual([]);
  });

  it('downloads the selected SBOM and reports errors', () => {
    const c = make(['write_sbom']);
    c.ngOnInit();
    c.selected = row;
    get.calls.reset();
    get.and.returnValue(throwError(() => ({ status: 404 })));
    c.download();
    expect(get).toHaveBeenCalledWith('scan/registry/image/sbom', {
      params: { name: 'reg', imageId: 'id1', format: 'cyclonedx' },
      responseType: 'text',
    });
    expect(openError).toHaveBeenCalledWith(
      { status: 404 },
      'sbom.s3.DOWNLOAD_ERR'
    );
    expect(c.downloading).toBeFalse();
  });
});
