#!/usr/bin/env node
// Daily Inbox Digest Runner — March 26, 2026
// Executes all digest steps using icloud-mcp library functions directly

import { createRequire } from 'module';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Set up environment variables for all accounts
process.env.IMAP_USER = 'azaidis1@me.com';
process.env.IMAP_PASSWORD = 'tuhh-dqxh-ytlg-mlfl';
process.env.IMAP_ACCOUNT_1_USER = 'azaidis1@me.com';
process.env.IMAP_ACCOUNT_1_PASSWORD = 'tuhh-dqxh-ytlg-mlfl';
process.env.IMAP_ACCOUNT_1_HOST = 'imap.mail.me.com';
process.env.IMAP_ACCOUNT_1_SMTP_HOST = 'smtp.mail.me.com';
process.env.IMAP_ACCOUNT_1_NAME = 'icloud';
process.env.IMAP_ACCOUNT_2_USER = 'zaidi1@terpmail.umd.edu';
process.env.IMAP_ACCOUNT_2_PASSWORD = 'tlcn hgfm idhw chlc';
process.env.IMAP_ACCOUNT_2_HOST = 'imap.gmail.com';
process.env.IMAP_ACCOUNT_2_SMTP_HOST = 'smtp.gmail.com';
process.env.IMAP_ACCOUNT_2_NAME = 'umd';
process.env.IMAP_ACCOUNT_3_USER = 'adamzaidi24@gmail.com';
process.env.IMAP_ACCOUNT_3_PASSWORD = 'lonp mybg toqp nfyw';
process.env.IMAP_ACCOUNT_3_HOST = 'imap.gmail.com';
process.env.IMAP_ACCOUNT_3_SMTP_HOST = 'smtp.gmail.com';
process.env.IMAP_ACCOUNT_3_NAME = 'personal';
process.env.IMAP_ACCOUNT_4_USER = 'adamzaidillc@gmail.com';
process.env.IMAP_ACCOUNT_4_PASSWORD = 'sgca pano apim nhkh';
process.env.IMAP_ACCOUNT_4_HOST = 'imap.gmail.com';
process.env.IMAP_ACCOUNT_4_SMTP_HOST = 'smtp.gmail.com';
process.env.IMAP_ACCOUNT_4_NAME = 'alt';

const BASE = '/Users/adamzaidi/Desktop/icloud-mcp';

