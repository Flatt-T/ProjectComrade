// Terms, privacy, refunds, advertising and acceptable use.
//
// Reviewed and approved by the company's solicitor, reported by the project owner on
// 2026-10-26. Treat the text as settled: changes of substance need to go back for review, and
// anything that changes what we actually promise — the refund window, the availability
// thresholds, the liability cap, retention periods — is a legal change, not a copy tweak.
//
// Every factual claim here was written against what the service really does and checked in
// the code: what is stored, what each cookie is for, how long an advertisement runs, what a
// refund gets you. If the behaviour changes, this text has to change with it.
//
// Positions that were chosen rather than required, recorded so nobody undoes them by accident:
//   - A full, no-questions refund in the first 14 days, once per customer. More generous than
//     the law requires, and cheaper than the chargebacks it avoids.
//   - Liability capped at the greater of £100 and twelve months of fees.
//   - Availability credit after 24 hours' continuous or 72 hours' monthly downtime.
//   - Retention: 12 months for play records, 30 days for logs, 7 years for invoices (HMRC).
//   - Governing law: England and Wales, where the company is registered.
//
// The advertising network register below is pre-written for Google Ad Manager and turns on by
// itself when a tag is configured; any further network must be added before its tag goes live.
import React from 'react';
import { useAuth } from '../auth';
import { Link, useRoute } from '../router';

/**
 * The operating entity, as published on mediafaire.io — the same company.
 *
 * `contact` must be a monitored mailbox: these pages promise a reply within five working days,
 * and it is the route for refunds, data requests and appeals.
 */
const COMPANY = {
  name: 'ThunderChild Creative Technologies Ltd',
  service: 'Project Comrade',
  contact: 'support@thunderchildcreativetechnologies.com',
  address: '155 Wellingborough Road, Rushden, Northamptonshire, NN10 9TB, United Kingdom',
  registration: 'Registered in England and Wales, company number 17014355',
  jurisdiction: 'England and Wales',
  /** Set by the owner when the solicitor signed the text off. Shown to players. */
  reviewed: '26 October 2026',
};

/**
 * Advertising networks we are set up to use. Each receives whatever the browser sends it when
 * the advertisement loads, so each has to be named with a link to its own notice and, where it
 * has one, its opt-out.
 *
 * This list describes what *would* serve; whether anything third-party is serving at all comes
 * from the service (`adsConfigured`, true once COMRADE_AD_TAGS holds a tag). So the pages never
 * claim a network is involved before its tag is live, and need no edit on the day it is.
 */
const AD_NETWORKS: { name: string; operator: string; href: string; optOut?: string }[] = [
  {
    name: 'Google Ad Manager',
    operator: 'Google Ireland Limited',
    href: 'https://policies.google.com/technologies/partner-sites',
    optOut: 'https://adssettings.google.com/',
  },
];

const PAGES = [
  { id: 'terms', title: 'Terms of service' },
  { id: 'privacy', title: 'Privacy policy' },
  { id: 'refunds', title: 'Cancellations and refunds' },
  { id: 'cookies', title: 'Cookies and advertising' },
  { id: 'acceptable-use', title: 'Acceptable use' },
];

function AdNetworkList({ live }: { live: boolean }) {
  if (!live || !AD_NETWORKS.length) {
    return <p>We are not currently serving third-party advertisements: the pre-match slot shows
      our own promotion, and nothing about you leaves this site for it. If that changes, this
      page will name every network involved before any of their advertisements run.</p>;
  }
  return <>
    <p>The networks that may serve an advertisement to you. Each is an independent controller of
      the data its own request collects, and each has its own notice:</p>
    <ul>{AD_NETWORKS.map(network => <li key={network.name}>
      <b>{network.name}</b> ({network.operator}) —
      {' '}<a href={network.href} target="_blank" rel="noreferrer noopener">how it uses data</a>
      {network.optOut && <> · <a href={network.optOut} target="_blank" rel="noreferrer noopener">opt out</a></>}
    </li>)}</ul>
  </>;
}

