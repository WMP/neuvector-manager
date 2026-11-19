import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AssetsHttpService } from '@common/api/assets-http.service';
import { LoadingTemplateModule } from '@components/ui/loading-template/loading-template.module';
import { DependencyTrackComponent } from './dependency-track.component';

const routes: Routes = [
  { path: '', component: DependencyTrackComponent },
  { path: '**', redirectTo: '' },
];

@NgModule({
  declarations: [DependencyTrackComponent],
  imports: [
    RouterModule.forChild(routes),
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSlideToggleModule,
    LoadingTemplateModule,
  ],
  providers: [AssetsHttpService],
})
export class DependencyTrackModule {}