// Suppress unhandled IMAP socket errors at process level to prevent crashes
process.on('uncaughtException', (err) => {
  if (err.code === 'ETIMEOUT' || err.code === 'ECONNRESET' || err.code === 'EPIPE' ||
      (err.message && (err.message.includes('Socket timeout') || err.message.includes('socket hang')))) {
    // Transient IMAP connection error - log but don't crash
    console.error(`[suppressed socket error] ${err.message}`);
    return;
  }
  // For real errors, log and exit gracefully
  console.error(`[uncaught] ${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  if (reason && (reason.code === 'ETIMEOUT' || reason.code === 'ECONNRESET')) {
    console.error(`[suppressed rejection] ${reason.message}`);
    return;
  }
  console.error(`[unhandledRejection] ${reason}`);
});

// Import all necessary modules
const { runRule, fetchEmails, searchEmails, getEmailContent, moveEmail, bulkMove, getUnsubscribeInfo } = await import(`${BASE}/lib/imap.js`);
const { getDigestState, updateDigestState } = await import(`${BASE}/lib/digest.js`);
const { composeEmail, saveDraft } = await import(`${BASE}/lib/smtp.js`);
const { listCalendars, listEvents, createEvent, updateEvent } = await import(`${BASE}/lib/caldav.js`);
const { listReminders, createReminder } = await import(`${BASE}/lib/reminders.js`);
const { searchContacts } = await import(`${BASE}/lib/carddav.js`);

// Account credentials lookup
const ACCOUNTS = {
  icloud: { user: 'azaidis1@me.com', pass: 'tuhh-dqxh-ytlg-mlfl', host: 'imap.mail.me.com', smtpHost: 'smtp.mail.me.com' },
  umd: { user: 'zaidi1@terpmail.umd.edu', pass: 'tlcn hgfm idhw chlc', host: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' },
  personal: { user: 'adamzaidi24@gmail.com', pass: 'lonp mybg toqp nfyw', host: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' },
  alt: { user: 'adamzaidillc@gmail.com', pass: 'sgca pano apim nhkh', host: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' },
};

const GMAIL_MAILBOX_MAP = {
  'Sent Messages': '[Gmail]/Sent Mail',
  'Archive': '[Gmail]/All Mail',
  'Deleted Messages': '[Gmail]/Trash',
  'Junk': '[Gmail]/Spam',
  'Drafts': '[Gmail]/Drafts',
};

function resolveMailbox(name, creds) {
  if (!name || creds?.host !== 'imap.gmail.com') return name;
  return GMAIL_MAILBOX_MAP[name] || name;
}

const TODAY = new Date('2026-03-26T12:00:00-04:00');
const NOW_ISO = new Date().toISOString();

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const errors = [];

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Archive Previous Digest
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 1: Archiving previous digest emails...');
try {
  const result = await runRule('archive-inbox-digests', false, ACCOUNTS.icloud);
  log(`Step 1 done: ${JSON.stringify(result)}`);
} catch (err) {
  errors.push(`Step 1 (archive): ${err.message}`);
  log(`Step 1 error: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Load State
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 2: Loading digest state...');
const state = getDigestState();
const { processedUids, lastRun, pendingActions } = state;
log(`State: lastRun=${lastRun}, processedUids=${processedUids.length}, pendingActions=${pendingActions.length}`);

const processedSet = new Set(processedUids.map(String));
const lastRunDate = lastRun ? new Date(lastRun) : new Date(0);
const nowDate = new Date(NOW_ISO);

// Check pending actions
const followUpNeeded = [];
const actionRequiredAlerts = [];
const expiredActions = [];
const newPendingActions = [...pendingActions];

for (const action of pendingActions) {
  if (action.type === 'follow_up') {
    const followUpAfter = new Date(action.followUpAfter);
    if (followUpAfter < nowDate) {
      // Check if email was sent
      try {
        const creds = ACCOUNTS[action.account || 'icloud'];
        const sentMailbox = resolveMailbox('Sent Messages', creds);
        const sentResults = await searchEmails({ subjectQuery: action.subject, mailbox: sentMailbox }, creds);
        if (sentResults && sentResults.emails && sentResults.emails.length > 0) {
          // Check for reply in inbox
          const reReSubject = action.subject.startsWith('Re:') ? action.subject : `Re: ${action.subject}`;
          const replyResults = await searchEmails({ subjectQuery: action.subject, mailbox: 'INBOX' }, creds);
          const hasReply = replyResults?.emails?.some(e => e.from !== creds.user && new Date(e.date) > followUpAfter);
          if (!hasReply) {
            const daysOverdue = Math.floor((nowDate - followUpAfter) / (1000 * 60 * 60 * 24));
            const item = { ...action, daysOverdue };
            followUpNeeded.push(item);
            if (daysOverdue > 7) {
              actionRequiredAlerts.push({ ...item, note: `overdue ${daysOverdue} days` });
            }
          }
        }
      } catch (err) {
        errors.push(`Step 2 follow_up check: ${err.message}`);
      }
    }
  } else if (action.type === 'bulk_move_pending') {
    const requestedAt = new Date(action.requestedAt);
    const daysSinceRequest = Math.floor((nowDate - requestedAt) / (1000 * 60 * 60 * 24));
    if (daysSinceRequest > 7) {
      expiredActions.push(action);
      // Remove from pending
      const idx = newPendingActions.findIndex(a => a === action);
      if (idx !== -1) newPendingActions.splice(idx, 1);
    }
  } else if (action.type === 'action_required') {
    if (!action.dueDate && action.addedAt) {
      const addedAt = new Date(action.addedAt);
      const daysOld = Math.floor((nowDate - addedAt) / (1000 * 60 * 60 * 24));
      if (daysOld > 14) {
        actionRequiredAlerts.push({ ...action, note: `stale — ${daysOld} days old` });
      }
    }
  }
}

log(`Step 2: followUpNeeded=${followUpNeeded.length}, actionRequiredAlerts=${actionRequiredAlerts.length}, expired=${expiredActions.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Check for Digest Replies
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 3: Checking for digest replies...');
let digestReplies = [];
try {
  const replySearch = await searchEmails({ subjectQuery: 'Re: Inbox Digest', mailbox: 'INBOX' }, ACCOUNTS.icloud);
  if (replySearch && replySearch.emails) {
    const filtered = replySearch.emails.filter(e => new Date(e.date) > lastRunDate);
    log(`Found ${filtered.length} digest replies since lastRun`);
    for (const reply of filtered) {
      try {
        const full = await getEmailContent(reply.uid, 'INBOX', 8000, false, ACCOUNTS.icloud);
        digestReplies.push({ uid: reply.uid, ...full });
      } catch (err) {
        errors.push(`Step 3 get reply ${reply.uid}: ${err.message}`);
      }
    }
  }
} catch (err) {
  errors.push(`Step 3 search: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Fetch Inbox (all accounts)
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 4: Fetching inboxes...');
const allEmails = [];

async function fetchInbox(accountName, creds) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await fetchEmails('INBOX', 100, true, 1, creds);
      const emails = result.emails || [];
      log(`${accountName}: ${emails.length} unread emails`);
      for (const email of emails) {
        const uidKey = accountName === 'icloud' ? String(email.uid) : `${accountName}:${email.uid}`;
        if (!processedSet.has(uidKey)) {
          allEmails.push({ ...email, account: accountName, creds, uidKey });
        }
      }
      return; // success
    } catch (err) {
      if (attempt < 2 && (err.code === 'ETIMEOUT' || err.code === 'ECONNRESET' || err.message?.includes('Socket'))) {
        log(`${accountName}: retry attempt ${attempt + 1} after transient error: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      errors.push(`Step 4 fetch ${accountName}: ${err.message}`);
      log(`Step 4 error ${accountName}: ${err.message}`);
      return;
    }
  }
}

await fetchInbox('icloud', ACCOUNTS.icloud);
await fetchInbox('umd', ACCOUNTS.umd);
await fetchInbox('personal', ACCOUNTS.personal);
await fetchInbox('alt', ACCOUNTS.alt);

log(`Total unprocessed emails: ${allEmails.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Triage
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 5: Triaging emails...');

const SECURITY_KEYWORDS = ['alert', 'verify', 'confirm', 'security', 'password', 'reset', 'receipt', 'order', 'invoice', 'statement', 'notification', 'suspicious', 'unauthorized', '2fa', 'code'];

const SKIP_PATTERNS = [
  /medium\.com/i, /substack\.com/i, /nytimes\.com/i, /espnmail\.com/i,
  /kaptest\.com/i, /bestbuy.*email/i, /tiktok.*relay/i, /stockx/i,
  /quizlet/i, /instagram.*mail/i, /datacamp\.com/i, /fanaticscommerce/i,
  /facebookmail\.com/i, /bncollege\.com/i, /fanatics/i, /marketing/i,
  /newsletter/i, /news\.paypal/i, /email\./i, /promo/i, /sale/i, /deal/i,
  /digest@/i, /deals@/i, /offers@/i,
];

const FYI_PATTERNS = [
  { test: (s, f) => /pnc|chase|bank|credit.union|wells.fargo|payment.*received|deposited|transfer/i.test(s + f), group: 'Payments received / Bank & account alerts' },
  { test: (s, f) => /receipt|order|shipped|delivered|tracking|invoice|purchase/i.test(s + f), group: 'Receipts & orders' },
  { test: (s, f) => /shift|schedule|work|clock.in|timesheet/i.test(s + f), group: 'Shift reminders' },
  { test: (s, f) => /security|alert|password|login|access|suspicious|unauthorized|verify|2fa|authentication/i.test(s + f), group: 'Security & account notices' },
  { test: (s, f) => /github|gitlab|jira|slack|notion|linear|vercel|snyk|heroku/i.test(s + f), group: 'Dev/tech notifications' },
  { test: (s, f) => /instagram|facebook|twitter|linkedin|snapchat|tiktok/i.test(s + f), group: 'Social notifications' },
];

const REPLY_NEEDED_PATTERNS = [
  /dear adam/i, /hi adam/i, /hello adam/i, /good morning/i,
  /please respond/i, /let me know/i, /can you/i, /could you/i, /would you/i,
  /your response/i, /looking forward/i, /following up/i, /question for you/i,
  /reaching out/i, /wanted to ask/i,
];

const CALENDAR_PATTERNS = [
  /interview/i, /meeting/i, /call scheduled/i, /appointment/i,
  /zoom link/i, /google meet/i, /calendar invite/i, /scheduled for/i,
  /rsvp/i, /event/i, /webinar/i, /conference/i,
];

const ACTION_PATTERNS = [
  /deadline/i, /due date/i, /action required/i, /please complete/i,
  /apply by/i, /submit by/i, /respond by/i, /expires/i, /urgent/i,
  /required/i, /must/i, /reminder:/i, /important:/i, /scholarship/i,
  /application/i,
];

const triaged = {
  reply_needed: [],
  calendar_event: [],
  action_required: [],
  fyi: [],
  skip: [],
};

const skipCountsThisRun = {};

function classifyEmail(email) {
  const subj = (email.subject || '').toLowerCase();
  const from = (email.from || '').toLowerCase();
  const combined = subj + ' ' + from;

  // Check if it's marketing/newsletter spam
  const isMarketing = SKIP_PATTERNS.some(p => p.test(combined));
  const hasSecurityKw = SECURITY_KEYWORDS.some(kw => subj.includes(kw));

  if (isMarketing && !hasSecurityKw) return 'skip';

  // Calendar events
  if (CALENDAR_PATTERNS.some(p => p.test(subj))) return 'calendar_event';

  // Action required
  if (ACTION_PATTERNS.some(p => p.test(subj))) return 'action_required';

  // FYI categories
  for (const pat of FYI_PATTERNS) {
    if (pat.test(subj, from)) return 'fyi';
  }

  // Check for personal senders (non-automated) that might need reply
  const isAutomated = /noreply|no-reply|notifications?@|alert@|support@|donotreply|automated|info@|team@|relay@|mail@|news@|update@/i.test(from);
  if (!isAutomated && (from.includes('@') && !isMarketing)) {
    // Personal sender — likely reply needed
    return 'reply_needed';
  }

  return 'fyi';
}

for (const email of allEmails) {
  const category = classifyEmail(email);
  email.category = category;
  triaged[category].push(email);

  if (category === 'skip') {
    skipCountsThisRun[email.from] = (skipCountsThisRun[email.from] || 0) + 1;
  }
}

log(`Triage: reply_needed=${triaged.reply_needed.length}, calendar=${triaged.calendar_event.length}, action=${triaged.action_required.length}, fyi=${triaged.fyi.length}, skip=${triaged.skip.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Move Marketing Emails
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 6: Moving marketing emails...');
const movedCount = { icloud: 0, umd: 0, personal: 0, alt: 0 };
const reclassifiedFromSkip = [];

for (const email of triaged.skip) {
  const subj = (email.subject || '').toLowerCase();
  const hasSecurityKw = SECURITY_KEYWORDS.some(kw => subj.includes(kw));

  if (hasSecurityKw) {
    email.category = 'fyi';
    reclassifiedFromSkip.push(email);
    triaged.fyi.push(email);
  } else {
    try {
      const acct = email.account;
      const creds = email.creds;
      await moveEmail(email.uid, 'bulk-mail/marketing', 'INBOX', creds);
      movedCount[acct]++;
    } catch (err) {
      // Folder might not exist, log and continue
      errors.push(`Step 6 move uid=${email.uid} acct=${email.account}: ${err.message}`);
    }
  }
}

log(`Step 6: moved ${JSON.stringify(movedCount)}, reclassified ${reclassifiedFromSkip.length} to fyi`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Handle reply_needed
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 7: Handling reply_needed emails...');
const draftsCreated = [];
const newFollowUps = [];

// Import getThread
const { getThread } = await import(`${BASE}/lib/imap.js`);

for (const email of triaged.reply_needed) {
  try {
    // Get thread to check for latest message
    let threadEmails = [];
    try {
      threadEmails = await getThread(email.uid, 'INBOX', email.creds);
    } catch (e) {
      threadEmails = [email];
    }

    // Check if we already sent a reply
    const creds = email.creds;
    const sentMailbox = resolveMailbox('Sent Messages', creds);
    let alreadyReplied = false;
    try {
      const sentSearch = await searchEmails({ subjectQuery: email.subject, mailbox: sentMailbox }, creds);
      if (sentSearch?.emails?.length > 0) {
        alreadyReplied = true;
      }
    } catch (e) {
      // ignore search error
    }

    if (!alreadyReplied) {
      // Get full email with headers
      const fullEmail = await getEmailContent(email.uid, 'INBOX', 8000, true, creds);

      // Draft a brief professional reply
      const replyBody = generateReply(fullEmail);
      if (replyBody) {
        try {
          const draftResult = await saveDraft(
            fullEmail.from,
            `Re: ${fullEmail.subject}`,
            null,
            {
              html: replyBody,
              inReplyTo: fullEmail.headers?.messageId,
              references: fullEmail.headers?.references || [],
            },
            creds
          );
          draftsCreated.push({ uid: email.uid, subject: email.subject, from: email.from, account: email.account });

          // Add follow-up
          const followUpDate = new Date(nowDate);
          followUpDate.setDate(followUpDate.getDate() + 3);
          newFollowUps.push({
            type: 'follow_up',
            subject: `Re: ${email.subject}`,
            to: email.from,
            toEmail: email.from,
            account: email.account,
            draftSavedAt: NOW_ISO,
            followUpAfter: followUpDate.toISOString(),
          });
        } catch (e) {
          errors.push(`Step 7 save_draft uid=${email.uid}: ${e.message}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Step 7 uid=${email.uid}: ${err.message}`);
  }
}

function generateReply(email) {
  const fromName = (email.from || '').split('@')[0].replace(/[._+]/g, ' ');
  return `<p>Hi${fromName ? ' ' + fromName.split(' ')[0].charAt(0).toUpperCase() + fromName.split(' ')[0].slice(1) : ''},</p>
<p>Thank you for reaching out. I'll get back to you shortly with a more detailed response.</p>
<p>Best regards,<br>Adam</p>`;
}

log(`Step 7: ${draftsCreated.length} drafts created`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — Handle calendar_event
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 8: Handling calendar events...');
const calendarEventsCreated = [];

// Get all calendars once
let allCalendars = [];
try {
  allCalendars = await listCalendars();
} catch (err) {
  errors.push(`Step 8 listCalendars: ${err.message}`);
}

const ADAM_CALENDAR_ID = 'e868dca2d6e41fdb842fb5390df251a176f7b42048e1c22d039709bfa2ae378d';

for (const email of triaged.calendar_event) {
  try {
    const fullEmail = await getEmailContent(email.uid, 'INBOX', 8000, false, email.creds);
    const eventDetails = extractEventDetails(fullEmail);

    if (eventDetails && eventDetails.date) {
      // Check if event already exists
      const dateStr = eventDetails.date;
      let existingEvent = null;

      for (const cal of allCalendars) {
        try {
          const events = await listEvents(cal.calendarId, dateStr, dateStr, 20);
          const match = events?.find(e => e.summary?.toLowerCase().includes(eventDetails.summary?.toLowerCase().split(' ')[0]));
          if (match) { existingEvent = match; break; }
        } catch (e) { /* continue */ }
      }

      if (existingEvent) {
        // Update to ensure 60-min reminder
        try {
          await updateEvent(ADAM_CALENDAR_ID, existingEvent.eventId, { reminder: 60 });
        } catch (e) { /* ignore */ }
      } else {
        // Create new event
        try {
          const newEvent = await createEvent(ADAM_CALENDAR_ID, {
            summary: eventDetails.summary || email.subject,
            start: eventDetails.start || `${dateStr}T09:00:00`,
            end: eventDetails.end || `${dateStr}T10:00:00`,
            timezone: 'America/New_York',
            description: eventDetails.description || `From email: ${email.subject}`,
            location: eventDetails.location || '',
            reminder: 60,
          });
          calendarEventsCreated.push({ subject: email.subject, summary: eventDetails.summary, date: dateStr });
        } catch (e) {
          errors.push(`Step 8 createEvent: ${e.message}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Step 8 uid=${email.uid}: ${err.message}`);
  }
}

function extractEventDetails(email) {
  const body = email.body || '';
  const subject = email.subject || '';

  // Try to extract date
  const datePatterns = [
    /(\w+ \d{1,2},?\s*202[0-9])/i,
    /(\d{1,2}\/\d{1,2}\/202[0-9])/,
    /(\d{4}-\d{2}-\d{2})/,
  ];

  let dateStr = null;
  for (const p of datePatterns) {
    const m = body.match(p) || subject.match(p);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d)) dateStr = d.toISOString().split('T')[0];
      } catch {}
      break;
    }
  }

  if (!dateStr) return null;

  // Extract time
  const timeMatch = body.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  const timeStr = timeMatch ? timeMatch[1] : '09:00';

  // Parse time
  let hour = 9, minute = 0;
  const tm = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (tm) {
    hour = parseInt(tm[1]);
    minute = parseInt(tm[2]);
    if (tm[3] && tm[3].toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (tm[3] && tm[3].toLowerCase() === 'am' && hour === 12) hour = 0;
  }

  const startStr = `${dateStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;
  const endStr = `${dateStr}T${String(hour+1).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`;

  // Extract location
  const locMatch = body.match(/location[:\s]+([^\n]+)/i) || body.match(/at\s+([^\n,]+(?:hall|building|room|center|university|college)[^\n]*)/i);

  return {
    summary: subject,
    date: dateStr,
    start: startStr,
    end: endStr,
    description: body.substring(0, 500),
    location: locMatch ? locMatch[1].trim() : '',
  };
}

log(`Step 8: ${calendarEventsCreated.length} calendar events created`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 — Handle action_required
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 9: Handling action_required emails...');
const remindersCreated = [];
const newActionItems = [];

for (const email of triaged.action_required) {
  try {
    const fullEmail = await getEmailContent(email.uid, 'INBOX', 4000, false, email.creds);
    const action = extractAction(fullEmail);

    try {
      await createReminder({
        listName: 'claude',
        title: action.title,
        notes: `From email: ${fullEmail.subject} — ${fullEmail.from}`,
        due: action.due || undefined,
      });
      remindersCreated.push({ subject: email.subject, action: action.title, due: action.due });
    } catch (e) {
      errors.push(`Step 9 createReminder: ${e.message}`);
    }

    newActionItems.push({
      type: 'action_required',
      subject: email.subject,
      from: email.from,
      dueDate: action.due || null,
      notes: action.title,
      addedAt: NOW_ISO,
    });
  } catch (err) {
    errors.push(`Step 9 uid=${email.uid}: ${err.message}`);
  }
}

function extractAction(email) {
  const subj = email.subject || '';
  const body = (email.body || '').substring(0, 2000);

  // Extract deadline
  const deadlinePatterns = [
    /deadline[:\s]+(\w+ \d{1,2},?\s*202[0-9])/i,
    /due[:\s]+(\w+ \d{1,2},?\s*202[0-9])/i,
    /by (\w+ \d{1,2},?\s*202[0-9])/i,
    /expires?[:\s]+(\w+ \d{1,2},?\s*202[0-9])/i,
    /(\d{4}-\d{2}-\d{2})/,
  ];

  let due = null;
  for (const p of deadlinePatterns) {
    const m = (body + subj).match(p);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d)) { due = d.toISOString().split('T')[0]; break; }
      } catch {}
    }
  }

  return { title: subj.substring(0, 100), due };
}

log(`Step 9: ${remindersCreated.length} reminders created`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 10 — Read & Act on Reminders
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 10: Reading reminders...');
let activeReminders = [];
try {
  const allLists = await listReminders();
  const claudeList = allLists.filter(r => r.listName === 'claude' && !r.completed);
  const actionedPattern = /Actioned \d{4}-\d{2}-\d{2}/i;
  activeReminders = claudeList.filter(r => !actionedPattern.test(r.notes || ''));
  log(`Found ${activeReminders.length} active reminders in 'claude' list`);
} catch (err) {
  errors.push(`Step 10 listReminders: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 10.5 — Pre-Meeting Brief (Tomorrow = March 27)
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 10.5: Checking tomorrow\'s calendar (March 27)...');
const tomorrowEvents = [];
try {
  const cals = allCalendars.length > 0 ? allCalendars : await listCalendars();
  for (const cal of cals) {
    try {
      const events = await listEvents(cal.calendarId, '2026-03-27', '2026-03-27', 20);
      if (events && events.length > 0) {
        for (const ev of events) {
          // Skip personal work/study blocks, self-reminders, all-day with no attendees
          const isPersonal = /study|work block|self|reminder|lsat|prep|sleep|gym|lunch|break/i.test(ev.summary || '');
          const hasAttendees = ev.attendees && ev.attendees.length > 0;
          const hasExternalContext = /meeting|interview|call|appointment|zoom|meet|with /i.test(ev.summary || '');

          if (!isPersonal || hasAttendees || hasExternalContext) {
            tomorrowEvents.push({ ...ev, calendarName: cal.name });
          }
        }
      }
    } catch (e) { /* continue */ }
  }
} catch (err) {
  errors.push(`Step 10.5: ${err.message}`);
}
log(`Tomorrow's qualifying events: ${tomorrowEvents.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 11 — Build and Send Digest
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 11: Building digest...');

// Organize FYI by group
const fyiGroups = {};
for (const email of triaged.fyi) {
  let group = 'Other FYI';
  const subj = (email.subject || '').toLowerCase();
  const from = (email.from || '').toLowerCase();
  const combined = subj + ' ' + from;

  if (/payment|received|deposited|transfer|bank|pnc|chase|wells|credit.union/i.test(combined)) {
    group = 'Payments received & Bank alerts';
  } else if (/receipt|order|ship|deliver|track|invoice|purchase/i.test(combined)) {
    group = 'Receipts & Orders';
  } else if (/shift|schedule|work|clock/i.test(combined)) {
    group = 'Shift reminders';
  } else if (/security|alert|password|login|suspicious|unauthorized|verify|2fa/i.test(combined)) {
    group = 'Security & Account notices';
  } else if (/github|gitlab|jira|vercel|snyk|heroku|stripe|twilio/i.test(combined)) {
    group = 'Dev / Tech notifications';
  } else if (/instagram|facebook|twitter|linkedin|snapchat|tiktok/i.test(combined)) {
    group = 'Social notifications';
  }

  if (!fyiGroups[group]) fyiGroups[group] = [];
  fyiGroups[group].push(email);
}

function acctBadge(account) {
  const colors = { icloud: '#007aff', umd: '#e03a3a', personal: '#34c759', alt: '#ff9500' };
  const color = colors[account] || '#888';
  return `<span style="background:${color};color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:600;margin-left:4px;">${account.toUpperCase()}</span>`;
}

function emailCard(email, extra = '') {
  const date = email.date ? new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return `<div style="border-left:3px solid #ddd;padding:6px 10px;margin:4px 0;font-size:13px;">
    <strong>${escHtml(email.subject || '(no subject)')}</strong>${acctBadge(email.account)}
    <br><span style="color:#666;">From: ${escHtml(email.from || '')}</span> · <span style="color:#999;">${date}</span>
    ${extra ? `<br>${extra}` : ''}
  </div>`;
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function section(title, color, content) {
  return `<div style="background:#fff;border-radius:8px;margin-bottom:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:${color};color:#fff;padding:10px 16px;font-weight:600;font-size:14px;">${title}</div>
    <div style="padding:12px 16px;">${content}</div>
  </div>`;
}

let htmlParts = [];

// Action Required
const allActionItems = [
  ...actionRequiredAlerts,
  ...triaged.action_required,
];
if (allActionItems.length > 0) {
  let content = '';
  for (const item of allActionItems) {
    if (item.uid !== undefined) {
      // From new emails
      const due = item.dueDate ? `<br><strong>Due:</strong> ${item.dueDate}` : '';
      content += emailCard(item, due);
    } else {
      // From pending actions
      const staleNote = item.note ? ` <em style="color:#e03a3a;">(${item.note})</em>` : '';
      const due = item.dueDate ? ` — due ${item.dueDate}` : '';
      content += `<div style="border-left:3px solid #ff9500;padding:6px 10px;margin:4px 0;font-size:13px;">
        <strong>${escHtml(item.subject || item.title || 'Action item')}</strong>${staleNote}
        <br><span style="color:#666;">From: ${escHtml(item.from || '')}</span>${due}
        ${item.notes ? `<br><span style="color:#444;font-size:12px;">${escHtml(item.notes)}</span>` : ''}
      </div>`;
    }
  }
  htmlParts.push(section('Action Required', '#e03a3a', content));
}

// Follow-up Needed
if (followUpNeeded.length > 0) {
  let content = '';
  for (const item of followUpNeeded) {
    const overdue = item.daysOverdue > 0 ? ` <em style="color:#e03a3a;">(${item.daysOverdue}d overdue)</em>` : '';
    content += `<div style="border-left:3px solid #ff9500;padding:6px 10px;margin:4px 0;font-size:13px;">
      <strong>${escHtml(item.subject)}</strong>${overdue}
      <br><span style="color:#666;">To: ${escHtml(item.to || item.toEmail || '')}</span>
      <br><span style="color:#999;font-size:12px;">No reply received since ${new Date(item.followUpAfter).toLocaleDateString()}</span>
    </div>`;
  }
  htmlParts.push(section('Follow-up Needed', '#ff9500', content));
}

// Reply Needed (drafts)
if (triaged.reply_needed.length > 0) {
  let content = '';
  for (const email of triaged.reply_needed) {
    const drafted = draftsCreated.find(d => d.uid === email.uid);
    const draftNote = drafted ? '<span style="color:#34c759;font-size:11px;">✓ Draft saved</span>' : '';
    content += emailCard(email, draftNote);
  }
  htmlParts.push(section('Reply Needed', '#007aff', content));
}

// Calendar Events
if (triaged.calendar_event.length > 0) {
  let content = '';
  for (const email of triaged.calendar_event) {
    const created = calendarEventsCreated.find(c => c.subject === email.subject);
    const note = created ? `<span style="color:#34c759;font-size:11px;">✓ Event created: ${escHtml(created.date)}</span>` : '';
    content += emailCard(email, note);
  }
  htmlParts.push(section('Calendar Events', '#5856d6', content));
}

// Tomorrow's Brief
if (tomorrowEvents.length > 0) {
  let content = '<p style="font-size:13px;color:#444;margin:0 0 10px;">Events on <strong>Friday, March 27</strong>:</p>';
  for (const ev of tomorrowEvents) {
    const timeStr = ev.start ? new Date(ev.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) : '';
    content += `<div style="border-left:3px solid #5856d6;padding:6px 10px;margin:4px 0;font-size:13px;">
      <strong>${escHtml(ev.summary || '(Untitled)')}</strong>
      ${timeStr ? `<br><span style="color:#666;">${timeStr}</span>` : ''}
      ${ev.location ? `<br><span style="color:#666;">📍 ${escHtml(ev.location)}</span>` : ''}
      <span style="color:#999;font-size:11px;"> · ${escHtml(ev.calendarName || '')}</span>
    </div>`;
  }
  htmlParts.push(section('Tomorrow\'s Schedule — Friday March 27', '#5856d6', content));
}

// Active Reminders (Needs You)
if (activeReminders.length > 0) {
  let content = '';
  for (const r of activeReminders.slice(0, 10)) {
    const due = r.due ? ` — due ${new Date(r.due).toLocaleDateString()}` : '';
    content += `<div style="border-left:3px solid #34c759;padding:6px 10px;margin:4px 0;font-size:13px;">
      <strong>${escHtml(r.title)}</strong>${due}
      ${r.notes ? `<br><span style="color:#666;font-size:12px;">${escHtml(r.notes)}</span>` : ''}
    </div>`;
  }
  htmlParts.push(section('Needs You — Active Reminders', '#34c759', content));
}

// FYI Groups
for (const [group, emails] of Object.entries(fyiGroups)) {
  let content = '<ul style="margin:0;padding-left:18px;font-size:13px;">';
  for (const email of emails) {
    const date = email.date ? new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    content += `<li style="margin-bottom:4px;"><strong>${escHtml(email.subject || '(no subject)')}</strong>${acctBadge(email.account)} <span style="color:#999;">${date}</span><br><span style="color:#666;font-size:12px;">${escHtml(email.from || '')}</span></li>`;
  }
  content += '</ul>';
  htmlParts.push(section(`FYI — ${group}`, '#8e8e93', content));
}

// Skip summary
const totalSkipped = triaged.skip.length - reclassifiedFromSkip.length;
if (totalSkipped > 0) {
  const topSkippers = Object.entries(skipCountsThisRun)
    .sort((a,b) => b[1]-a[1]).slice(0,5);
  let content = `<p style="font-size:13px;color:#444;margin:0 0 8px;">${totalSkipped} emails moved to bulk-mail/marketing.</p>`;
  if (topSkippers.length > 0) {
    content += '<ul style="margin:0;padding-left:18px;font-size:12px;color:#666;">';
    for (const [sender, count] of topSkippers) {
      content += `<li>${escHtml(sender)} (×${count})</li>`;
    }
    content += '</ul>';
  }
  htmlParts.push(section('Skipped & Moved to Marketing', '#8e8e93', content));
}

// Errors
if (errors.length > 0) {
  let content = '<ul style="margin:0;padding-left:18px;font-size:12px;color:#e03a3a;">';
  for (const err of errors) {
    content += `<li>${escHtml(err)}</li>`;
  }
  content += '</ul>';
  htmlParts.push(section('Errors (Non-Fatal)', '#e03a3a', content));
}

// Expired actions
if (expiredActions.length > 0) {
  let content = '<ul style="margin:0;padding-left:18px;font-size:12px;">';
  for (const a of expiredActions) {
    content += `<li>Bulk move of ${a.count || '?'} emails from ${escHtml(a.sender || '?')} to ${escHtml(a.targetMailbox || '?')} expired (requested ${a.requestedAt}, never confirmed)</li>`;
  }
  content += '</ul>';
  htmlParts.push(section('Expired Actions', '#8e8e93', content));
}

// High skip-count unsubscribe suggestions
const cumulativeSkipCounts = { ...state.skipCounts };
for (const [sender, count] of Object.entries(skipCountsThisRun)) {
  cumulativeSkipCounts[sender] = (cumulativeSkipCounts[sender] || 0) + count;
}
const unsubCandidates = Object.entries(cumulativeSkipCounts)
  .filter(([, c]) => c >= 5)
  .sort((a,b) => b[1]-a[1])
  .slice(0, 5);

if (unsubCandidates.length > 0) {
  let content = '<ul style="margin:0;padding-left:18px;font-size:13px;">';
  for (const [sender, count] of unsubCandidates) {
    content += `<li><strong>${escHtml(sender)}</strong> — skipped ${count}× total. Consider unsubscribing.</li>`;
  }
  content += '</ul>';
  htmlParts.push(section('Unsubscribe Suggestions (skipped 5+ times)', '#ff9500', content));
}

// Stats footer
const statsHtml = `<div style="font-size:12px;color:#999;text-align:center;margin-top:8px;padding:8px;">
  ${allEmails.length} new emails processed across 4 accounts &nbsp;·&nbsp;
  ${triaged.reply_needed.length} need reply &nbsp;·&nbsp;
  ${triaged.action_required.length} action items &nbsp;·&nbsp;
  ${triaged.calendar_event.length} calendar &nbsp;·&nbsp;
  ${triaged.fyi.length} FYI &nbsp;·&nbsp;
  ${totalSkipped} skipped
</div>`;

const fullHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:16px;">
    <div style="background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:22px;font-weight:700;">Inbox Digest</div>
      <div style="font-size:14px;opacity:0.85;margin-top:4px;">Thursday, March 26, 2026</div>
      <div style="font-size:12px;opacity:0.7;margin-top:2px;">Generated ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET</div>
    </div>
    ${htmlParts.join('\n')}
    ${statsHtml}
  </div>
</body>
</html>`;

// Send the digest
log('Sending digest email...');
try {
  const result = await composeEmail(
    'azaidis1@me.com',
    'Inbox Digest — Thursday, March 26',
    null,
    { html: fullHtml },
    ACCOUNTS.icloud
  );
  log(`Digest sent: ${JSON.stringify(result)}`);
} catch (err) {
  errors.push(`Step 11 send: ${err.message}`);
  log(`Step 11 ERROR: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 12 — Update State
// ─────────────────────────────────────────────────────────────────────────────
log('STEP 12: Updating digest state...');

const allProcessedThisRun = allEmails.map(e => e.uidKey);

// Build updated pending actions
const updatedPending = [
  // Keep existing actions that weren't expired
  ...newPendingActions.filter(a => !expiredActions.includes(a)),
  // Add new action items from step 9
  ...newActionItems,
  // Add new follow-ups from step 7
  ...newFollowUps,
];

try {
  const newState = updateDigestState({
    lastRun: NOW_ISO,
    processedUids: allProcessedThisRun,
    pendingActions: updatedPending,
    skipCounts: skipCountsThisRun,
  });
  log(`State updated: processedUids=${newState.processedUids.length}, pending=${newState.pendingActions.length}`);
} catch (err) {
  errors.push(`Step 12 updateState: ${err.message}`);
  log(`Step 12 ERROR: ${err.message}`);
}

log('=== DIGEST COMPLETE ===');
if (errors.length > 0) {
  log(`Errors encountered: ${errors.length}`);
  for (const e of errors) log(`  ERROR: ${e}`);
}

// Summary output
console.log('\n\n=== DIGEST SUMMARY ===');
console.log(`Date: Thursday, March 26, 2026`);
console.log(`Accounts: icloud, umd, personal, alt`);
console.log(`New emails processed: ${allEmails.length}`);
console.log(`  - Reply needed: ${triaged.reply_needed.length} (${draftsCreated.length} drafts saved)`);
console.log(`  - Calendar events: ${triaged.calendar_event.length} (${calendarEventsCreated.length} created)`);
console.log(`  - Action required: ${triaged.action_required.length} (${remindersCreated.length} reminders created)`);
console.log(`  - FYI: ${triaged.fyi.length}`);
console.log(`  - Skipped/moved to marketing: ${totalSkipped}`);
console.log(`Follow-up needed: ${followUpNeeded.length}`);
console.log(`Tomorrow's events: ${tomorrowEvents.length}`);
console.log(`Active reminders: ${activeReminders.length}`);
console.log(`Errors: ${errors.length}`);
