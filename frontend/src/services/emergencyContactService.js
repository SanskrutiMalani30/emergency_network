/**
 * RESQMesh — Emergency Contact Management Service
 *
 * Handles emergency contact onboarding, format validation, local offline persistence,
 * and server synchronization.
 */

import { API_BASE } from './api';

const CONTACT_STORAGE_PREFIX = 'resqmesh_emergency_contact_';
const ONBOARDED_STORAGE_PREFIX = 'resqmesh_contact_onboarded_';

const getStorage = () => (typeof window !== 'undefined' ? window.localStorage : (typeof globalThis !== 'undefined' ? globalThis.localStorage : null));

export const DEFAULT_PROTOTYPE_CONTACT = {
  name: 'Sanskruti',
  phone: '9272104399',
  country_code: '+91',
  relationship: 'Primary Emergency Contact'
};

/**
 * Validates phone numbers for emergency contact.
 * India (+91) expects 10 digits; international numbers require 7 to 15 digits.
 */
export function validatePhoneNumber(phone, countryCode = '+91') {
  if (!phone) return 'Phone number is required.';
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');

  if (countryCode === '+91') {
    if (!/^\d{10}$/.test(cleaned)) {
      return 'Please enter a valid 10-digit mobile number for India (+91).';
    }
  } else {
    if (!/^\d{7,15}$/.test(cleaned)) {
      return 'Phone number must be between 7 and 15 digits.';
    }
  }
  return null;
}

/**
 * Retrieves the emergency contact for a specific user.
 * Falls back to default prototype contact if none exists yet.
 */
export function getEmergencyContact(userId = 'usr-citizen') {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(`${CONTACT_STORAGE_PREFIX}${userId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    }
  } catch (e) {
    console.warn('Error reading stored emergency contact:', e);
  }

  return {
    ...DEFAULT_PROTOTYPE_CONTACT,
    user_id: userId
  };
}

/**
 * Checks if the user has completed or explicitly dismissed the contact onboarding step.
 */
export function hasCompletedContactOnboarding(userId = 'usr-citizen') {
  try {
    const storage = getStorage();
    if (storage) {
      const flag = storage.getItem(`${ONBOARDED_STORAGE_PREFIX}${userId}`);
      return flag === 'true';
    }
  } catch (e) {
    console.warn('Error reading onboarding status:', e);
  }
  return false;
}

/**
 * Marks the contact onboarding step as completed (or skipped).
 */
export function markContactOnboarded(userId = 'usr-citizen', completed = true) {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(`${ONBOARDED_STORAGE_PREFIX}${userId}`, completed ? 'true' : 'false');
    }
  } catch (e) {
    console.warn('Error setting onboarding status:', e);
  }
}

/**
 * Saves emergency contact locally and opportunistically synchronizes with the backend.
 */
export async function saveEmergencyContact(userId = 'usr-citizen', contactData) {
  const cleanedPhone = (contactData.phone || '').replace(/[\s\-\(\)]/g, '');
  const validationErr = validatePhoneNumber(cleanedPhone, contactData.country_code || '+91');
  if (validationErr) {
    throw new Error(validationErr);
  }

  const contact = {
    user_id: userId,
    name: (contactData.name || DEFAULT_PROTOTYPE_CONTACT.name).trim(),
    phone: cleanedPhone,
    country_code: contactData.country_code || '+91',
    relationship: contactData.relationship || 'Primary Emergency Contact',
    updated_at: new Date().toISOString()
  };

  // 1. Save to localStorage
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(`${CONTACT_STORAGE_PREFIX}${userId}`, JSON.stringify(contact));
      storage.setItem(`${ONBOARDED_STORAGE_PREFIX}${userId}`, 'true');
    }
  } catch (e) {
    console.warn('Error persisting contact to localStorage:', e);
  }

  // 2. Synchronize to backend if online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const res = await fetch(`${API_BASE}/resqmesh/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact)
      });
      if (res.ok) {
        const json = await res.json();
        return { ...contact, ...json };
      }
    } catch (err) {
      console.warn('Could not sync emergency contact to backend (offline mode):', err);
    }
  }

  return contact;
}
