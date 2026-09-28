/* Demo data for the candidate (job-seeker) workspace.
 * TODO(candidate): replace with real endpoints once the candidate module lands
 * in the backend. The shapes here intentionally mirror the recruiter workspace
 * (`features/dashboard/recruiter/mock-data.ts`) so both sides can move to the
 * same API contract without rework:
 *   APPLICATIONS -> GET  /api/candidate/me/applications
 *   JOBS         -> GET  /api/jobs
 *   INTERVIEWS   -> GET  /api/candidate/me/interviews
 *   PROFILE      -> GET  /api/candidate/me/profile */

export type ApplicationStatus =
  | 'Applied'
  | 'Shortlisted'
  | 'Interview'
  | 'Offer'
  | 'Hired'
  | 'Rejected'
  | 'Withdrawn';

export type JobType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship';

export type WorkMode = 'Remote' | 'Hybrid' | 'On-site';

/** Human-readable meaning of each stage (used in tooltips/legend).
 * Candidate funnel: Applied -> Shortlisted -> Interview -> Offer -> Hired,
 * with Rejected / Withdrawn as exits. */
export const APPLICATION_STATUS_MEANINGS: Record<ApplicationStatus, string> = {
  Applied: 'Sent and waiting for the resume screen.',
  Shortlisted: 'Resume passed - the recruiter wants to talk.',
  Interview: 'Interview scheduled or completed, awaiting a decision.',
  Offer: 'Offer on the table - respond before it expires.',
  Hired: 'Offer accepted. Congratulations!',
  Rejected: 'Not moving forward for this role.',
  Withdrawn: 'You pulled out of this application.',
};

/** The funnel the dashboard reports on, in order. */
export const PIPELINE_ORDER: ApplicationStatus[] = [
  'Applied',
  'Shortlisted',
  'Interview',
  'Offer',
  'Hired',
];

export const ACTIVE_STATUSES: ApplicationStatus[] = [
  'Applied',
  'Shortlisted',
  'Interview',
  'Offer',
];

/* -------------------------------------------------------------------------- */
/*                                   Profile                                  */
/* -------------------------------------------------------------------------- */

export interface ChecklistItem {
  key: string;
  label: string;
  weight: number;
  done: boolean;
  hint: string;
}

export interface CandidateProfile {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  about: string;
  seniority: string;
  experienceYears: number;
  expectedSalary: string;
  noticePeriod: string;
  openToWork: boolean;
  workModes: WorkMode[];
  skills: string[];
  links: Array<{ label: string; url: string }>;
  education: Array<{ degree: string; school: string; period: string }>;
  experience: Array<{
    role: string;
    company: string;
    period: string;
    highlights: string[];
  }>;
  resumeFileName: string;
  resumeUpdatedDaysAgo: number;
}

export const INITIAL_PROFILE: CandidateProfile = {
  name: 'Bibek Thapa',
  headline: 'Full-stack developer · React, TypeScript, Node.js',
  email: 'bibek.thapa@outlook.com',
  phone: '+977 9803 555 210',
  location: 'Pokhara, Nepal',
  about:
    'Full-stack leaning frontend developer with 4 years shipping B2B dashboards end-to-end. I like typed APIs, accessible components and shipping small slices often.',
  seniority: 'Mid-level',
  experienceYears: 4,
  expectedSalary: 'Rs 120k / month',
  noticePeriod: '30 days',
  openToWork: true,
  workModes: ['Remote', 'Hybrid'],
  skills: [
    'React',
    'TypeScript',
    'Node.js',
    'Redux',
    'GraphQL',
    'PostgreSQL',
    'Tailwind',
    'Testing Library',
  ],
  links: [
    { label: 'GitHub', url: 'github.com/bibekthapa' },
    { label: 'Portfolio', url: 'bibek.dev' },
  ],
  education: [
    {
      degree: 'BE Computer Engineering',
      school: 'Pashchimanchal Campus, IOE',
      period: '2017 – 2021',
    },
  ],
  experience: [
    {
      role: 'Software Engineer',
      company: 'Himalaya Soft',
      period: '2021 – now',
      highlights: [
        'Rebuilt the customer portal in React + TypeScript, cutting p75 load time by 38%.',
        'Introduced GraphQL codegen and end-to-end tests for the checkout flow.',
        'Mentored two interns through their first production releases.',
      ],
    },
    {
      role: 'Frontend Intern',
      company: 'Kathmandu Labs',
      period: '2020 – 2021',
      highlights: [
        'Shipped reusable form components adopted by three product teams.',
      ],
    },
  ],
  resumeFileName: 'bibek-thapa-frontend-2026.pdf',
  resumeUpdatedDaysAgo: 4,
};

