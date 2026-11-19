import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ColDef, GridSizeChangedEvent } from 'ag-grid-community';
import { TranslateService } from '@ngx-translate/core';
import { GlobalConstant } from '@common/constants/global.constant';
import { PathConstant } from '@common/constants/path.constant';
import { GlobalVariable } from '@common/variables/global.variable';
import { NotificationService } from '@services/notification.service';

interface ComponentRef {
  name: string;
  version: string;
  purl: string;
}

interface Section {
  titleKey: string;
  rows: any[];
  columnDefs: ColDef[];
  onRowClicked?: (row: any) => void;
}

export function componentsText(components: ComponentRef[]): string {
  return (components || [])
    .map(c => (c.version ? `${c.name} ${c.version}` : c.name))
    .join(', ');
}

// "host:5000/a:1" -> repository "host:5000/a", tag "1"
export function splitImage(image: string): { image: string; tag: string } {
  const i = image.lastIndexOf(':');
  // a ':' before the last '/' belongs to the registry host, not to a tag
  return i < 0 || i < image.lastIndexOf('/')
    ? { image, tag: '' }
    : { image: image.slice(0, i), tag: image.slice(i + 1) };
}

@Component({
  standalone: false,
  selector: 'app-sbom-components',
  templateUrl: './sbom-components.component.html',
  styleUrls: ['./sbom-components.component.scss'],
})
export class SbomComponentsComponent {
  form = new FormGroup({
    name: new FormControl('', Validators.maxLength(256)),
    purl: new FormControl('', Validators.maxLength(512)),
    version: new FormControl('', Validators.maxLength(128)),
  });
  searching = false;
  searched = false;
  sections: Section[] = [
    {
      titleKey: 'sbom.PODS',
      rows: [],
      columnDefs: this.cols([
        ['sbom.POD', 'name'],
        ['sbom.CONTAINER', 'container'],
        ['sbom.NAMESPACE', 'domain'],
        ['sbom.IMAGE', 'image'],
      ]),
      onRowClicked: row =>
        this.router.navigate(['/workloads'], {
          queryParams: { container: encodeURIComponent(row.id) },
        }),
    },
    {
      titleKey: 'sbom.NODES',
      rows: [],
      columnDefs: this.cols([['sbom.NAME', 'name']]),
      onRowClicked: row =>
        this.router.navigate(['/hosts'], {
          queryParams: { node: encodeURIComponent(row.id) },
        }),
    },
    {
      titleKey: 'sbom.REGISTRY_IMAGES',
      rows: [],
      columnDefs: this.cols([
        ['sbom.REGISTRY', 'registry'],
        ['sbom.IMAGES', p => (p.data.images || []).join(', ')],
        ['sbom.NAMESPACE', 'domain'],
      ]),
      onRowClicked: row => {
        if (!row.images?.length) return;
        const { image, tag } = splitImage(row.images[0]);
        this.router.navigate(['/regScan'], {
          queryParams: {
            registry: encodeURIComponent(row.registry),
            image: encodeURIComponent(image),
            tag: encodeURIComponent(tag),
          },
        });
      },
    },
    {
      titleKey: 'sbom.RUNNING_IMAGES',
      rows: [],
      columnDefs: this.cols([
        ['sbom.IMAGE', 'image'],
        ['sbom.WORKLOADS', 'workloads'],
      ]),
    },
  ];
  private groups = ['workloads', 'hosts', 'images', 'running_images'];

  constructor(
    private translate: TranslateService,
    private notificationService: NotificationService,
    private router: Router
  ) {}

  get canSearch(): boolean {
    const { name, purl } = this.form.value;
    return (
      !this.searching && this.form.valid && !!(name?.trim() || purl?.trim())
    );
  }

  search(): void {
    if (!this.canSearch || this.form.invalid) return;
    const params: Record<string, string> = {};
    Object.entries(this.form.value).forEach(([k, v]) => {
      if (v?.trim()) params[k] = v.trim();
    });
    this.searching = true;
    // never show the previous results under a new query
    this.searched = false;
    GlobalVariable.http
      .get<any>(PathConstant.SBOM_COMPONENT_URL, { params })
      .subscribe({
        next: res => {
          this.groups.forEach(
            (g, i) => (this.sections[i].rows = res?.[g] || [])
          );
          this.searched = true;
          this.searching = false;
        },
        error: err => {
          this.searching = false;
          if (err.status === 429) {
            this.notificationService.open(
              this.translate.instant('sbom.SEARCH_BUSY'),
              GlobalConstant.NOTIFICATION_TYPE.WARNING
            );
          } else {
            this.notificationService.openError(
              err,
              this.translate.instant('sbom.SEARCH_ERR')
            );
          }
        },
      });
  }

  onGridSizeChanged(event: GridSizeChangedEvent): void {
    event.api.sizeColumnsToFit();
  }

  // Every section ends with the components column.
  private cols(defs: [string, string | ((p: any) => string)][]): ColDef[] {
    defs.push([
      'sbom.COMPONENTS_FOUND',
      p => componentsText(p.data.components),
    ]);
    return defs.map(([headerKey, f]) => ({
      sortable: true,
      resizable: true,
      ...(typeof f === 'string' ? { field: f } : { valueGetter: f }),
      headerValueGetter: () => this.translate.instant(headerKey),
    }));
  }
}
