# PopGeneticsPro

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22740171.svg)](https://doi.org/10.5281/zenodo.22740171)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

**Population genetics for plants, from the field to the paper — without writing code.** All ten blocks are complete (version 1.0.0).

**Online version:** https://luisangelbg.github.io/PopGeneticsPro/ ·
**User manual (Spanish):** [PDF](manual/PopGeneticsPro_Manual_de_usuario_ES.pdf) ·
[HTML](https://luisangelbg.github.io/PopGeneticsPro/manual/es/manual-completo.html)

A web platform (HTML + JavaScript, no installation; it also runs offline from a local copy) that takes plant population genetic data —
microsatellites, SNPs and isozymes, dominant AFLP/ISSR/RAPD bands, chloroplast or nuclear sequences, and
morphological characters — from the raw genotype table to publication-ready results: diversity indices,
Hardy–Weinberg and linkage disequilibrium tests, hierarchical AMOVA and F-statistics, genetic distances and trees,
Bayesian clustering, haplotype networks, demographic history and fine-scale spatial genetic structure.

It brings the classical toolkit of population genetics into a single guided workflow, adds plant-specific
analyses rarely found together (mating system, spatial genetic structure, Q<sub>ST</sub> vs F<sub>ST</sub>,
divergence times), and ends in editable, journal-ready figures and a reproducible report.

Developed as a teaching and research tool for botany, agronomy, forestry, ecology and plant breeding.

## How to open it

1. Right-click **`server.ps1`** → *Run with PowerShell* (or double-click `Open PopGeneticsPro.bat`).
   The browser opens at `http://localhost:9000`.
   If the port is busy: `powershell -ExecutionPolicy Bypass -File server.ps1 -Port 9001`
2. Double-clicking `index.html` also works: the example data sets are embedded in `js/examples.js`, so they load
   without a server, and your own files load either way. (The MCMC of Block 7 and of the dating card runs in a
   background thread built by the page itself; if a browser refuses that thread, the chain runs in the page, which
   then pauses until each run ends.)
   If you edit the files in `data/`, regenerate `js/examples.js` with the one-line script in that file's header.
3. To use it from a tablet on the same Wi-Fi network, run the script *as administrator*; it prints the address.

## Status of the blocks

| Block | Content | Status |
|---|---|---|
| 1 | Home: theory, method gallery, live Wright–Fisher simulator, references | ✅ done |
| 2 | Data import (spreadsheets with or without parameter rows, binary matrices, .str, .gen and .arp genotype files, FASTA, VCF), built-in data sheet for pasting or typing, data template designer and converter, sample sheets, quality control with cell-by-cell checks | ✅ done |
| 3 | Allele frequencies and diversity (Na, Ne, Ho, He, uHe, I, PIC, rarefied allelic richness, private and locally common alleles, phenotypic H′) | ✅ done |
| 4 | Hardy–Weinberg (exact and χ²), F_IS (Weir & Cockerham, Nei & Chesser) with bootstrap, null alleles (EM, Brookfield, Chakraborty), linkage disequilibrium (r̄_d, r², D′) | ✅ done |
| 5 | Differentiation (Weir & Cockerham θ/f/F, Nei G_ST with Nei & Chesser corrections, Hedrick G′_ST, Jost D, Nm), hierarchical AMOVA (regions › populations › individuals › gene copies, Φ_ST/Φ_CT/Φ_SC/Φ_IS/Φ_PT) with permutation tests, pairwise matrices | ✅ done |
| 6 | Genetic distances (Nei 1972/1978, Cavalli-Sforza, Reynolds, Rogers, Prevosti; Smouse–Peakall, shared alleles, Jaccard, Dice, p-distance, Gower), PCoA with Lingoes correction, NJ and UPGMA trees with bootstrap over loci and Newick export, tree studio (circular or rectangular trees with coloured clades, rings and images of the OTUs), Mantel test and Rousset isolation by distance | ✅ done |
| 7 | Bayesian clustering (admixture / no-admixture model of Pritchard et al. 2000 in a Web Worker, replicate alignment by label permutation, Evanno ΔK, Puechmaille estimators, barplots), DAPC with k-means clustering (BIC) and leave-one-out re-assignment, assignment tests (Rannala & Mountain, Paetkau) and Monte Carlo migrant detection | ✅ done |
| 8 | DNA sequences: sites, haplotypes, Hd, π, θ_W, Tajima D, Fu Fs, Fu & Li D*/F*, R₂ with coalescent P-values, mismatch distribution and sudden-expansion fit, N_ST vs G_ST (Pons & Petit), Φ_ST, median-joining network; divergence times (ML branch lengths under JC/K80/HKY/GTR ± Γ with AICc, fossil and secondary calibrations or a known rate, least-squares dating and Bayesian MCMC with strict or relaxed lognormal clock, geological time scale, NEXUS and MCMC-log exports) | ✅ done |
| 9 | Demography: bottleneck tests (heterozygosity excess by conditional coalescent simulation under IAM/TPM/SMM, adjusted for inbreeding, with sign, standardized-differences and Wilcoxon tests on normal scores; mode shift; M-ratio), N_e (LD method with Waples corrections and jackknife; heterozygote excess with limits), fine-scale spatial structure within populations or over all pairs (Loiselle kinship or Smouse–Peakall r, correlogram with permutation envelope, b_F, Sp, Nb), selfing rate from F_IS, P_ST vs F_ST with exact confidence limits | ✅ done |
| 10 | Self-contained HTML report (tables, interpretations, every figure as edited, methods paragraph with settings and references, BibTeX), print-to-PDF, and a ZIP with data, CSV tables, Newick trees, figures in SVG and PNG/TIFF up to 900 dpi | ✅ done |

## What runs where

Everything is computed in the browser with plain JavaScript: no server, no upload. The only third-party component
is an open-source reader and writer of spreadsheet files (.xlsx, .ods), bundled in `vendor/` under its own
Apache License 2.0, which must be kept with it; it is not part of the original work of this program. The permutation tests, bootstrap
resampling and the MCMC all draw from a seeded generator, so a run can be reproduced from the seed reported with
the results.

## Data formats read

| Format | Extension | Notes |
|---|---|---|
| Genotype spreadsheet | `.xlsx`, `.csv` | two columns per codominant locus, population column, with or without parameter rows (counts in row 1, names in row 2) |
| Binary / dominant matrix | `.xlsx`, `.csv` | AFLP, ISSR, RAPD presence–absence |
| Morphological matrix | `.xlsx`, `.csv` | quantitative, ordinal and nominal traits |
| Two-row genotype file | `.str`, `.txt` | one or two rows per individual |
| Population block file | `.gen`, `.txt` | loci list, then POP blocks; 2- and 3-digit allele coding |
| Project file | `.arp` | profile and sample blocks, genotypic and haplotypic |
| FASTA | `.fas`, `.fasta` | aligned sequences |
| VCF | `.vcf` | biallelic SNPs |
| Genotypes in one cell | `.xlsx`, `.csv` | `182/186`, `A/G`, `AG` — one column per locus |
| Sequences in a sheet | `.xlsx`, `.csv` | one column per gene region, concatenated in column order |
| Sample sheet | `.xlsx`, `.csv` | ID, Population, Region, Latitude, Longitude — completes FASTA, VCF, .str and .gen files |
| Built-in data sheet | — | paste from any spreadsheet or type; saved in the browser and downloadable as .xlsx, .ods, .csv or .tsv |

## Data template designer

Block 2 includes a designer for people who have not yet laid out their data. You choose what was scored (SSR,
SNP, dominant bands, haplotype codes, DNA sequences or morphological traits), the sampling design (populations and
plants per population, or one bulk sample per landrace or accession; groups, regions and coordinates), and the loci,
primers, gene regions or traits. The app then

- checks the design before any data are collected (minimum sample sizes, number of loci or bands, the smallest
  attainable P of Φ_CT given the number of populations per region, what analyses the design will allow);
- writes the sheet to fill in as .xlsx (with Instructions and Design sheets), CSV, the parameter-row layout, FASTA
  skeleton or sample sheet, with IDs and populations already in place;
- declares the layout in row 1 of the PopGeneticsPro sheet, so the filled file is read without any guessing and
  compared with the design: loci, individuals, population names and sizes, rows still empty, and every invalid
  value with its spreadsheet row (band scores other than 0/1, half-scored genotypes, letters in allele sizes,
  non-IUPAC bases, unaligned sequences, repeated IDs, coordinates out of range).

The same designer converts any loaded dataset (.gen, .str, .arp, FASTA, VCF…) into those layouts;
every conversion was checked to read back identical to the original.

## Tree studio and images of the OTUs

Every tree of Block 6 and every dated tree of Block 8 is drawn by one tree studio (`js/treeviz.js`): circular
(with an opening for the time axis) or rectangular layouts; clades coloured by population or region, or cut from
the tree into *k* named clades; shaded clades, clade arcs with their names, rings for populations, regions or
admixture ancestry; support as dots or numbers; for dated trees, 95% HPD bars, calibrated nodes and the geological
scale (ICS chart v2020/03) as bands, boundary lines or coloured strips.

Images of the OTUs (flowers, fruits, leaves, seeds, whole plants, animals) can be added for each tip or for each
group (`js/imagelib.js`). Each image is framed (circle, rounded square, square or none), linked to its branch by a
leader line, and adjusted in the browser: crop, zoom, rotation, brightness, contrast, saturation, warmth, sharpness,
greyscale and removal of a plain background. An image is drawn only after the user confirms that it shows exactly
that species or variety, and its source and licence are recorded. Images stay on the computer (IndexedDB, per data
file) and are embedded in the exported SVG, PNG and TIFF.

## Divergence times

Card 8 of Block 8 dates a tree of aligned sequences (`js/dating.js`, `js/blockdating.js`):

- **Tree**: neighbour-joining on K2P distances or an imported Newick/NEXUS tree; outgroup or midpoint root;
  branch lengths by maximum likelihood under JC69, K80, HKY85 or GTR (± Γ, four categories), the model chosen by AICc.
- **Clock**: fossil minimum ages on crown or stem nodes (offset lognormal, offset exponential or uniform priors,
  with a helper that reads ages from the stratigraphic unit), secondary calibrations (normal), or a known
  substitution rate with presets for chloroplast, mitochondrial, nuclear and ITS DNA.
- **Fast**: least-squares dating (To et al. 2016) with resampled confidence intervals.
- **Bayesian**: MCMC on node ages with a strict or uncorrelated lognormal relaxed clock, Yule or constant-size
  coalescent prior, sampled κ and α, effective sample sizes, trace plots, prior-versus-posterior plots of the
  calibrations and a prior-only run; exports to NEXUS with ages and intervals, Newick chronograms, CSV and tab-delimited MCMC logs.

Validation (`tests/dating.test.js`, run in the browser): transition matrices, Yang's discrete-Γ rates and the
pruning likelihood match analytic values and a brute-force sum over internal states to 1e-9; maximum-likelihood
distances match the Jukes–Cantor formula; LSD recovers simulated ages with 95.8% coverage of its intervals over
360 nodes; the MCMC reproduces a uniform root calibration when sampling the prior (KS test), and its 95% HPD
intervals cover the true ages of 95.6% of nodes under a strict clock and 93.3% under a relaxed clock (σ = 0.3).
The analyses run on a fixed topology: tree uncertainty is not integrated, and dated tips (serial samples) are not
supported.

## User manual

A user manual in Spanish walks through every block with worked examples, the decision rules behind each
interpretation, file formats, a glossary, troubleshooting and the full reference list: `manual/PopGeneticsPro_Manual_de_usuario_ES.pdf`
(249 pages) or, chapter by chapter, `manual/es/`.

## Licence and citation

Released under the GNU General Public License, version 3 or later (GPL-3.0-or-later). If it helps with a thesis or a
paper, please cite the software and the original method papers it implements — each one is named at the point where
it is used and listed on the home page.

> Barrera-Guzmán, L.Á. (2026). *PopGeneticsPro: a browser-based platform for plant population genetics with codominant, dominant, sequence and morphological data* (Version 1.0.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.22740171

The DOI above is the concept DOI and always resolves to the latest version; each release also has its own DOI
(v1.0.0: [10.5281/zenodo.22740172](https://doi.org/10.5281/zenodo.22740172)).
