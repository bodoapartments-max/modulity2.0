import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFirebaseIdentityAdapter } from './firebaseIdentityAdapter.js';
import { AuthError, ConfigurationError } from '../../core/errors/appError.js';

const mockCreateUser = vi.fn();
const mockUpdateProfile = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockOnAuthStateChanged = vi.fn();

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args) => mockCreateUser(...args),
  updateProfile: (...args) => mockUpdateProfile(...args),
  signInWithEmailAndPassword: (...args) => mockSignIn(...args),
  signOut: (...args) => mockSignOut(...args),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
}));

const mockFirebaseUser = {
  uid: 'firebase-uid-1',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: false,
};

function createMockAuth(initialUser = null) {
  return {
    currentUser: initialUser,
  };
}

describe('createFirebaseIdentityAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a successful signUp to UserIdentity and updates display name', async () => {
    const mockAuth = createMockAuth();
    const firebaseUser = { ...mockFirebaseUser, reload: vi.fn().mockResolvedValue() };
    const mockCredential = {
      user: firebaseUser,
    };
    mockAuth.currentUser = firebaseUser;
    mockCreateUser.mockResolvedValue(mockCredential);
    mockUpdateProfile.mockResolvedValue();

    const adapter = createFirebaseIdentityAdapter(mockAuth);

    const user = await adapter.signUp({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    });

    expect(mockCreateUser).toHaveBeenCalledWith(
      mockAuth,
      'test@example.com',
      'password123',
    );
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      mockCredential.user,
      { displayName: 'Test User' },
    );
    expect(user.userId).toBe('firebase-uid-1');
    expect(user.email).toBe('test@example.com');
    expect(user.displayName).toBe('Test User');
  });

  it('maps a Firebase auth error to a user-safe AuthError on signIn', async () => {
    const mockAuth = createMockAuth();
    const firebaseError = new Error('Firebase auth error');
    firebaseError.code = 'auth/invalid-credential';
    mockSignIn.mockRejectedValue(firebaseError);

    const adapter = createFirebaseIdentityAdapter(mockAuth);

    await expect(
      adapter.signIn({ email: 'test@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws ConfigurationError when auth instance is missing', () => {
    expect(() => createFirebaseIdentityAdapter(null)).toThrow(ConfigurationError);
  });
});
