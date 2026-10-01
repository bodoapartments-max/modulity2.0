/**
 * Modulity 2.0 — Firestore Person/Profile Repository
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { createPerson } from '../../core/workspace/person.js';

const COLLECTION = 'users';

/**
 * Person/Profile is stored in the users collection, keyed by userId.
 *
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/personRepository.js').PersonRepository}
 */
export function createFirestorePersonRepository(db) {
  function toFirestore(person) {
    return {
      userId: person.userId,
      displayName: person.displayName,
      email: person.email,
      phone: person.phone,
      avatarUrl: person.avatarUrl,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };
  }

  function fromFirestore(data) {
    return createPerson({
      userId: data.userId,
      displayName: data.displayName,
      email: data.email,
      phone: data.phone || '',
      avatarUrl: data.avatarUrl || '',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async function create(person) {
    const ref = doc(db, COLLECTION, person.userId);
    await setDoc(ref, {
      ...toFirestore(person),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return person;
  }

  async function getByUserId(userId) {
    const ref = doc(db, COLLECTION, userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromFirestore(snap.data());
  }

  async function update(userId, updates) {
    const ref = doc(db, COLLECTION, userId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  return { create, getByUserId, update };
}
