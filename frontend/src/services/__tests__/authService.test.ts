import { describe, it, expect, beforeEach } from 'vitest';
import { authService, validatePasswordStrength } from '../authService';
import { getAuthCredential, DEFAULT_SEED_CREDENTIALS } from '../offlineStorage';

describe('RESQMesh Authentication & Offline Verifier Suite', () => {
  beforeEach(() => {
    authService.logout();
  });

  it('validates password complexity policy', () => {
    expect(validatePasswordStrength('short')).toContain('at least 8 characters');
    expect(validatePasswordStrength('alllowercase1!')).toContain('uppercase');
    expect(validatePasswordStrength('ALLUPPERCASE1!')).toContain('lowercase');
    expect(validatePasswordStrength('NoSpecialOrNumber')).toContain('number or special');
    expect(validatePasswordStrength('ResqMesh2026!')).toBeNull();
  });

  it('provides pre-seeded offline credentials for emergency responders', async () => {
    const cred = await getAuthCredential('amulya@resqmesh.net');
    expect(cred).not.toBeNull();
    expect(cred?.username).toBe('amulya');
    expect(cred?.role).toBe('responder');
    expect(cred?.verifier_hash).toBe('89f96f3393cd5310044f84f10105846895223d99cb217d7f4c551df0232fc2de');

    // Also looks up by username
    const credByUsername = await getAuthCredential('dr_radhika');
    expect(credByUsername).not.toBeNull();
    expect(credByUsername?.email).toBe('radhika@resqmesh.net');
  });

  it('authenticates offline emergency responders using salted PBKDF2 verifier', async () => {
    const res = await authService.login('amulya@resqmesh.net', 'ResqMesh2026!');
    expect(res.success).toBe(true);
    expect(res.user.email).toBe('amulya@resqmesh.net');
    expect(res.user.display_name).toContain('Amulya Yadav');
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getCurrentUser()?.email).toBe('amulya@resqmesh.net');
  });

  it('rejects invalid passwords during offline authentication', async () => {
    await expect(authService.login('amulya@resqmesh.net', 'WrongPassword123!'))
      .rejects.toThrow();
  });

  it('clears session on logout', async () => {
    await authService.login('citizen@resqmesh.net', 'CitizenHelp2026!');
    expect(authService.isAuthenticated()).toBe(true);

    await authService.logout();
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.getCurrentUser()).toBeNull();
  });
});
