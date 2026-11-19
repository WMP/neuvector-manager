import { NgModule } from '@angular/core';
import { SettingsComponent } from './settings.component';
import { RouterModule, Routes } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

const routes: Routes = [
  { path: '', component: SettingsComponent },
  {
    path: 'users',
    loadChildren: () => import('./users/users.module').then(m => m.UsersModule),
  },
  {
    path: 'configuration',
    loadChildren: () =>
      import('./configuration/configuration.module').then(
        m => m.ConfigurationModule
      ),
  },
  {
    path: 'ldap',
    loadChildren: () => import('./ldap/ldap.module').then(m => m.LdapModule),
  },
  {
    path: 'saml',
    loadChildren: () => import('./saml/saml.module').then(m => m.SamlModule),
  },
  {
    path: 'openid',
    loadChildren: () =>
      import('./openid/openid.module').then(m => m.OpenidModule),
  },
  {
    path: 'dependency-track',
    loadChildren: () =>
      import('./dependency-track/dependency-track.module').then(
        m => m.DependencyTrackModule
      ),
  },
  {
    path: 'sbom-storage',
    loadChildren: () =>
      import('./sbom-storage/sbom-storage.module').then(
        m => m.SbomStorageModule
      ),
  },
  { path: '**', redirectTo: '' },
];

@NgModule({
  declarations: [SettingsComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    TranslateModule,
    MatCardModule,
    MatGridListModule,
  ],
})
export class SettingsModule {}
