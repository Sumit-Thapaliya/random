'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Bookmark,
  Briefcase,
  CalendarCheck,
  Check,
  CheckCheck,
  Compass,
  Download,
  Eye,
  FileCheck2,
  Gauge,
  Send,
  Sparkles,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

import {
  ACTIVE_STATUSES,
  type Application,
  type ApplicationStatus,
  type CandidateProfile,
  INITIAL_ACTIVITY,
  INITIAL_APPLICATIONS,
  INITIAL_CONVERSATIONS,
  INITIAL_INTERVIEWS,
  INITIAL_JOBS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PROFILE,
  INITIAL_SAVED_IDS,
  type JobPosting,
  PIPELINE_ORDER,
  profileCompleteness,
  PROFILE_CHECKLIST,
  type ChecklistItem,
  type Conversation,
  type Notification,
} from './candidate/mock-data';
import { Sidebar as CandidateSidebar, type CandidateView } from './candidate/sidebar';
import { ResumeStudioView } from './candidate/resume-studio';
import {
  type AtsGenerationResult,
  type AtsUploadedFile,
  triggerDownload,
} from './candidate/ats-service';
import { ApplicationsTrend } from './candidate/charts';
import {
  ActivityFeed,
  ApplicationDrawer,
  ApplicationsView,
  EmptyState,
  HelpView,
  InsightsView,
  InterviewsView,
  JobDrawer,
  JobsView,
  MessagesView,
  ProfileView,
  SavedJobsView,
  SectionCard,
  SettingsView,
  StagePills,
  StatusChip,
} from './candidate/views';

function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  delay,
  onClick,
  hint,
}: {
  label: string;
  value: number;
  delta: string;
  icon: typeof Briefcase;
  delay: number;
  onClick?: () => void;
  hint?: string;
}) {
  const count = useCountUp(value);
  const body = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight xl:text-3xl">
            {count.toLocaleString()}
          </p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-success">{delta}</p>
    </>
  );
  const base =
    'sheen-hover group animate-fade-in-up w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg xl:p-5';

  /* Cards with a destination are buttons; the rest stay plain. */
  if (!onClick) {
    return (
      <div className={base} style={{ animationDelay: `${delay}ms` }}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        base,
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {body}
    </button>
  );
}

function countByStatus(applications: Application[]): Record<ApplicationStatus, number> {
  const counts = PIPELINE_ORDER.reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {} as Record<ApplicationStatus, number>,
  );
  counts.Rejected = 0;
  counts.Withdrawn = 0;
  for (const application of applications) {
    counts[application.status] = (counts[application.status] ?? 0) + 1;
  }
  return counts;
}