/** Weighted profile-strength signals - drives the completeness ring. */
export const PROFILE_CHECKLIST: ChecklistItem[] = [
  {
    key: 'headline',
    label: 'Professional headline',
    weight: 10,
    done: true,
    hint: 'Say what you do and the stack you do it in.',
  },
  {
    key: 'about',
    label: 'About section',
    weight: 10,
    done: true,
    hint: 'Two or three sentences on impact, not duties.',
  },
  {
    key: 'skills',
    label: 'Five or more skills',
    weight: 15,
    done: true,
    hint: 'Recruiters filter on skills before anything else.',
  },
  {
    key: 'experience',
    label: 'Work experience with results',
    weight: 15,
    done: true,
    hint: 'Add numbers: latency, revenue, users, time saved.',
  },
  {
    key: 'resume',
    label: 'Resume attached',
    weight: 20,
    done: true,
    hint: 'Applications without a resume get skipped.',
  },
  {
    key: 'links',
    label: 'Portfolio or GitHub',
    weight: 10,
    done: true,
    hint: 'Portfolio links roughly double profile views.',
  },
  {
    key: 'education',
    label: 'Education',
    weight: 5,
    done: true,
    hint: 'Add your highest qualification.',
  },
  {
    key: 'salary',
    label: 'Salary expectation',
    weight: 5,
    done: true,
    hint: 'Set a target so match scores stay accurate.',
  },
  {
    key: 'phone',
    label: 'Phone number',
    weight: 5,
    done: true,
    hint: 'Recruiters call before they email.',
  },
  {
    key: 'workModes',
    label: 'Preferred working styles',
    weight: 5,
    done: true,
    hint: 'Pick remote, hybrid or on-site preferences.',
  },
  {
    key: 'references',
    label: 'Two professional references',
    weight: 10,
    done: false,
    hint: 'Speeds up background checks when an offer lands.',
  },
  {
    key: 'video',
    label: '60-second intro video',
    weight: 5,
    done: false,
    hint: 'Profiles with a video get 3x more recruiter replies.',
  },
];

export const profileCompleteness = (items: ChecklistItem[]) => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const earned = items.reduce(
    (sum, item) => sum + (item.done ? item.weight : 0),
    0,
  );
  return Math.round((earned / total) * 100);
};

/* -------------------------------------------------------------------------- */
/*                                    Jobs                                    */
/* -------------------------------------------------------------------------- */

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  companyInitials: string;
  department: string;
  location: string;
  workMode: WorkMode;
  type: JobType;
  salary: string;
  postedDaysAgo: number;
  postedOn: string;
  applicants: number;
  views: number;
  /** 0-100 fit for this candidate, produced by the match score. */
  match: number;
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
  description: string;
  requirements: string[];
  saved?: boolean;
}

