export const SOURCES = {
  verdonk2019: {
    short: 'Verdonk 2019',
    cite: 'Verdonk SJE, Vesper HW, Martens F, Sluss PM, Hillebrand JJ, Heijboer AC. Estradiol reference intervals in women during the menstrual cycle, postmenopausal women and men using an LC-MS/MS method. Clin Chim Acta 2019;495:198–204.',
    url: 'https://doi.org/10.1016/j.cca.2019.04.062',
    method: 'LC-MS/MS, traceable to the CDC reference method',
  },
  anckaert2021: {
    short: 'Anckaert 2021',
    cite: 'Anckaert E, Jank A, Petzold J, et al. Extensive monitoring of the natural menstrual cycle using the serum biomarkers estradiol, luteinizing hormone and progesterone. Pract Lab Med 2021;25:e00211.',
    url: 'https://doi.org/10.1016/j.plabm.2021.e00211',
    method: 'Elecsys Estradiol III immunoassay; every cycle rescaled to a standard 29 days with the LH peak on day 15; designed, funded and co-written by the assay’s maker, Roche Diagnostics',
  },
  parikh2018: {
    short: 'Parikh 2018',
    cite: 'Parikh TP, Stolze B, Ozarda Y, et al. Diurnal variation of steroid hormones and their reference intervals using mass spectrometric analysis. Endocr Connect 2018;7:1354–1361.',
    url: 'https://doi.org/10.1530/EC-18-0417',
    method: 'LC-MS/MS, one platform for both sexes; paired draws at 6–8 am and 6–8 pm',
  },
  veldhuis1987: {
    short: 'Veldhuis 1987',
    cite: 'Veldhuis JD, King JC, Urban RJ, et al. Operating characteristics of the male hypothalamo-pituitary-gonadal axis: pulsatile release of testosterone and follicle-stimulating hormone and their temporal coupling with luteinizing hormone. J Clin Endocrinol Metab 1987;65:929–941.',
    url: 'https://doi.org/10.1210/jcem-65-5-929',
    method: 'radioimmunoassay, blood every 10 minutes; testosterone series n = 5',
  },
  rothman2011: {
    short: 'Rothman 2011',
    cite: 'Rothman MS, Carlson NE, Xu M, et al. Reexamination of testosterone, dihydrotestosterone, estradiol and estrone levels across the menstrual cycle and in postmenopausal women measured by liquid chromatography–tandem mass spectrometry. Steroids 2011;76:177–182.',
    url: 'https://doi.org/10.1016/j.steroids.2010.10.010',
    method: 'LC-MS/MS, three draws per cycle; complete data in 14 women',
  },
  bui2013: {
    short: 'Bui 2013',
    cite: 'Bui HN, Sluss PM, Blincko S, Knol DL, Blankenstein MA, Heijboer AC. Dynamics of serum testosterone during the menstrual cycle evaluated by daily measurements with an ID-LC-MS/MS method and a 2nd generation automated immunoassay. Steroids 2013;78:96–101.',
    url: 'https://doi.org/10.1016/j.steroids.2012.10.010',
    method: 'ID-LC-MS/MS, 25 women sampled daily',
  },
  // cited in the "What they do" block, not drawn in the chart
  romans2012: {
    short: 'Romans 2012',
    cite: 'Romans S, Clarkson R, Einstein G, Petrovic M, Stewart D. Mood and the menstrual cycle: a review of prospective data studies. Gend Med 2012;9:361–384.',
    url: 'https://doi.org/10.1016/j.genm.2012.07.003',
    method: 'review of 47 prospective daily-diary studies',
  },
  schmidt1998: {
    short: 'Schmidt 1998',
    cite: 'Schmidt PJ, Nieman LK, Danaceau MA, Adams LF, Rubinow DR. Differential behavioral effects of gonadal steroids in women with and in those without premenstrual syndrome. N Engl J Med 1998;338:209–216.',
    url: 'https://doi.org/10.1056/NEJM199801223380401',
    method: 'hormone suppression then add-back, 20 women with PMS and 15 without',
  },
  reilly2024: {
    short: 'Reilly 2024',
    cite: 'Reilly TJ, Patel S, Unachukwu IC, Knox C-L, Wilson CA, Craig MC, Schmalenberger KM, Eisenlohr-Moul TA, Cullen AE. The prevalence of premenstrual dysphoric disorder: systematic review and meta-analysis. J Affect Disord 2024;349:534–540.',
    url: 'https://doi.org/10.1016/j.jad.2024.01.066',
    method: 'meta-analysis of 44 studies, 50,659 participants; PMDD 3.2% confirmed, 7.7% provisional, 1.6% in community samples with a confirmed diagnosis',
  },
  finkelstein2013: {
    short: 'Finkelstein 2013',
    cite: 'Finkelstein JS, Lee H, Burnett-Bowie S-AM, et al. Gonadal steroids and body composition, strength, and sexual function in men. N Engl J Med 2013;369:1011\u20131022.',
    url: 'https://doi.org/10.1056/NEJMoa1206168',
    method: '400 men, gonadal steroids suppressed then testosterone replaced at five doses, half of them also blocked from converting it to estradiol',
  },
  finkelstein2016: {
    short: 'Finkelstein 2016',
    cite: 'Finkelstein JS, Lee H, Leder BZ, et al. Gonadal steroid-dependent effects on bone turnover and bone mineral density in men. J Clin Invest 2016;126:1114\u20131125.',
    url: 'https://doi.org/10.1172/JCI84137',
    method: 'the same design read out on the skeleton; estrogens primarily regulate bone in adult men',
  },
  son2005: {
    short: 'Son 2005',
    cite: 'Son ED, Lee JY, Lee S, et al. Topical application of 17\u03b2-estradiol increases extracellular matrix protein synthesis by stimulating TGF-\u03b2 signaling in aged human skin in vivo. J Invest Dermatol 2005;124:1149\u20131161.',
    url: 'https://doi.org/10.1111/j.0022-202X.2005.23736.x',
    method: 'topical estradiol under occlusion for two weeks on the skin of 13 people aged 68\u201382, eight women and five men; results not split by sex',
  },
  maseroli2022: {
    short: 'Maseroli 2022',
    cite: 'Maseroli E, Vignozzi L. Are endogenous androgens linked to female sexual function? A systematic review and meta-analysis. J Sex Med 2022;19(4):553–568.',
    url: 'https://doi.org/10.1016/j.jsxm.2022.01.515',
    method: 'meta-analysis, 34 studies and 3,268 women; total testosterone associated with desire, a moderate effect, and no difference by cycle phase or menopausal status',
  },
};

