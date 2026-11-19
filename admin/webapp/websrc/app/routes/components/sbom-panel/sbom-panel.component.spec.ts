import { cdxToRows, sbomFileName } from './sbom-panel.component';

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
