# Modulity 2.0 — Identity Architecture

## Overview

Authentication is provider-agnostic at the Core level. The application depends on an `IdentityProvider` contract, implemented currently by a Firebase Auth adapter.

## Contract

`src/core/identity/identityContract.js` documents the required interface:

- `signUp(request)`
- `signIn(request)`
- `signOut()`
- `getCurrentUser()`
- `subscribeToAuthState(callback)`

## User model boundary

`src/core/identity/user.js` defines the canonical `UserIdentity` object:

```js
{
  userId,
  email,
  displayName,
  emailVerified,
}
```

Firebase User objects are mapped to this shape by `toUserIdentity()` before crossing into Core or UI layers.

## Provider selection

`src/infrastructure/identity/identityProvider.js` selects and exports the configured adapter based on `config.identityProvider`.

## Firebase adapter

`src/infrastructure/firebase/firebaseIdentityAdapter.js` implements the contract using Firebase Auth modular API:

- `createUserWithEmailAndPassword` for registration.
- `signInWithEmailAndPassword` for login.
- `signOut` for logout.
- `onAuthStateChanged` for auth state restoration.

## Auth state boundary

`src/app/providers/AuthProvider.jsx` is the single React boundary for auth state. Components use `useAuth()` to read the current user and call sign-in/sign-out operations.

## Error handling

Firebase Auth errors are translated into user-safe `AuthError` instances by `fromFirebaseAuthError()` in `src/core/errors/appError.js`. UI layers should display `error.message` without leaking raw provider details.

## What is not implemented

- Social login (Google, etc.).
- Organization membership or role-based access.
- Password reset / email verification flows.
- Service identities and API tokens.
