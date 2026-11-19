import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AssetsHttpService } from '@common/api/assets-http.service';
import { PathConstant } from '@common/constants/path.constant';
import { AuthUtilsService } from '@common/utils/auth.utils';
import { GlobalVariable } from '@common/variables/global.variable';
import { NotificationService } from '@services/notification.service';

export interface DtrackConfig {
  enabled: boolean;
  url: string;
  api_key_set: boolean;
  project_name: string;
  project_version: string;
  tags: string[];
  inactive_grace_period: number;
}

// "a, b,,c" -> ["a","b","c"]; tags cannot contain commas
export function splitTags(text: string | null): string[] {
  return (text || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t);
}

// api_key: absent = unchanged, "" = delete. api_key_set is never sent.
export function buildDtrackPatch(
  form: {
    enabled: boolean;
    url: string;
    api_key: string;
    project_name: string;
    project_version: string;
    tags: string;
    inactive_grace_period: number;
  },
  removeKey: boolean
): { config: Record<string, unknown> } {
  const config: Record<string, unknown> = {
    enabled: form.enabled,
    url: (form.url || '').trim(),
    project_name: form.project_name,
    project_version: form.project_version,
    tags: splitTags(form.tags),
    inactive_grace_period: form.inactive_grace_period,
  };
  if (form.api_key) config.api_key = form.api_key;
  else if (removeKey) config.api_key = '';
  return { config };
}

@Component({
  standalone: false,
  selector: 'app-dependency-track',
  templateUrl: './dependency-track.component.html',
  styleUrls: ['./dependency-track.component.scss'],
})
export class DependencyTrackComponent implements OnInit {
  form = new FormGroup({
    enabled: new FormControl(false),
    url: new FormControl(''),
    api_key: new FormControl('', (c: AbstractControl) => this.keyRequired(c)),
    project_name: new FormControl('', Validators.maxLength(1024)),
    project_version: new FormControl('', Validators.maxLength(1024)),
    tags: new FormControl(''),
    inactive_grace_period: new FormControl(1440, [
      Validators.required,
      Validators.min(0),
    ]),
  });
  loaded: DtrackConfig | null = null;
  loading = true;
  saving = false;
  removeKey = false;
  canRead = false;
  canWrite = false;
  workloads: { id: string; name: string; domain: string }[] = [];
  workloadCtrl = new FormControl('');
  previewing = false;
  preview: {
    project_name: string;
    project_version: string;
    tags: string[];
    skipped_reason?: string;
  } | null = null;

  constructor(
    private tr: TranslateService,
    private notificationService: NotificationService,
    private authUtils: AuthUtilsService,
    private assetsHttpService: AssetsHttpService
  ) {}

  ngOnInit(): void {
    // Global sbom permission only; namespace users get 403 from the controller.
    this.canWrite =
      this.authUtils.getDisplayFlagByMultiPermission('write_sbom');
    this.canRead =
      this.canWrite ||
      this.authUtils.getDisplayFlagByMultiPermission('sbom_global_read');
    this.form.controls.url.valueChanges.subscribe(() =>
      this.form.controls.api_key.updateValueAndValidity()
    );
    this.load();
    if (this.canWrite) this.loadWorkloads();
  }

  // A changed URL needs the key again, so the old key cannot go to another host.
  private keyRequired(c: AbstractControl): ValidationErrors | null {
    const url = c.parent?.get('url')?.value;
    return this.loaded && (url || '').trim() !== this.loaded.url && !c.value
      ? { required: true }
      : null;
  }

  get urlChanged(): boolean {
    return (
      !!this.loaded &&
      (this.form.controls.url.value || '').trim() !== this.loaded.url
    );
  }

  load(): void {
    this.loading = true;
    GlobalVariable.http
      .get<{ config: DtrackConfig }>(PathConstant.SBOM_DTRACK_URL)
      .subscribe({
        next: ({ config }) => {
          this.loaded = config;
          this.removeKey = false;
          this.form.reset({
            enabled: config.enabled,
            url: config.url,
            api_key: '',
            project_name: config.project_name,
            project_version: config.project_version,
            tags: (config.tags || []).join(', '),
            inactive_grace_period: config.inactive_grace_period,
          });
          if (!this.canWrite) this.form.disable();
          this.loading = false;
        },
        error: err => {
          this.loading = false;
          this.notificationService.openError(
            err,
            this.tr.instant('sbom.dtrack.LOAD_ERR')
          );
        },
      });
  }

  private loadWorkloads(): void {
    this.assetsHttpService.getContainers().subscribe({
      next: ws => {
        this.workloads = ws
          .flatMap(w => (w.children?.length ? w.children : [w]))
          .map(w => ({
            id: w.id,
            name: w.display_name || w.name,
            domain: w.domain,
          }));
      },
      error: err =>
        this.notificationService.openError(
          err,
          this.tr.instant('sbom.dtrack.PREVIEW_ERR')
        ),
    });
  }

  markRemoveKey(): void {
    this.removeKey = true;
    this.form.controls.api_key.setValue('');
  }

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    GlobalVariable.http
      .patch(
        PathConstant.SBOM_DTRACK_URL,
        buildDtrackPatch(this.form.getRawValue() as any, this.removeKey)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.notificationService.open(this.tr.instant('sbom.dtrack.SAVE_OK'));
          this.load();
        },
        error: err => {
          this.saving = false;
          this.notificationService.openError(
            err,
            this.tr.instant('sbom.dtrack.SAVE_ERR')
          );
        },
      });
  }

  runPreview(): void {
    if (!this.workloadCtrl.value || this.previewing) return;
    const v = this.form.getRawValue();
    this.previewing = true;
    GlobalVariable.http
      .post<any>(PathConstant.SBOM_DTRACK_PREVIEW_URL, {
        project_name: v.project_name,
        project_version: v.project_version,
        tags: splitTags(v.tags),
        workload_id: this.workloadCtrl.value,
      })
      .subscribe({
        next: r => {
          this.preview = r;
          this.previewing = false;
        },
        error: err => {
          this.previewing = false;
          this.preview = null;
          this.notificationService.openError(
            err,
            this.tr.instant('sbom.dtrack.PREVIEW_ERR')
          );
        },
      });
  }
}