// x is days from the LH peak: the axis the interval data is defined on.
export const DAYS = { from: -15, to: 14 };

const NG_DL_TO_NMOL_L = 0.03467;
const t = (ngdl) => +(ngdl * NG_DL_TO_NMOL_L).toFixed(2);

export const MOLECULES = {
  e2: {
    name: 'Estrogen (estradiol)',
    unit: 'pmol/L',
    token: '--e2',
    women: {
      sample: '30 women · blood drawn daily',
      // reference intervals by phase
      bands: [
        { from: -15, to: -6, lo: 31, hi: 771, phase: 'early follicular' },
        { from: -5, to: -1, lo: 104, hi: 1742, phase: 'late follicular' },
        { from: 0, to: 0, lo: 275, hi: 2864, phase: 'day of the LH peak' },
        { from: 1, to: 4, lo: 95, hi: 1188, phase: 'early luteal' },
        { from: 5, to: 9, lo: 151, hi: 1941, phase: 'mid luteal' },
        { from: 10, to: 14, lo: 39, hi: 1769, phase: 'late luteal' },
      ],
      bandSource: 'verdonk2019',
      // sub-phase medians; x = midpoint of the sub-phase window in Anckaert Supp. Table S3, standardised day minus 15
      medians: [
        { x: -12.8, v: 125, n: 78, phase: 'early follicular' },
        { x: -8.5, v: 172, n: 83, phase: 'mid follicular' },
        { x: -4.2, v: 464, n: 84, phase: 'late follicular' },
        { x: 0, v: 817, n: 79, phase: 'LH peak ± 1 day' },
        { x: 3.7, v: 390, n: 85, phase: 'early luteal' },
        { x: 7.5, v: 505, n: 81, phase: 'mid luteal' },
        { x: 11.8, v: 396, n: 84, phase: 'late luteal' },
      ],
      medianSource: 'anckaert2021',
      model: { kind: 'through-medians' },
    },
    men: {
      sample: '64 men · one blood draw each',
      bands: [{ from: -15, to: 14, lo: 12, hi: 136, phase: 'any day' }],
      bandSource: 'verdonk2019',
      medians: [],
      model: null,
    },
    evidence: 'Ranges: 30 women sampled every day of one cycle and 64 men sampled once, by mass spectrometry (Verdonk 2019). Dots: middle values from 85 women (Anckaert 2021). The curve is drawn through the dots. Each man gave blood once, so he gets a range and no curve.',
    captions: {
      split: 'Drawn the usual way. Each body gets its own scale, so both look equally busy. Check the numbers on the left.',
      merged: 'Same scale. On her peak day, his entire range sits below the floor of hers. On most other days the two ranges overlap.',
    },
  },

  t: {
    name: 'Testosterone',
    unit: 'nmol/L',
    token: '--t',
    women: {
      sample: '120 women, 19–67 · morning draw',
      bands: [{ from: -15, to: 14, lo: t(9.0), hi: t(84.8), phase: 'morning, cycle day not recorded', native: '9.0–84.8 ng/dL' }],
      bandSource: 'parikh2018',
      medians: [],
      levels: [
        { when: '6–8 am', hour: 7, v: t(27.1), native: '27.1 ng/dL' },
        { when: '6–8 pm', hour: 19, v: t(24.8), native: '24.8 ng/dL' },
      ],
      levelSource: 'parikh2018',
      // group-mean total testosterone, early follicular : midcycle : mid-luteal = 15.4 : 22.7 : 18.7 ng/dL
      model: { kind: 'daily-rhythm', swell: [[-15, 1], [-10, 1], [0, 22.7 / 15.4], [7, 18.7 / 15.4], [14, 1]], pulses: null },
    },
    men: {
      sample: '62 men, 19–75 · morning draw',
      bands: [{ from: -15, to: 14, lo: t(227.0), hi: t(903.4), phase: 'morning, any day', native: '227.0–903.4 ng/dL' }],
      bandSource: 'parikh2018',
      medians: [],
      levels: [
        { when: '6–8 am', hour: 7, v: t(524.4), native: '524.4 ng/dL' },
        { when: '6–8 pm', hour: 19, v: t(329.3), native: '329.3 ng/dL' },
      ],
      levelSource: 'parikh2018',
      // a pulse about every 112 ± 14 min, each rising roughly a third above the trough before it:
      // peak 910 ng/dL is 242 above the preceding nadir, so nadir 668 and rise 242/668.
      // decay is half the measured 90 ± 11 min pulse duration.
      model: { kind: 'daily-rhythm', swell: null, pulses: { everyMin: 112, jitterMin: 14, rise: 0.36, decayMin: 45 } },
    },
    evidence: 'Ranges: morning values from 120 women and 62 men, one mass-spectrometry platform (Parikh 2018); the women’s cycle day was not recorded. Both curves are estimates. His: evening value 37% below morning (Parikh 2018), plus a pulse about every two hours (Veldhuis 1987, five men). Hers: evening 8.5% below morning, plus a mid-cycle rise of about 1.5× seen in group averages but not in every woman (Rothman 2011, Bui 2013). Her pulses are not drawn.',
    captions: {
      split: 'Same trick, other hormone. Her month has a bump. His every day has a drop. Own scales, so both fill the frame.',
      merged: 'Same scale. Now she is the thread. In the morning he has nearly twenty times as much, and by evening he has lost a third. He does this every day and has never noticed.',
    },
  },
};