export const INITIAL_JOBS: JobPosting[] = [
  {
    id: 'job-1',
    title: 'Senior Frontend Engineer',
    company: 'JobDev',
    companyInitials: 'JD',
    department: 'Engineering',
    location: 'Kathmandu / Remote',
    workMode: 'Hybrid',
    type: 'Full-time',
    salary: 'Rs 120k–180k',
    postedDaysAgo: 6,
    postedOn: 'Sep 9, 2026',
    applicants: 48,
    views: 1240,
    match: 92,
    matchedSkills: ['React', 'TypeScript', 'Tailwind', 'Testing Library'],
    missingSkills: ['Accessibility'],
    reasons: [
      'Matches 4 of 5 required skills',
      '4 years sits inside the 4–7 year band',
      'Hybrid matches your preferred working style',
    ],
    description:
      'Own our design system and ship fast, accessible interfaces with a small senior team.',
    requirements: [
      '5+ years with React & TypeScript',
      'Design-system experience',
      'Accessibility (WCAG 2.1)',
      'A real testing culture',
    ],
  },
  {
    id: 'job-2',
    title: 'Full Stack Developer (Node/React)',
    company: 'Fintech Nepal',
    companyInitials: 'FN',
    department: 'Engineering',
    location: 'Remote (Asia)',
    workMode: 'Remote',
    type: 'Full-time',
    salary: 'Rs 140k–200k',
    postedDaysAgo: 2,
    postedOn: 'Sep 13, 2026',
    applicants: 63,
    views: 1810,
    match: 95,
    matchedSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    missingSkills: ['Docker'],
    reasons: [
      'Matches 4 of 5 required skills',
      'Top of band clears your expected salary',
      'Posted in the last 48 hours',
    ],
    description:
      'Build payment flows that move Rs 4B a year, from API to pixel.',
    requirements: [
      'Node.js and React in production',
      'PostgreSQL schema design',
      'Comfortable with Docker',
    ],
  },
  {
    id: 'job-3',
    title: 'React Developer',
    company: 'Everest Tech',
    companyInitials: 'ET',
    department: 'Product',
    location: 'Kathmandu',
    workMode: 'Hybrid',
    type: 'Full-time',
    salary: 'Rs 100k–150k',
    postedDaysAgo: 9,
    postedOn: 'Sep 6, 2026',
    applicants: 37,
    views: 940,
    match: 88,
    matchedSkills: ['React', 'Redux', 'TypeScript'],
    missingSkills: ['Cypress'],
    reasons: [
      'Matches 3 of 4 required skills',
      'Hybrid matches your preferred working style',
    ],
    description:
      'Join a 12-person product team rebuilding an internal CRM used by 600 agents.',
    requirements: ['React + Redux at scale', 'TypeScript', 'Cypress or Playwright'],
  },
  {
    id: 'job-4',
    title: 'Node.js Backend Engineer',
    company: 'Cloud Everest',
    companyInitials: 'CE',
    department: 'Platform',
    location: 'Remote',
    workMode: 'Remote',
    type: 'Full-time',
    salary: 'Rs 130k–190k',
    postedDaysAgo: 4,
    postedOn: 'Sep 11, 2026',
    applicants: 29,
    views: 720,
    match: 84,
    matchedSkills: ['Node.js', 'PostgreSQL', 'TypeScript'],
    missingSkills: ['Kafka', 'Kubernetes'],
    reasons: [
      'Matches 3 of 5 required skills',
      'Remote matches your preferred working style',
    ],
    description:
      'Design idempotent payment and ledger services with strict correctness budgets.',
    requirements: [
      'Node.js services in production',
      'PostgreSQL and Redis',
      'Kafka or another event bus',
    ],
  },
  {
    id: 'job-5',
    title: 'Frontend Engineer (Contract)',
    company: 'Creative Hub',
    companyInitials: 'CH',
    department: 'Studio',
    location: 'Remote',
    workMode: 'Remote',
    type: 'Contract',
    salary: 'Rs 180k / month',
    postedDaysAgo: 14,
    postedOn: 'Sep 1, 2026',
    applicants: 22,
    views: 610,
    match: 79,
    matchedSkills: ['React', 'Tailwind'],
    missingSkills: ['Figma', 'Motion design'],
    reasons: [
      'Matches 2 of 4 required skills',
      'Contract work is outside your stated preferences',
    ],
    description:
      'Six-month contract building marketing sites and dashboards for venture-backed clients.',
    requirements: ['React + Tailwind', 'Figma hand-off', 'Motion design a plus'],
  },
  {
    id: 'job-6',
    title: 'QA Automation Engineer',
    company: 'Fintech Nepal',
    companyInitials: 'FN',
    department: 'Quality',
    location: 'Lalitpur',
    workMode: 'On-site',
    type: 'Full-time',
    salary: 'Rs 90k–130k',
    postedDaysAgo: 7,
    postedOn: 'Sep 8, 2026',
    applicants: 18,
    views: 430,
    match: 66,
    matchedSkills: ['TypeScript', 'Testing Library'],
    missingSkills: ['Playwright', 'CI/CD'],
    reasons: [
      'Matches 2 of 4 required skills',
      'On-site is outside your stated preference',
    ],
    description:
      'Own the end-to-end suite that gates every release of our retail banking app.',
    requirements: ['Playwright or Cypress', 'TypeScript', 'CI pipelines'],
  },
  {
    id: 'job-7',
    title: 'Junior Data Analyst',
    company: 'JobDev Labs',
    companyInitials: 'JD',
    department: 'Data',
    location: 'Lalitpur',
    workMode: 'On-site',
    type: 'Internship',
    salary: 'Rs 25k stipend',
    postedDaysAgo: 21,
    postedOn: 'Aug 25, 2026',
    applicants: 17,
    views: 402,
    match: 48,
    matchedSkills: ['PostgreSQL'],
    missingSkills: ['Python', 'Power BI', 'Excel'],
    reasons: [
      'Only 1 of 4 required skills',
      '4 years is 4 years above the advertised band',
    ],
    description:
      'A structured internship turning product data into decisions for the hiring team.',
    requirements: ['SQL', 'Python', 'Power BI'],
  },
  {
    id: 'job-8',
    title: 'DevOps Engineer',
    company: 'Cloud Everest',
    companyInitials: 'CE',
    department: 'Platform',
    location: 'Remote',
    workMode: 'Remote',
    type: 'Contract',
    salary: 'Rs 150k / month',
    postedDaysAgo: 40,
    postedOn: 'Aug 6, 2026',
    applicants: 26,
    views: 730,
    match: 61,
    matchedSkills: ['Node.js', 'PostgreSQL'],
    missingSkills: ['Kubernetes', 'Terraform', 'AWS'],
    reasons: [
      'Matches 2 of 5 required skills',
      'Consider upskilling in Kubernetes for this track',
    ],
    description:
      'Keep 900 daily container deployments predictable and observable.',
    requirements: ['Kubernetes', 'Terraform', 'AWS', 'CI/CD'],
  },
];

