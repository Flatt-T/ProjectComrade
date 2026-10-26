// Terms, privacy, refunds and the advertising/cookies notice.
//
// IMPORTANT: the copy below is a working skeleton, not legal advice, and every block marked
// [NEEDS YOUR TEXT] has to be filled in and the whole thing reviewed before the paid service
// opens. The structure, routing, consent wiring and the facts about how the service actually
// behaves are real; the commitments a business makes are yours to set.
import React from 'react';
import { useAuth } from '../auth';
import { Link, useRoute } from '../router';
import { Notice } from '../ui';

/** Replace this with the operating entity's own details before launch. */
const COMPANY = {
  name: 'Thunderchild Creative Technologies',
  contact: 'support@thunderchildcreativetechnologies.com',
  address: '[NEEDS YOUR TEXT: registered address]',
  registration: '[NEEDS YOUR TEXT: company number and VAT number if registered]',
};

const PAGES = [
  { id: 'terms', title: 'Terms of service' },
  { id: 'privacy', title: 'Privacy policy' },
  { id: 'refunds', title: 'Cancellations and refunds' },
  { id: 'cookies', title: 'Cookies and advertising' },
  { id: 'acceptable-use', title: 'Acceptable use' },
];

function Placeholder({ children }: { children: React.ReactNode }) {
  return <p className="legal-placeholder"><b>[NEEDS YOUR TEXT]</b> {children}</p>;
}