export default function Legal() {
  const { match } = useRoute();
  const { tiers } = useAuth();
  const page = PAGES.find(p => match(`/legal/${p.id}`)) ?? PAGES[0];
  const version = tiers?.termsVersion ?? '';
  // Whether anything third-party is actually serving, as the service reports it.
  const adsLive = !!tiers?.adsConfigured && AD_NETWORKS.length > 0;

  return <section className="page legal-page">
    <nav className="legal-nav">
      <p className="eyebrow">LEGAL</p>
      {PAGES.map(p => <Link key={p.id} to={`/legal/${p.id}`} className={p.id === page.id ? 'on' : ''}>{p.title}</Link>)}
    </nav>

    <article className="legal-body">
      <h1>{page.title}</h1>
      <p className="legal-meta">
        Version {version || COMPANY.reviewed} · last reviewed {COMPANY.reviewed} · {COMPANY.name}
      </p>

      {/* ------------------------------------------------------------------ */}
      {page.id === 'terms' && <>
        <h2>1. Who we are, and what this covers</h2>
        <p>{COMPANY.service} is operated by {COMPANY.name}, {COMPANY.address}. {COMPANY.registration}.
          You can reach us at {COMPANY.contact}, and we aim to answer within five working days.</p>
        <p>These terms are the agreement between you and us for your use of the service, whether
          you play free, as a guest, or on a subscription. By using the service you accept them.
          If you do not accept them, please do not use the service.</p>

        <h2>2. What the service is</h2>
        <p>{COMPANY.service} is a browser-based real-time strategy platform. The Classic game
          styles run original GPL-licensed engines with freeware content. The Comrade Fusion
          Engine styles are independent gameplay replications with original procedural art: they
          approximate how the classics played and are tuned over time.</p>
        <p>This is an unofficial community project. It is not affiliated with, endorsed by,
          sponsored by or connected to Electronic Arts, Westwood Studios or any other rights
          holder in the original games. Trade marks belong to their owners and are used only to
          describe what a game style replicates.</p>

        <h2>3. Who may use it</h2>
        <p>You must be at least 13 years old to register. If you are under 18 you need the
          permission of a parent or guardian, and if you are under 18 you may not subscribe
          without their consent to the payment.</p>
        <p>You may hold one account. You must give an email address you control, keep your
          password to yourself, and tell us promptly at {COMPANY.contact} if you believe somebody
          else has got into your account. You are responsible for what is done through your
          account up to the point you tell us.</p>

        <h2>4. Your callsign</h2>
        <p>Your callsign is yours for as long as your account is open, and nobody else can take
          it while you hold it. If you delete your account it is released and somebody else may
          claim it.</p>
        <p>We may reclaim a callsign that impersonates another person or organisation, that is
          used to deceive, that implies a connection with us or with a rights holder, or that is
          unlawful or abusive. Where we do, we will tell you and give you a chance to choose
          another one unless the circumstances make that inappropriate.</p>

        <h2>5. Free play, allowances and advertisements</h2>
        <p>Guests and free accounts get a weekly allowance of matches. The allowance renews seven
          days after the day you registered — not on a fixed day of the week — and the current
          allowances for every tier are set out on the <Link to="/tiers">tiers page</Link>.</p>
        <p>On the free and guest tiers a short advertisement of up to thirty seconds plays before
          a match. Your base is on the battlefield while it runs, so what you lose is the time,
          not the position. Subscribers see no advertisement.</p>

        <h2>6. Subscriptions and payment</h2>
        <p>Subscriptions are monthly, billed in advance, and renew automatically until you cancel.
          Payment is taken by Stripe, who process the payment and hold your card details — we
          never see or store them.</p>
        <p>The price is shown before you buy, in pounds sterling, and the checkout tells you
          whether VAT is included. By subscribing you authorise the recurring charge until you
          cancel.</p>
        <p>If a payment fails, Stripe retries it on a schedule. You keep your tier while it does.
          If it cannot be collected, the subscription ends and your account returns to the free
          tier; nothing is owed and nothing is sent to collection.</p>

        <h2>7. Changing tier and cancelling</h2>
        <p>Upgrades take effect immediately and you pay only the prorated difference for the rest
          of the month. Downgrades take effect at your renewal date, so you keep what you have
          already paid for. You can cancel at any time from your billing page; your subscription
          then runs to the end of the paid month and does not renew. See
          {' '}<Link to="/legal/refunds">cancellations and refunds</Link>.</p>

        <h2>8. Changes to the service, the allowances and the price</h2>
        <p>We will keep developing the service: adding, changing and sometimes withdrawing game
          styles, maps and features. We may also change the allowances or the price.</p>
        <p>If we change the price of your subscription, or reduce what your tier includes, we
          will tell you by email at least 30 days before it applies to you, and you may cancel
          before it takes effect. Your existing paid month is never changed.</p>

        <h2>9. Fair play</h2>
        <p>Our <Link to="/legal/acceptable-use">acceptable use policy</Link> is part of these
          terms. If you break it we may warn you, restrict chat, suspend your account or close
          it, depending on how serious and how repeated the matter is. Where we close a paid
          account other than for serious or repeated abuse, we refund the unused part of the
          month.</p>

        <h2>10. Your content</h2>
        <p>You keep whatever rights you have in what you post — chat, a callsign, a display name,
          an avatar, a proposal. By posting it you give us a non-exclusive, royalty-free licence
          to store it and show it on the service for as long as you keep it there. You confirm
          you have the right to post it. We may remove anything that breaks these terms.</p>

        <h2>11. Our content and third-party licences</h2>
        <p>The engine source we distribute stays under its own licences, which are recorded in the
          project's rights ledger and shipped with the service. Classic artwork and sound remain
          the property of their owners. Our own code, procedural art, maps, interface and
          branding remain ours. Nothing here transfers any of it to you beyond the right to use
          the service.</p>

        <h2>12. Availability</h2>
        <p>We work to keep the service up, but we do not promise it will be uninterrupted or
          error-free. We may take it down for maintenance, and we will give notice where we
          reasonably can. The service is provided as it is, and we do not promise it will meet
          any particular requirement of yours.</p>

        <h2>13. Our responsibility to you</h2>
        <p>Nothing in these terms limits liability that cannot be limited by law — including for
          death or personal injury caused by negligence, for fraud or fraudulent
          misrepresentation, or for your rights under the Consumer Rights Act 2015.</p>
        <p>Subject to that, we are not liable for loss that was not reasonably foreseeable, for
          business losses (the service is supplied for private use), or for loss of game progress,
          statistics or standing. Our total liability to you in any twelve-month period is limited
          to the greater of £100 and the amount you paid us in that period.</p>

        <h2>14. Ending the agreement</h2>
        <p>You may stop using the service and delete your account at any time. We may end this
          agreement by closing your account if you seriously or repeatedly break these terms, or
          if we withdraw the service altogether — in which case we will give reasonable notice and
          refund any unused paid time.</p>

        <h2>15. Law and disputes</h2>
        <p>These terms are governed by the law of {COMPANY.jurisdiction}, and you and we can both
          bring claims in its courts. If you live elsewhere in the UK you may also bring a claim
          in your local courts. Nothing here affects your rights as a consumer where you live.</p>
        <p>If something goes wrong, please write to {COMPANY.contact} first — most things are
          settled that way.</p>

        <h2>16. Changes to these terms</h2>
        <p>We may update these terms. We will tell you about material changes by email or in the
          service, and ask you to accept them when you next sign in. The version in force is shown
          at the top of this page.</p>
      </>}

      {/* ------------------------------------------------------------------ */}
      {page.id === 'privacy' && <>
        <p>This notice explains what we hold about you, why, and what you can do about it. It
          covers {COMPANY.service} only. We are the data controller: {COMPANY.name},
          {' '}{COMPANY.address}. {COMPANY.registration}. Contact {COMPANY.contact}.</p>

        <h2>The short version</h2>
        <p>We hold the least we can: a callsign, an email address, what you played and whether you
          are subscribed. We never see your password or your card details. We set no analytics or
          tracking cookies. We do not sell your data. You can erase almost all of it yourself in
          two clicks from your account page.</p>

        <h2>What we hold, and why</h2>
        <table className="legal-table">
          <thead><tr><th>What</th><th>Why</th><th>Lawful basis</th></tr></thead>
          <tbody>
            <tr>
              <td>Callsign and email address</td>
              <td>To run your account, sign you in and send service messages</td>
              <td>Performing our contract with you</td>
            </tr>
            <tr>
              <td>Password</td>
              <td>Held by AWS Cognito, hashed. We never see or store it</td>
              <td>Performing our contract with you</td>
            </tr>
            <tr>
              <td>Display name, country, preferred side, avatar</td>
              <td>Optional profile. You can change or clear any of them at any time</td>
              <td>Performing our contract with you</td>
            </tr>
            <tr>
              <td>Match records: what you played, when, on what map, how it ended, and the final
                economy and combat figures</td>
              <td>Your record, your history and the results other players see</td>
              <td>Performing our contract with you</td>
            </tr>
            <tr>
              <td>Play records: one row each time you start a match</td>
              <td>To count your weekly allowance and to stop it being circumvented</td>
              <td>Performing our contract; our legitimate interest in preventing abuse</td>
            </tr>
            <tr>
              <td>A Stripe customer reference, your tier and subscription status</td>
              <td>To give you what you have paid for and show you your invoices</td>
              <td>Performing our contract with you</td>
            </tr>
            <tr>
              <td>Invoices and payment records</td>
              <td>Accounting and tax</td>
              <td>Legal obligation</td>
            </tr>
            <tr>
              <td>Consent records: what you agreed to, and when</td>
              <td>To honour your choices and show that we did</td>
              <td>Legal obligation</td>
            </tr>
            <tr>
              <td>Advertising choice</td>
              <td>To decide whether an advertisement may be personalised</td>
              <td>Consent, which you can withdraw at any time</td>
            </tr>
            <tr>
              <td>Product email</td>
              <td>To tell you when new maps and fusions launch</td>
              <td>Consent, which you can withdraw at any time</td>
            </tr>
            <tr>
              <td>Guest identifier: a signed random id in a cookie</td>
              <td>So an unregistered visitor's taster match can be counted</td>
              <td>Our legitimate interest in offering a free trial fairly</td>
            </tr>
            <tr>
              <td>Operational logs</td>
              <td>To keep the service running and investigate faults</td>
              <td>Our legitimate interest in a reliable, secure service</td>
            </tr>
          </tbody>
        </table>

        <h2>What we deliberately do not hold</h2>
        <ul>
          <li><b>Your password.</b> It goes to AWS Cognito over an encrypted connection and is
            never stored or logged by us.</li>
          <li><b>Your card details.</b> They are entered on Stripe's own pages and held by Stripe.
            They never reach our servers.</li>
          <li><b>IP addresses, in our logs.</b> Our operational logs contain no IP address and no
            chat text. Rate limiting uses a one-way hash of the connecting address, computed for
            the request and never stored.</li>
          <li><b>Analytics or tracking cookies of our own.</b> We set none.</li>
        </ul>

        <h2>Who else is involved</h2>
        <ul>
          <li><b>Stripe</b> — payments, subscriptions and invoicing. Stripe is a controller in its
            own right for payment data. <a href="https://stripe.com/gb/privacy" target="_blank" rel="noreferrer noopener">Stripe's privacy policy</a>.</li>
          <li><b>Amazon Web Services</b> — the Cognito user pool that holds your sign-in
            credentials, and the email service that sends confirmation and reset codes.
            {' '}<a href="https://aws.amazon.com/privacy/" target="_blank" rel="noreferrer noopener">AWS privacy notice</a>.</li>
          <li><b>Advertising networks</b> — only on the free and guest tiers, and only for the
            pre-match slot. They are independent controllers of what their own request collects;
            we send them nothing about you. See below and
            {' '}<Link to="/legal/cookies">cookies and advertising</Link>.</li>
        </ul>
        <AdNetworkList live={adsLive} />

        <h2>Where your data is held</h2>
        <p>Our database and the service itself run on our own infrastructure in the United
          Kingdom. AWS Cognito and the email service run in the AWS London region, so your
          sign-in credentials stay in the UK.</p>
        <p>Stripe and the advertising networks may process data outside the UK, including in the
          United States. Where they do, they rely on the UK's approved transfer mechanisms — an
          adequacy decision where one covers them, otherwise the International Data Transfer
          Addendum to the European Commission's standard contractual clauses. Google Ireland
          Limited is the contracting party for Google Ad Manager in the UK and EEA.</p>

        <h2>How long we keep it</h2>
        <ul>
          <li><b>Your account and profile:</b> while your account is open. When you delete it, your
            callsign is released and your profile, avatar and sign-in are erased immediately.</li>
          <li><b>Match records:</b> kept after you delete your account, with your name removed and
            no link to you, because they are also the other players' history.</li>
          <li><b>Play records:</b> 12 months, then deleted.</li>
          <li><b>Invoices and payment records:</b> seven years, as tax law requires.</li>
          <li><b>Consent records:</b> for as long as the consent applies, and then two years.</li>
          <li><b>Operational logs:</b> 30 days.</li>
        </ul>

        <h2>Your rights</h2>
        <p>You have the right to see what we hold, to correct it, to have it erased, to get a copy
          in a portable form, to restrict or object to how we use it, and to withdraw consent at
          any time. Most of this you can do yourself:</p>
        <ul>
          <li><b>See and correct:</b> your <Link to="/account">account page</Link>.</li>
          <li><b>Withdraw consent:</b> the advertising and email switches on the same page.</li>
          <li><b>Erase:</b> "Delete your account" on the same page.</li>
        </ul>
        <p>For anything else — including a copy of your data — write to {COMPANY.contact} and we
          will answer within one month.</p>
        <p>If you are not happy with how we have handled your data you can complain to the
          Information Commissioner's Office at <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer noopener">ico.org.uk</a>,
          or to your local supervisory authority. We would rather you told us first.</p>

        <h2>Children</h2>
        <p>The service is not intended for children under 13 and we do not knowingly hold data
          about them. If you believe a child under 13 has registered, tell us at
          {' '}{COMPANY.contact} and we will remove the account.</p>

        <h2>Changes</h2>
        <p>If we change this notice we will update the version at the top and, for material
          changes, tell you in the service or by email.</p>
      </>}

      {/* ------------------------------------------------------------------ */}
      {page.id === 'refunds' && <>
        <h2>Cancelling</h2>
        <p>Cancel whenever you like from your <Link to="/account/billing">billing page</Link> —
          no email, no form, no retention call. Your subscription then runs to the end of the
          month you have already paid for and does not renew. You keep your tier until that date,
          and the page tells you what that date is.</p>

        <h2>Your 14-day right to change your mind</h2>
        <p>As a consumer in the UK you have 14 days from subscribing to change your mind. Because
          the service is digital and available to you immediately, you are asked at checkout to
          agree that it starts straight away, which would normally end that right once you have
          used it.</p>
        <p><b>We do not rely on that.</b> If you ask within 14 days of your first subscription
          payment, we will refund it in full, whether or not you have played — once per customer.
          Write to {COMPANY.contact} from the address on the account.</p>

        <h2>After 14 days</h2>
        <p>Subscriptions are monthly and we do not refund part-months as a matter of course —
          cancel and you keep the tier until the month runs out. If something went wrong, the
          sections below apply, and if you think your case is unfair, write to us: we would rather
          sort it out than argue.</p>

        <h2>Changing tier</h2>
        <p>Upgrades take effect immediately and you pay only the prorated difference for the rest
          of the month — the exact amount is quoted to you before you confirm. Downgrades take
          effect at your renewal date, so you are never charged twice for the same period and never
          lose a tier you have already paid for.</p>

        <h2>If the service is unavailable</h2>
        <p>If the service is unavailable to subscribers for more than 24 hours in a row, or for
          more than 72 hours in total in a calendar month, write to {COMPANY.contact} and we will
          credit the affected days against your next invoice, or refund them if you would rather.
          Short interruptions and planned maintenance are not included.</p>

        <h2>If you were charged in error</h2>
        <p>Tell us at {COMPANY.contact} and we will refund it in full, promptly. That includes a
          payment taken after you cancelled, a duplicate charge, or a charge you did not
          authorise.</p>

        <h2>If we close your account</h2>
        <p>If we close a paid account for anything other than serious or repeated breach of the
          <Link to="/legal/acceptable-use"> acceptable use policy</Link>, we refund the unused part
          of the month. For serious or repeated breach, we do not.</p>

        <h2>How refunds are paid</h2>
        <p>Refunds go back to the card or method you paid with, through Stripe. They usually
          appear within five to ten working days, depending on your bank. We do not refund to a
          different method.</p>

        <h2>Before you ask your bank</h2>
        <p>If you are unhappy with a charge, please write to {COMPANY.contact} first. A chargeback
          costs us a fee and is far slower for you than our asking Stripe to refund it, which we
          can do the same day.</p>
      </>}

      {/* ------------------------------------------------------------------ */}
      {page.id === 'cookies' && <>
        <h2>What we store on your device</h2>
        <p>We set no analytics cookies and no tracking cookies of our own. There are two cookies,
          both strictly necessary, plus some settings kept in your browser's own storage.</p>
        <table className="legal-table">
          <thead><tr><th>Name</th><th>What it does</th><th>How long</th></tr></thead>
          <tbody>
            <tr>
              <td><code>cmrd_session</code></td>
              <td>Keeps you signed in. It is httpOnly, so no script on the page can read it, and
                it is only sent to us</td>
              <td>30 days</td>
            </tr>
            <tr>
              <td><code>cmrd_guest</code></td>
              <td>A signed random identifier so an unregistered visitor's taster match can be
                counted. It holds no personal data</td>
              <td>13 months</td>
            </tr>
            <tr>
              <td>Browser storage</td>
              <td>Your callsign, audio settings and your advertising choice. These stay on your
                device; only the advertising choice is sent to us, and only if you are signed in</td>
              <td>Until you clear it</td>
            </tr>
          </tbody>
        </table>
        <p>Strictly necessary cookies do not need your consent, which is why you are not asked to
          accept cookies to use the site. You are asked one question, about advertising.</p>

        <h2>Advertising</h2>
        <p>Free and guest players see one advertisement of up to thirty seconds before a match.
          Your base is already on the battlefield while it plays, so the only cost is the time.
          Subscribers see no advertisement at all, and are never asked this question.</p>

        <h3>Personalised or not</h3>
        <p>With personalisation <b>off</b> — which is the default until you turn it on — the
          request we make is marked as non-personalised and the network is asked not to build or
          use a profile of you. With it <b>on</b>, the network may use what your browser sends it
          to choose a more relevant advertisement.</p>
        <p>Either way the advertisement is the same length and you lose nothing by saying no. You
          can change your answer whenever you like on your <Link to="/account">account page</Link>,
          and it applies to your very next match.</p>
        {adsLive && <p>In practice, with personalisation off we add Google's
          {' '}<code>npa=1</code> parameter to the request, which tells Google to serve a
          non-personalised advertisement: it may still use coarse signals such as the page and
          your general location to pick something sensible, but not a profile built from your
          browsing.</p>}

        <h3>What the network receives</h3>
        <p>When an advertisement loads, your browser contacts the network directly. It will
          receive what any web request carries — your IP address, your browser and device type,
          and the page the request came from. We do not send it your callsign, your email address
          or your match history, ever.</p>
        <AdNetworkList live={adsLive} />
        {adsLive && <>
          <p>Google Ad Manager may set cookies or read device identifiers in your browser to
            measure that an advertisement was shown and to limit how often you see the same one.
            Those are Google's own, not ours, and they are set only when an advertisement
            actually loads — so a subscriber, who never sees one, never gets them.</p>
          <p>You can control this at Google's own
            {' '}<a href="https://adssettings.google.com/" target="_blank" rel="noreferrer noopener">Ads Settings</a>,
            which applies across every site using Google's advertising, and more broadly at
            {' '}<a href="https://optout.aboutads.info/" target="_blank" rel="noreferrer noopener">optout.aboutads.info</a>
            {' '}and <a href="https://youronlinechoices.eu/" target="_blank" rel="noreferrer noopener">Your Online Choices</a>.
            Turning personalisation off here does the same job for this site without you having
            to go anywhere.</p>
        </>}

        <h3>Turning advertisements off entirely</h3>
        <p>Any <Link to="/tiers">subscription</Link> removes them completely.</p>
      </>}

      {/* ------------------------------------------------------------------ */}
      {page.id === 'acceptable-use' && <>
        <p>This policy is part of the <Link to="/legal/terms">terms of service</Link>. It is short
          because it is mostly one idea: play properly and leave other people alone.</p>

        <h2>Play fair</h2>
        <ul>
          <li>No modified clients, no automation, no scripts that play for you.</li>
          <li>No exploiting a bug for advantage. Tell us about it instead — use the help button.</li>
          <li>No interfering with the synchronised simulation other players depend on.</li>
          <li>No deliberately ruining matches: sabotaging allies, stalling to run the clock down,
            or quitting repeatedly to spoil other people's games.</li>
        </ul>

        <h2>Do not dodge the allowances</h2>
        <ul>
          <li>One account per person.</li>
          <li>No clearing cookies or using private windows to farm guest matches.</li>
          <li>No sharing or selling an account, and no using somebody else's.</li>
        </ul>

        <h2>Treat people decently</h2>
        <ul>
          <li>Nothing hateful, threatening or harassing in chat, a callsign or a display name —
            including on the grounds of race, religion, sex, gender identity, sexual orientation
            or disability.</li>
          <li>Nothing sexual involving children, ever. We report this to the authorities.</li>
          <li>No doxxing: do not post anyone's personal information, including your own.</li>
          <li>No impersonating staff, another commander, or anybody else.</li>
          <li>No advertising, spam or links to malware.</li>
        </ul>

        <h2>Do not attack the service</h2>
        <ul>
          <li>No probing, scanning or testing our security without written permission. If you find
            something, tell us at {COMPANY.contact} — we will thank you properly.</li>
          <li>No denial of service, no scraping at volume, no automated account creation.</li>
          <li>No reverse engineering the paid parts of the service to get round them.</li>
        </ul>

        <h2>What happens if you break this</h2>
        <p>Depending on how serious and how repeated it is: a warning, a chat restriction, a
          temporary suspension, or the account closed. We aim to match the response to the
          conduct, and a first minor slip will not cost you an account.</p>
        <p>If we close a paid account for a first, minor matter, we refund the unused part of the
          month. For serious or repeated breach — cheating, harassment, attacking the service — we
          do not.</p>

        <h2>Appeals</h2>
        <p>If you think we got it wrong, write to {COMPANY.contact} within 30 days with your
          callsign and what happened. Somebody who was not involved in the original decision will
          look at it, and we will tell you the outcome and why. Our decision after an appeal is
          final.</p>

        <h2>Reporting somebody</h2>
        <p>Use the help button in the war room, or write to {COMPANY.contact} with the callsign,
          the game code and roughly when it happened. We will tell you we have received it; we may
          not be able to tell you what we did about it.</p>
      </>}

      <footer className="legal-foot">
        <p>Questions about any of this: {COMPANY.contact}</p>
        <Link to="/">← Back to the war room</Link>
      </footer>
    </article>
  </section>;
}