/* -------------------------------------------------------------------------- */
/*                                Applications                                */
/* -------------------------------------------------------------------------- */

export interface Application {
  id: string;
  jobId: string;
  title: string;
  company: string;
  companyInitials: string;
  location: string;
  workMode: WorkMode;
  type: JobType;
  salary: string;
  status: ApplicationStatus;
  match: number;
  appliedDaysAgo: number;
  appliedOn: string;
  resumeVersion: string;
  source: string;
  nextStep?: string;
  recruiterNote?: string;
  timeline: Array<{ status: ApplicationStatus; when: string; note: string }>;
}

export const INITIAL_APPLICATIONS: Application[] = [
  {
    id: 'app-1',
    jobId: 'job-1',
    title: 'Senior Frontend Engineer',
    company: 'JobDev',
    companyInitials: 'JD',
    location: 'Kathmandu / Remote',
    workMode: 'Hybrid',
    type: 'Full-time',
    salary: 'Rs 120k–180k',
    status: 'Interview',
    match: 92,
    appliedDaysAgo: 6,
    appliedOn: 'Sep 9, 2026',
    resumeVersion: 'v4 — frontend 2026',
    source: 'JobDev search',
    nextStep: 'Recruiter screen tomorrow at 2:00 PM',
    recruiterNote: 'Portfolio reviewed - strong typed-API work.',
    timeline: [
      { status: 'Applied', when: 'Sep 9', note: 'Application submitted with tailored resume.' },
      { status: 'Shortlisted', when: 'Sep 11', note: 'Resume screen passed.' },
      { status: 'Interview', when: 'Sep 14', note: 'Recruiter screen booked for Sep 17, 2:00 PM.' },
    ],
  },
  {
    id: 'app-2',
    jobId: 'job-2',
    title: 'Full Stack Developer (Node/React)',
    company: 'Fintech Nepal',
    companyInitials: 'FN',
    location: 'Remote (Asia)',
    workMode: 'Remote',
    type: 'Full-time',
    salary: 'Rs 140k–200k',
    status: 'Shortlisted',
    match: 95,
    appliedDaysAgo: 2,
    appliedOn: 'Sep 13, 2026',
    resumeVersion: 'v4 — frontend 2026',
    source: 'JobDev search',
    nextStep: 'Recruiter will reach out to schedule a screen',
    timeline: [
      { status: 'Applied', when: 'Sep 13', note: 'Applied through JobDev with a cover note.' },
      { status: 'Shortlisted', when: 'Sep 14', note: 'Shortlisted - awaiting scheduling.' },
    ],
  },
  {
    id: 'app-3',
    jobId: 'job-4',
    title: 'Node.js Backend Engineer',
    company: 'Cloud Everest',
    companyInitials: 'CE',
    location: 'Remote',
    workMode: 'Remote',
    type: 'Full-time',
    salary: 'Rs 130k–190k',
    status: 'Interview',
    match: 84,
    appliedDaysAgo: 12,
    appliedOn: 'Sep 3, 2026',
    resumeVersion: 'v3 — backend',
    source: 'Referral — Suman K.',
    nextStep: 'Technical round in 3 days',
    recruiterNote: 'Liked the ledger refactor write-up.',
    timeline: [
      { status: 'Applied', when: 'Sep 3', note: 'Referred by Suman K.' },
      { status: 'Shortlisted', when: 'Sep 6', note: 'Referral screen passed.' },
      { status: 'Interview', when: 'Sep 10', note: 'Technical round scheduled.' },
    ],
  },
  {
    id: 'app-4',
    jobId: 'job-5',
    title: 'React Native Developer',
    company: 'Sajha Health',
    companyInitials: 'SH',
    location: 'Kathmandu',
    workMode: 'Hybrid',
    type: 'Full-time',
    salary: 'Rs 125k–170k',
    status: 'Offer',
    match: 86,
    appliedDaysAgo: 26,
    appliedOn: 'Aug 20, 2026',
    resumeVersion: 'v4 — frontend 2026',
    source: 'JobDev search',
    nextStep: 'Offer expires in 5 days — accept or decline',
    recruiterNote: 'Offer at the top of the band plus a learning budget.',
    timeline: [
      { status: 'Applied', when: 'Aug 20', note: 'Application submitted.' },
      { status: 'Shortlisted', when: 'Aug 24', note: 'Portfolio walkthrough requested.' },
      { status: 'Interview', when: 'Aug 28', note: 'Two rounds completed with positive feedback.' },
      { status: 'Offer', when: 'Sep 9', note: 'Written offer sent - respond within 5 days.' },
    ],
  },
  {
    id: 'app-5',
    jobId: 'job-3',
    title: 'React Developer',
    company: 'Everest Tech',
    companyInitials: 'ET',
    location: 'Kathmandu',
    workMode: 'Hybrid',
    type: 'Full-time',
    salary: 'Rs 100k–150k',
    status: 'Applied',
    match: 88,
    appliedDaysAgo: 1,
    appliedOn: 'Sep 14, 2026',
    resumeVersion: 'v4 — frontend 2026',
    source: 'JobDev search',
    nextStep: 'Recruiters usually reply within 5–7 days',
    timeline: [
      { status: 'Applied', when: 'Sep 14', note: 'Application submitted.' },
    ],
  },
  {
    id: 'app-6',
    jobId: 'job-6',
    title: 'QA Automation Engineer',
    company: 'Fintech Nepal',
    companyInitials: 'FN',
    location: 'Lalitpur',
    workMode: 'On-site',
    type: 'Full-time',
    salary: 'Rs 90k–130k',
    status: 'Rejected',
    match: 66,
    appliedDaysAgo: 19,
    appliedOn: 'Aug 27, 2026',
    resumeVersion: 'v3 — backend',
    source: 'Company site',
    recruiterNote: 'Went with a candidate who had deeper Playwright experience.',
    timeline: [
      { status: 'Applied', when: 'Aug 27', note: 'Application submitted.' },
      { status: 'Rejected', when: 'Sep 2', note: 'Role filled by a closer QA match.' },
    ],
  },
  {
    id: 'app-7',
    jobId: 'job-7',
    title: 'Junior Data Analyst',
    company: 'JobDev Labs',
    companyInitials: 'JD',
    location: 'Lalitpur',
    workMode: 'On-site',
    type: 'Internship',
    salary: 'Rs 25k stipend',
    status: 'Withdrawn',
    match: 48,
    appliedDaysAgo: 33,
    appliedOn: 'Aug 13, 2026',
    resumeVersion: 'v3 — backend',
    source: 'JobDev search',
    timeline: [
      { status: 'Applied', when: 'Aug 13', note: 'Applied out of curiosity.' },
      { status: 'Withdrawn', when: 'Aug 16', note: 'Withdrew - role was aimed at students.' },
    ],
  },
  {
    id: 'app-8',
    jobId: 'job-9',
    title: 'Junior Web Developer',
    company: 'Kathmandu Labs',
    companyInitials: 'KL',
    location: 'Pokhara',
    workMode: 'On-site',
    type: 'Full-time',
    salary: 'Rs 45k–60k',
    status: 'Hired',
    match: 74,
    appliedDaysAgo: 620,
    appliedOn: 'Jan 5, 2025',
    resumeVersion: 'v1 — graduate',
    source: 'Campus drive',
    recruiterNote: 'First role - stayed 18 months before moving on.',
    timeline: [
      { status: 'Applied', when: 'Jan 5, 2025', note: 'Applied through the campus drive.' },
      { status: 'Interview', when: 'Jan 14, 2025', note: 'Two rounds on the same day.' },
      { status: 'Hired', when: 'Jan 20, 2025', note: 'Joined the web team.' },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*                                 Interviews                                 */
/* -------------------------------------------------------------------------- */

export interface Interview {
  id: string;
  applicationId: string;
  title: string;
  company: string;
  companyInitials: string;
  stage: string;
  date: string;
  time: string;
  durationMins: number;
  mode: 'Video call' | 'Phone screen' | 'On-site';
  interviewer: string;
  meetingUrl?: string;
  /** Whole days from today; negatives are in the past. */
  inDays: number;
  notes?: string;
}

export const INITIAL_INTERVIEWS: Interview[] = [
  {
    id: 'int-1',
    applicationId: 'app-1',
    title: 'Senior Frontend Engineer',
    company: 'JobDev',
    companyInitials: 'JD',
    stage: 'Recruiter screen',
    date: 'Thu, Sep 17, 2026',
    time: '2:00 PM',
    durationMins: 30,
    mode: 'Video call',
    interviewer: 'Anjali Rana · Talent Partner',
    meetingUrl: 'https://meet.jobdev.app/screen-bibek',
    inDays: 1,
    notes: 'Expect a short culture + salary alignment chat. Have your notice period ready.',
  },
  {
    id: 'int-2',
    applicationId: 'app-3',
    title: 'Node.js Backend Engineer',
    company: 'Cloud Everest',
    companyInitials: 'CE',
    stage: 'Technical round',
    date: 'Sat, Sep 19, 2026',
    time: '11:30 AM',
    durationMins: 60,
    mode: 'Video call',
    interviewer: 'Rajan Bhattarai · Engineering Manager',
    meetingUrl: 'https://meet.jobdev.app/ce-technical',
    inDays: 3,
    notes: 'Live problem: design an idempotent payment endpoint. Bring questions about the ledger.',
  },
  {
    id: 'int-3',
    applicationId: 'app-4',
    title: 'React Native Developer',
    company: 'Sajha Health',
    companyInitials: 'SH',
    stage: 'Offer discussion',
    date: 'Mon, Sep 21, 2026',
    time: '4:15 PM',
    durationMins: 30,
    mode: 'Phone screen',
    interviewer: 'Sunita Maharjan · Head of People',
    inDays: 5,
    notes: 'Negotiation call. Decide whether you want the learning budget as salary or courses.',
  },
  {
    id: 'int-4',
    applicationId: 'app-6',
    title: 'QA Automation Engineer',
    company: 'Fintech Nepal',
    companyInitials: 'FN',
    stage: 'Resume screen',
    date: 'Mon, Sep 1, 2026',
    time: '10:00 AM',
    durationMins: 20,
    mode: 'Phone screen',
    interviewer: 'Prakash Gurung · QA Lead',
    inDays: -15,
    notes: 'Felt underprepared on automation frameworks - that gap showed up later.',
  },
];

export const PREP_CHECKLIST: Array<{ id: string; text: string; done: boolean }> = [
  {
    id: 'prep-1',
    text: 'Re-read the job description and map each requirement to a project you shipped.',
    done: true,
  },
  {
    id: 'prep-2',
    text: 'Prepare three stories: a hard bug, a disagreement, and a measurable win.',
    done: true,
  },
  {
    id: 'prep-3',
    text: 'Test camera, microphone and connection 15 minutes before a video call.',
    done: false,
  },
  {
    id: 'prep-4',
    text: 'Write down two questions about the team, roadmap and how success is measured.',
    done: false,
  },
  {
    id: 'prep-5',
    text: 'Have your notice period, expected salary and two references ready.',
    done: false,
  },
];

/* -------------------------------------------------------------------------- */
/*                              Saved / activity                              */
/* -------------------------------------------------------------------------- */

export const INITIAL_SAVED_IDS: string[] = ['job-2', 'job-3', 'job-5'];

export interface Activity {
  id: string;
  kind: 'status' | 'interview' | 'view' | 'saved' | 'message' | 'badge';
  text: string;
  detail: string;
  time: string;
}

/** Icon tint per activity kind, so the feed reads at a glance. */
export const ACTIVITY_STATUS: Record<Activity['kind'], string> = {
  status: 'bg-primary-light text-primary-dark',
  interview: 'bg-warning/10 text-warning',
  view: 'bg-info/10 text-info',
  saved: 'bg-muted text-muted-foreground',
  message: 'bg-success/10 text-success',
  badge: 'bg-primary-light text-primary-dark',
};

export const INITIAL_ACTIVITY: Activity[] = [
  {
    id: 'ac-1',
    kind: 'message',
    text: 'Anjali Rana sent you a message',
    detail: 'JobDev · Senior Frontend Engineer',
    time: '3h ago',
  },
  {
    id: 'ac-2',
    kind: 'status',
    text: 'Shortlisted for Full Stack Developer (Node/React)',
    detail: 'Fintech Nepal · match 95%',
    time: '1d ago',
  },
  {
    id: 'ac-3',
    kind: 'interview',
    text: 'Recruiter screen confirmed for tomorrow',
    detail: 'JobDev · Video call · 30 minutes',
    time: '1d ago',
  },
  {
    id: 'ac-4',
    kind: 'status',
    text: 'Offer received from Sajha Health',
    detail: 'React Native Developer · expires in 5 days',
    time: '5d ago',
  },
  {
    id: 'ac-5',
    kind: 'view',
    text: '9 recruiters viewed your profile',
    detail: 'Four are hiring for React roles in Kathmandu',
    time: '6d ago',
  },
  {
    id: 'ac-6',
    kind: 'badge',
    text: 'Profile strength passed 85%',
    detail: 'Add two references to unlock the top tier',
    time: '1w ago',
  },
];

export interface Notification {
  id: string;
  text: string;
  time: string;
  read: boolean;
  view: 'applications' | 'interviews' | 'saved' | 'messages' | 'jobs' | 'insights';
}

export const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'nt-1',
    text: 'Recruiter screen tomorrow at 2:00 PM - JobDev',
    time: '2h ago',
    read: false,
    view: 'interviews',
  },
  {
    id: 'nt-2',
    text: 'Anjali Rana replied about your portfolio',
    time: '3h ago',
    read: false,
    view: 'messages',
  },
  {
    id: 'nt-3',
    text: 'You were shortlisted by Fintech Nepal',
    time: '1d ago',
    read: false,
    view: 'applications',
  },
  {
    id: 'nt-4',
    text: 'Your offer from Sajha Health expires in 5 days',
    time: '5d ago',
    read: true,
    view: 'applications',
  },
];

export interface Conversation {
  id: string;
  name: string;
  role: string;
  unread: number;
  messages: Array<{ from: 'them' | 'me'; text: string; time: string }>;
}

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'cv-1',
    name: 'Anjali Rana',
    role: 'Talent Partner · JobDev',
    unread: 2,
    messages: [
      {
        from: 'them',
        text: 'Hi Bibek! Your portfolio came through - the typed API work is exactly what we need.',
        time: '09:02',
      },
      {
        from: 'them',
        text: 'Are you free Thursday at 2:00 PM for a 30-minute screen?',
        time: '09:03',
      },
      { from: 'me', text: 'Thursday 2 PM works. Sending a calendar hold now.', time: '09:14' },
      { from: 'them', text: 'Perfect. We will focus on the design system and testing.', time: '09:20' },
    ],
  },
  {
    id: 'cv-2',
    name: 'Sunita Maharjan',
    role: 'Head of People · Sajha Health',
    unread: 0,
    messages: [
      {
        from: 'them',
        text: 'The written offer is on its way. Anything you would like clarified first?',
        time: 'Mon',
      },
      {
        from: 'me',
        text: 'Thanks! Could we talk through the learning budget on Monday?',
        time: 'Mon',
      },
      { from: 'them', text: 'Booked for 4:15 PM Monday.', time: 'Mon' },
    ],
  },
  {
    id: 'cv-3',
    name: 'JobDev Alerts',
    role: 'System',
    unread: 1,
    messages: [
      {
        from: 'them',
        text: '3 new roles above 85% match were posted for your profile this week.',
        time: 'Tue',
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*                                Analytics                                   */
/* -------------------------------------------------------------------------- */

export const WEEKLY = [
  { week: 'W1', applications: 1, views: 14, interviews: 0 },
  { week: 'W2', applications: 0, views: 11, interviews: 0 },
  { week: 'W3', applications: 2, views: 19, interviews: 1 },
  { week: 'W4', applications: 1, views: 16, interviews: 0 },
  { week: 'W5', applications: 3, views: 24, interviews: 1 },
  { week: 'W6', applications: 2, views: 21, interviews: 1 },
  { week: 'W7', applications: 4, views: 31, interviews: 2 },
  { week: 'W8', applications: 3, views: 28, interviews: 2 },
];

export const SKILL_DEMAND: Array<{ skill: string; roles: number; hasSkill: boolean }> = [
  { skill: 'React', roles: 14, hasSkill: true },
  { skill: 'TypeScript', roles: 12, hasSkill: true },
  { skill: 'Node.js', roles: 9, hasSkill: true },
  { skill: 'PostgreSQL', roles: 7, hasSkill: true },
  { skill: 'Docker', roles: 6, hasSkill: false },
  { skill: 'GraphQL', roles: 5, hasSkill: true },
  { skill: 'Kubernetes', roles: 4, hasSkill: false },
  { skill: 'Figma', roles: 3, hasSkill: false },
];

/** Where the candidate's applications came from - mirrored by the recruiter's
 * "Applicant sources" donut so both dashboards tell the same story. */
export const SOURCES = [
  { label: 'JobDev search', value: 52, colorClass: 'bg-primary' },
  { label: 'Referrals', value: 26, colorClass: 'bg-info' },
  { label: 'Company sites', value: 14, colorClass: 'bg-warning' },
  { label: 'Other', value: 8, colorClass: 'bg-success' },
];
