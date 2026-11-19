import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ColDef, GridOptions } from 'ag-grid-community';
import { TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { PathConstant } from '@common/constants/path.constant';
import { BytesPipe } from '@common/pipes/app.pipes';
import { AuthUtilsService } from '@common/utils/auth.utils';
import { GlobalVariable } from '@common/variables/global.variable';
import { NotificationService } from '@services/notification.service';
import { sbomFileName } from '@routes/components/sbom-panel/sbom-panel.component';
import { ConfirmDialogComponent } from '@components/ui/confirm-dialog/confirm-dialog.component';

export interface S3Config {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  path_style: boolean;
  access_key: string;
  secret_key_set: boolean;
  delete_unused: boolean;
  delete_grace_period: number;
}

export interface StoredSbom {
  registry: string;
  image_id: string;
  digest: string;
  images: string[];
  size: number;
  last_modified: string;
}

// Same normalization as the controller.
export const normalizeEndpoint = (s: string | null | undefined): string =>
  (s || '').trim().replace(/\/+$/, '');

// secret_key: absent = unchanged, "" = delete. secret_key_set is never sent.
export function buildS3Patch(
  form: {
    enabled: boolean;
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    path_style: boolean;
    access_key: string;
    secret_key: string;
    delete_unused: boolean;
    delete_grace_period: number;
  },
  removeSecret: boolean
): { config: Record<string, unknown> } {
  const t = (s: string) => (s || '').trim();
  const config: Record<string, unknown> = {
    enabled: form.enabled,
    endpoint: t(form.endpoint),
    region: t(form.region),
    bucket: t(form.bucket),
    prefix: t(form.prefix),
    path_style: form.path_style,
    access_key: t(form.access_key),
    delete_unused: form.delete_unused,
    delete_grace_period: form.delete_grace_period,
  };
  if (form.secret_key) config.secret_key = form.secret_key;
  else if (removeSecret) config.secret_key = '';
  return { config };
}

@Component({
  standalone: false,
  selector: 'app-sbom-storage',
  templateUrl: './sbom-storage.component.html',
  styleUrls: ['./sbom-storage.component.scss'],
})
export class SbomStorageComponent implements OnInit {
  form = new FormGroup({
    enabled: new FormControl(false),
    endpoint: new FormControl(''),
    region: new FormControl(''),
    bucket: new FormControl('', [
      Validators.minLength(3),
      Validators.maxLength(63),
    ]),
    prefix: new FormControl(''),
    path_style: new FormControl(false),
    access_key: new FormControl(''),
    secret_key: new FormControl('', (c: AbstractControl) =>
      this.secretRequired(c)
    ),
    delete_unused: new FormControl(false),
    delete_grace_period: new FormControl(1440, [
      Validators.required,
      Validators.min(0),
      Validators.max(525600),
      Validators.pattern(/^\d+$/),
    ]),
  });
  loaded: S3Config | null = null;
  loading = false;
  saving = false;
  removeSecret = false;
  canReadConfig = false;
  canWrite = false;

  rows: StoredSbom[] = [];
  listLoading = true;
  selected: StoredSbom | null = null;
  downloading = false;
  gridOptions: GridOptions = {
    rowSelection: 'single',
    suppressDragLeaveHidesColumns: true,
    onSelectionChanged: e =>
      (this.selected = e.api.getSelectedRows()[0] || null),
    onGridSizeChanged: e => e.api.sizeColumnsToFit(),
  };
  columnDefs: ColDef<StoredSbom>[] = [
    { field: 'registry', headerKey: 'sbom.s3.COL_REGISTRY' },
    {
      field: 'images',
      headerKey: 'sbom.s3.COL_IMAGES',
      valueFormatter: p => (p.value || []).join(', '),
    },
    { field: 'digest', headerKey: 'sbom.s3.COL_DIGEST' },
    {
      field: 'size',
      headerKey: 'sbom.s3.COL_SIZE',
      // BytesPipe has no unit below 1 KiB and returns '' for 0
      valueFormatter: p =>
        (p.value || 0) < 1024
          ? `${p.value || 0} B`
          : new BytesPipe().transform(String(p.value)),
    },
    {
      field: 'last_modified',
      headerKey: 'sbom.s3.COL_MODIFIED',
      valueFormatter: p => (p.value ? new Date(p.value).toLocaleString() : ''),
    },
  ].map(c => ({
    sortable: true,
    resizable: true,
    field: c.field,
    valueFormatter: c.valueFormatter,
    headerValueGetter: () => this.tr.instant(c.headerKey),
  })) as ColDef<StoredSbom>[];

  constructor(
    private tr: TranslateService,
    private notificationService: NotificationService,
    private authUtils: AuthUtilsService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    // The list needs sbom in any domain; the config needs the global permission.
    this.canWrite =
      this.authUtils.getDisplayFlagByMultiPermission('write_sbom');
    this.canReadConfig =
      this.canWrite ||
      this.authUtils.getDisplayFlagByMultiPermission('sbom_global_read');
    this.form.controls.endpoint.valueChanges.subscribe(() =>
      this.form.controls.secret_key.updateValueAndValidity()
    );
    if (this.canReadConfig) this.load();
    this.loadList();
  }

  // Same rule as the controller: a saved secret must not follow a changed
  // endpoint to another host, so the request needs a new secret or a removal.
  get secretNeeded(): boolean {
    return (
      !!this.loaded?.secret_key_set &&
      !this.removeSecret &&
      normalizeEndpoint(this.form.controls.endpoint.value) !==
        normalizeEndpoint(this.loaded.endpoint)
    );
  }

  private secretRequired(c: AbstractControl): ValidationErrors | null {
    return c.parent && this.secretNeeded && !c.value
      ? { required: true }
      : null;
  }

  load(): void {
    this.loading = true;
    GlobalVariable.http
      .get<{ config: S3Config }>(PathConstant.SBOM_S3_URL)
      .subscribe({
        next: ({ config }) => {
          this.loaded = config;
          this.removeSecret = false;
          this.form.reset({
            enabled: config.enabled,
            endpoint: config.endpoint,
            region: config.region,
            bucket: config.bucket,
            prefix: config.prefix,
            path_style: config.path_style,
            access_key: config.access_key,
            secret_key: '',
            delete_unused: config.delete_unused,
            delete_grace_period: config.delete_grace_period || 1440,
          });
          // no events: the endpoint listener would revalidate and re-enable the form status
          if (!this.canWrite) this.form.disable({ emitEvent: false });
          this.loading = false;
        },
        error: err => {
          this.loading = false;
          this.notificationService.openError(
            err,
            this.tr.instant('sbom.s3.LOAD_ERR')
          );
        },
      });
  }

  loadList(): void {
    this.listLoading = true;
    this.selected = null;
    GlobalVariable.http
      .get<{ images: StoredSbom[] }>(PathConstant.SBOM_S3_IMAGES_URL)
      .subscribe({
        next: r => {
          this.rows = r.images || [];
          this.listLoading = false;
        },
        error: err => {
          this.rows = [];
          this.listLoading = false;
          this.notificationService.openError(
            err,
            this.tr.instant('sbom.s3.LOAD_ERR')
          );
        },
      });
  }

  markRemoveSecret(): void {
    this.removeSecret = true;
    this.form.controls.secret_key.setValue('');
  }

  undoRemoveSecret(): void {
    this.removeSecret = false;
    this.form.controls.secret_key.updateValueAndValidity();
  }

  save(): void {
    if (this.form.invalid || this.saving) return;
    // turning deletion on removes objects from the bucket: confirm it first
    if (this.form.value.delete_unused && !this.loaded?.delete_unused) {
      this.dialog
        .open(ConfirmDialogComponent, {
          width: '80%',
          maxWidth: '600px',
          data: {
            message: this.tr.instant('sbom.s3.DELETE_CONFIRM'),
            isSync: true,
          },
        })
        .afterClosed()
        .subscribe(ok => ok && this.patch());
      return;
    }
    this.patch();
  }

  private patch(): void {
    this.saving = true;
    GlobalVariable.http
      .patch(
        PathConstant.SBOM_S3_URL,
        buildS3Patch(this.form.getRawValue() as any, this.removeSecret)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.notificationService.open(this.tr.instant('sbom.s3.SAVE_OK'));
          this.load();
        },
        error: err => {
          this.saving = false;
          this.notificationService.openError(
            err,
            this.tr.instant('sbom.s3.SAVE_ERR')
          );
        },
      });
  }

  download(): void {
    const row = this.selected;
    if (!row || this.downloading) return;
    this.downloading = true;
    GlobalVariable.http
      .get(PathConstant.SBOM_REGISTRY_IMAGE_URL, {
        params: {
          name: row.registry,
          imageId: row.image_id,
          format: 'cyclonedx',
        },
        responseType: 'text',
      })
      .subscribe({
        next: text => {
          this.downloading = false;
          saveAs(
            new Blob([text], { type: 'application/json' }),
            sbomFileName(row.images?.[0] || row.digest, 'cdx')
          );
        },
        error: err => {
          this.downloading = false;
          this.notificationService.openError(
            err,
            this.tr.instant('sbom.s3.DOWNLOAD_ERR')
          );
        },
      });
  }
}