export default function Legal() {
  const { match } = useRoute();
  const { tiers } = useAuth();
  const page = PAGES.find(p => match(`/legal/${p.id}`)) ?? PAGES[0];
  const version = tiers?.termsVersion ?? '';

  return <section className="page legal-page">
    <nav className="legal-nav">
      <p className="eyebrow">LEGAL</p>
      {PAGES.map(p => <Link key={p.id} to={`/legal/${p.id}`} className={p.id === page.id ? 'on' : ''}>{p.title}</Link>)}
    </nav>

    <article className="legal-body">
      <h1>{page.title}</h1>
      <p className="legal-meta">Version {version || 'draft'} · operated by {COMPANY.name}</p>
      <Notice kind="bad">
        Draft. This text has not been reviewed by a solicitor and must be completed before the
        paid service opens to the public.
      </Notice>

      {page.id === 'terms' && <>
        <h2>1. Who we are</h2>
        <p>Project Comrade is operated by {COMPANY.name}, {COMPANY.address}. {COMPANY.registration}.
          You can reach us at {COMPANY.contact}.</p>

        <h2>2. What the service is</h2>
        <p>Project Comrade is a browser-based real-time strategy platform. Some game styles run
          original GPL-licensed engines with freeware content; the Comrade Fusion Engine styles are
          independent gameplay replications with original procedural art. This is an unofficial
          community project and is not affiliated with, endorsed by or sponsored by Electronic Arts
          or Westwood Studios.</p>

        <h2>3. Accounts</h2>
        <p>You need an account to keep a callsign, a record and a subscription. You must give an
          email address you control, keep your password to yourself, and tell us promptly if you
          think somebody else has got into your account. One person, one account. You must be at
          least 13 years old to register, and if you are under 18 you need your parent or guardian's
          permission.</p>
        <p>Your callsign is yours while your account is live. We may reclaim a callsign that
          impersonates somebody, that is used to deceive, or that is unlawful or abusive.</p>

        <h2>4. Free play and subscriptions</h2>
        <p>Free accounts get a weekly allowance of matches, which renews seven days after the day
          you registered, and see a short advertisement before each match. Subscriptions remove the
          advertisement and raise or remove the allowances as set out on the
          {' '}<Link to="/tiers">tiers page</Link>. We may change the allowances or the prices; if we
          do, we will tell subscribers before the change applies to them, and you can cancel.</p>

        <h2>5. Paying</h2>
        <p>Subscriptions are billed monthly in advance by Stripe, who process the payment and hold
          the card details — we never see them. Prices are shown before you buy and include or exclude
          VAT as stated at checkout. If a payment fails, Stripe retries it; you keep your tier while it
          does, and the subscription lapses if it cannot be collected.</p>

        <h2>6. Cancelling</h2>
        <p>You can cancel at any time from your billing page. See
          {' '}<Link to="/legal/refunds">cancellations and refunds</Link>.</p>

        <h2>7. Fair play</h2>
        <p>See <Link to="/legal/acceptable-use">acceptable use</Link>. We may suspend or close an
          account that breaks those rules, and where we do we will refund the unused part of a paid
          month unless the account was closed for serious or repeated abuse.</p>

        <h2>8. Availability</h2>
        <p>We work to keep the service up but we do not promise it will be uninterrupted. We may
          change, suspend or withdraw game styles, maps and features. Nothing here excludes liability
          we cannot exclude by law, including for death or personal injury caused by negligence, or
          for fraud.</p>
        <Placeholder>Set out your liability cap, the law and courts that apply (England and Wales, presumably), and how disputes are handled.</Placeholder>

        <h2>9. Intellectual property</h2>
        <p>The engine source we distribute stays under its own licences, which are recorded in the
          project's rights ledger and shipped with the service. Classic artwork and sound remain the
          property of their owners. Our own code, art, maps and branding stay ours. You keep whatever
          rights you have in what you post; by posting it you let us show it on the service.</p>

        <h2>10. Changes to these terms</h2>
        <p>We will tell you about material changes and ask you to accept them when you next sign in.</p>
      </>}

      {page.id === 'privacy' && <>
        <h2>What we hold</h2>
        <ul>
          <li><b>Your account:</b> callsign, email address, and the password hash held by AWS Cognito
            (we never see or store your password).</li>
          <li><b>Optional profile:</b> display name, country, preferred side and an avatar, all of
            which you can change or clear whenever you like.</li>
          <li><b>Play records:</b> which matches you played, when, on what map and how they ended,
            with the final economy and combat figures.</li>
          <li><b>Allowance records:</b> one row per match you start, so your weekly allowance can be
            counted.</li>
          <li><b>Billing:</b> a Stripe customer reference, your subscription tier and status. Card
            details are held by Stripe, never by us.</li>
          <li><b>Consent records:</b> what you agreed to and when.</li>
          <li><b>Operational logs:</b> deliberately free of IP addresses and chat text. Rate limiting
            uses a one-way hash of the connecting address, which is never stored.</li>
        </ul>

        <h2>Why we hold it</h2>
        <p>To run your account and your subscription (to perform our contract with you), to count
          allowances and prevent abuse (our legitimate interests), to meet our tax and accounting
          duties (legal obligation), and — only where you have said yes — to show personalised
          advertisements or send you product email (consent, which you can withdraw at any time from
          your <Link to="/account">account page</Link>).</p>

        <h2>Who we share it with</h2>
        <p>Stripe (payments and invoicing), Amazon Web Services (the Cognito user pool that holds your
          sign-in credentials), and the advertising networks that serve the pre-match slot. Advertising
          networks receive what your browser sends them when the advertisement loads; with
          personalisation off, the request is marked non-personalised.</p>
        <Placeholder>Name each advertising network you actually enable, with a link to its own privacy notice, and confirm the lawful basis and any international transfer mechanism.</Placeholder>

        <h2>How long we keep it</h2>
        <p>Your account for as long as it is open. When you delete your account we release the
          callsign and erase your profile, avatar and sign-in immediately; match rows stay, with your
          name removed, because they are also the other players' history. Invoices are kept for as
          long as tax law requires.</p>
        <Placeholder>Confirm retention periods, especially for invoices and logs.</Placeholder>

        <h2>Your rights</h2>
        <p>You can see, correct, export or erase your data, object to processing, or withdraw consent.
          Most of it you can do yourself from your account page; for anything else write to
          {' '}{COMPANY.contact}. You can complain to the Information Commissioner's Office.</p>
      </>}

      {page.id === 'refunds' && <>
        <h2>Cancelling</h2>
        <p>Cancel whenever you like from your <Link to="/account/billing">billing page</Link>. Your
          subscription then runs to the end of the month you have already paid for and does not renew.
          You keep your tier until that date.</p>

        <h2>Your 14-day right to change your mind</h2>
        <p>As a consumer in the UK or EU you normally have 14 days from subscribing to cancel for a
          refund. Because the service is digital and available immediately, you are asked to agree
          that it starts straight away, and you keep a refund right for the part you have not used.</p>
        <Placeholder>State exactly what you will refund inside 14 days — in full, or pro rata for the unused days — and how to ask. A clear, more generous rule causes fewer disputes than the legal minimum.</Placeholder>

        <h2>Changing tier</h2>
        <p>Upgrades take effect immediately and Stripe charges only the difference for the rest of the
          month. Downgrades take effect at your renewal date, so you are never charged twice for the
          same period and never lose a tier you have paid for.</p>

        <h2>If something goes wrong</h2>
        <p>If the service is unavailable for a long stretch, or you were charged in error, write to
          {' '}{COMPANY.contact} and we will put it right.</p>
        <Placeholder>Define what counts as a long outage and what you will do about it.</Placeholder>
      </>}

      {page.id === 'cookies' && <>
        <h2>What we store on your device</h2>
        <ul>
          <li><b>Session cookie</b> (<code>cmrd_session</code>): keeps you signed in. It is httpOnly,
            so no script on the page can read it. Strictly necessary.</li>
          <li><b>Guest cookie</b> (<code>cmrd_guest</code>): a signed random id, so an unregistered
            visitor's taster match can be counted. No personal data, strictly necessary for that.</li>
          <li><b>Local settings</b>: your callsign, audio settings and your advertising choice, kept
            in your browser's own storage and never sent anywhere except as your choice.</li>
        </ul>
        <p>We set no analytics or tracking cookies of our own.</p>

        <h2>Advertising</h2>
        <p>Free and guest players see one advertisement of up to thirty seconds before a match. Your
          base is already on the battlefield while it plays, so the only cost is the time. Subscribers
          see none at all.</p>
        <p>With personalisation <b>off</b> — the default until you turn it on — the advertisement
          request is marked non-personalised and the networks are asked not to profile you. With it
          <b> on</b>, the networks may use what your browser sends them to choose a more relevant
          advertisement. You can change this at any time on your
          {' '}<Link to="/account">account page</Link>, and the change applies to the very next match.</p>
        <Placeholder>List the networks you enable and link their notices. If you join a network that requires IAB TCF consent strings, a certified consent management platform has to be added here.</Placeholder>
      </>}

      {page.id === 'acceptable-use' && <>
        <h2>Play fair</h2>
        <ul>
          <li>No cheating: no modified clients, no automation, no exploiting bugs for advantage, and
            no interfering with the lockstep simulation other players depend on.</li>
          <li>No getting round the allowances — multiple accounts, cleared cookies to farm guest
            matches, or anything else meant to dodge the limits.</li>
          <li>No abuse in chat or in a callsign: nothing hateful, threatening, sexual about children,
            or designed to harass another player.</li>
          <li>No impersonating staff or other commanders.</li>
          <li>No attacking the service: no scraping at volume, no probing, no denial of service.</li>
        </ul>
        <h2>What happens if you do</h2>
        <p>Depending on how serious it is: a warning, a chat restriction, a suspension, or the account
          closed. Where we close a paid account for a first, minor matter we refund the unused part of
          the month.</p>
        <Placeholder>Say how an appeal works and who hears it.</Placeholder>
      </>}

      <footer className="legal-foot">
        <p>Questions about any of this: {COMPANY.contact}</p>
        <Link to="/">← Back to the war room</Link>
      </footer>
    </article>
  </section>;
}