export function CandidateDashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const [view, setView] = useState<CandidateView>('overview');
  const [jobs, setJobs] = useState<JobPosting[]>(INITIAL_JOBS);
  const [applications, setApplications] = useState<Application[]>(INITIAL_APPLICATIONS);
  const [savedIds, setSavedIds] = useState<string[]>(INITIAL_SAVED_IDS);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(PROFILE_CHECKLIST);
  const [profile] = useState<CandidateProfile>(INITIAL_PROFILE);
  const [toast, setToast] = useState<string | null>(null);

  /* ATS resume: the uploaded file and the generated download live here so they
     survive switching views (the studio itself is unmounted on navigation). */
  const [atsFile, setAtsFile] = useState<AtsUploadedFile | null>(null);
  const [atsResult, setAtsResult] = useState<AtsGenerationResult | null>(null);
  const [atsInviteOpen, setAtsInviteOpen] = useState(false);
  /* The invite is offered once per dashboard visit. */
  const inviteShownRef = useRef(false);

  /* Notifications persist in localStorage so read state survives reloads. */
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    if (typeof window === 'undefined') return INITIAL_NOTIFICATIONS;
    try {
      const raw = window.localStorage.getItem('jobdev-candidate-notifications');
      if (raw) return JSON.parse(raw) as Notification[];
    } catch {
      /* fall back to the demo set */
    }
    return INITIAL_NOTIFICATIONS;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'jobdev-candidate-notifications',
        JSON.stringify(notifications),
      );
    } catch {
      /* storage may be unavailable; ignore */
    }
  }, [notifications]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  /* Close the search dropdown on outside click / Escape so an open result list
     never blocks the page behind it. */
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setQuery('');
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setQuery('');
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* Welcome nudge: two seconds after the candidate lands on the dashboard,
     offer the ATS-friendly resume upload. Skipped entirely once they already
     have a generated file, and it is always dismissible.
     To show it only once per browser instead of once per visit, wrap the open
     call in a localStorage check, e.g.
       if (window.localStorage.getItem('jobdev-ats-invite')) return; */
  useEffect(() => {
    if (inviteShownRef.current || atsResult) return;
    const timer = window.setTimeout(() => {
      inviteShownRef.current = true;
      setAtsInviteOpen(true);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [atsResult]);

  useEffect(() => {
    if (!atsInviteOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAtsInviteOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atsInviteOpen]);

  const firstName =
    (user?.name || user?.identifier || 'there').split(/[@\s]/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const counts = useMemo(() => countByStatus(applications), [applications]);
  const appliedJobIds = useMemo(
    () => applications.map((application) => application.jobId),
    [applications],
  );
  const completeness = useMemo(() => profileCompleteness(checklist), [checklist]);
  const missingSignals = checklist.filter((item) => !item.done).length;

  const upcomingInterviews = INITIAL_INTERVIEWS.filter((interview) => interview.inDays >= 0);
  const activeApplications = applications.filter((application) =>
    ACTIVE_STATUSES.includes(application.status),
  );
  const unreadMessages = conversations.reduce(
    (sum, conversation) => sum + conversation.unread,
    0,
  );
  const avgMatch = Math.round(
    applications.reduce((sum, application) => sum + application.match, 0) /
      Math.max(applications.length, 1),
  );

  const stats: Array<{
    label: string;
    value: number;
    delta: string;
    icon: typeof Briefcase;
    hint: string;
    go: () => void;
  }> = [
    {
      label: 'Active applications',
      value: activeApplications.length,
      delta: `${counts.Applied} awaiting a reply`,
      icon: Briefcase,
      hint: 'Open your applications',
      go: () => setView('applications'),
    },
    {
      label: 'Interviews scheduled',
      value: upcomingInterviews.length,
      delta: `Next: ${upcomingInterviews[0]?.date ?? 'book one'}`,
      icon: CalendarCheck,
      hint: 'Open your interview schedule',
      go: () => setView('interviews'),
    },
    {
      label: 'Saved jobs',
      value: savedIds.length,
      delta: `${jobs.filter((job) => job.match >= 85).length} roles above 85% match`,
      icon: Bookmark,
      hint: 'Open your shortlist',
      go: () => setView('saved'),
    },
    {
      label: 'Profile views',
      value: 163,
      delta: `Profile ${completeness}% complete`,
      icon: Eye,
      hint: 'Open your insights',
      go: () => setView('insights'),
    },
  ];

  /* Working global search: matches open roles + your applications, click to jump in. */
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return {
      jobs: jobs
        .filter((job) => job.title.toLowerCase().includes(q))
        .slice(0, 4),
      applications: applications
        .filter(
          (application) =>
            application.title.toLowerCase().includes(q) ||
            application.company.toLowerCase().includes(q),
        )
        .slice(0, 4),
    };
  }, [query, jobs, applications]);

  const unread = notifications.filter((notification) => !notification.read).length;

  /* ------------------------------- mutations ------------------------------ */

  function toggleSave(job: JobPosting) {
    const saved = savedIds.includes(job.id);
    setSavedIds((current) =>
      saved ? current.filter((id) => id !== job.id) : [job.id, ...current],
    );
    setJobs((current) =>
      current.map((entry) => (entry.id === job.id ? { ...entry, saved: !saved } : entry)),
    );
    setToast(
      saved
        ? `Removed “${job.title}” from saved jobs`
        : `Saved “${job.title}” for later`,
    );
  }

  function applyToJob(job: JobPosting) {
    if (appliedJobIds.includes(job.id)) {
      setToast('You have already applied to this role');
      return;
    }
    const application: Application = {
      id: `app-${job.id}-${Date.now()}`,
      jobId: job.id,
      title: job.title,
      company: job.company,
      companyInitials: job.companyInitials,
      location: job.location,
      workMode: job.workMode,
      type: job.type,
      salary: job.salary,
      status: 'Applied',
      match: job.match,
      appliedDaysAgo: 0,
      appliedOn: 'Today',
      resumeVersion: `v4 — ${profile.resumeUpdatedDaysAgo}d old`,
      source: 'JobDev search',
      nextStep: 'Recruiters usually reply within 5–7 days',
      timeline: [
        {
          status: 'Applied',
          when: 'Today',
          note: 'Application submitted with your current resume.',
        },
      ],
    };
    setApplications((current) => [application, ...current]);
    setToast(`Applied to “${job.title}” — we will track it for you`);
  }

  function withdrawApplication(id: string) {
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? {
              ...application,
              status: 'Withdrawn',
              nextStep: undefined,
              timeline: [
                ...application.timeline,
                {
                  status: 'Withdrawn',
                  when: 'Today',
                  note: 'You withdrew from this application.',
                },
              ],
            }
          : application,
      ),
    );
    setToast('Application withdrawn — the recruiter has been notified');
  }

  function sendMessage(conversationId: string, text: string) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              unread: 0,
              messages: [
                ...conversation.messages,
                { from: 'me' as const, text, time: 'now' },
              ],
            }
          : conversation,
      ),
    );
  }

  function toggleChecklistItem(key: string) {
    setChecklist((current) =>
      current.map((item) => (item.key === key ? { ...item, done: !item.done } : item)),
    );
  }

  function downloadAtsResume() {
    if (!atsResult) {
      setView('resume');
      return;
    }
    triggerDownload(atsResult.blob, atsResult.fileName);
    setToast(`Downloading ${atsResult.fileName}`);
  }

  function openApplicationById(applicationId: string) {
    const application = applications.find((entry) => entry.id === applicationId);
    if (!application) return;
    setView('applications');
    setSelectedApplication(application);
  }

  const recommended = useMemo(
    () =>
      jobs
        .filter((job) => !appliedJobIds.includes(job.id))
        .sort((a, b) => b.match - a.match)
        .slice(0, 3),
    [jobs, appliedJobIds],
  );

  const refreshJob = selectedJob
    ? jobs.find((job) => job.id === selectedJob.id) ?? null
    : null;

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-8rem)] lg:flex-row lg:gap-6">
      <CandidateSidebar
        active={view}
        onSelect={setView}
        badges={{
          applications: activeApplications.length,
          interviews: upcomingInterviews.length,
          saved: savedIds.length,
          messages: unreadMessages,
        }}
        strengthPercent={completeness}
        missingSignals={missingSignals}
        onLogout={() => {
          logout();
          window.location.href = '/login';
        }}
      />

      <main className="min-w-0 flex-1 space-y-4 overflow-y-auto pr-1 scrollbar-slim">
        {/* Greeting + global actions */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="animate-fade-in-up">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting}, <span className="text-primary">{firstName}</span>
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Here is where your search stands today.
            </p>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
            <div className="relative min-w-0 flex-1 sm:flex-none" ref={searchRef}>
              <Compass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search jobs, companies…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full pl-9 sm:w-56"
              />
              {searchResults && (
                <div className="animate-pop-in absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl scrollbar-slim">
                  {searchResults.jobs.length === 0 &&
                    searchResults.applications.length === 0 && (
                      <p className="p-3 text-center text-xs text-muted-foreground">
                        No matches for “{query}”.
                      </p>
                    )}
                  {searchResults.jobs.length > 0 && (
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                      Open roles
                    </p>
                  )}
                  {searchResults.jobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setSelectedJob(job);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary-light"
                    >
                      <Briefcase className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate font-medium">{job.title}</span>
                      <span className="ml-auto shrink-0 text-xs font-semibold text-muted-foreground">
                        {job.match}% match
                      </span>
                    </button>
                  ))}
                  {searchResults.applications.length > 0 && (
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                      My applications
                    </p>
                  )}
                  {searchResults.applications.map((application) => (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setView('applications');
                        setSelectedApplication(application);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary-light"
                    >
                      <Send className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate font-medium">
                        {application.title} · {application.company}
                      </span>
                      <span className="ml-auto shrink-0">
                        <StatusChip status={application.status} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                aria-label={`Notifications (${unread} unread)`}
                onClick={() => setNotifOpen((value) => !value)}
                className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition-all hover:scale-105 hover:text-primary-dark"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 animate-pulse-dot items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                  <div className="animate-pop-in absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
                      <p className="text-sm font-bold">Notifications</p>
                      <button
                        type="button"
                        onClick={() =>
                          setNotifications((current) =>
                            current.map((notification) => ({ ...notification, read: true })),
                          )
                        }
                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    </div>
                    <ul className="max-h-80 overflow-y-auto p-2 scrollbar-slim">
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setNotifications((current) =>
                                current.map((entry) =>
                                  entry.id === notification.id ? { ...entry, read: true } : entry,
                                ),
                              );
                              setView(notification.view);
                              setNotifOpen(false);
                            }}
                            className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary-light"
                          >
                            <span
                              className={
                                notification.read
                                  ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border'
                                  : 'mt-1.5 h-2 w-2 shrink-0 animate-pulse-dot rounded-full bg-primary'
                              }
                            />
                            <span>
                              <span className="block text-sm font-medium leading-snug">
                                {notification.text}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {notification.time}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            <Button className="hidden sm:inline-flex" onClick={() => setView('jobs')}>
              <Compass className="h-4 w-4" />
              Find jobs
            </Button>
          </div>
        </div>

        {/* Mobile primary action */}
        <Button className="w-full sm:hidden" onClick={() => setView('jobs')}>
          <Compass className="h-4 w-4" />
          Find jobs
        </Button>

        {view === 'overview' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat, index) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  delta={stat.delta}
                  icon={stat.icon}
                  delay={index * 90}
                  onClick={stat.go}
                  hint={stat.hint}
                />
              ))}
            </div>

            {/* ATS resume shortcut */}
            <SectionCard
              title="ATS-friendly resume"
              subtitle="Upload the resume you send out and download the ATS-friendly version"
              delay={220}
            >
              {atsResult ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                    <FileCheck2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{atsResult.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      PDF · {atsResult.pages} page{atsResult.pages === 1 ? '' : 's'} · ready to
                      send
                    </p>
                  </div>
                  <Button onClick={downloadAtsResume}>
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                    <FileCheck2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">No ATS resume generated yet</p>
                    <p className="text-sm text-muted-foreground">
                      Upload a PDF or DOCX and download a single-column, parser-safe
                      version.
                    </p>
                  </div>
                  <Button onClick={() => setView('resume')}>
                    <UploadCloud className="h-4 w-4" />
                    Upload resume
                  </Button>
                </div>
              )}
            </SectionCard>

            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div
                className="animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm"
                style={{ animationDelay: '200ms' }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Your activity</h3>
                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Applications
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-info" />
                      Profile views
                    </span>
                  </div>
                </div>
                <ApplicationsTrend />
                <div className="mt-3 border-t border-border pt-3">
                  <StagePills counts={counts} onPick={() => setView('applications')} />
                </div>
              </div>

              <div
                className="animate-fade-in-up rounded-2xl border border-border bg-card p-5 shadow-sm"
                style={{ animationDelay: '280ms' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Recent activity</h3>
                  <button
                    type="button"
                    onClick={() => setView('insights')}
                    className="text-xs font-semibold text-primary hover:text-primary-hover"
                  >
                    View insights
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto pr-1 scrollbar-slim">
                  <ActivityFeed items={INITIAL_ACTIVITY.slice(0, 5)} />
                </div>
              </div>
            </div>

            {/* Next actions */}
            <SectionCard
              title="Next best actions"
              subtitle="The three things most likely to move your search forward"
              delay={340}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setView('interviews')}
                  className="group flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                    <Video className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">
                      Prep for {upcomingInterviews[0]?.company ?? 'your next interview'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {upcomingInterviews[0]
                        ? `${upcomingInterviews[0].date} at ${upcomingInterviews[0].time}`
                        : 'No interviews booked yet'}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setView('profile')}
                  className="group flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary-dark">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">
                      Lift your profile to 100%
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {missingSignals} signal{missingSignals === 1 ? '' : 's'} left
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setView('insights')}
                  className="group flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
                    <Gauge className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">Close your Docker gap</span>
                    <span className="block text-xs text-muted-foreground">
                      Asked for in 6 of your matched roles
                    </span>
                  </span>
                </button>
              </div>
            </SectionCard>

            {/* Recommendations */}
            <SectionCard
              title="Recommended for you"
              subtitle="Ranked by skills, experience, working style and salary fit"
              delay={400}
              action={
                <button
                  type="button"
                  onClick={() => setView('jobs')}
                  className="text-xs font-semibold text-primary hover:text-primary-hover"
                >
                  Browse all
                </button>
              }
            >
              {recommended.length === 0 ? (
                <EmptyState
                  icon={Compass}
                  title="No fresh matches right now"
                  body="Add a few more skills to your profile and new roles will appear here within minutes."
                />
              ) : (
                <ul className="space-y-3">
                  {recommended.map((job, index) => (
                    <li
                      key={job.id}
                      className="animate-fade-in-up rounded-xl border border-border p-4 transition-colors hover:border-primary/40 hover:bg-primary-light/20"
                      style={{ animationDelay: `${460 + index * 70}ms` }}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-xs font-bold text-primary-dark">
                          {job.companyInitials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold">{job.title}</h4>
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                              {job.match}% match
                            </span>
                            {job.postedDaysAgo <= 3 ? (
                              <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-semibold text-primary-dark">
                                New
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {job.company} · {job.location} · {job.workMode} · {job.salary}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {job.matchedSkills.slice(0, 3).map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
                              >
                                {skill}
                              </span>
                            ))}
                            {job.missingSkills.slice(0, 2).map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button size="sm" onClick={() => applyToJob(job)}>
                            Quick apply
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setSelectedJob(job)}>
                            Details
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        )}

        {view === 'applications' && (
          <ApplicationsView
            applications={applications}
            onOpen={setSelectedApplication}
            onWithdraw={withdrawApplication}
            onBrowseJobs={() => setView('jobs')}
          />
        )}

        {view === 'interviews' && (
          <InterviewsView
            interviews={INITIAL_INTERVIEWS}
            onOpenApplication={openApplicationById}
          />
        )}

        {view === 'saved' && (
          <SavedJobsView
            jobs={jobs.filter((job) => savedIds.includes(job.id))}
            onOpenJob={setSelectedJob}
            onToggleSave={toggleSave}
            onApply={applyToJob}
            appliedJobIds={appliedJobIds}
          />
        )}

        {view === 'resume' && (
          <ResumeStudioView
            profile={profile}
            file={atsFile}
            onFileChange={setAtsFile}
            result={atsResult}
            onResultChange={setAtsResult}
            onNotify={setToast}
          />
        )}

        {view === 'jobs' && (
          <JobsView
            jobs={jobs}
            savedIds={savedIds}
            appliedJobIds={appliedJobIds}
            onOpenJob={setSelectedJob}
            onToggleSave={toggleSave}
            onApply={applyToJob}
          />
        )}

        {view === 'messages' && (
          <MessagesView conversations={conversations} onSend={sendMessage} />
        )}

        {view === 'insights' && (
          <InsightsView
            counts={counts}
            profilePercent={completeness}
            responseRate={80}
            avgReplyDays={2}
            avgMatch={avgMatch}
          />
        )}

        {view === 'profile' && (
          <ProfileView
            profile={profile}
            checklist={checklist}
            percent={completeness}
            onToggleChecklist={toggleChecklistItem}
            onOpenSettings={() => setView('settings')}
            atsReady={Boolean(atsResult)}
            atsFileName={atsResult?.fileName ?? null}
            onOpenResume={() => setView('resume')}
            onDownloadAts={downloadAtsResume}
          />
        )}

        {view === 'settings' && <SettingsView />}
        {view === 'help' && <HelpView />}
      </main>

      <ApplicationDrawer
        application={selectedApplication}
        onClose={() => setSelectedApplication(null)}
        onWithdraw={withdrawApplication}
      />

      <JobDrawer
        job={refreshJob}
        applied={refreshJob ? appliedJobIds.includes(refreshJob.id) : false}
        saved={refreshJob ? savedIds.includes(refreshJob.id) : false}
        onClose={() => setSelectedJob(null)}
        onApply={applyToJob}
        onToggleSave={toggleSave}
      />

      {/* Welcome invite — appears 2s after landing, always dismissible */}
      {atsInviteOpen ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center p-4 sm:items-center">
          <div
            className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setAtsInviteOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ats-invite-title"
            className="animate-pop-in relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setAtsInviteOpen(false)}
              className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <FileCheck2 className="h-6 w-6" />
            </span>

            <h2 id="ats-invite-title" className="mt-4 text-lg font-bold">
              Make your resume ATS-friendly
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Most applications are filtered by software before a human reads them. Upload
              your resume and download a version every parser can read.
            </p>

            <ul className="mt-4 space-y-2 text-sm">
              {[
                'PDF or DOCX — up to 20 MB',
                'Single column, standard headings, no tables or images',
                'Download the finished file as a PDF',
              ].map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                onClick={() => {
                  setAtsInviteOpen(false);
                  setView('resume');
                }}
              >
                <UploadCloud className="h-4 w-4" />
                Upload resume
              </Button>
              <Button
                variant="outline"
                onClick={() => setAtsInviteOpen(false)}
                className="sm:w-36"
              >
                Maybe later
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="animate-pop-in fixed bottom-6 right-6 z-[80] flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-xl"
        >
          <CheckCheck className="h-4 w-4 text-success" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
