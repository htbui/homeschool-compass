/**
 * Baseline 50-state + DC homeschool law directory ("Legal Radar").
 *
 * This is a simplified, informational summary compiled from public sources
 * (state statutes and homeschool advocacy summaries). Laws and funding programs
 * change frequently — the app always surfaces `VERIFY_NOTICE` alongside this data,
 * and the compliance service is expected to replace it with a maintained feed.
 */

export type RegTier = 'none' | 'low' | 'moderate' | 'high';

export interface FundingProgram {
  name: string;
  kind: 'esa' | 'tax_credit' | 'tax_deduction' | 'voucher' | 'allotment';
  /** Approximate annual amount per student when known, for display only. */
  approxAmount?: string;
  note: string;
}

export interface StateLaw {
  code: string;
  name: string;
  tier: RegTier;
  compulsoryAges: [number, number];
  noticeRequired: boolean;
  noticeNote?: string;
  /** Required instructional days per year, when the statute sets one. */
  requiredDays?: number;
  /** Required instructional hours per year, when the statute sets one. */
  requiredHours?: number;
  testingRequired: boolean;
  portfolioRequired: boolean;
  /** Public-school extracurricular access for homeschoolers ("Tim Tebow" law). */
  activitiesAccess: 'statewide' | 'district' | 'none';
  funding: FundingProgram[];
  requirements: string[];
}

export const VERIFY_NOTICE =
  'Informational summary only — not legal advice. Homeschool laws and funding programs change often; confirm with your state education department or a homeschool legal association before filing.';

export const TIER_INFO: Record<RegTier, { label: string; color: string; blurb: string }> = {
  none: { label: 'No notice', color: '#4BA36B', blurb: 'No requirement to notify the state.' },
  low: { label: 'Low regulation', color: '#7FB24B', blurb: 'Notify the state; few other requirements.' },
  moderate: { label: 'Moderate regulation', color: '#E3A33B', blurb: 'Notice plus test scores and/or evaluations.' },
  high: { label: 'High regulation', color: '#E0605A', blurb: 'Notice, assessments, and often curriculum approval or home visits.' },
};

const s = (law: StateLaw) => law;

