/**
 * Modulity 2.0 — Firebase Identity Adapter
 *
 * Implements the Core Identity Provider contract using Firebase Authentication.
 * All Firebase-specific code is contained in this file; higher layers only see
 * the provider-independent UserIdentity and AppError types.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import { toUserIdentity } from '../../core/identity/user.js';
import { fromFirebaseAuthError, ConfigurationError } from '../../core/errors/appError.js';

/**
 * Creates a Firebase-backed identity provider.
 *
 * @param {import('firebase/auth').Auth} auth - Firebase Auth instance (may be mocked in tests)
 * @returns {import('../../core/identity/identityContract.js').IdentityProvider}
 */
export function createFirebaseIdentityAdapter(auth) {
  if (!auth) {
    throw new ConfigurationError(
      'Firebase Auth instance is not available. Check configuration and initialization.',
    );
  }

  async function signUp(request) {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        request.email,
        request.password,
      );

      if (request.displayName) {
        await updateProfile(userCredential.user, { displayName: request.displayName });
      }

      await userCredential.user.reload();
      return toUserIdentity(auth.currentUser);
    } catch (error) {
      throw fromFirebaseAuthError(error);
    }
  }

  async function signIn(request) {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        request.email,
        request.password,
      );
      return toUserIdentity(userCredential.user);
    } catch (error) {
      throw fromFirebaseAuthError(error);
    }
  }

  async function signOut() {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      throw fromFirebaseAuthError(error);
    }
  }

  function getCurrentUser() {
    return toUserIdentity(auth.currentUser);
  }

  function subscribeToAuthState(callback, errorCallback) {
    return onAuthStateChanged(
      auth,
      (firebaseUser) => callback(toUserIdentity(firebaseUser)),
      (error) => errorCallback?.(fromFirebaseAuthError(error)),
    );
  }

  return {
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    subscribeToAuthState,
  };
}
