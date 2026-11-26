/**
 * Where the structured curriculum comes from: each area's E&O document (already in the
 * education-scotland-eo collection, as markdown) and its benchmark PDFs on education.gov.scot
 * (https://education.gov.scot/curriculum-for-excellence/benchmarks, English versions). The
 * across-learning files repeat codes from the areas, and Gàidhlig's benchmarks are in Gaelic, so
 * they are left out for now.
 */
const MEDIA = 'https://education.gov.scot/media';

export interface AreaSource {
  /** The E&O collection's markdown file. */
  eo: string;
  benchmarks: string[];
}

export const AREA_SOURCES: AreaSource[] = [
  { eo: 'literacy-and-english.md', benchmarks: [`${MEDIA}/giljynmw/literacyenglishbenchmarks.pdf`] },
  { eo: 'numeracy-and-mathematics.md', benchmarks: [`${MEDIA}/s5edgtvx/numeracyandmathematicsbenchmarks.pdf`] },
  { eo: 'sciences.md', benchmarks: [`${MEDIA}/kosdrlaj/sciencesbenchmarkspdf.pdf`] },
  { eo: 'social-studies.md', benchmarks: [`${MEDIA}/eprjaqf0/social-studiesbenchmarkspdf.pdf`] },
  { eo: 'technologies.md', benchmarks: [`${MEDIA}/irimoozl/technologiesbenchmarkspdf.pdf`] },
  { eo: 'expressive-arts.md', benchmarks: [`${MEDIA}/vv3l2kp2/expressive-arts-benchmarks-0825.pdf`] },
  {
    eo: 'health-and-wellbeing.md',
    benchmarks: [`${MEDIA}/tbhpydja/hwbpersonalsocial-educationbenchmarkspdf.pdf`, `${MEDIA}/xybdxqqm/hwbphysicaleducationbenchmarkspdf.pdf`, `${MEDIA}/ryukm55b/hwbfoodhealthbenchmarkspdf.pdf`],
  },
  { eo: 'religious-and-moral-education.md', benchmarks: [`${MEDIA}/1z0ejtwp/rmebenchmarkspdf.pdf`] },
  { eo: 'religious-education-in-roman-catholic-schools.md', benchmarks: [`${MEDIA}/sjjfw5oj/rerc_benchmarkspdf.pdf`] },
  { eo: 'modern-languages.md', benchmarks: [`${MEDIA}/fr0bhzlu/modernlanguagesbenchmarkspdf.pdf`] },
  { eo: 'gaelic-learners.md', benchmarks: [`${MEDIA}/s1dnp0ek/gaeliclearnersbenchmarkspdf.pdf`] },
  { eo: 'classical-languages.md', benchmarks: [`${MEDIA}/0noishwy/classicallanguagesbenchmarks.pdf`] },
];

export const CURRICULUM_HOSTS = ['education.gov.scot'];