export const STATE_LAWS: StateLaw[] = [
  s({ code: 'AL', name: 'Alabama', tier: 'low', compulsoryAges: [6, 17], noticeRequired: true, noticeNote: 'Enroll in a church school (cover school) or qualify as a private tutor.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'CHOOSE Act Education Savings Account', kind: 'esa', approxAmount: '$2,000 (homeschool)', note: 'Phased eligibility; homeschool students receive a smaller award than private-school students.' }], requirements: ['Church school enrollment or private tutor option', 'Attendance kept per church school rules'] }),
  s({ code: 'AK', name: 'Alaska', tier: 'none', compulsoryAges: [7, 16], noticeRequired: false, testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Correspondence program allotments', kind: 'allotment', note: 'Families enrolled in a public correspondence (homeschool) program can receive a student allotment for approved expenses.' }], requirements: ['No notice required for independent homeschooling'] }),
  s({ code: 'AZ', name: 'Arizona', tier: 'low', compulsoryAges: [6, 16], noticeRequired: true, noticeNote: 'File an affidavit of intent with the county school superintendent within 30 days of starting.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Empowerment Scholarship Account (ESA)', kind: 'esa', approxAmount: '~$7,000+', note: 'Universal ESA. Note: families using an ESA sign a contract instead of filing a homeschool affidavit.' }], requirements: ['Affidavit of intent with birth certificate copy', 'Instruct in reading, grammar, math, social studies, science'] }),
  s({ code: 'AR', name: 'Arkansas', tier: 'low', compulsoryAges: [5, 17], noticeRequired: true, noticeNote: 'Submit a notice of intent to the superintendent annually.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Education Freedom Account (LEARNS Act)', kind: 'esa', note: 'Homeschool students are eligible under the program\'s phase-in rules.' }], requirements: ['Annual notice of intent (by Aug 15 or 14 days before withdrawing)'] }),
  s({ code: 'CA', name: 'California', tier: 'low', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Most families file a Private School Affidavit (Oct 1–15) to operate a home-based private school.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'none', funding: [{ name: 'Charter independent-study programs', kind: 'allotment', note: 'Public charter homeschool programs often provide instructional funds (these are public school enrollment, not independent homeschooling).' }], requirements: ['Private School Affidavit annually', 'Attendance records', 'Courses in branches of study taught in public schools', 'Instruction in English'] }),
  s({ code: 'CO', name: 'Colorado', tier: 'moderate', compulsoryAges: [6, 17], noticeRequired: true, noticeNote: 'Notice of intent 14 days before starting, then annually.', requiredDays: 172, requiredHours: 688, testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Notice of intent', '172 days averaging 4 hours/day', 'Evaluation in grades 3, 5, 7, 9, 11 (standardized test or qualified evaluator)', 'Attendance and immunization records'] }),
  s({ code: 'CT', name: 'Connecticut', tier: 'none', compulsoryAges: [5, 18], noticeRequired: false, noticeNote: 'Optional Notice of Intent is recommended but not required by statute.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Equivalent instruction in required subjects'] }),
  s({ code: 'DE', name: 'Delaware', tier: 'low', compulsoryAges: [5, 16], noticeRequired: true, noticeNote: 'Register the homeschool and report enrollment and attendance annually.', requiredDays: 180, testingRequired: false, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Annual enrollment report (by Oct 1)', 'Annual attendance report (by July 31)'] }),
  s({ code: 'DC', name: 'District of Columbia', tier: 'moderate', compulsoryAges: [5, 18], noticeRequired: true, noticeNote: 'Notice of intent 15 business days before starting.', testingRequired: false, portfolioRequired: true, activitiesAccess: 'none', funding: [], requirements: ['Notice of intent', 'Thorough, regular instruction during the school year', 'Portfolio available for review'] }),
  s({ code: 'FL', name: 'Florida', tier: 'moderate', compulsoryAges: [6, 16], noticeRequired: true, noticeNote: 'Notice to the county superintendent within 30 days of starting.', testingRequired: true, portfolioRequired: true, activitiesAccess: 'statewide', funding: [{ name: 'Family Empowerment Scholarship – Personalized Education Program (PEP)', kind: 'esa', approxAmount: '~$8,000', note: 'Capacity-limited; PEP students follow PEP rules rather than the homeschool statute.' }], requirements: ['Notice of intent', 'Portfolio of records and work samples kept 2 years', 'Annual evaluation (test, certified teacher, psychologist, or other approved method)'] }),
  s({ code: 'GA', name: 'Georgia', tier: 'moderate', compulsoryAges: [6, 16], noticeRequired: true, noticeNote: 'Declaration of intent within 30 days of starting and by Sept 1 each year.', requiredDays: 180, requiredHours: 810, testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Georgia Promise Scholarship', kind: 'esa', approxAmount: '$6,500', note: 'Eligibility tied to residence in a qualifying school zone; check program rules for home study.' }], requirements: ['Declaration of intent', '180 days of 4.5 hours', 'Standardized test every 3 years starting grade 3', 'Annual progress report kept'] }),
  s({ code: 'HI', name: 'Hawaii', tier: 'moderate', compulsoryAges: [5, 18], noticeRequired: true, noticeNote: 'Notify the principal of the public school the child would attend.', testingRequired: true, portfolioRequired: false, activitiesAccess: 'none', funding: [], requirements: ['Notice of intent', 'Annual progress report (test, evaluation, or portfolio review)'] }),
  s({ code: 'ID', name: 'Idaho', tier: 'none', compulsoryAges: [7, 16], noticeRequired: false, testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Parental Choice Tax Credit', kind: 'tax_credit', approxAmount: 'up to $5,000', note: 'Refundable credit for qualifying education expenses; homeschool expenses eligible.' }], requirements: ['Instruction comparable to public schools'] }),
  s({ code: 'IL', name: 'Illinois', tier: 'none', compulsoryAges: [6, 17], noticeRequired: false, testingRequired: false, portfolioRequired: false, activitiesAccess: 'none', funding: [{ name: 'Education Expense Credit', kind: 'tax_credit', approxAmount: 'up to $750/family', note: 'Credit for qualifying K–12 expenses over $250; homeschool qualifies.' }], requirements: ['Instruct in English in the branches taught in public schools'] }),
  s({ code: 'IN', name: 'Indiana', tier: 'none', compulsoryAges: [7, 18], noticeRequired: false, requiredDays: 180, testingRequired: false, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['180 days of instruction', 'Attendance records'] }),
  s({ code: 'IA', name: 'Iowa', tier: 'none', compulsoryAges: [6, 16], noticeRequired: false, noticeNote: 'Independent Private Instruction needs no notice; Competent Private Instruction options require forms.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Tuition & Textbook Tax Credit', kind: 'tax_credit', note: 'Credit on qualifying textbook expenses.' }], requirements: ['Choose an instruction option (IPI or CPI)'] }),
  s({ code: 'KS', name: 'Kansas', tier: 'low', compulsoryAges: [7, 18], noticeRequired: true, noticeNote: 'Register a non-accredited private school with the State Board of Education.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'none', funding: [], requirements: ['One-time registration', 'Competent teacher', 'Instruction for a period substantially equivalent to public school'] }),
  s({ code: 'KY', name: 'Kentucky', tier: 'low', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Notify the local board within 2 weeks of the start of the school year.', requiredDays: 170, testingRequired: false, portfolioRequired: false, activitiesAccess: 'none', funding: [], requirements: ['Annual notice', 'Attendance and scholarship reports'] }),
  s({ code: 'LA', name: 'Louisiana', tier: 'moderate', compulsoryAges: [7, 18], noticeRequired: true, noticeNote: 'Apply for home study approval within 15 days of starting.', requiredDays: 180, testingRequired: true, portfolioRequired: false, activitiesAccess: 'district', funding: [{ name: 'LA GATOR Scholarship', kind: 'esa', note: 'Education savings account with phased eligibility.' }, { name: 'K–12 educational expense deduction', kind: 'tax_deduction', note: 'Deduction for qualifying school expenses.' }], requirements: ['Home study application', 'Annual evidence of progress (test or portfolio)'] }),
  s({ code: 'ME', name: 'Maine', tier: 'moderate', compulsoryAges: [6, 17], noticeRequired: true, noticeNote: 'Notice of intent within 10 days of starting; letter of continuation annually by Sept 1.', requiredDays: 175, testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Notice of intent', 'Annual assessment (test, teacher review, or portfolio)', 'Required subjects'] }),
  s({ code: 'MD', name: 'Maryland', tier: 'moderate', compulsoryAges: [5, 18], noticeRequired: true, noticeNote: 'Notice 15 days before starting.', testingRequired: false, portfolioRequired: true, activitiesAccess: 'none', funding: [], requirements: ['Notice of consent form', 'Portfolio reviewed up to 3 times per year (or umbrella supervision)', 'Regular, thorough instruction'] }),
  s({ code: 'MA', name: 'Massachusetts', tier: 'high', compulsoryAges: [6, 16], noticeRequired: true, noticeNote: 'Obtain prior approval from the local school committee.', requiredHours: 900, testingRequired: true, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Prior approval of education plan', 'Assessment method agreed with district', 'Hours comparable to public school'] }),
  s({ code: 'MI', name: 'Michigan', tier: 'none', compulsoryAges: [6, 18], noticeRequired: false, testingRequired: false, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Instruction in reading, spelling, math, science, history, civics, literature, writing, grammar'] }),
  s({ code: 'MN', name: 'Minnesota', tier: 'moderate', compulsoryAges: [7, 17], noticeRequired: true, noticeNote: 'Report to the superintendent by Oct 1 (first year) then letter of intent annually.', testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'K–12 Education Credit & Subtraction', kind: 'tax_credit', note: 'Credit and subtraction for qualifying education expenses; homeschool expenses can qualify.' }], requirements: ['Annual letter of intent', 'Annual nationally normed test'] }),
  s({ code: 'MS', name: 'Mississippi', tier: 'low', compulsoryAges: [6, 17], noticeRequired: true, noticeNote: 'Certificate of enrollment with the school attendance officer by Sept 15.', requiredDays: 180, testingRequired: false, portfolioRequired: false, activitiesAccess: 'none', funding: [], requirements: ['Certificate of enrollment', '180 days'] }),
  s({ code: 'MO', name: 'Missouri', tier: 'none', compulsoryAges: [7, 17], noticeRequired: false, requiredHours: 1000, testingRequired: false, portfolioRequired: true, activitiesAccess: 'statewide', funding: [{ name: 'MOScholars', kind: 'esa', note: 'Tax-credit funded scholarship; homeschool students can be eligible.' }], requirements: ['1,000 hours/year, 600 in core subjects (400 at the regular home location)', 'Plan book/log, portfolio of work samples, and evaluations'] }),
  s({ code: 'MT', name: 'Montana', tier: 'low', compulsoryAges: [7, 16], noticeRequired: true, noticeNote: 'Notify the county superintendent annually.', requiredHours: 720, testingRequired: false, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Annual notice', 'Attendance and immunization records', '720 hours (grades 1–3), 1,080 (4–12)'] }),
  s({ code: 'NE', name: 'Nebraska', tier: 'low', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'File the exempt school forms annually.', requiredHours: 1032, testingRequired: false, portfolioRequired: false, activitiesAccess: 'none', funding: [], requirements: ['Annual exempt-school filing', '1,032 hours (elementary) / 1,080 (high school)'] }),
  s({ code: 'NV', name: 'Nevada', tier: 'low', compulsoryAges: [7, 18], noticeRequired: true, noticeNote: 'One-time notice of intent to the district.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Notice of intent', 'Educational plan of instruction'] }),
  s({ code: 'NH', name: 'New Hampshire', tier: 'moderate', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Notify a participating agency within 5 days of starting.', testingRequired: true, portfolioRequired: true, activitiesAccess: 'statewide', funding: [{ name: 'Education Freedom Accounts', kind: 'esa', note: 'Homeschool expenses eligible.' }], requirements: ['Notice of intent', 'Portfolio and annual evaluation (kept, not filed)'] }),
  s({ code: 'NJ', name: 'New Jersey', tier: 'none', compulsoryAges: [6, 16], noticeRequired: false, testingRequired: false, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Equivalent instruction'] }),
  s({ code: 'NM', name: 'New Mexico', tier: 'low', compulsoryAges: [5, 18], noticeRequired: true, noticeNote: 'Notify within 30 days of starting and by April 1 each year.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Annual notification', 'Parent has a high school diploma or equivalent', 'Attendance and immunization records'] }),
  s({ code: 'NY', name: 'New York', tier: 'high', compulsoryAges: [6, 16], noticeRequired: true, noticeNote: 'Letter of intent by July 1 (or within 14 days of starting), then IHIP.', requiredHours: 900, testingRequired: true, portfolioRequired: false, activitiesAccess: 'none', funding: [], requirements: ['Letter of intent', 'Individualized Home Instruction Plan (IHIP)', 'Quarterly reports', 'Annual assessment', '900 hours (grades 1–6), 990 (7–12)'] }),
  s({ code: 'NC', name: 'North Carolina', tier: 'moderate', compulsoryAges: [7, 16], noticeRequired: true, noticeNote: 'Notice of intent to the Division of Non-Public Education.', testingRequired: true, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Notice of intent', 'Regular schedule for at least 9 calendar months', 'Annual nationally standardized test', 'Attendance and immunization records'] }),
  s({ code: 'ND', name: 'North Dakota', tier: 'moderate', compulsoryAges: [7, 16], noticeRequired: true, noticeNote: 'Statement of intent 14 days before starting.', requiredDays: 175, testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Statement of intent', '175 days of 4 hours', 'Testing in certain grades'] }),
  s({ code: 'OH', name: 'Ohio', tier: 'low', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Notify the superintendent within 5 days of starting and annually.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Annual notification only'] }),
  s({ code: 'OK', name: 'Oklahoma', tier: 'none', compulsoryAges: [5, 18], noticeRequired: false, requiredDays: 180, testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Parental Choice Tax Credit', kind: 'tax_credit', approxAmount: 'up to $1,000', note: 'Refundable credit for homeschool expenses.' }], requirements: ['Instruction for 180 days'] }),
  s({ code: 'OR', name: 'Oregon', tier: 'moderate', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Notify the ESD within 10 days of starting.', testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['One-time notice', 'Testing in grades 3, 5, 8, 10'] }),
  s({ code: 'PA', name: 'Pennsylvania', tier: 'high', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Notarized affidavit to the superintendent by Aug 1.', requiredDays: 180, requiredHours: 900, testingRequired: true, portfolioRequired: true, activitiesAccess: 'statewide', funding: [], requirements: ['Notarized affidavit with outline of objectives', 'Portfolio + annual evaluator review', 'Standardized tests in grades 3, 5, 8', '180 days or 900 hours (elementary) / 990 (secondary)'] }),
  s({ code: 'RI', name: 'Rhode Island', tier: 'high', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Approval from the local school committee.', requiredDays: 180, testingRequired: true, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['School committee approval', 'Attendance register', 'Instruction comparable to public school'] }),
  s({ code: 'SC', name: 'South Carolina', tier: 'moderate', compulsoryAges: [5, 17], noticeRequired: true, noticeNote: 'Choose one of three options: district approval, SCAIHS, or an accountability association.', requiredDays: 180, testingRequired: false, portfolioRequired: true, activitiesAccess: 'statewide', funding: [], requirements: ['Enroll under one of three legal options', '180 days of 4.5 hours', 'Plan book, portfolio, and semiannual progress report'] }),
  s({ code: 'SD', name: 'South Dakota', tier: 'low', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'Notification within 30 days of starting.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Notification form'] }),
  s({ code: 'TN', name: 'Tennessee', tier: 'moderate', compulsoryAges: [6, 17], noticeRequired: true, noticeNote: 'Notice of intent annually to the local director, or enroll in a church-related umbrella school.', requiredDays: 180, requiredHours: 720, testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Annual notice', '180 days of 4 hours', 'Testing in grades 5, 7, 9 (independent option)'] }),
  s({ code: 'TX', name: 'Texas', tier: 'none', compulsoryAges: [6, 19], noticeRequired: false, testingRequired: false, portfolioRequired: false, activitiesAccess: 'district', funding: [{ name: 'Texas Education Freedom Accounts', kind: 'esa', approxAmount: '~$2,000 (homeschool)', note: 'New ESA program; homeschool students receive a reduced award. Check launch timing.' }], requirements: ['Bona fide curriculum in reading, spelling, grammar, math, and good citizenship', 'Instruction in a visual format (e.g. books, workbooks)'] }),
  s({ code: 'UT', name: 'Utah', tier: 'low', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'One-time affidavit with the local school board.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Utah Fits All Scholarship', kind: 'esa', approxAmount: '~$8,000', note: 'Homeschool students eligible; capacity-limited lottery when oversubscribed.' }], requirements: ['Notarized affidavit'] }),
  s({ code: 'VT', name: 'Vermont', tier: 'high', compulsoryAges: [6, 16], noticeRequired: true, noticeNote: 'Enrollment notice annually by March 1 for the next year.', requiredDays: 175, testingRequired: true, portfolioRequired: true, activitiesAccess: 'statewide', funding: [], requirements: ['Annual enrollment notice with course outline', 'Annual assessment (teacher report, portfolio, or test)'] }),
  s({ code: 'VA', name: 'Virginia', tier: 'moderate', compulsoryAges: [5, 18], noticeRequired: true, noticeNote: 'Notice of intent by Aug 15 annually.', testingRequired: true, portfolioRequired: false, activitiesAccess: 'district', funding: [], requirements: ['Notice of intent with description of curriculum', 'Evidence of progress by Aug 1 (test or evaluation)', 'Or religious exemption option'] }),
  s({ code: 'WA', name: 'Washington', tier: 'moderate', compulsoryAges: [8, 18], noticeRequired: true, noticeNote: 'Declaration of intent by Sept 15 or within 2 weeks of starting.', requiredHours: 1000, testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Annual declaration', 'Parent qualification', 'Annual test or evaluation', '11 required subjects'] }),
  s({ code: 'WV', name: 'West Virginia', tier: 'moderate', compulsoryAges: [6, 17], noticeRequired: true, noticeNote: 'Notice of intent 2 weeks before starting.', testingRequired: true, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Hope Scholarship', kind: 'esa', note: 'Eligibility generally requires prior public-school enrollment or entering kindergarten.' }], requirements: ['Notice of intent', 'Annual assessment in grades 3, 5, 8, 11'] }),
  s({ code: 'WI', name: 'Wisconsin', tier: 'low', compulsoryAges: [6, 18], noticeRequired: true, noticeNote: 'File the PI-1206 form online by Oct 15.', requiredHours: 875, testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [], requirements: ['Annual PI-1206 filing', '875 hours of instruction', 'Sequentially progressive curriculum'] }),
  s({ code: 'WY', name: 'Wyoming', tier: 'low', compulsoryAges: [7, 16], noticeRequired: true, noticeNote: 'Submit a curriculum to the local board annually.', testingRequired: false, portfolioRequired: false, activitiesAccess: 'statewide', funding: [{ name: 'Steamboat Legacy Scholarship (ESA)', kind: 'esa', note: 'Homeschool students can be eligible; check current status.' }], requirements: ['Annual curriculum submission'] }),
];

const BY_CODE = new Map(STATE_LAWS.map((l) => [l.code, l]));

export function getStateLaw(code: string): StateLaw | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Coarse ZIP → state lookup by 3-digit prefix ranges (enough for onboarding defaults). */
const ZIP_RANGES: [number, number, string][] = [
  [5, 5, 'NY'], [6, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 59, 'VT'],
  [60, 69, 'CT'], [70, 89, 'NJ'], [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'], [200, 205, 'DC'],
  [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'],
  [320, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'], [400, 427, 'KY'],
  [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'],
  [569, 569, 'DC'], [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'],
  [660, 679, 'KS'], [680, 693, 'NE'], [700, 715, 'LA'], [716, 729, 'AR'], [733, 733, 'TX'], [730, 749, 'OK'], [750, 799, 'TX'],
  [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'],
  [885, 885, 'TX'], [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'], [980, 994, 'WA'],
  [995, 999, 'AK'],
];

export function stateFromZip(zip: string): string | undefined {
  if (!/^\d{5}$/.test(zip)) return undefined;
  const prefix = Number(zip.slice(0, 3));
  const hit = ZIP_RANGES.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  return hit && BY_CODE.has(hit[2]) ? hit[2] : undefined;
}
