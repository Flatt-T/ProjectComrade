// AWS Cognito, over its plain JSON API.
//
// Every call used here is either unauthenticated (sign-up, sign-in, password reset) or
// authorised by the user's own access token, so none of them needs SigV4 request signing
// and the service needs no AWS SDK or AWS credentials at all — only the pool and client
// ids. Passwords pass through this process over TLS and are never stored or logged.
import { createHmac } from 'node:crypto';
import { cognito } from './config.js';
import { HttpError, badRequest, conflict, unauthorised, unavailable } from './http.js';
import { log } from './ops.js';

const PREFIX = 'AWSCognitoIdentityProviderService';

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/** Cognito requires a SECRET_HASH only when the app client was created with a secret. */
function secretHash(username: string): string | undefined {
  const secret = cognito.clientSecret();
  if (!secret) return undefined;
  return createHmac('sha256', secret).update(username + cognito.clientId()).digest('base64');
}

/** Friendly, non-enumerating messages for the errors Cognito actually returns. */
function translate(type: string, message: string): HttpError {
  switch (type) {
    case 'UsernameExistsException': return conflict('That email address already has an account', 'email-taken');
    case 'InvalidPasswordException': return badRequest(message || 'That password does not meet the requirements', 'weak-password');
    case 'InvalidParameterException': return badRequest(message || 'Check the details and try again');
    case 'CodeMismatchException': return badRequest('That code is not right', 'code-mismatch');
    case 'ExpiredCodeException': return badRequest('That code has expired — request a new one', 'code-expired');
    case 'UserNotConfirmedException': return new HttpError(403, 'Confirm your email address first', 'unconfirmed');
    case 'PasswordResetRequiredException': return new HttpError(403, 'Your password must be reset before signing in', 'reset-required');
    case 'NotAuthorizedException': return unauthorised('Those details are not right');
    // Never confirm whether an address is registered.
    case 'UserNotFoundException': return unauthorised('Those details are not right');
    case 'TooManyRequestsException': case 'LimitExceededException': case 'TooManyFailedAttemptsException':
      return new HttpError(429, 'Too many attempts — try again shortly');
    case 'AliasExistsException': return conflict('That email address is already in use', 'email-taken');
    default: return new HttpError(502, 'The sign-in service is unavailable — try again shortly');
  }
}

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!cognito.configured()) throw unavailable('Accounts are not configured on this deployment');
  const response = await fetch(cognito.endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `${PREFIX}.${action}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const parsed: Record<string, unknown> = text ? JSON.parse(text) : {};
  if (!response.ok) {
    // `__type` is "com.amazonaws...#UsernameExistsException"; only the tail matters.
    const type = String(parsed.__type ?? '').split('#').pop() ?? '';
    const message = String(parsed.message ?? '');
    const error = translate(type, message);
    // The type is operationally useful; the message may echo user input, so it is not logged.
    if (error.status >= 500) log('cognito-error', { action, type, status: response.status });
    throw error;
  }
  return parsed as T;
}

function tokens(result: Record<string, unknown> | undefined): AuthTokens {
  const r = result ?? {};
  const accessToken = String(r.AccessToken ?? '');
  const idToken = String(r.IdToken ?? '');
  if (!accessToken || !idToken) throw new HttpError(502, 'Sign-in did not complete — try again');
  return {
    accessToken, idToken,
    refreshToken: typeof r.RefreshToken === 'string' ? r.RefreshToken : undefined,
    expiresIn: Number(r.ExpiresIn ?? 3600),
  };
}

export interface SignUpResult { sub: string; confirmed: boolean }

/** Create the Cognito user. The handle is stored as `preferred_username` for display. */
export async function signUp(email: string, password: string, handle: string): Promise<SignUpResult> {
  const result = await call<{ UserSub: string; UserConfirmed: boolean }>('SignUp', {
    ClientId: cognito.clientId(), Username: email, Password: password,
    SecretHash: secretHash(email),
    UserAttributes: [{ Name: 'email', Value: email }, { Name: 'preferred_username', Value: handle }],
  });
  return { sub: result.UserSub, confirmed: !!result.UserConfirmed };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await call('ConfirmSignUp', {
    ClientId: cognito.clientId(), Username: email, ConfirmationCode: code, SecretHash: secretHash(email),
  });
}

export async function resendCode(email: string): Promise<void> {
  await call('ResendConfirmationCode', { ClientId: cognito.clientId(), Username: email, SecretHash: secretHash(email) });
}

export async function signIn(email: string, password: string): Promise<AuthTokens> {
  const result = await call<{ AuthenticationResult?: Record<string, unknown>; ChallengeName?: string }>('InitiateAuth', {
    ClientId: cognito.clientId(), AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password, ...(secretHash(email) ? { SECRET_HASH: secretHash(email)! } : {}) },
  });
  // Challenges (MFA, forced password change) are not part of the player sign-in flow; if the
  // pool is later configured to issue one, say so plainly rather than failing obscurely.
  if (!result.AuthenticationResult && result.ChallengeName) {
    throw new HttpError(409, `This account needs ${String(result.ChallengeName).toLowerCase().replace(/_/g, ' ')} — not supported yet`, 'challenge');
  }
  return tokens(result.AuthenticationResult);
}

export async function refresh(refreshToken: string, username?: string): Promise<AuthTokens> {
  const hash = username ? secretHash(username) : undefined;
  const result = await call<{ AuthenticationResult?: Record<string, unknown> }>('InitiateAuth', {
    ClientId: cognito.clientId(), AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: refreshToken, ...(hash ? { SECRET_HASH: hash } : {}) },
  });
  return tokens(result.AuthenticationResult);
}

export async function forgotPassword(email: string): Promise<void> {
  await call('ForgotPassword', { ClientId: cognito.clientId(), Username: email, SecretHash: secretHash(email) });
}

export async function confirmForgotPassword(email: string, code: string, password: string): Promise<void> {
  await call('ConfirmForgotPassword', {
    ClientId: cognito.clientId(), Username: email, ConfirmationCode: code, Password: password, SecretHash: secretHash(email),
  });
}

export async function changePassword(accessToken: string, previous: string, proposed: string): Promise<void> {
  await call('ChangePassword', { AccessToken: accessToken, PreviousPassword: previous, ProposedPassword: proposed });
}

/** Start a verified email change: Cognito emails a code to the new address. */
export async function requestEmailChange(accessToken: string, email: string): Promise<void> {
  await call('UpdateUserAttributes', { AccessToken: accessToken, UserAttributes: [{ Name: 'email', Value: email }] });
}

export async function confirmEmailChange(accessToken: string, code: string): Promise<void> {
  await call('VerifyUserAttribute', { AccessToken: accessToken, AttributeName: 'email', Code: code });
}

export interface CognitoUser { sub: string; email: string; emailVerified: boolean; handle?: string }

export async function getUser(accessToken: string): Promise<CognitoUser> {
  const result = await call<{ UserAttributes: { Name: string; Value: string }[] }>('GetUser', { AccessToken: accessToken });
  const attributes = new Map(result.UserAttributes.map(a => [a.Name, a.Value]));
  return {
    sub: attributes.get('sub') ?? '',
    email: attributes.get('email') ?? '',
    emailVerified: attributes.get('email_verified') === 'true',
    handle: attributes.get('preferred_username'),
  };
}

/** Invalidate every refresh token this user holds, on every device. */
export async function signOutEverywhere(accessToken: string): Promise<void> {
  try { await call('GlobalSignOut', { AccessToken: accessToken }); } catch { /* the token may already be dead */ }
}

export async function deleteUser(accessToken: string): Promise<void> {
  await call('DeleteUser', { AccessToken: accessToken });
}
